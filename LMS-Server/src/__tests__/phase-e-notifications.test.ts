/**
 * Phase E tests — in-app notification system (Phase 7 C2)
 *
 * Covers:
 *  E1  — GET  /notifications (route tests)
 *  E1  — PUT  /notifications/:id/read (route tests)
 *  E2  — Notification emission (submission review, NFT approve/reject)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

// ─── Seed helpers ──────────────────────────────────────────────────────────────

function seedBase() {
  const adminId    = uuidv4();
  const studentId  = uuidv4();
  const student2Id = uuidv4();
  const courseId   = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}',    'Admin',    'admin-e@test.com',    '${HASH}', 'admin'),
      ('${studentId}',  'Student',  'student-e@test.com',  '${HASH}', 'student'),
      ('${student2Id}', 'Student2', 'student2-e@test.com', '${HASH}', 'student');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'Course E', 'desc', 'E-E-001', '[]');
  `);

  return { adminId, studentId, student2Id, courseId };
}

// ═══════════════════════════════════════════════════════════════════════════════
// E1 — Notification Routes
// ═══════════════════════════════════════════════════════════════════════════════

describe('E1 — Notification Routes', () => {
  let ids: ReturnType<typeof seedBase>;
  beforeEach(() => { ids = seedBase(); });

  it('E1-AC1: GET /notifications returns empty array for authenticated user', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-e@test.com', role: 'student' });
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.notifications).toEqual([]);
    expect(res.body.data.unreadCount).toBe(0);
  });

  it('E1-AC2: GET /notifications returns seeded notifications in desc order', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-e@test.com', role: 'student' });

    // Seed 3 notifications with explicit timestamps
    db.exec(`
      INSERT INTO notifications (id, user_id, type, title, body, link, created_at)
      VALUES
        ('${uuidv4()}', '${ids.studentId}', 'submission_reviewed', 'Oldest', 'body1', '/a', '2026-01-01T00:00:00'),
        ('${uuidv4()}', '${ids.studentId}', 'nft_approved',       'Middle', 'body2', '/b', '2026-06-01T00:00:00'),
        ('${uuidv4()}', '${ids.studentId}', 'nft_minted',         'Newest', 'body3', '/c', '2026-08-01T00:00:00');
    `);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const notifs = res.body.data.notifications;
    expect(notifs).toHaveLength(3);
    expect(notifs[0].title).toBe('Newest');
    expect(notifs[1].title).toBe('Middle');
    expect(notifs[2].title).toBe('Oldest');
  });

  it('E1-AC3: GET /notifications returns correct unreadCount', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-e@test.com', role: 'student' });

    // Seed 3 unread + 1 read
    db.exec(`
      INSERT INTO notifications (id, user_id, type, title, body, read)
      VALUES
        ('${uuidv4()}', '${ids.studentId}', 'submission_reviewed', 'A', 'a', 0),
        ('${uuidv4()}', '${ids.studentId}', 'nft_approved',       'B', 'b', 0),
        ('${uuidv4()}', '${ids.studentId}', 'nft_rejected',       'C', 'c', 0),
        ('${uuidv4()}', '${ids.studentId}', 'nft_minted',         'D', 'd', 1);
    `);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.unreadCount).toBe(3);
    expect(res.body.data.notifications).toHaveLength(4);
  });

  it('E1-AC4: PUT /notifications/:id/read marks as read (idempotent)', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-e@test.com', role: 'student' });
    const notifId = uuidv4();

    db.exec(`
      INSERT INTO notifications (id, user_id, type, title, body, read)
      VALUES ('${notifId}', '${ids.studentId}', 'submission_reviewed', 'Test', 'body', 0);
    `);

    // First PUT
    const res1 = await request(app)
      .put(`/api/v1/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);

    // Verify DB
    const row = db.prepare('SELECT read FROM notifications WHERE id = ?').get(notifId) as { read: number };
    expect(row.read).toBe(1);

    // Second PUT (idempotent)
    const res2 = await request(app)
      .put(`/api/v1/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(200);
  });

  it('E1-AC5: PUT /notifications/:id/read returns 403 for wrong user', async () => {
    const notifId = uuidv4();

    // Notification belongs to student1
    db.exec(`
      INSERT INTO notifications (id, user_id, type, title, body, read)
      VALUES ('${notifId}', '${ids.studentId}', 'submission_reviewed', 'Test', 'body', 0);
    `);

    // student2 tries to mark it read
    const token2 = makeToken({ userId: ids.student2Id, email: 'student2-e@test.com', role: 'student' });
    const res = await request(app)
      .put(`/api/v1/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E2 — Notification Emission
// ═══════════════════════════════════════════════════════════════════════════════

describe('E2 — Notification Emission', () => {
  let ids: ReturnType<typeof seedBase>;
  let studentsTableId: string;
  let submissionId: string;
  let nftAppId: string;

  beforeEach(() => {
    ids = seedBase();
    studentsTableId = uuidv4();
    submissionId = uuidv4();
    nftAppId = uuidv4();

    // Seed students table row linked to the user (submissions use students.id, not users.id)
    db.exec(`
      INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
      VALUES ('${studentsTableId}', '${ids.studentId}', 'Student', 'student-e@test.com', 'E-001', 'CS', 1);
    `);

    // Seed a submission for the review test
    db.exec(`
      INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status)
      VALUES ('${submissionId}', '${studentsTableId}', 'Week 3 Essay', 'My essay', 'essay.pdf', 1024, '/uploads/essay.pdf', 'pending');
    `);

    // Seed an NFT application for approve/reject tests
    db.exec(`
      INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status)
      VALUES ('${nftAppId}', '${ids.studentId}', '${ids.courseId}', 'GABCDEF1234567890', 'pending');
    `);
  });

  it('E2-AC1: Review submission → notification created for student', async () => {
    const adminToken = makeToken({ userId: ids.adminId, email: 'admin-e@test.com', role: 'admin' });

    const res = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved', feedback: 'Good work' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Check notification was created for the student
    const notif = db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? AND type = ?'
    ).get(ids.studentId, 'submission_reviewed') as { title: string; body: string; link: string } | undefined;

    expect(notif).toBeDefined();
    expect(notif!.title).toBe('Submission Approved');
    expect(notif!.body).toContain('Week 3 Essay');
    expect(notif!.link).toBe('/student/submissions');
  });

  it('E2-AC2: Approve NFT application → notification created for student', async () => {
    const adminToken = makeToken({ userId: ids.adminId, email: 'admin-e@test.com', role: 'admin' });

    const res = await request(app)
      .patch(`/api/v1/courses/${ids.courseId}/completions/applications/${nftAppId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Approved' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Check notification
    const notif = db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? AND type = ?'
    ).get(ids.studentId, 'nft_approved') as { title: string; body: string; link: string } | undefined;

    expect(notif).toBeDefined();
    expect(notif!.title).toBe('Certificate Approved');
    expect(notif!.body).toContain('Course E');
    expect(notif!.link).toBe('/student/course');
  });

  it('E2-AC3: Reject NFT application → notification created for student', async () => {
    const adminToken = makeToken({ userId: ids.adminId, email: 'admin-e@test.com', role: 'admin' });

    const res = await request(app)
      .patch(`/api/v1/courses/${ids.courseId}/completions/applications/${nftAppId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Not ready yet' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Check notification
    const notif = db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? AND type = ?'
    ).get(ids.studentId, 'nft_rejected') as { title: string; body: string; link: string } | undefined;

    expect(notif).toBeDefined();
    expect(notif!.title).toBe('Certificate Rejected');
    expect(notif!.body).toContain('Course E');
    expect(notif!.link).toBe('/student/course');
  });
});
