/**
 * Phase 23 C3 — Notifications v2 backend tests (12 tests).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { execute, query, queryOne } from '../config/database.js';
import { createNotification, getPreferences, updatePreferences, createBroadcast, CONFIGURABLE_TYPES } from '../services/notificationService.js';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const adminId = uuidv4();
const studentId = uuidv4();
const student2Id = uuidv4();
const lecturerId = uuidv4();

function getToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' });
}

function seedUsers(): void {
  for (const [id, name, email, role] of [
    [adminId, 'Admin', 'notif-admin@test.com', 'admin'],
    [studentId, 'Student', 'notif-student@test.com', 'student'],
    [student2Id, 'Student2', 'notif-student2@test.com', 'student'],
    [lecturerId, 'Lecturer', 'notif-lecturer@test.com', 'lecturer'],
  ] as const) {
    execute(
      `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'hashed', ?)`,
      [id, name, email, role]
    );
  }
}

// ── PREF-1 ────────────────────────────────────────────────────────────────
describe('PREF-1 — Preferences default to enabled', () => {
  beforeEach(() => { seedUsers(); });

  it('should return all configurable types as enabled when no rows exist', () => {
    const prefs = getPreferences(studentId);
    expect(prefs).toHaveLength(CONFIGURABLE_TYPES.length);
    for (const p of prefs) {
      expect(p.enabled).toBe(true);
    }
  });
});

// ── PREF-2 ────────────────────────────────────────────────────────────────
describe('PREF-2 — Opted-out user does not receive notification', () => {
  beforeEach(() => { seedUsers(); });

  it('should skip creation when user opted out, but force bypasses', () => {
    updatePreferences(studentId, [{ type: 'course_enrolled', enabled: false }]);

    createNotification({
      userId: studentId, type: 'course_enrolled',
      title: 'Enrolled', body: 'You enrolled',
    });

    const skipped = queryOne<{ id: string }>(
      `SELECT id FROM notifications WHERE user_id = ? AND type = 'course_enrolled'`,
      [studentId]
    );
    expect(skipped).toBeNull();

    createNotification({
      userId: studentId, type: 'course_enrolled',
      title: 'Forced', body: 'Forced', force: true,
    });

    const forced = queryOne<{ id: string }>(
      `SELECT id FROM notifications WHERE user_id = ? AND type = 'course_enrolled'`,
      [studentId]
    );
    expect(forced).toBeDefined();
  });
});

// ── PREF-3 ────────────────────────────────────────────────────────────────
describe('PREF-3 — GET preferences returns correct state', () => {
  beforeEach(() => { seedUsers(); });

  it('should return overridden preferences', async () => {
    updatePreferences(studentId, [
      { type: 'course_enrolled', enabled: false },
      { type: 'payment_failed', enabled: false },
    ]);

    const res = await request(app)
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${getToken(studentId, 'student')}`);

    expect(res.status).toBe(200);
    const prefs = res.body.data.preferences;
    expect(prefs).toHaveLength(CONFIGURABLE_TYPES.length);
    expect(prefs.find((p: any) => p.type === 'course_enrolled').enabled).toBe(false);
    expect(prefs.find((p: any) => p.type === 'payment_failed').enabled).toBe(false);
    expect(prefs.find((p: any) => p.type === 'nft_approved').enabled).toBe(true);
    expect(prefs.find((p: any) => p.type === 'admin_broadcast')).toBeUndefined();
  });
});

// ── PREF-4 ────────────────────────────────────────────────────────────────
describe('PREF-4 — PUT preferences upserts and rejects admin_broadcast', () => {
  beforeEach(() => { seedUsers(); });

  it('should upsert and reject admin_broadcast', async () => {
    const token = getToken(studentId, 'student');

    const res = await request(app)
      .put('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: [{ type: 'nft_approved', enabled: false }] });

    expect(res.status).toBe(200);
    const row = queryOne<{ enabled: number }>(
      `SELECT enabled FROM notification_preferences WHERE user_id = ? AND type = 'nft_approved'`,
      [studentId]
    );
    expect(row?.enabled).toBe(0);

    const res2 = await request(app)
      .put('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: [{ type: 'admin_broadcast', enabled: false }] });

    expect(res2.status).toBe(400);
  });
});

// ── NOTIF-1 ───────────────────────────────────────────────────────────────
describe('NOTIF-1 — GET with pagination', () => {
  beforeEach(() => { seedUsers(); });

  it('should return correct page and totalPages', async () => {
    for (let i = 0; i < 25; i++) {
      createNotification({ userId: studentId, type: 'nft_approved', title: `N${i}`, body: `B${i}`, force: true });
    }

    const token = getToken(studentId, 'student');
    const res1 = await request(app)
      .get('/api/v1/notifications?page=1&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res1.status).toBe(200);
    expect(res1.body.data.notifications).toHaveLength(10);
    expect(res1.body.data.page).toBe(1);
    expect(res1.body.data.totalPages).toBe(3);
    expect(res1.body.data.total).toBe(25);

    const res3 = await request(app)
      .get('/api/v1/notifications?page=3&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res3.body.data.notifications).toHaveLength(5);
  });
});

// ── NOTIF-2 ───────────────────────────────────────────────────────────────
describe('NOTIF-2 — GET with type filter', () => {
  beforeEach(() => { seedUsers(); });

  it('should return only matching type', async () => {
    createNotification({ userId: studentId, type: 'nft_approved', title: 'A', body: 'B', force: true });
    createNotification({ userId: studentId, type: 'submission_reviewed', title: 'C', body: 'D', force: true });
    createNotification({ userId: studentId, type: 'nft_approved', title: 'E', body: 'F', force: true });

    const res = await request(app)
      .get('/api/v1/notifications?type=nft_approved')
      .set('Authorization', `Bearer ${getToken(studentId, 'student')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.notifications).toHaveLength(2);
    for (const n of res.body.data.notifications) {
      expect(n.type).toBe('nft_approved');
    }
  });
});

// ── NOTIF-3 ───────────────────────────────────────────────────────────────
describe('NOTIF-3 — PUT read-all', () => {
  beforeEach(() => { seedUsers(); });

  it('should mark all unread as read and return count', async () => {
    for (let i = 0; i < 3; i++) {
      createNotification({ userId: studentId, type: 'nft_approved', title: `N${i}`, body: 'B', force: true });
    }

    const token = getToken(studentId, 'student');
    const res = await request(app)
      .put('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(3);

    const unread = queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND read = 0',
      [studentId]
    );
    expect(unread?.cnt).toBe(0);

    const res2 = await request(app)
      .put('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res2.body.data.updated).toBe(0);
  });
});

// ── BCAST-1 ───────────────────────────────────────────────────────────────
describe('BCAST-1 — POST broadcast to all users', () => {
  beforeEach(() => { seedUsers(); });

  it('should create notifications for all users', async () => {
    const res = await request(app)
      .post('/api/v1/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${getToken(adminId, 'admin')}`)
      .send({ title: 'System Down', body: 'Maintenance Saturday.', target: 'all' });

    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBeGreaterThanOrEqual(4);

    const notif = queryOne<{ title: string; type: string }>(
      `SELECT title, type FROM notifications WHERE user_id = ? AND type = 'admin_broadcast'`,
      [studentId]
    );
    expect(notif?.title).toBe('System Down');
  });
});

// ── BCAST-2 ───────────────────────────────────────────────────────────────
describe('BCAST-2 — POST broadcast filtered by role', () => {
  beforeEach(() => { seedUsers(); });

  it('should send only to matching role', async () => {
    const res = await request(app)
      .post('/api/v1/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${getToken(adminId, 'admin')}`)
      .send({ title: 'Students Only', body: 'For students.', target: 'student' });

    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBeGreaterThanOrEqual(2);

    const lecNotif = queryOne<{ id: string }>(
      `SELECT id FROM notifications WHERE user_id = ? AND type = 'admin_broadcast' AND title = 'Students Only'`,
      [lecturerId]
    );
    expect(lecNotif).toBeNull();

    const stuNotif = queryOne<{ id: string }>(
      `SELECT id FROM notifications WHERE user_id = ? AND type = 'admin_broadcast' AND title = 'Students Only'`,
      [studentId]
    );
    expect(stuNotif).toBeDefined();
  });
});

// ── BCAST-3 ───────────────────────────────────────────────────────────────
describe('BCAST-3 — POST broadcast requires permission', () => {
  beforeEach(() => { seedUsers(); });

  it('should return 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/v1/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${getToken(studentId, 'student')}`)
      .send({ title: 'Hack', body: 'Fail.', target: 'all' });

    expect(res.status).toBe(403);
  });
});

// ── EMIT-1 ────────────────────────────────────────────────────────────────
describe('EMIT-1 — Course enrollment emits notifications', () => {
  beforeEach(() => { seedUsers(); });

  it('should create course_enrolled + new_enrollment', async () => {
    const courseId = uuidv4();
    const courseCode = 'EMIT1-' + Date.now();
    execute(
      `INSERT INTO courses (id, course_code, title, description) VALUES (?, ?, 'Emit1 Course', 'Test')`,
      [courseId, courseCode]
    );

    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/members`)
      .set('Authorization', `Bearer ${getToken(adminId, 'admin')}`)
      .send({ userId: studentId });

    expect(res.status).toBe(201);

    const stuNotif = queryOne<{ type: string }>(
      `SELECT type FROM notifications WHERE user_id = ? AND type = 'course_enrolled'`,
      [studentId]
    );
    expect(stuNotif?.type).toBe('course_enrolled');

    const adminNotif = queryOne<{ type: string }>(
      `SELECT type FROM notifications WHERE user_id = ? AND type = 'new_enrollment'`,
      [adminId]
    );
    expect(adminNotif?.type).toBe('new_enrollment');
  });
});

// ── EMIT-2 ────────────────────────────────────────────────────────────────
describe('EMIT-2 — Payment confirm emits notification', () => {
  beforeEach(() => { seedUsers(); });

  it('should create payment_confirmed on manual confirm', async () => {
    const courseId = uuidv4();
    const courseCode = 'EMIT2-' + Date.now();
    execute(
      `INSERT INTO courses (id, course_code, title, description) VALUES (?, ?, 'Emit2 Course', 'Test')`,
      [courseId, courseCode]
    );
    execute(`INSERT INTO course_pricing (id, course_id, price_cents, currency) VALUES (?, ?, 1000, 'ZAR')`, [uuidv4(), courseId]);

    const paymentId = uuidv4();
    execute(
      `INSERT INTO payments (id, user_id, course_id, payment_method, amount_cents, currency, status) VALUES (?, ?, ?, 'manual', 1000, 'ZAR', 'pending')`,
      [paymentId, studentId, courseId]
    );

    const res = await request(app)
      .post(`/api/v1/admin/payments/${paymentId}/confirm`)
      .set('Authorization', `Bearer ${getToken(adminId, 'admin')}`)
      .send({ notes: 'Test confirm' });

    expect(res.status).toBe(200);

    const notif = queryOne<{ type: string }>(
      `SELECT type FROM notifications WHERE user_id = ? AND type = 'payment_confirmed'`,
      [studentId]
    );
    expect(notif?.type).toBe('payment_confirmed');
  });
});
