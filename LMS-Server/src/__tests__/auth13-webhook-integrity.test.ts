import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import app from '../app.js';
import { db } from '../config/database.js';

beforeEach(() => db.exec(`
  INSERT INTO users(id,name,email,password_hash) VALUES('webhook-user','Synthetic','webhook@example.invalid','synthetic');
  INSERT INTO courses(id,title,course_code) VALUES('webhook-course','Synthetic','A13-WH');
  INSERT INTO payments(id,user_id,course_id,amount_cents,currency,payment_method,paystack_reference)
    VALUES('payment','webhook-user','webhook-course',100,'USD','paystack','reference');
`));
const payment = () => db.prepare("SELECT * FROM payments WHERE id='payment'").get();
const events = () => (db.prepare('SELECT count(*) n FROM webhook_events').get() as {n:number}).n;
function send(event='charge.success', change: Record<string,unknown> = {}, signatureMode='valid') {
  const data = event === 'refund.processed'
    ? {transaction_reference:'reference',refund_reference:'synthetic-refund',amount:'100',currency:'USD',status:'processed',...change}
    : {reference:'reference',amount:100,currency:'USD',status:'success',...change};
  const raw=JSON.stringify({event,data});
  const signature=createHmac('sha512',process.env.PAYSTACK_SECRET_KEY!).update(raw).digest('hex');
  const call=request(app).post('/api/v1/webhooks/paystack').set('Content-Type','application/json');
  if (signatureMode!=='missing') call.set('x-paystack-signature',signatureMode==='bad'?'0'.repeat(128):signature);
  return call.send(signatureMode==='tampered'?raw+' ':raw);
}

