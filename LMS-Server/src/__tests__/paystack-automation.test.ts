/**
 * Tests for Phase 12 C1 — Paystack + Stellar Payment Automation.
 *
 * PAY-B11 — Paystack checkout creates payment + returns URL
 * PAY-B12 — Paystack checkout rejects free course
 * PAY-B13 — Paystack checkout rejects already-paid application
 * PAY-B14 — Webhook charge.success confirms payment
 * PAY-B15 — Webhook invalid signature returns 401
 * PAY-B16 — Webhook duplicate event is idempotent
 * PAY-B17 — Webhook charge.failed sets status to failed
 * PAY-B18 — Stellar checkout returns memo + address
 * PAY-B19 — Stellar checkout rejects missing XLM price
 * PAY-B20 — Payment status returns correct state
 * PAY-B21 — Payment status rejects wrong user
 * PAY-B22 — Refund updates status to refunded
 * PAY-B23 — Refund rejects non-paystack payment
 * PAY-B24 — Student payment history returns own payments
 * PAY-B25 — Pricing endpoint includes stellar fields
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);
const TEST_PAYSTACK_SECRET = 'test-only-jwt-secret-do-not-use-in-production'; // matches vitest env

function seedUser(role: 'admin' | 'student', suffix: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES ('${userId}', 'PayAuto ${suffix}', 'payauto-${suffix}@test.com', '${HASH}', '${role}', 'GTEST${suffix}', 'linked');
  `);
  return userId;
}

function seedCourse(title: string, code: string) {
  const courseId = uuidv4();
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections)
    VALUES ('${courseId}', '${title}', '${code}', '[]');
  `);
  return courseId;
}

function seedPricing(courseId: string, priceCents: number, xlm?: number, usdc?: number) {
  const pricingId = uuidv4();
  db.exec(`
    INSERT INTO course_pricing (id, course_id, price_cents, currency, is_active, stellar_price_xlm, stellar_price_usdc)
    VALUES ('${pricingId}', '${courseId}', ${priceCents}, 'USD', 1, ${xlm ?? 'NULL'}, ${usdc ?? 'NULL'});
  `);
  return pricingId;
}

function seedApplication(userId: string, courseId: string, status: string = 'approved') {
  const appId = uuidv4();
  db.exec(`
    INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status)
    VALUES ('${appId}', '${userId}', '${courseId}', 'GTESTWALLET', '${status}');
  `);
  return appId;
}

function seedPayment(
  userId: string, courseId: string, applicationId: string,
  amountCents: number, status: string = 'pending',
  opts?: { method?: string; reference?: string; memo?: string },
) {
  const paymentId = uuidv4();
  const method = opts?.method ?? 'manual';
  const ref = opts?.reference ?? null;
  const memo = opts?.memo ?? null;
  db.exec(`
    INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status, paystack_reference, stellar_memo)
    VALUES ('${paymentId}', '${userId}', '${courseId}', '${applicationId}', ${amountCents}, 'USD', '${method}', '${status}', ${ref ? `'${ref}'` : 'NULL'}, ${memo ? `'${memo}'` : 'NULL'});
  `);
  return paymentId;
}

function makeWebhookSignature(body: string): string {
  // In tests, PAYSTACK_SECRET_KEY defaults to empty string or process.env value.
  // We use the JWT_SECRET from vitest config as a stand-in since we control both.
  const secret = process.env.PAYSTACK_SECRET_KEY || '';
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

describe('Phase 12 C1 — Paystack + Stellar Automation', () => {
  // PAY-B11: Paystack checkout
  it('PAY-B11 — Paystack checkout creates payment (mocked)', async () => {
    const studentId = seedUser('student', 'b11-student');
    const courseId = seedCourse('Paid Course B11', 'PAY-B11');
    seedPricing(courseId, 2500);
    const appId = seedApplication(studentId, courseId);

    const studentToken = makeToken({ userId: studentId, role: 'student' });

    // Mock global fetch for Paystack API
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/test123',
          access_code: 'test-access-code',
          reference: 'lms-pay-mockref123456',
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await request(app)
      .post('/api/v1/payments/checkout/paystack')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ applicationId: appId });

    expect(res.status).toBe(201);
    expect(res.body.data.checkoutUrl).toBe('https://checkout.paystack.com/test123');
    expect(res.body.data.reference).toBeTruthy();
    expect(res.body.data.paymentId).toBeTruthy();

    vi.unstubAllGlobals();
  });

  // PAY-B12: Paystack checkout rejects free course
  it('PAY-B12 — Paystack checkout rejects free course', async () => {
    const studentId = seedUser('student', 'b12-student');
    const courseId = seedCourse('Free Course B12', 'PAY-B12');
    // No pricing = free
    const appId = seedApplication(studentId, courseId);

    const studentToken = makeToken({ userId: studentId, role: 'student' });

    const res = await request(app)
      .post('/api/v1/payments/checkout/paystack')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ applicationId: appId });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/free/i);
  });

  // PAY-B13: Paystack checkout rejects already-paid
  it('PAY-B13 — Paystack checkout rejects already-paid', async () => {
    const studentId = seedUser('student', 'b13-student');
    const courseId = seedCourse('Paid Course B13', 'PAY-B13');
    seedPricing(courseId, 3000);
    const appId = seedApplication(studentId, courseId);
    seedPayment(studentId, courseId, appId, 3000, 'confirmed');

    const studentToken = makeToken({ userId: studentId, role: 'student' });

    const res = await request(app)
      .post('/api/v1/payments/checkout/paystack')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ applicationId: appId });

    expect(res.status).toBe(409);
  });

  // PAY-B14: Webhook charge.success confirms payment
  it('PAY-B14 — webhook charge.success confirms payment', async () => {
    const studentId = seedUser('student', 'b14-student');
    const courseId = seedCourse('Paid Course B14', 'PAY-B14');
    const appId = seedApplication(studentId, courseId);
    const reference = `lms-pay-b14ref${Date.now()}`;
    seedPayment(studentId, courseId, appId, 2500, 'pending', { method: 'paystack', reference });

    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference, status: 'success', amount: 2500, currency: 'USD' },
    });
    const signature = makeWebhookSignature(body);

    const res = await request(app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/confirmed/i);

    // Verify payment was confirmed in DB
    const payment = db.prepare('SELECT status FROM payments WHERE paystack_reference = ?').get(reference) as { status: string };
    expect(payment.status).toBe('confirmed');
  });

  // PAY-B15: Webhook invalid signature
  it('PAY-B15 — webhook rejects invalid signature', async () => {
    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'fake-ref', status: 'success', amount: 100, currency: 'USD' },
    });

    const res = await request(app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'invalid-signature')
      .send(body);

    expect(res.status).toBe(401);
  });

  // PAY-B16: Webhook duplicate event is idempotent
  it('PAY-B16 — webhook duplicate event is idempotent', async () => {
    const studentId = seedUser('student', 'b16-student');
    const courseId = seedCourse('Paid Course B16', 'PAY-B16');
    const appId = seedApplication(studentId, courseId);
    const reference = `lms-pay-b16ref${Date.now()}`;
    seedPayment(studentId, courseId, appId, 1000, 'pending', { method: 'paystack', reference });

    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference, status: 'success', amount: 1000, currency: 'USD' },
    });
    const signature = makeWebhookSignature(body);

    // First call
    const res1 = await request(app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(body);
    expect(res1.status).toBe(200);

    // Second call — should be idempotent
    const res2 = await request(app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(body);
    expect(res2.status).toBe(200);
    expect(res2.body.message).toMatch(/already/i);
  });

  // PAY-B17: Webhook charge.failed
  it('PAY-B17 — webhook charge.failed sets status to failed', async () => {
    const studentId = seedUser('student', 'b17-student');
    const courseId = seedCourse('Paid Course B17', 'PAY-B17');
    const appId = seedApplication(studentId, courseId);
    const reference = `lms-pay-b17ref${Date.now()}`;
    seedPayment(studentId, courseId, appId, 2000, 'pending', { method: 'paystack', reference });

    const body = JSON.stringify({
      event: 'charge.failed',
      data: { reference, status: 'failed', amount: 2000, currency: 'USD' },
    });
    const signature = makeWebhookSignature(body);

    const res = await request(app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(body);

    expect(res.status).toBe(200);

    const payment = db.prepare('SELECT status FROM payments WHERE paystack_reference = ?').get(reference) as { status: string };
    expect(payment.status).toBe('failed');
  });

  // PAY-B18: Stellar checkout returns memo + address
  it('PAY-B18 — Stellar checkout returns memo + address', async () => {
    const studentId = seedUser('student', 'b18-student');
    const courseId = seedCourse('Stellar Course B18', 'PAY-B18');
    seedPricing(courseId, 5000, 100); // 100 XLM
    const appId = seedApplication(studentId, courseId);

    const studentToken = makeToken({ userId: studentId, role: 'student' });

    const res = await request(app)
      .post('/api/v1/payments/checkout/stellar')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ applicationId: appId });

    expect(res.status).toBe(201);
    expect(res.body.data.memo).toBeTruthy();
    expect(res.body.data.memo.length).toBeLessThanOrEqual(28);
    expect(res.body.data.amount).toBe(100);
    expect(res.body.data.currency).toBe('XLM');
    expect(res.body.data.paymentId).toBeTruthy();
  });

  // PAY-B19: Stellar checkout rejects missing XLM price
  it('PAY-B19 — Stellar checkout rejects missing XLM price', async () => {
    const studentId = seedUser('student', 'b19-student');
    const courseId = seedCourse('No-XLM Course B19', 'PAY-B19');
    seedPricing(courseId, 5000); // No XLM price
    const appId = seedApplication(studentId, courseId);

    const studentToken = makeToken({ userId: studentId, role: 'student' });

    const res = await request(app)
      .post('/api/v1/payments/checkout/stellar')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ applicationId: appId });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/XLM/);
  });

  // PAY-B20: Payment status returns correct state
  it('PAY-B20 — payment status returns correct state', async () => {
    const studentId = seedUser('student', 'b20-student');
    const courseId = seedCourse('Course B20', 'PAY-B20');
    const appId = seedApplication(studentId, courseId);
    const paymentId = seedPayment(studentId, courseId, appId, 1500, 'pending');

    const studentToken = makeToken({ userId: studentId, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/payments/${paymentId}/status`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.amountCents).toBe(1500);
  });

  // PAY-B21: Payment status rejects wrong user
  it('PAY-B21 — payment status rejects wrong user', async () => {
    const studentId = seedUser('student', 'b21-student');
    const otherId = seedUser('student', 'b21-other');
    const courseId = seedCourse('Course B21', 'PAY-B21');
    const appId = seedApplication(studentId, courseId);
    const paymentId = seedPayment(studentId, courseId, appId, 1500, 'pending');

    const otherToken = makeToken({ userId: otherId, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/payments/${paymentId}/status`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });

  // PAY-B22: Refund updates status
  it('PAY-B22 — refund updates status to refunded (mocked)', async () => {
    const adminId = seedUser('admin', 'b22-admin');
    const studentId = seedUser('student', 'b22-student');
    const courseId = seedCourse('Course B22', 'PAY-B22');
    const appId = seedApplication(studentId, courseId);
    const reference = `lms-pay-b22ref${Date.now()}`;
    const paymentId = seedPayment(studentId, courseId, appId, 2500, 'confirmed', { method: 'paystack', reference });

    const adminToken = makeToken({ userId: adminId, role: 'admin' });

    // Mock fetch for Paystack refund API
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ status: true, data: { id: 1, status: 'processed', amount: 2500 } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await request(app)
      .post(`/api/v1/admin/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Customer requested refund' });

    expect(res.status).toBe(200);

    const payment = db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId) as { status: string };
    expect(payment.status).toBe('refunded');

    vi.unstubAllGlobals();
  });

  // PAY-B23: Refund rejects non-paystack payment
  it('PAY-B23 — refund rejects non-paystack payment', async () => {
    const adminId = seedUser('admin', 'b23-admin');
    const studentId = seedUser('student', 'b23-student');
    const courseId = seedCourse('Course B23', 'PAY-B23');
    const appId = seedApplication(studentId, courseId);
    const paymentId = seedPayment(studentId, courseId, appId, 2500, 'confirmed', { method: 'manual' });

    const adminToken = makeToken({ userId: adminId, role: 'admin' });

    const res = await request(app)
      .post(`/api/v1/admin/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/paystack/i);
  });

  // PAY-B24: Student payment history
  it('PAY-B24 — student payment history returns own payments', async () => {
    const studentId = seedUser('student', 'b24-student');
    const courseId = seedCourse('Course B24', 'PAY-B24');
    const appId = seedApplication(studentId, courseId);
    seedPayment(studentId, courseId, appId, 1000, 'pending');
    seedPayment(studentId, courseId, appId, 2000, 'confirmed');

    const studentToken = makeToken({ userId: studentId, role: 'student' });

    const res = await request(app)
      .get('/api/v1/payments/mine')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].amountCents).toBeDefined();
  });

  // PAY-B25: Pricing endpoint includes stellar fields
  it('PAY-B25 — pricing endpoint includes stellar fields', async () => {
    const adminId = seedUser('admin', 'b25-admin');
    const courseId = seedCourse('Course B25', 'PAY-B25');
    seedPricing(courseId, 5000, 150, 50);

    const token = makeToken({ userId: adminId, role: 'admin' });

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/pricing`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.stellarPriceXlm).toBe(150);
    expect(res.body.data.stellarPriceUsdc).toBe(50);
    expect(res.body.data.paymentMethods).toContain('stellar_xlm');
    expect(res.body.data.paymentMethods).toContain('stellar_usdc');
  });
});
