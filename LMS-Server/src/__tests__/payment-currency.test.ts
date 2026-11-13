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
