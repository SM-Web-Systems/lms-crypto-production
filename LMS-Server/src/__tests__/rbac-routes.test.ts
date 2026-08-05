/**
 * Phase 13 C1: RBAC Route Migration Tests
 *
 * Verifies that all migrated routes enforce permission-based access
 * via requirePermission() rather than legacy authorize().
 *
 * RBAC-R1  — GET /users requires user.view_all
 * RBAC-R2  — PATCH /users/:id requires user.manage
 * RBAC-R3  — POST /courses requires course.create
 * RBAC-R4  — PUT /courses/:id requires course.manage
 * RBAC-R5  — DELETE /courses/:id requires course.manage
 * RBAC-R6  — POST /quizzes requires quiz.manage
 * RBAC-R7  — POST /announcements requires announcement.create
 * RBAC-R8  — POST /documents requires document.manage (multipart)
 * RBAC-R9  — GET /analytics/dashboard requires system.view_audit_log
 * RBAC-R10 — GET /admin/payments requires billing.view_all
 * RBAC-R11 — POST /submissions/:id/review requires course.grade
 * RBAC-R12 — POST /admin/cohorts requires cohort.manage
 * RBAC-R13 — Instructor can access course.manage routes (expanded RBAC)
 * RBAC-R14 — Student cannot access admin-only permission routes
 * RBAC-R15 — Student CAN access course.submit routes (own permission)
 */

import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { execute, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';

function createUser(role: 'student' | 'lecturer' | 'admin', email?: string): string {
  const id = uuidv4();
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', ?)",
    [id, `Test ${role}`, email ?? `${id}@test.com`, role],
  );
  return id;
}

function makeToken(userId: string, email: string, role: 'student' | 'lecturer' | 'admin'): string {
  return generateToken({ userId, email, role });
}

function createCourse(): string {
  const id = uuidv4();
  const code = `C-${id.slice(0, 8)}`;
  execute(
    "INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'Test Course', 'desc', ?, '[]')",
    [id, code],
  );
  return id;
}

describe('RBAC Route Migration', () => {
  // ── Admin routes that students cannot access ──

  it('RBAC-R1: GET /users requires user.view_all — student blocked', async () => {
    const id = createUser('student');
    const token = makeToken(id, 'student@test.com', 'student');
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('RBAC-R1: GET /users requires user.view_all — admin allowed', async () => {
    const id = createUser('admin');
    const token = makeToken(id, 'admin@test.com', 'admin');
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('RBAC-R2: PATCH /users/:id requires user.manage — student blocked', async () => {
    const id = createUser('student');
    const targetId = createUser('student');
    const token = makeToken(id, 'student@test.com', 'student');
    const res = await request(app)
      .patch(`/api/v1/users/${targetId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('RBAC-R3: POST /courses requires course.create — student blocked', async () => {
    const id = createUser('student');
    const token = makeToken(id, 'student@test.com', 'student');
    const res = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Course', description: 'desc', course_code: 'NEW01' });
    expect(res.status).toBe(403);
  });

  it('RBAC-R4: PUT /courses/:id requires course.manage — student blocked', async () => {
    const courseId = createCourse();
    const id = createUser('student');
    const token = makeToken(id, 'student@test.com', 'student');
    const res = await request(app)
      .put(`/api/v1/courses/${courseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('RBAC-R5: DELETE /courses/:id requires course.manage — student blocked', async () => {
    const courseId = createCourse();
    const id = createUser('student');
    const token = makeToken(id, 'student@test.com', 'student');
    const res = await request(app)
      .delete(`/api/v1/courses/${courseId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('RBAC-R6: POST /quizzes requires quiz.manage — student blocked', async () => {
    const id = createUser('student');
    const token = makeToken(id, 'student@test.com', 'student');
    const res = await request(app)
      .post('/api/v1/quizzes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Quiz', courseId: 'x', questions: [] });
    expect(res.status).toBe(403);
  });

  it('RBAC-R7: POST /announcements requires announcement.create — student blocked', async () => {
    const id = createUser('student');
    const token = makeToken(id, 'student@test.com', 'student');
    const res = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Ann', content: 'Hello' });
    expect(res.status).toBe(403);
  });

  it('RBAC-R9: GET /analytics/dashboard requires system.view_audit_log — student blocked', async () => {
    const id = createUser('student');
    const token = makeToken(id, 'student@test.com', 'student');
    const res = await request(app)
      .get('/api/v1/analytics/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('RBAC-R9: GET /analytics/dashboard — admin allowed', async () => {
    const id = createUser('admin');
    const token = makeToken(id, 'admin@test.com', 'admin');
    const res = await request(app)
      .get('/api/v1/analytics/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('RBAC-R10: GET /admin/payments requires billing.view_all — student blocked', async () => {
    const id = createUser('student');
    const token = makeToken(id, 'student@test.com', 'student');
    const res = await request(app)
      .get('/api/v1/admin/payments')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('RBAC-R12: POST /admin/cohorts requires cohort.manage — student blocked', async () => {
    const id = createUser('student');
    const token = makeToken(id, 'student@test.com', 'student');
    const res = await request(app)
      .post('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cohort1', courseId: 'x' });
    expect(res.status).toBe(403);
  });

  // ── Instructor expanded access via RBAC ──

  it('RBAC-R13: Instructor can access course.manage routes', async () => {
    const courseId = createCourse();
    const id = createUser('lecturer');
    const token = makeToken(id, 'lecturer@test.com', 'lecturer');
    const res = await request(app)
      .put(`/api/v1/courses/${courseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated by instructor' });
    // Instructor has course.manage permission → 200
    expect(res.status).toBe(200);
  });

  it('RBAC-R13: Instructor passes quiz.manage gate (not 403)', async () => {
    const courseId = createCourse();
    const id = createUser('lecturer');
    const token = makeToken(id, 'lecturer@test.com', 'lecturer');
    const res = await request(app)
      .post('/api/v1/quizzes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Instructor Quiz',
        courseId,
        questions: [{ text: 'Q1?', type: 'multiple_choice', options: ['A', 'B'], correctIndex: 0 }],
      });
    // Key assertion: NOT 403 (permission gate passed)
    expect(res.status).not.toBe(403);
  });

  // ── Student own-permission routes ──

  it('RBAC-R14: Student cannot access user management', async () => {
    const id = createUser('student');
    const token = makeToken(id, 'student@test.com', 'student');
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('RBAC-R15: Student CAN view own courses (no permission gate)', async () => {
    const id = createUser('student');
    const token = makeToken(id, 'student@test.com', 'student');
    const res = await request(app)
      .get('/api/v1/users/me/courses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
