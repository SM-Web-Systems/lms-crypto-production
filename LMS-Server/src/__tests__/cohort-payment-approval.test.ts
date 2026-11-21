/**
 * Owner decision 2026-11-21: sponsor cohort payment with administrator approval.
 *
 * The sponsor's Create Payment (POST /admin/cohorts/:id/pay) is the request. It waits in the
 * administrator queue (GET /admin/cohort-payments). An administrator holding billing.confirm
 * approves it — the learners' certificate payments are then settled exactly as a confirmed
 * single payment settles one — or declines it with a reason. No money moves and nothing calls
 * a payment provider.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { isPaymentSatisfied } from '../services/paymentService.js';

function seedUser(role: 'admin' | 'student', name: string, rbacRole?: string) {
  const id = uuidv4();
  const email = `${name.toLowerCase().replace(/\s/g, '')}-${id.slice(0, 6)}@test.com`;
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'h', ?)").run(id, name, email, role);
  if (rbacRole) db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, rbacRole);
  return { id, token: makeToken({ userId: id, email, role }) };
}

describe('Cohort payment requests with administrator approval', () => {
  let sponsor: { id: string; token: string };
  let admin: { id: string; token: string };
  let learners: string[];
  let courseId: string;
  let cohortId: string;

  beforeEach(async () => {
    sponsor = seedUser('student', 'Sam Sponsor', 'role_sponsor');
    admin = seedUser('admin', 'Ada Admin');
    courseId = uuidv4();
    const code = `CP-${courseId.slice(0, 6)}`;
    db.prepare("INSERT INTO courses (id, title, course_code, sections) VALUES (?, 'Paid Course', ?, '[]')").run(courseId, code);
    db.prepare("INSERT INTO course_pricing (id, course_id, price_cents, currency, is_active, tiers_enabled) VALUES (?, ?, 2500, 'USD', 1, 'both')").run(uuidv4(), courseId);
    learners = [seedUser('student', 'Lee One').id, seedUser('student', 'Lee Two').id];
    for (const l of learners) db.prepare('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)').run(l, code);
    cohortId = uuidv4();
    db.prepare("INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier) VALUES (?, 'Spring Cohort', ?, ?, 'paid')").run(cohortId, sponsor.id, courseId);
    for (const l of learners) db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, l);
    const applied = await request(app).post(`/api/v1/admin/cohorts/${cohortId}/apply`).set('Authorization', `Bearer ${sponsor.token}`);
    expect(applied.status).toBe(200);
  });

  const submit = () => request(app).post(`/api/v1/admin/cohorts/${cohortId}/pay`).set('Authorization', `Bearer ${sponsor.token}`);
  const queue = (token = admin.token, status?: string) => request(app)
    .get('/api/v1/admin/cohort-payments').query(status ? { status } : {}).set('Authorization', `Bearer ${token}`);
  const approve = (paymentId: string, token = admin.token) => request(app)
    .post(`/api/v1/admin/cohort-payments/${paymentId}/approve`).set('Authorization', `Bearer ${token}`).send({});
  const decline = (paymentId: string, reason?: string, token = admin.token) => request(app)
    .post(`/api/v1/admin/cohort-payments/${paymentId}/decline`).set('Authorization', `Bearer ${token}`).send({ reason });
  const applicationIds = () => (db.prepare('SELECT application_id FROM cohort_members WHERE cohort_id = ? ORDER BY user_id').all(cohortId) as Array<{ application_id: string }>).map(r => r.application_id);
  const notifications = (type: string) => db.prepare('SELECT title, body, link FROM notifications WHERE user_id = ? AND type = ?').all(sponsor.id, type) as Array<{ title: string; body: string; link: string }>;

  it('CPA-1: the sponsor request waits in the administrator queue with sponsor, amount and learner count', async () => {
    const res = await submit();
    expect(res.status).toBe(201);
    const q = await queue();
    expect(q.status).toBe(200);
    expect(q.body.data.requests).toEqual([expect.objectContaining({
      paymentId: res.body.data.paymentId, cohortId, cohortName: 'Spring Cohort', courseName: 'Paid Course',
      sponsorName: 'Sam Sponsor', amountCents: 5000, currency: 'USD', learnerCount: 2, status: 'pending',
    })]);
    // Nothing is settled while the request waits.
    expect(applicationIds().map(isPaymentSatisfied)).toEqual([false, false]);
  });

  it('CPA-2: approval settles every learner on the request, records who and when, and tells the sponsor', async () => {
    const { paymentId } = (await submit()).body.data;
    const res = await approve(paymentId);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ paymentId, status: 'approved', learnersSettled: 2 }));

    const payment = db.prepare('SELECT status, confirmed_by, confirmed_at FROM payments WHERE id = ?').get(paymentId) as Record<string, string>;
    expect(payment.status).toBe('confirmed');
    expect(payment.confirmed_by).toBe(admin.id);
    expect(payment.confirmed_at).toBeTruthy();
    expect(applicationIds().map(isPaymentSatisfied)).toEqual([true, true]);
    expect(notifications('payment_confirmed')).toHaveLength(1);

    const q = await queue(admin.token, 'approved');
    expect(q.body.data.requests[0]).toEqual(expect.objectContaining({ status: 'approved', decidedByName: 'Ada Admin' }));
  });

  it('CPA-3: approving twice settles once and notifies once', async () => {
    const { paymentId } = (await submit()).body.data;
    expect((await approve(paymentId)).status).toBe(200);
    const again = await approve(paymentId);
    expect(again.status).toBe(200);
    expect(again.body.data.learnersSettled).toBe(0);
    for (const appId of applicationIds()) {
      const n = (db.prepare('SELECT COUNT(*) AS n FROM payments WHERE application_id = ?').get(appId) as { n: number }).n;
      expect(n).toBe(1);
    }
    expect(notifications('payment_confirmed')).toHaveLength(1);
  });

  it('CPA-4: a decline needs a reason, settles nothing, tells the sponsor, and cannot then be approved', async () => {
    const { paymentId } = (await submit()).body.data;
    expect((await decline(paymentId, '  ')).status).toBe(400);
    const res = await decline(paymentId, 'Invoice details do not match the purchase order');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('declined');

    const row = db.prepare('SELECT status, decline_reason, declined_by, declined_at FROM payments WHERE id = ?').get(paymentId) as Record<string, string>;
    expect(row).toEqual(expect.objectContaining({ status: 'failed', decline_reason: 'Invoice details do not match the purchase order', declined_by: admin.id }));
    expect(row.declined_at).toBeTruthy();
    expect(applicationIds().map(isPaymentSatisfied)).toEqual([false, false]);
    expect(notifications('payment_failed')[0].body).toContain('Invoice details do not match the purchase order');
    expect((await approve(paymentId)).status).toBe(409);
    expect((await decline(paymentId, 'again')).status).toBe(409);
  });

  it('CPA-5: after a decline the sponsor sees the reason and may send a new request', async () => {
    const { paymentId } = (await submit()).body.data;
    await decline(paymentId, 'Wrong learner count');
    const billing = await request(app).get('/api/v1/sponsor/billing').set('Authorization', `Bearer ${sponsor.token}`);
    expect(billing.status).toBe(200);
    expect(billing.body.data.payments).toEqual([expect.objectContaining({
      id: paymentId, status: 'failed', cohort_name: 'Spring Cohort', decline_reason: 'Wrong learner count',
    })]);
    const again = await submit();
    expect(again.status).toBe(201);
    expect(again.body.data.paymentId).not.toBe(paymentId);
  });

  it('CPA-6: only an administrator with billing.confirm may decide, and not on their own cohort', async () => {
    const { paymentId } = (await submit()).body.data;
    expect((await queue(sponsor.token)).status).toBe(403);
    expect((await approve(paymentId, sponsor.token)).status).toBe(403);
    expect((await decline(paymentId, 'no', sponsor.token)).status).toBe(403);

    db.prepare('UPDATE sponsor_cohorts SET sponsor_user_id = ? WHERE id = ?').run(admin.id, cohortId);
    expect((await approve(paymentId)).status).toBe(403);
    expect(applicationIds().map(isPaymentSatisfied)).toEqual([false, false]);
  });

  it('CPA-7: a learner applied after the request is not covered by it', async () => {
    const { paymentId } = (await submit()).body.data;
    const late = seedUser('student', 'Lee Late').id;
    const lateApp = uuidv4();
    db.prepare("INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, selected_tier, applied_at) VALUES (?, ?, ?, '', 'pending', 'paid', datetime('now', '+1 minute'))").run(lateApp, late, courseId);
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id, application_id) VALUES (?, ?, ?)').run(cohortId, late, lateApp);
    const res = await approve(paymentId);
    expect(res.body.data.learnersSettled).toBe(2);
    expect(isPaymentSatisfied(lateApp)).toBe(false);
  });

  it('CPA-8: the generic confirm route refuses a cohort payment so learners are never left unsettled', async () => {
    const { paymentId } = (await submit()).body.data;
    const res = await request(app).post(`/api/v1/admin/payments/${paymentId}/confirm`).set('Authorization', `Bearer ${admin.token}`).send({});
    expect(res.status).toBe(409);
    expect((db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as { status: string }).status).toBe('pending');
  });

  it('CPA-9: unknown or non-cohort payments are not found', async () => {
    expect((await approve(uuidv4())).status).toBe(404);
  });
});
