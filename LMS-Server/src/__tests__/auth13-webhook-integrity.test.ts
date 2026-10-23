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
});
