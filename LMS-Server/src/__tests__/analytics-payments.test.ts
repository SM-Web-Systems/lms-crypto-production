/**
 * Tests for GET /api/v1/analytics/payments (Phase 19 C1 — payment analytics).
 *
 * ANA-BE-1 — Returns correct revenue totals (confirmed + waived only)
 * ANA-BE-2 — Revenue by course breakdown matches seeded data
 * ANA-BE-3 — Revenue by method breakdown matches seeded data
 * ANA-BE-4 — Non-admin gets 403, unauthenticated gets 401
 */

import { describe, it, expect } from 'vitest';
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
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${userId}', 'ANA User ${suffix}', 'ana-${suffix}@test.com', '${HASH}', '${role}');
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

function seedApplication(userId: string, courseId: string) {
  const appId = uuidv4();
  db.exec(`
    INSERT OR IGNORE INTO course_nft_applications (id, user_id, course_id, wallet_address, status)
    VALUES ('${appId}', '${userId}', '${courseId}', 'GTESTWALLET', 'approved');
  `);
  return appId;
}

function seedPayment(
  userId: string,
  courseId: string,
  amountCents: number,
  status: string,
  method: string = 'manual',
) {
  const paymentId = uuidv4();
  db.exec(`
    INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status, created_at, updated_at)
    VALUES ('${paymentId}', '${userId}', '${courseId}', NULL, ${amountCents}, 'USD', '${method}', '${status}', datetime('now'), datetime('now'));
  `);
  return paymentId;
}

describe('GET /api/v1/analytics/payments', () => {
  // ANA-BE-4: Auth checks
  it('ANA-BE-4a — 401 when no token', async () => {
    const res = await request(app).get('/api/v1/analytics/payments');
    expect(res.status).toBe(401);
  });

  it('ANA-BE-4b — 403 when student token', async () => {
    const userId = seedUser('student', uuidv4().slice(0, 8));
    const token = makeToken({ userId, email: `ana-${userId.slice(0, 8)}@test.com`, role: 'student' });
    const res = await request(app)
      .get('/api/v1/analytics/payments')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  // ANA-BE-1: Revenue totals
  it('ANA-BE-1 — returns correct revenue totals (confirmed + waived only)', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ana-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const courseId = seedCourse('Revenue Test', `ANA1-${uuidv4().slice(0, 6)}`);

    seedPayment(adminId, courseId, 2500, 'confirmed', 'paystack');
    seedPayment(adminId, courseId, 1000, 'waived', 'waived');
    seedPayment(adminId, courseId, 3000, 'pending', 'manual');
    seedPayment(adminId, courseId, 500, 'failed', 'paystack');

    const res = await request(app)
      .get('/api/v1/analytics/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { summary } = res.body.data;
    expect(summary.totalRevenueCents).toBeGreaterThanOrEqual(3500);
    expect(summary.confirmedPayments).toBeGreaterThanOrEqual(1);
    expect(summary.waivedPayments).toBeGreaterThanOrEqual(1);
    expect(summary.pendingPayments).toBeGreaterThanOrEqual(1);
    expect(summary.failedPayments).toBeGreaterThanOrEqual(1);
  });

  // ANA-BE-2: Revenue by course
  it('ANA-BE-2 — revenue by course breakdown matches seeded data', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ana-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const code = `ANA2-${uuidv4().slice(0, 6)}`;
    const courseId = seedCourse('Course By Revenue', code);
    seedPayment(adminId, courseId, 5000, 'confirmed', 'paystack');

    const res = await request(app)
      .get('/api/v1/analytics/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const course = res.body.data.byCourse.find(
      (c: { courseId: string }) => c.courseId === courseId,
    );
    expect(course).toBeDefined();
    expect(course.courseName).toBe('Course By Revenue');
    expect(course.revenueCents).toBe(5000);
    expect(course.paymentCount).toBeGreaterThanOrEqual(1);
  });

  // ANA-BE-3: Revenue by method
  it('ANA-BE-3 — revenue by method breakdown matches seeded data', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ana-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const courseId = seedCourse('Method Test', `ANA3-${uuidv4().slice(0, 6)}`);
    seedPayment(adminId, courseId, 4000, 'confirmed', 'stellar_xlm');

    const res = await request(app)
      .get('/api/v1/analytics/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const stellar = res.body.data.byMethod.find(
      (m: { method: string }) => m.method === 'stellar_xlm',
    );
    expect(stellar).toBeDefined();
    expect(stellar.revenueCents).toBeGreaterThanOrEqual(4000);
    expect(stellar.count).toBeGreaterThanOrEqual(1);
  });
});
