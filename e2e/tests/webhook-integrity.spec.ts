import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { apiURL } from '../playwright.config';
import { withFixtureDatabase } from '../helpers/fixture-db';
import { computeSignature, sendChargeSuccess, sendChargeFailed, sendRefundProcessed } from '../helpers/webhook-seeding';

let reference: string;
test.beforeEach(() => {
  reference = `e2e-lifecycle-${randomUUID()}`;
  withFixtureDatabase(db => {
    const user = db.prepare("SELECT id FROM users WHERE email='student@test.com'").get();
    if (!user) throw new Error('Student fixture missing');
    db.prepare('INSERT INTO courses(id,title,course_code) VALUES(?,?,?)').run(reference,'Synthetic webhook course',reference);
    db.prepare("INSERT INTO payments(id,user_id,course_id,amount_cents,currency,payment_method,paystack_reference) VALUES(?,?,?,100,'USD','paystack',?)")
      .run(reference,user.id,reference,reference);
  });
});
const snapshot = () => withFixtureDatabase(db => ({
  payment:db.prepare('SELECT status,confirmed_at,notes FROM payments WHERE id=?').get(reference),
  events:db.prepare("SELECT count(*) n FROM webhook_events WHERE COALESCE(json_extract(payload,'$.data.reference'),json_extract(payload,'$.data.transaction_reference'))=?").get(reference).n,
}));

test('real confirmation, duplicate and refund preserve exactly-once financial state', async ({request}) => {
  expect((await sendChargeSuccess(request,apiURL,reference,100,'USD')).status).toBe(200);
  const confirmed = snapshot(); expect(confirmed.payment.status).toBe('confirmed');expect(confirmed.events).toBe(1);
  await sendChargeSuccess(request,apiURL,reference,100,'USD'); expect(snapshot()).toEqual(confirmed);
  expect((await sendRefundProcessed(request,apiURL,reference,100,'USD')).status).toBe(200);
  const refunded = snapshot();expect(refunded.payment.status).toBe('refunded');expect(refunded.events).toBe(2);
  await sendRefundProcessed(request,apiURL,reference,100,'USD');expect(snapshot()).toEqual(refunded);
  await sendChargeSuccess(request,apiURL,reference,100,'USD');expect(snapshot()).toEqual(refunded);
});

test('failure and later success for one reference are separate events', async ({request}) => {
  await sendChargeFailed(request,apiURL,reference,100,'USD');expect(snapshot().payment.status).toBe('failed');
  await sendChargeSuccess(request,apiURL,reference,100,'USD');expect(snapshot()).toMatchObject({payment:{status:'confirmed'},events:2});
});

for (const kind of ['missing','invalid','tampered']) {
  test(`${kind} signature leaves real payment and event rows unchanged`, async ({request}) => {
    const before = snapshot();
    const body = JSON.stringify({event:'charge.success',data:{reference,amount:100,currency:'USD',status:'success'}});
    const headers: Record<string,string> = {'Content-Type':'application/json'};
    if (kind !== 'missing') headers['x-paystack-signature'] = kind === 'invalid' ? '0'.repeat(128) : computeSignature(body);
    const response = await request.post(`${apiURL}/api/v1/webhooks/paystack`,{data:kind === 'tampered' ? body+' ' : body,headers});
    expect(response.status()).toBe(401); expect(snapshot()).toEqual(before);
  });
}
