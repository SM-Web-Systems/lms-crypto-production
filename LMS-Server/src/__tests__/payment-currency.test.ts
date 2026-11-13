import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { createPayment } from '../services/paymentService.js';

const HASH = bcrypt.hashSync('password123', 4);

function seed(suffix: string) {
  const userId = uuidv4(); const courseId = uuidv4(); const appId = uuidv4();
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'student')`)
    .run(userId, `Currency ${suffix}`, `currency-${suffix}@test.invalid`, HASH);
  db.prepare(`INSERT INTO courses (id, title, course_code, sections) VALUES (?, ?, ?, '[]')`)
    .run(courseId, `Currency course ${suffix}`, `CUR${suffix}`);
  db.prepare(`INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status) VALUES (?, ?, ?, 'GTEST', 'pending')`)
    .run(appId, userId, courseId);
  return { userId, courseId, appId };
}

describe('certificate payment currency', () => {
  it('records the course currency instead of always USD', () => {
    const { userId, courseId, appId } = seed('zar');
    expect(createPayment(userId, courseId, appId, 1000, 'ZAR')).toMatchObject({ amount_cents: 1000, currency: 'ZAR', payment_method: 'manual', status: 'pending' });
  });

  it('keeps USD for callers that do not pass a currency and ignores malformed codes', () => {
    const a = seed('default'); const b = seed('bad');
    expect(createPayment(a.userId, a.courseId, a.appId, 500).currency).toBe('USD');
    expect(createPayment(b.userId, b.courseId, b.appId, 500, 'rand').currency).toBe('USD');
  });
});

describe('learner payment history', () => {
  it('hides the pending manual placeholder once a card payment for the same application is confirmed', async () => {
    const { getStudentPayments } = await import('../services/paymentService.js');
    const { userId, courseId, appId } = seed('history');
    const manual = createPayment(userId, courseId, appId, 1000, 'ZAR');
    expect(getStudentPayments(userId).map(p => p.id)).toEqual([manual.id]);
    const cardId = uuidv4();
    db.prepare(`INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1000, 'ZAR', 'paystack', 'confirmed', datetime('now', '+1 second'), datetime('now'))`).run(cardId, userId, courseId, appId);
    expect(getStudentPayments(userId).map(p => p.id)).toEqual([cardId]);
  });

  it('keeps a pending manual payment visible while nothing else is confirmed', async () => {
    const { getStudentPayments } = await import('../services/paymentService.js');
    const { userId, courseId, appId } = seed('history-pending');
    const manual = createPayment(userId, courseId, appId, 1000, 'ZAR');
    db.prepare(`INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1000, 'ZAR', 'paystack', 'pending', datetime('now'), datetime('now'))`).run(uuidv4(), userId, courseId, appId);
    expect(getStudentPayments(userId).map(p => p.id)).toContain(manual.id);
  });
});
