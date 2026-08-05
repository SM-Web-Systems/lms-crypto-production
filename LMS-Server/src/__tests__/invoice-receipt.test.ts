/**
 * Phase 16 C1: Invoice/Receipt PDF Generation Tests
 *
 * INV-1  — GET /payments/:id/receipt returns PDF for confirmed payment (owner)
 * INV-2  — GET /payments/:id/receipt returns PDF for waived payment (owner)
 * INV-3  — GET /payments/:id/receipt rejects pending payment (400)
 * INV-4  — GET /payments/:id/receipt rejects non-owner non-admin (403)
 * INV-5  — GET /payments/:id/receipt allows admin to download any receipt
 * INV-6  — GET /payments/:id/receipt returns 404 for unknown payment
 * INV-7  — getReceiptData returns correct joined data
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { getReceiptData } from '../services/invoiceService.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(role: 'admin' | 'student', suffix: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES ('${userId}', 'Invoice User ${suffix}', 'inv-${suffix}@test.com', '${HASH}', '${role}', 'GINV${suffix}', 'linked');
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

function seedPayment(userId: string, courseId: string, status: string, method = 'paystack', amountCents = 5000) {
  const paymentId = uuidv4();
  const confirmedAt = (status === 'confirmed' || status === 'waived') ? "datetime('now')" : 'NULL';
  db.exec(`
    INSERT INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status, confirmed_at)
    VALUES ('${paymentId}', '${userId}', '${courseId}', ${amountCents}, 'USD', '${method}', '${status}', ${confirmedAt});
  `);
  return paymentId;
}

describe('Phase 16 C1 — Invoice/Receipt PDF', () => {
  let studentId: string;
  let adminId: string;
  let otherStudentId: string;
  let courseId: string;
  let confirmedPaymentId: string;
  let waivedPaymentId: string;
  let pendingPaymentId: string;
  let studentToken: string;
  let adminToken: string;
  let otherStudentToken: string;

  // Use unique suffix to avoid conflicts with other test files
  const suffix = uuidv4().slice(0, 6);

  beforeEach(() => {
    studentId = seedUser('student', `stu-${suffix}`);
    adminId = seedUser('admin', `adm-${suffix}`);
    otherStudentId = seedUser('student', `oth-${suffix}`);
    courseId = seedCourse(`Invoice Test Course ${suffix}`, `INV-${suffix}`);

    confirmedPaymentId = seedPayment(studentId, courseId, 'confirmed', 'paystack', 5000);
    waivedPaymentId = seedPayment(studentId, courseId, 'waived', 'waived', 0);
    pendingPaymentId = seedPayment(studentId, courseId, 'pending', 'manual', 5000);

    studentToken = makeToken({ userId: studentId, email: `inv-stu-${suffix}@test.com`, role: 'student' });
    adminToken = makeToken({ userId: adminId, email: `inv-adm-${suffix}@test.com`, role: 'admin' });
    otherStudentToken = makeToken({ userId: otherStudentId, email: `inv-oth-${suffix}@test.com`, role: 'student' });
  });

  it('INV-1 — returns PDF for confirmed payment (owner)', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${confirmedPaymentId}/receipt`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('receipt-');
    expect(res.headers['content-disposition']).toContain('.pdf');
    // PDF magic bytes: %PDF
    expect(res.body.slice(0, 5).toString()).toContain('%PDF');
  });

  it('INV-2 — returns PDF for waived payment (owner)', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${waivedPaymentId}/receipt`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });

  it('INV-3 — rejects pending payment (400)', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${pendingPaymentId}/receipt`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('confirmed or waived');
  });

  it('INV-4 — rejects non-owner non-admin (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${confirmedPaymentId}/receipt`)
      .set('Authorization', `Bearer ${otherStudentToken}`);

    expect(res.status).toBe(403);
  });

  it('INV-5 — admin can download any receipt', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${confirmedPaymentId}/receipt`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });

  it('INV-6 — returns 404 for unknown payment', async () => {
    const fakeId = uuidv4();
    const res = await request(app)
      .get(`/api/v1/payments/${fakeId}/receipt`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(404);
  });

  it('INV-7 — getReceiptData returns correct joined data', () => {
    const data = getReceiptData(confirmedPaymentId);
    expect(data).not.toBeNull();
    expect(data!.paymentId).toBe(confirmedPaymentId);
    expect(data!.studentName).toContain('Invoice User');
    expect(data!.courseName).toContain('Invoice Test Course');
    expect(data!.amountCents).toBe(5000);
    expect(data!.currency).toBe('USD');
    expect(data!.paymentMethod).toBe('paystack');
    expect(data!.status).toBe('confirmed');
  });
});
