/**
 * Tests for Phase 11 C1a — Manual Payment Foundation.
 *
 * PAY-B1  — GET pricing returns price for priced course
 * PAY-B2  — GET pricing returns 0 for unpriced course
 * PAY-B3  — PUT pricing sets price (admin only)
 * PAY-B4  — PUT pricing rejects non-admin (401/403)
 * PAY-B5  — POST confirm updates status
 * PAY-B6  — POST confirm rejects non-admin
 * PAY-B7  — POST waive requires notes
 * PAY-B8  — Mint gate rejects pending payment
 * PAY-B9  — Mint gate allows confirmed payment
 * PAY-B10 — Mint gate allows free course
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
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
    VALUES ('${userId}', 'Pay User ${suffix}', 'pay-${suffix}@test.com', '${HASH}', '${role}', 'GTEST${suffix}', 'linked');
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

function seedPayment(userId: string, courseId: string, applicationId: string, amountCents: number, status: string = 'pending') {
  const paymentId = uuidv4();
  db.exec(`
    INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status)
    VALUES ('${paymentId}', '${userId}', '${courseId}', '${applicationId}', ${amountCents}, 'USD', 'manual', '${status}');
  `);
  return paymentId;
}

function seedEnrollment(userId: string, courseCode: string) {
  db.exec(`
    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${userId}', '${courseCode}');
  `);
}

function seedRequirements(courseId: string) {
  const reqId = uuidv4();
  db.exec(`
    INSERT INTO course_completion_requirements (id, course_id, require_all_lessons, lesson_threshold, required_quiz_ids, min_quiz_score, require_submissions)
    VALUES ('${reqId}', '${courseId}', 0, 0, '[]', 70, 0);
  `);
}

describe('Phase 11 C1a — Payment Endpoints', () => {
  // PAY-B1: GET pricing — priced course
  it('PAY-B1 — returns price for priced course', async () => {
    const adminId = seedUser('admin', 'b1-admin');
    const courseId = seedCourse('Paid Course', 'PAY-B1');
    seedPricing(courseId, 2500);

    const token = makeToken({ userId: adminId, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/pricing`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.priceCents).toBe(2500);
    expect(res.body.data.isFree).toBe(false);
    expect(res.body.data.currency).toBe('USD');
  });

  // PAY-B2: GET pricing — no pricing row
  it('PAY-B2 — returns 0 for unpriced course', async () => {
    const adminId = seedUser('admin', 'b2-admin');
    const courseId = seedCourse('Free Course', 'PAY-B2');

    const token = makeToken({ userId: adminId, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/pricing`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.priceCents).toBe(0);
    expect(res.body.data.isFree).toBe(true);
  });

  // PAY-B3: PUT pricing — admin sets price
  it('PAY-B3 — admin sets price', async () => {
    const adminId = seedUser('admin', 'b3-admin');
    const courseId = seedCourse('Course B3', 'PAY-B3');

    const token = makeToken({ userId: adminId, role: 'admin' });
    const res = await request(app)
      .put(`/api/v1/admin/courses/${courseId}/pricing`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priceCents: 1500 });

    expect(res.status).toBe(200);
    expect(res.body.data.priceCents).toBe(1500);
    expect(res.body.data.isFree).toBe(false);

    // Update price
    const res2 = await request(app)
      .put(`/api/v1/admin/courses/${courseId}/pricing`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priceCents: 3000 });

    expect(res2.status).toBe(200);
    expect(res2.body.data.priceCents).toBe(3000);
  });

  // PAY-B4: PUT pricing — non-admin rejected
  it('PAY-B4 — 401 unauthenticated, 403 student', async () => {
    const courseId = seedCourse('Course B4', 'PAY-B4');

    // 401 — no token
    const res1 = await request(app)
      .put(`/api/v1/admin/courses/${courseId}/pricing`)
      .send({ priceCents: 1500 });
    expect(res1.status).toBe(401);

    // 403 — student
    const studentId = seedUser('student', 'b4-student');
    const studentToken = makeToken({ userId: studentId, role: 'student' });
    const res2 = await request(app)
      .put(`/api/v1/admin/courses/${courseId}/pricing`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ priceCents: 1500 });
    expect(res2.status).toBe(403);
  });

  // PAY-B5: POST confirm — updates status
  it('PAY-B5 — admin confirms payment', async () => {
    const adminId = seedUser('admin', 'b5-admin');
    const studentId = seedUser('student', 'b5-student');
    const courseId = seedCourse('Course B5', 'PAY-B5');
    const appId = seedApplication(studentId, courseId, 'approved');
    const paymentId = seedPayment(studentId, courseId, appId, 2500, 'pending');

    const token = makeToken({ userId: adminId, role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/admin/payments/${paymentId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Bank transfer received' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('confirmed');
    expect(res.body.data.confirmedBy).toBe(adminId);
    expect(res.body.data.confirmedAt).toBeTruthy();
  });

  // PAY-B6: POST confirm — non-admin rejected
  it('PAY-B6 — non-admin cannot confirm payment', async () => {
    const studentId = seedUser('student', 'b6-student');
    const courseId = seedCourse('Course B6', 'PAY-B6');
    const appId = seedApplication(studentId, courseId, 'approved');
    const paymentId = seedPayment(studentId, courseId, appId, 2500, 'pending');

    // 401
    const res1 = await request(app)
      .post(`/api/v1/admin/payments/${paymentId}/confirm`);
    expect(res1.status).toBe(401);

    // 403
    const studentToken = makeToken({ userId: studentId, role: 'student' });
    const res2 = await request(app)
      .post(`/api/v1/admin/payments/${paymentId}/confirm`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res2.status).toBe(403);
  });

  // PAY-B7: POST waive — requires notes
  it('PAY-B7 — waive requires notes, 400 without', async () => {
    const adminId = seedUser('admin', 'b7-admin');
    const studentId = seedUser('student', 'b7-student');
    const courseId = seedCourse('Course B7', 'PAY-B7');
    const appId = seedApplication(studentId, courseId, 'approved');
    const paymentId = seedPayment(studentId, courseId, appId, 2500, 'pending');

    const token = makeToken({ userId: adminId, role: 'admin' });

    // No notes → 400
    const res1 = await request(app)
      .post(`/api/v1/admin/payments/${paymentId}/waive`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res1.status).toBe(400);

    // With notes → 200
    const res2 = await request(app)
      .post(`/api/v1/admin/payments/${paymentId}/waive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Scholarship recipient' });
    expect(res2.status).toBe(200);
    expect(res2.body.data.status).toBe('waived');
    expect(res2.body.data.notes).toBe('Scholarship recipient');
  });

  // PAY-B8: Mint gate — rejects pending payment
  it('PAY-B8 — mint returns 402 when payment pending', async () => {
    const adminId = seedUser('admin', 'b8-admin');
    const studentId = seedUser('student', 'b8-student');
    const courseId = seedCourse('Paid Course B8', 'PAY-B8');
    seedPricing(courseId, 2500);
    seedEnrollment(studentId, 'PAY-B8');
    seedRequirements(courseId);
    const appId = seedApplication(studentId, courseId, 'approved');
    seedPayment(studentId, courseId, appId, 2500, 'pending');

    const token = makeToken({ userId: adminId, role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PAYMENT_REQUIRED');
  });

  // PAY-B9: Mint gate — allows confirmed payment
  it('PAY-B9 — mint proceeds after payment confirmed', async () => {
    const adminId = seedUser('admin', 'b9-admin');
    const studentId = seedUser('student', 'b9-student');
    const courseId = seedCourse('Paid Course B9', 'PAY-B9');
    seedPricing(courseId, 2500);
    seedEnrollment(studentId, 'PAY-B9');
    seedRequirements(courseId);
    const appId = seedApplication(studentId, courseId, 'approved');
    seedPayment(studentId, courseId, appId, 2500, 'confirmed');

    const token = makeToken({ userId: adminId, role: 'admin' });

    // Mock mintCredential to avoid Soroban call
    const mintService = await import('../services/mintService.js');
    vi.spyOn(mintService, 'mintCredential').mockResolvedValue({
      credentialId: uuidv4(),
      txHash: 'mock-tx-hash-b9',
      tokenId: 1,
    });

    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);

    // Should not be 402 — payment is confirmed
    expect(res.status).not.toBe(402);
    // It may fail for other reasons (soroban mocking) but should pass payment gate
    vi.restoreAllMocks();
  });

  // PAY-B10: Mint gate — allows free course
  it('PAY-B10 — mint proceeds for free course (no pricing row)', async () => {
    const adminId = seedUser('admin', 'b10-admin');
    const studentId = seedUser('student', 'b10-student');
    const courseId = seedCourse('Free Course B10', 'PAY-B10');
    // No pricing row → free
    seedEnrollment(studentId, 'PAY-B10');
    seedRequirements(courseId);
    const appId = seedApplication(studentId, courseId, 'approved');

    const token = makeToken({ userId: adminId, role: 'admin' });

    // Mock mintCredential to avoid Soroban call
    const mintService = await import('../services/mintService.js');
    vi.spyOn(mintService, 'mintCredential').mockResolvedValue({
      credentialId: uuidv4(),
      txHash: 'mock-tx-hash-b10',
      tokenId: 2,
    });

    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);

    // Should not be 402 — course is free
    expect(res.status).not.toBe(402);
    vi.restoreAllMocks();
  });
});