describe('AUTH-13 webhook financial state and atomic idempotency', () => {
  it('processes confirmation and refund for the same reference independently', async () => {
    expect((await send()).status).toBe(200);expect(payment()).toMatchObject({status:'confirmed'});
    expect((await send('refund.processed')).status).toBe(200);expect(payment()).toMatchObject({status:'refunded'});
    expect(events()).toBe(2);
  });
  it('a failed attempt can later succeed on the same reference', async () => {
    expect((await send('charge.failed')).status).toBe(200);expect(payment()).toMatchObject({status:'failed'});
    expect((await send()).status).toBe(200);expect(payment()).toMatchObject({status:'confirmed'});
  });
  it('duplicates leave payment rows and event counts unchanged', async () => {
    await send();const before=payment();await send();await send();
    expect(payment()).toEqual(before);expect(events()).toBe(1);
  });
  it.each(['missing','bad','tampered'])('rejects %s signatures before any database write', async mode => {
    const before=payment();expect((await send('charge.success',{},mode)).status).toBe(401);
    expect(payment()).toEqual(before);expect(events()).toBe(0);
  });
  it('rolls back event insertion when payment mutation fails and permits retry', async () => {
    db.exec("CREATE TRIGGER fail_payment BEFORE UPDATE ON payments BEGIN SELECT RAISE(ABORT,'synthetic payment failure'); END");
    expect((await send()).status).toBe(500);expect(events()).toBe(0);expect(payment()).toMatchObject({status:'pending'});
    db.exec('DROP TRIGGER fail_payment');expect((await send()).status).toBe(200);expect(payment()).toMatchObject({status:'confirmed'});
  });
  it('does not acknowledge storage failure as an already-processed event', async () => {
    db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON webhook_events BEGIN SELECT RAISE(ABORT,'synthetic event failure'); END");
    expect((await send()).status).toBe(500);expect(events()).toBe(0);expect(payment()).toMatchObject({status:'pending'});
  });
  it.each([{currency:'ZAR'},{amount:101}])('mismatched payment evidence cannot confirm or poison a later valid retry: %j', async change => {
    await send('charge.success',change);expect(payment()).toMatchObject({status:'pending'});expect(events()).toBe(0);
    await send();expect(payment()).toMatchObject({status:'confirmed'});
  });
  it('cannot reconfirm a refunded payment with a later success event', async () => {
    db.prepare("UPDATE payments SET status='refunded' WHERE id='payment'").run();
    await send();expect(payment()).toMatchObject({status:'refunded'});
  });
  it('an out-of-order refund is retryable after confirmation', async () => {
    expect((await send('refund.processed')).status).toBe(409);expect(events()).toBe(0);
    await send();await send('refund.processed');expect(payment()).toMatchObject({status:'refunded'});
  });
  it.each([null,{}, {event:'charge.success',data:null}])('malformed signed payload %j is rejected without writes', async payload => {
    const raw=JSON.stringify(payload);const signature=createHmac('sha512',process.env.PAYSTACK_SECRET_KEY!).update(raw).digest('hex');
    const response=await request(app).post('/api/v1/webhooks/paystack').set('Content-Type','application/json').set('x-paystack-signature',signature).send(raw);
    expect(response.status).toBe(400);expect(events()).toBe(0);expect(payment()).toMatchObject({status:'pending'});
  });
  it('partial refunds retain confirmed status and durable evidence for manual reconciliation', async () => {
    await send();const response=await send('refund.processed',{amount:'50'});
    expect(response.status).toBe(200);expect(response.body.message).toMatch(/partial.*manual/i);
    expect(payment()).toMatchObject({status:'confirmed'});expect(events()).toBe(2);
  });
  it('recovers a pending payment despite a legacy marker written before a failed mutation', async () => {
    db.exec("INSERT INTO webhook_events(id,event_id,event_type,provider,payload) VALUES('legacy','reference','charge.success','paystack','{}')");
    await send();expect(payment()).toMatchObject({status:'confirmed'});expect(events()).toBe(2);
  });
  it('honors historical reference-only deduplication records for the matching event type', async () => {
    db.exec("UPDATE payments SET status='confirmed' WHERE id='payment'; INSERT INTO webhook_events(id,event_id,event_type,provider,payload) VALUES('legacy','reference','charge.success','paystack','{}')");
    await send();expect(events()).toBe(1);
    await send('refund.processed');expect(events()).toBe(2);expect(payment()).toMatchObject({status:'refunded'});
  });

  // --- AUTH-13 additional partial-refund and deduplication tests ---

  it('two distinct partial refunds with different refund_references are both recorded', async () => {
    await send(); // confirm payment first
    const r1 = await send('refund.processed', { amount: '30', refund_reference: 'refund-A' });
    expect(r1.status).toBe(200);
    const r2 = await send('refund.processed', { amount: '40', refund_reference: 'refund-B' });
    expect(r2.status).toBe(200);
    // Both refunds must be recorded as separate events (3 total: confirm + 2 refunds)
    expect(events()).toBe(3);
  });

  it('two distinct partial refunds with MISSING refund_reference are both recorded', async () => {
    // This is the critical deduplication collision test.
    // When refund_reference is absent, two separate partial refunds for the same
    // transaction must NOT collide on the deduplication key.
    await send(); // confirm payment first
    const r1 = await send('refund.processed', { amount: '30', refund_reference: undefined });
    expect(r1.status).toBe(200);
    expect(events()).toBe(2); // confirm + first refund
    const r2 = await send('refund.processed', { amount: '40', refund_reference: undefined });
    expect(r2.status).toBe(200);
    // Second refund must also be recorded — 3 events total
    expect(events()).toBe(3);
  });

  it('duplicate delivery of the SAME refund (same refund_reference) is idempotent', async () => {
    await send(); // confirm
    await send('refund.processed', { amount: '50', refund_reference: 'refund-X' });
    await send('refund.processed', { amount: '50', refund_reference: 'refund-X' });
    // Duplicate must not create a new event
    expect(events()).toBe(2); // confirm + one refund
  });

  it('refund with null refund_reference is retried correctly after DB failure', async () => {
    await send(); // confirm
    db.exec("CREATE TRIGGER fail_event_refund BEFORE INSERT ON webhook_events WHEN NEW.event_type='refund.processed' BEGIN SELECT RAISE(ABORT,'synthetic event failure'); END");
    const r1 = await send('refund.processed', { refund_reference: undefined });
    expect(r1.status).toBe(500);
    expect(events()).toBe(1); // only the confirm event
    db.exec('DROP TRIGGER fail_event_refund');
    const r2 = await send('refund.processed', { refund_reference: undefined });
    expect(r2.status).toBe(200);
    expect(events()).toBe(2);
  });

  it('refund on already-refunded payment does not double-refund', async () => {
    await send(); // confirm
    await send('refund.processed'); // full refund
    expect(payment()).toMatchObject({ status: 'refunded' });
    // Second full refund attempt — should be idempotent or rejected
    const r = await send('refund.processed', { refund_reference: 'refund-second' });
    expect(r.status).toBe(200);
    expect(payment()).toMatchObject({ status: 'refunded' });
  });

  // --- AUTH-13 refund deduplication collision fix tests ---

  it('two distinct partial refunds with same amount and NO refund_reference use provider event ID', async () => {
    await send(); // confirm payment first
    const r1 = await send('refund.processed', { amount: '50', refund_reference: undefined, id: 90001 });
    expect(r1.status).toBe(200);
    const r2 = await send('refund.processed', { amount: '50', refund_reference: undefined, id: 90002 });
    expect(r2.status).toBe(200);
    // Both refunds must be recorded — 3 events total (confirm + 2 distinct refunds)
    expect(events()).toBe(3);
  });

  it('same-amount refund retry with identical provider event ID is idempotent', async () => {
    await send(); // confirm payment first
    await send('refund.processed', { amount: '50', refund_reference: undefined, id: 80001 });
    await send('refund.processed', { amount: '50', refund_reference: undefined, id: 80001 });
    // Duplicate must deduplicate — 2 events total (confirm + 1 refund)
    expect(events()).toBe(2);
  });

  it('refund with no refund_reference AND no provider ID falls through to reconciliation', async () => {
    await send(); // confirm payment first
    const r1 = await send('refund.processed', { amount: '50', refund_reference: undefined });
    expect(r1.status).toBe(200);
    const r2 = await send('refund.processed', { amount: '50', refund_reference: undefined });
    expect(r2.status).toBe(200);
    // Both must be recorded (not silently dropped) — 3 events total
    expect(events()).toBe(3);
  });

  it('existing _no_ref_ tests still pass with provider ID preferred', async () => {
    // When provider ID is present, it takes priority over the old _no_ref_ fallback
    await send(); // confirm
    const r1 = await send('refund.processed', { amount: '30', refund_reference: undefined, id: 70001 });
    expect(r1.status).toBe(200);
    expect(events()).toBe(2);
    const r2 = await send('refund.processed', { amount: '40', refund_reference: undefined, id: 70002 });
    expect(r2.status).toBe(200);
    // Different provider IDs means both are recorded
    expect(events()).toBe(3);
  });

  // --- AUTH-13 reconciliation-mode financial safety ---

  it('reconciliation-mode refund records event but does NOT mutate financial state', async () => {
    // When a refund event has no identity (no refund_reference, no data.id),
    // it enters reconciliation mode. The event must be recorded for audit,
    // but payment status must NOT change — provider reconciliation is required
    // before making financial claims with ambiguous identity.
    await send(); // confirm payment first
    expect(payment()).toMatchObject({ status: 'confirmed' });
    const r = await send('refund.processed', { amount: '100', refund_reference: undefined });
    expect(r.status).toBe(200);
    expect(events()).toBe(2); // confirm + reconciliation event recorded for audit
    expect(payment()).toMatchObject({ status: 'confirmed' }); // NOT refunded
    expect(r.body.message).toMatch(/reconcil/i);
  });

  it('reconciliation-mode partial refund also defers to manual review', async () => {
    await send(); // confirm
    const r = await send('refund.processed', { amount: '50', refund_reference: undefined });
    expect(r.status).toBe(200);
    expect(events()).toBe(2);
    expect(payment()).toMatchObject({ status: 'confirmed' });
    expect(r.body.message).toMatch(/reconcil/i);
  });
});
