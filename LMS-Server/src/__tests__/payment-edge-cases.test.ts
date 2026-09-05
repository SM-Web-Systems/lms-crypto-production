/**
 * Payment Flow Hardening — Edge Case Tests (Initiative #4).
 *
 * Tests for payment scenarios not covered by payments.test.ts or
 * paystack-automation.test.ts. No production credentials or real
 * payment transactions.
 *
 * PAY-B26 — charge.success webhook with unknown reference
 * PAY-B27 — charge.success webhook with mismatched amount
 * PAY-B28 — Refund of already-refunded payment → 400
 * PAY-B29 — Refund of pending payment → 400
 * PAY-B30 — Paystack checkout 502 when fetch rejects
 * PAY-B31 — Paystack checkout for another user's application → 403
 * PAY-B32 — PUT /pricing with negative priceCents → 400
 * PAY-B33 — PUT /pricing with float priceCents → 400
 * PAY-B34 — charge.failed for unknown reference → 200 no crash
 * PAY-B35 — Paystack checkout for non-existent application → 404
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(role: 'admin' | 'student', suffix: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES ('${userId}', 'PayEdge ${suffix}', 'payedge-${suffix}@test.com', '${HASH}', '${role}', 'GTEST${suffix}', 'linked');
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

function seedPricing(courseId: string, priceCents: number) {
  const pricingId = uuidv4();
  db.exec(`
    INSERT INTO course_pricing (id, course_id, price_cents, currency, is_active)
    VALUES ('${pricingId}', '${courseId}', ${priceCents}, 'USD', 1);
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
  opts?: { method?: string; reference?: string },
) {
  const paymentId = uuidv4();
  const method = opts?.method ?? 'manual';
  const ref = opts?.reference ?? null;
  db.exec(`
    INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status, paystack_reference)
    VALUES ('${paymentId}', '${userId}', '${courseId}', '${applicationId}', ${amountCents}, 'USD', '${method}', '${status}', ${ref ? `'${ref}'` : 'NULL'});
  `);
  return paymentId;
}

function makeWebhookSignature(body: string): string {
  const secret = process.env.PAYSTACK_SECRET_KEY || '';
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

describe('Payment Edge Cases — Webhook Hardening', () => {
  // PAY-B26: charge.success with unknown reference
  it('PAY-B26 — charge.success with unknown reference returns 200 with no-match message', async () => {
    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference: `lms-pay-nonexistent-${Date.now()}`, status: 'success', amount: 1000, currency: 'USD' },
    });
    const signature = makeWebhookSignature(body);

    const res = await request(app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/no matching payment/i);
  });

  // PAY-B27: charge.success with mismatched amount
  it('PAY-B27 — charge.success with mismatched amount logs mismatch and does not confirm', async () => {
    const studentId = seedUser('student', 'b27-student');
    const courseId = seedCourse('Course B27', 'PAY-B27');
    const appId = seedApplication(studentId, courseId);
    const reference = `lms-pay-b27ref${Date.now()}`;
    seedPayment(studentId, courseId, appId, 2500, 'pending', { method: 'paystack', reference });

    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference, status: 'success', amount: 1000, currency: 'USD' }, // 1000 != 2500
    });
    const signature = makeWebhookSignature(body);

    const res = await request(app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/amount mismatch/i);

    // Payment should NOT be confirmed
    const payment = db.prepare('SELECT status FROM payments WHERE paystack_reference = ?').get(reference) as { status: string };
    expect(payment.status).toBe('pending');
  });

  // PAY-B34: charge.failed with unknown reference → 200 no crash
  it('PAY-B34 — charge.failed with unknown reference returns 200 without crashing', async () => {
    const body = JSON.stringify({
      event: 'charge.failed',
      data: { reference: `lms-pay-ghost-${Date.now()}`, status: 'failed', amount: 500, currency: 'USD' },
    });
    const signature = makeWebhookSignature(body);

    const res = await request(app)
      .post('/api/v1/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/failure recorded/i);
  });
});

describe('Payment Edge Cases — Refund Guards', () => {
  // PAY-B28: Refund of already-refunded payment
  it('PAY-B28 — refund of already-refunded payment returns 400', async () => {
    const adminId = seedUser('admin', 'b28-admin');
    const studentId = seedUser('student', 'b28-student');
    const courseId = seedCourse('Course B28', 'PAY-B28');
    const appId = seedApplication(studentId, courseId);
    const reference = `lms-pay-b28ref${Date.now()}`;
    const paymentId = seedPayment(studentId, courseId, appId, 2500, 'refunded', { method: 'paystack', reference });

    const adminToken = makeToken({ userId: adminId, email: 'payedge-b28-admin@test.com', role: 'admin' });

    const res = await request(app)
      .post(`/api/v1/admin/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Double refund attempt' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/confirmed/i);
  });

  // PAY-B29: Refund of pending payment
  it('PAY-B29 — refund of pending payment returns 400', async () => {
    const adminId = seedUser('admin', 'b29-admin');
    const studentId = seedUser('student', 'b29-student');
    const courseId = seedCourse('Course B29', 'PAY-B29');
    const appId = seedApplication(studentId, courseId);
    const reference = `lms-pay-b29ref${Date.now()}`;
    const paymentId = seedPayment(studentId, courseId, appId, 1500, 'pending', { method: 'paystack', reference });

    const adminToken = makeToken({ userId: adminId, email: 'payedge-b29-admin@test.com', role: 'admin' });

    const res = await request(app)
      .post(`/api/v1/admin/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Premature refund' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/confirmed/i);
  });
});

describe('Payment Edge Cases — Checkout Guards', () => {
  // PAY-B30: Paystack checkout 502 when fetch rejects
  it('PAY-B30 — Paystack checkout returns 502 when payment gateway is down', async () => {
    const studentId = seedUser('student', 'b30-student');
    const courseId = seedCourse('Paid Course B30', 'PAY-B30');
    seedPricing(courseId, 3000);
    const appId = seedApplication(studentId, courseId);

    const studentToken = makeToken({ userId: studentId, email: 'payedge-b30-student@test.com', role: 'student' });

    // Mock fetch to reject (network error)
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error: ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    const res = await request(app)
      .post('/api/v1/payments/checkout/paystack')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ applicationId: appId });

    expect(res.status).toBe(502);
    expect(res.body.error.message).toMatch(/payment gateway/i);

    vi.unstubAllGlobals();
  });

  // PAY-B31: Paystack checkout for another user's application
  it('PAY-B31 — Paystack checkout for another user\'s application returns 403', async () => {
    const ownerStudentId = seedUser('student', 'b31-owner');
    const otherStudentId = seedUser('student', 'b31-other');
    const courseId = seedCourse('Paid Course B31', 'PAY-B31');
    seedPricing(courseId, 2000);
    const appId = seedApplication(ownerStudentId, courseId); // owned by ownerStudentId

    const otherToken = makeToken({ userId: otherStudentId, email: 'payedge-b31-other@test.com', role: 'student' });

    const res = await request(app)
      .post('/api/v1/payments/checkout/paystack')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ applicationId: appId });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/not your/i);
  });

  // PAY-B35: Paystack checkout for non-existent application
  it('PAY-B35 — Paystack checkout for non-existent application returns 404', async () => {
    const studentId = seedUser('student', 'b35-student');
    const studentToken = makeToken({ userId: studentId, email: 'payedge-b35-student@test.com', role: 'student' });

    const res = await request(app)
      .post('/api/v1/payments/checkout/paystack')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ applicationId: uuidv4() });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/application not found/i);
  });
});

describe('Payment Edge Cases — Pricing Validation', () => {
  // PAY-B32: PUT /pricing with negative priceCents
  it('PAY-B32 — PUT /pricing with negative priceCents returns 400', async () => {
    const adminId = seedUser('admin', 'b32-admin');
    const courseId = seedCourse('Course B32', 'PAY-B32');

    const adminToken = makeToken({ userId: adminId, email: 'payedge-b32-admin@test.com', role: 'admin' });

    const res = await request(app)
      .put(`/api/v1/admin/courses/${courseId}/pricing`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priceCents: -100 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/non-negative integer/i);
  });

  // PAY-B33: PUT /pricing with float priceCents
  it('PAY-B33 — PUT /pricing with float priceCents returns 400', async () => {
    const adminId = seedUser('admin', 'b33-admin');
    const courseId = seedCourse('Course B33', 'PAY-B33');

    const adminToken = makeToken({ userId: adminId, email: 'payedge-b33-admin@test.com', role: 'admin' });

    const res = await request(app)
      .put(`/api/v1/admin/courses/${courseId}/pricing`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priceCents: 25.50 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/non-negative integer/i);
  });
});
