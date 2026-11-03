/**
 * WI-08 — Course-scoped submission listing acceptance tests
 *
 * Tests GET /api/v1/courses/:courseId/submissions with RBAC enforcement.
 *
 * The expected authorization model:
 *   - Admin (course.delete permission) → sees all submissions for any course
 *   - Lecturer assigned to the course → sees submissions for that course
 *   - Lecturer NOT assigned to the course → 403
 *   - Learner (student) → 403 (no course.manage or course.grade_pending)
 *   - TA assigned to the course → sees submissions for that course
 *   - TA NOT assigned to the course → 403
 *
 * These tests should FAIL against the current unpatched code because:
 *   1. The route has no requireCourseScope middleware
 *   2. An unassigned lecturer currently gets 200 (sees all course submissions)
 *   3. A student currently gets 200 (filtered to own, but not blocked)
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

/**
 * Seed two courses, each with a student enrolled and a submission.
 * Lecturer A is assigned to course1 only.
 * Lecturer B is assigned to course2 only.
 * A TA is assigned to course1 only.
 */
function seedCourseSubmissions() {
  const adminId = uuidv4();
  const lecturerAId = uuidv4();
  const lecturerBId = uuidv4();
  const taId = uuidv4();
  const studentUserId = uuidv4();
  const studentId = uuidv4();
  const student2UserId = uuidv4();
  const student2Id = uuidv4();
  const course1Id = uuidv4();
  const course2Id = uuidv4();
  const code1 = `WI08-${uuidv4().slice(0, 6)}`;
  const code2 = `WI08-${uuidv4().slice(0, 6)}`;
  const submission1Id = uuidv4();
  const submission2Id = uuidv4();

  // --- Users ---
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}',        'WI08 Admin',      'wi08-admin-${adminId}@test.com',         '${HASH}', 'admin'),
      ('${lecturerAId}',    'WI08 Lecturer A', 'wi08-lecta-${lecturerAId}@test.com',     '${HASH}', 'lecturer'),
      ('${lecturerBId}',    'WI08 Lecturer B', 'wi08-lectb-${lecturerBId}@test.com',     '${HASH}', 'lecturer'),
      ('${taId}',           'WI08 TA',         'wi08-ta-${taId}@test.com',               '${HASH}', 'student'),
      ('${studentUserId}',  'WI08 Student 1',  'wi08-stu1-${studentUserId}@test.com',    '${HASH}', 'student'),
      ('${student2UserId}', 'WI08 Student 2',  'wi08-stu2-${student2UserId}@test.com',   '${HASH}', 'student');
  `);

  // --- Students ---
  db.exec(`
    INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
    VALUES
      ('${studentId}',  '${studentUserId}',  'WI08 Student 1', 'wi08-stu1-${studentUserId}@test.com',  'WI08-001', 'CS', 1),
      ('${student2Id}', '${student2UserId}', 'WI08 Student 2', 'wi08-stu2-${student2UserId}@test.com', 'WI08-002', 'CS', 1);
  `);

  // --- Courses ---
  db.exec(`
    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES
      ('${course1Id}', 'WI08 Course 1', 'Test course 1', '${code1}', '[]'),
      ('${course2Id}', 'WI08 Course 2', 'Test course 2', '${code2}', '[]');
  `);

  // --- Enrollments ---
  db.exec(`
    INSERT INTO user_course_codes (user_id, course_code)
    VALUES
      ('${studentUserId}',  '${code1}'),
      ('${student2UserId}', '${code2}');
  `);

  // --- Course-lecturer assignments ---
  db.exec(`
    INSERT INTO course_lecturers (course_id, user_id, assigned_by)
    VALUES
      ('${course1Id}', '${lecturerAId}', '${adminId}'),
      ('${course2Id}', '${lecturerBId}', '${adminId}');
  `);

  // --- RBAC role assignments ---
  db.exec(`
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${adminId}',       'role_admin');
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${lecturerAId}',   'role_instructor');
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${lecturerBId}',   'role_instructor');
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${taId}',          'role_ta');
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${studentUserId}', 'role_student');
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${student2UserId}','role_student');
  `);

  // --- TA assignment: TA assigned to course1 only ---
  db.exec(`
    INSERT INTO course_tas (course_id, user_id, assigned_by)
    VALUES ('${course1Id}', '${taId}', '${adminId}');
  `);

  // --- Submissions ---
  db.exec(`
    INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id)
    VALUES
      ('${submission1Id}', '${studentId}',  'Sub in Course 1', 'desc1', 'file1.pdf', 1024, '/tmp/wi08-file1.pdf', 'pending', '${course1Id}'),
      ('${submission2Id}', '${student2Id}', 'Sub in Course 2', 'desc2', 'file2.pdf', 2048, '/tmp/wi08-file2.pdf', 'pending', '${course2Id}');
  `);

  return {
    adminId, lecturerAId, lecturerBId, taId,
    studentUserId, studentId, student2UserId, student2Id,
    course1Id, course2Id, code1, code2,
    submission1Id, submission2Id,
  };
}

describe('WI-08 — Course-scoped submission listing (GET /courses/:courseId/submissions)', () => {

  describe('Admin access', () => {
    it('admin sees submissions for any course → 200', async () => {
      const ids = seedCourseSubmissions();
      const token = makeToken({ userId: ids.adminId, email: `wi08-admin-${ids.adminId}@test.com`, role: 'admin' });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.course1Id}/submissions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.submissions).toBeInstanceOf(Array);
      expect(res.body.data.submissions.length).toBeGreaterThanOrEqual(1);
    });

    it('admin sees submissions for course2 (unassigned) → 200', async () => {
      const ids = seedCourseSubmissions();
      const token = makeToken({ userId: ids.adminId, email: `wi08-admin-${ids.adminId}@test.com`, role: 'admin' });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.course2Id}/submissions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.submissions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Lecturer — assigned course access', () => {
    it('lecturer A lists submissions for assigned course1 → 200', async () => {
      const ids = seedCourseSubmissions();
      const token = makeToken({ userId: ids.lecturerAId, email: `wi08-lecta-${ids.lecturerAId}@test.com`, role: 'lecturer' });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.course1Id}/submissions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.submissions.length).toBeGreaterThanOrEqual(1);
      // Should include the submission from course1
      const titles = res.body.data.submissions.map((s: { title: string }) => s.title);
      expect(titles).toContain('Sub in Course 1');
    });
  });

  describe('Lecturer — cross-course isolation (core WI-08 gap)', () => {
    it('lecturer A cannot list submissions for unassigned course2 → 403', async () => {
      const ids = seedCourseSubmissions();
      const token = makeToken({ userId: ids.lecturerAId, email: `wi08-lecta-${ids.lecturerAId}@test.com`, role: 'lecturer' });

      // Lecturer A is assigned to course1 only — should be denied access to course2
      const res = await request(app)
        .get(`/api/v1/courses/${ids.course2Id}/submissions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('lecturer B cannot list submissions for unassigned course1 → 403', async () => {
      const ids = seedCourseSubmissions();
      const token = makeToken({ userId: ids.lecturerBId, email: `wi08-lectb-${ids.lecturerBId}@test.com`, role: 'lecturer' });

      // Lecturer B is assigned to course2 only — should be denied access to course1
      const res = await request(app)
        .get(`/api/v1/courses/${ids.course1Id}/submissions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Learner (student) access denied', () => {
    it('student cannot list course submissions → 403', async () => {
      const ids = seedCourseSubmissions();
      const token = makeToken({
        userId: ids.studentUserId,
        email: `wi08-stu1-${ids.studentUserId}@test.com`,
        role: 'student',
        studentId: ids.studentId,
      });

      // Students should be denied at the middleware level (no course.manage/course.grade_pending)
      const res = await request(app)
        .get(`/api/v1/courses/${ids.course1Id}/submissions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('student cannot list submissions for another course → 403', async () => {
      const ids = seedCourseSubmissions();
      const token = makeToken({
        userId: ids.studentUserId,
        email: `wi08-stu1-${ids.studentUserId}@test.com`,
        role: 'student',
        studentId: ids.studentId,
      });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.course2Id}/submissions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('TA access — course-scoped', () => {
    it('TA assigned to course1 can list submissions → 200', async () => {
      const ids = seedCourseSubmissions();
      // TA has legacy role 'student' but RBAC role_ta with course.grade_pending
      const token = makeToken({ userId: ids.taId, email: `wi08-ta-${ids.taId}@test.com`, role: 'student' });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.course1Id}/submissions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.submissions.length).toBeGreaterThanOrEqual(1);
    });

    it('TA not assigned to course2 is denied → 403', async () => {
      const ids = seedCourseSubmissions();
      const token = makeToken({ userId: ids.taId, email: `wi08-ta-${ids.taId}@test.com`, role: 'student' });

      const res = await request(app)
        .get(`/api/v1/courses/${ids.course2Id}/submissions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Nonexistent course', () => {
    it('returns 404 for nonexistent courseId', async () => {
      const ids = seedCourseSubmissions();
      const token = makeToken({ userId: ids.adminId, email: `wi08-admin-${ids.adminId}@test.com`, role: 'admin' });
      const fakeCourseId = uuidv4();

      const res = await request(app)
        .get(`/api/v1/courses/${fakeCourseId}/submissions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
