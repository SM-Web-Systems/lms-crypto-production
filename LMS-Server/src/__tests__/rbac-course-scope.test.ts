/**
 * WI-01 — requireCourseScope middleware acceptance tests
 *
 * Tests the RBAC-aware replacement for requireCourseAccess.
 * The new middleware uses RBAC permissions (course.manage, course.create,
 * course.grade_pending) rather than hardcoded legacy role strings.
 *
 * Covers:
 *  - Admin (course.manage permission) bypasses course assignment check
 *  - Instructor (RBAC role) accesses assigned course → 200
 *  - Instructor (RBAC role) accesses unassigned course → 403
 *  - TA (RBAC role) accesses assigned course → 200
 *  - TA (RBAC role) accesses unassigned course → 403
 *  - Student cannot access instructor-scoped routes → 403
 *  - RBAC instructor with legacy users.role='student' accesses assigned course → 200
 *    (the core D-01 bug: legacy role mismatch)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedCourseScope() {
  const adminId = uuidv4();
  const instructorId = uuidv4();
  const taId = uuidv4();
  const studentUserId = uuidv4();
  const studentId = uuidv4();
  const courseId = uuidv4();
  const course2Id = uuidv4();
  const code1 = `WI01-${uuidv4().slice(0, 6)}`;
  const code2 = `WI01-${uuidv4().slice(0, 6)}`;

  // --- Users ---
  // Admin has legacy role 'admin'
  // Instructor has legacy role 'lecturer' (standard case)
  // TA has legacy role 'student' (elevated via RBAC only)
  // Student has legacy role 'student'
  db.exec(`
    INSERT INTO users (id,name,email,password_hash)
    VALUES
      ('${adminId}','WI01 Admin','wi01-admin-${adminId}@test.com','${HASH}'),
      ('${instructorId}','WI01 Instructor','wi01-inst-${instructorId}@test.com','${HASH}'),
      ('${taId}','WI01 TA','wi01-ta-${taId}@test.com','${HASH}'),
      ('${studentUserId}','WI01 Student','wi01-stu-${studentUserId}@test.com','${HASH}');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${adminId}','role_admin');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${instructorId}','role_instructor');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${taId}','role_student');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${studentUserId}','role_student');


    INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
    VALUES ('${studentId}', '${studentUserId}', 'WI01 Student', 'wi01-stu-${studentUserId}@test.com', 'WI01-001', 'CS', 1);

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES
      ('${courseId}',  'WI01 Course One', 'Test course', '${code1}', '[]'),
      ('${course2Id}', 'WI01 Course Two', 'Test course', '${code2}', '[]');

    INSERT INTO user_course_codes (user_id, course_code)
    VALUES ('${studentUserId}', '${code1}');
  `);

  // --- RBAC role assignments ---
  // Admin gets role_admin (has course.manage)
  db.exec(`
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${adminId}', 'role_admin');
  `);
  // Instructor gets role_instructor (has course.create, course.manage, course.grade)
  db.exec(`
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${instructorId}', 'role_instructor');
  `);
  // TA gets role_ta (has course.grade_pending)
  db.exec(`
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${taId}', 'role_ta');
  `);
  // Student gets role_student
  db.exec(`
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${studentUserId}', 'role_student');
  `);

  // --- Course assignments ---
  // Instructor assigned to courseId only (NOT course2Id)
  db.exec(`
    INSERT INTO course_lecturers (course_id, user_id, assigned_by)
    VALUES ('${courseId}', '${instructorId}', '${adminId}');
  `);
  // TA assigned to courseId only (NOT course2Id)
  db.exec(`
    INSERT INTO course_tas (course_id, user_id, assigned_by)
    VALUES ('${courseId}', '${taId}', '${adminId}');
  `);

  return {
    adminId, instructorId, taId, studentUserId, studentId,
    courseId, course2Id, code1, code2,
  };
}

/**
 * Helper to seed an RBAC instructor whose legacy users.role is 'student'.
 * This is the core D-01 scenario: RBAC assignment without legacy column update.
 */
function seedMismatchedInstructor() {
  const base = seedCourseScope();
  const mismatchId = uuidv4();

  // Legacy role is 'student', but RBAC role is instructor
  db.exec(`
    INSERT INTO users (id,name,email,password_hash)
    VALUES ('${mismatchId}','Mismatched Inst','wi01-mismatch-${mismatchId}@test.com','${HASH}');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${mismatchId}','role_student');


    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${mismatchId}', 'role_instructor');

    INSERT INTO course_lecturers (course_id, user_id, assigned_by)
    VALUES ('${base.courseId}', '${mismatchId}', '${base.adminId}');
  `);

  return { ...base, mismatchId };
}

// Test against a route that uses requireCourseAccess (now requireCourseScope):
// GET /api/v1/courses/:courseId/requirements
// This is the simplest of the 5 call sites — GET only, no side effects.

describe('WI-01 — requireCourseScope middleware (via GET /courses/:courseId/requirements)', () => {
  describe('Admin access', () => {
    it('admin with course.manage permission accesses any course → 200', async () => {
      const ids = seedCourseScope();
      const token = makeToken({ userId: ids.adminId, email: `wi01-admin-${ids.adminId}@test.com`, role: 'admin' });

      // Admin is NOT assigned to courseId in course_lecturers, but has course.manage
      const res = await request(app)
        .get(`/api/v1/courses/${ids.courseId}/requirements`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('admin accesses course2 (unassigned) → 200', async () => {
      const ids = seedCourseScope();
      const token = makeToken({ userId: ids.adminId, email: `wi01-admin-${ids.adminId}@test.com`, role: 'admin' });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.course2Id}/requirements`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Instructor access (RBAC role)', () => {
    it('instructor accesses assigned course → 200', async () => {
      const ids = seedCourseScope();
      const token = makeToken({ userId: ids.instructorId, email: `wi01-inst-${ids.instructorId}@test.com`, role: 'lecturer' });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.courseId}/requirements`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('instructor accesses unassigned course → 403', async () => {
      const ids = seedCourseScope();
      const token = makeToken({ userId: ids.instructorId, email: `wi01-inst-${ids.instructorId}@test.com`, role: 'lecturer' });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.course2Id}/requirements`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('TA access (RBAC role)', () => {
    it('TA accesses assigned course → 200', async () => {
      const ids = seedCourseScope();
      // TA has legacy role 'student' but RBAC role_ta
      const token = makeToken({ userId: ids.taId, email: `wi01-ta-${ids.taId}@test.com`, role: 'student' });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.courseId}/requirements`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('TA accesses unassigned course → 403', async () => {
      const ids = seedCourseScope();
      const token = makeToken({ userId: ids.taId, email: `wi01-ta-${ids.taId}@test.com`, role: 'student' });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.course2Id}/requirements`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Student access (denied)', () => {
    it('student cannot access instructor-scoped route → 403', async () => {
      const ids = seedCourseScope();
      const token = makeToken({
        userId: ids.studentUserId,
        email: `wi01-stu-${ids.studentUserId}@test.com`,
        role: 'student',
        studentId: ids.studentId,
      });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.courseId}/requirements`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('D-01 core bug: RBAC instructor with legacy role=student', () => {
    it('RBAC instructor with users.role=student accesses assigned course → 200', async () => {
      const ids = seedMismatchedInstructor();
      // This is the key test: legacy role is 'student' but RBAC role is instructor
      const token = makeToken({ userId: ids.mismatchId, email: `wi01-mismatch-${ids.mismatchId}@test.com`, role: 'student' });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.courseId}/requirements`)
        .set('Authorization', `Bearer ${token}`);

      // Under the old requireCourseAccess, this would be 403 (line 144: role !== 'lecturer')
      // Under the new requireCourseScope, this should be 200 (RBAC instructor + assigned)
      expect(res.status).toBe(200);
    });

    it('RBAC instructor with users.role=student on unassigned course → 403', async () => {
      const ids = seedMismatchedInstructor();
      const token = makeToken({ userId: ids.mismatchId, email: `wi01-mismatch-${ids.mismatchId}@test.com`, role: 'student' });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.course2Id}/requirements`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });
});

// Test against a second call site to ensure consistency:
// GET /api/v1/courses/:courseId/progress/all
describe('WI-01 — requireCourseScope on progress route (GET /courses/:courseId/progress/all)', () => {
  it('admin accesses any course → 200', async () => {
    const ids = seedCourseScope();
    const token = makeToken({ userId: ids.adminId, email: `wi01-admin-${ids.adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/progress/all`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('instructor accesses assigned course → 200', async () => {
    const ids = seedCourseScope();
    const token = makeToken({ userId: ids.instructorId, email: `wi01-inst-${ids.instructorId}@test.com`, role: 'lecturer' });

    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/progress/all`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('instructor accesses unassigned course → 403', async () => {
    const ids = seedCourseScope();
    const token = makeToken({ userId: ids.instructorId, email: `wi01-inst-${ids.instructorId}@test.com`, role: 'lecturer' });

    const res = await request(app)
      .get(`/api/v1/courses/${ids.course2Id}/progress/all`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('student cannot access → 403', async () => {
    const ids = seedCourseScope();
    const token = makeToken({
      userId: ids.studentUserId,
      email: `wi01-stu-${ids.studentUserId}@test.com`,
      role: 'student',
      studentId: ids.studentId,
    });

    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/progress/all`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
