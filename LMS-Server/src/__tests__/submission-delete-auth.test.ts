/**
 * WI-12 — DELETE /submissions/:id Authorization and Cross-Course Gap Fix
 *
 * Tests the fixed authorization model for submission deletion:
 * - Submitter may delete their own pending submission
 * - Assigned instructor may delete submissions for students in their courses
 * - Cross-course instructor is denied (the gap fix)
 * - Admin may delete any submission
 * - TA behavior (cannot delete — no course.grade permission on submissions route)
 * - Learner cannot delete another learner's submission
 * - Invalid/nonexistent submission returns 404
 * - Unauthenticated access returns 401
 *
 * DEL-01 — Submitter deletes own pending submission
 * DEL-02 — Submitter cannot delete own reviewed submission
 * DEL-03 — Assigned instructor deletes submission in own course
 * DEL-04 — Cross-course instructor denied (student enrolled in 2 courses, instructor only teaches 1)
 * DEL-05 — Admin deletes any submission
 * DEL-06 — TA cannot delete submissions
 * DEL-07 — Learner cannot delete another learner's submission
 * DEL-08 — Nonexistent submission returns 404
 * DEL-09 — Unauthenticated access returns 401
 * DEL-10 — Route-level requirePermission blocks unauthorized roles
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db, execute } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedSubmissionDeleteData() {
  const adminId = uuidv4();
  const instructorAId = uuidv4(); // teaches course 1
  const instructorBId = uuidv4(); // teaches course 2 only
  const studentUserId = uuidv4();
  const studentId = uuidv4();
  const otherStudentUserId = uuidv4();
  const otherStudentId = uuidv4();
  const taId = uuidv4();
  const courseId = uuidv4();
  const course2Id = uuidv4();
  const code = `DEL-${uuidv4().slice(0, 6)}`;
  const code2 = `DEL2-${uuidv4().slice(0, 6)}`;

  // Pending submission for student in course 1
  const pendingSubId = uuidv4();
  // Approved submission for student
  const approvedSubId = uuidv4();
  // Submission in course 2 for the same student (cross-course gap test)
  const crossCourseSubId = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}', 'Admin', 'admin-del-${adminId.slice(0, 6)}@test.com', '${HASH}', 'admin'),
      ('${instructorAId}', 'Instructor A', 'inst-a-${instructorAId.slice(0, 6)}@test.com', '${HASH}', 'lecturer'),
      ('${instructorBId}', 'Instructor B', 'inst-b-${instructorBId.slice(0, 6)}@test.com', '${HASH}', 'lecturer'),
      ('${studentUserId}', 'Student', 'stud-${studentUserId.slice(0, 6)}@test.com', '${HASH}', 'student'),
      ('${otherStudentUserId}', 'Other Student', 'other-${otherStudentUserId.slice(0, 6)}@test.com', '${HASH}', 'student'),
      ('${taId}', 'TA User', 'ta-del-${taId.slice(0, 6)}@test.com', '${HASH}', 'student');

    INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
    VALUES
      ('${studentId}', '${studentUserId}', 'Student', 'stud-${studentUserId.slice(0, 6)}@test.com', 'DEL-001', 'CS', 1),
      ('${otherStudentId}', '${otherStudentUserId}', 'Other Student', 'other-${otherStudentUserId.slice(0, 6)}@test.com', 'DEL-002', 'CS', 1);

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES
      ('${courseId}', 'Course 1', 'Test', '${code}', '[]'),
      ('${course2Id}', 'Course 2', 'Test', '${code2}', '[]');

    -- Student enrolled in BOTH courses (this creates the cross-course gap)
    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${studentUserId}', '${code}');
    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${studentUserId}', '${code2}');

    -- Other student enrolled in course 1
    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${otherStudentUserId}', '${code}');

    -- Instructor A teaches course 1 only
    INSERT INTO course_lecturers (course_id, user_id, assigned_by) VALUES ('${courseId}', '${instructorAId}', '${adminId}');

    -- Instructor B teaches course 2 only
    INSERT INTO course_lecturers (course_id, user_id, assigned_by) VALUES ('${course2Id}', '${instructorBId}', '${adminId}');

    -- TA assigned to course 1
    INSERT INTO course_tas (course_id, user_id, assigned_by) VALUES ('${courseId}', '${taId}', '${adminId}');

    -- Pending submission for student in course 1
    INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id)
    VALUES ('${pendingSubId}', '${studentId}', 'Pending Sub', 'desc', 'test.pdf', 1024, '/tmp/nonexistent.pdf', 'pending', '${courseId}');

    -- Approved submission for student (not deletable by student)
    INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id)
    VALUES ('${approvedSubId}', '${studentId}', 'Approved Sub', 'desc', 'test2.pdf', 1024, '/tmp/nonexistent2.pdf', 'approved', '${courseId}');

    -- Cross-course submission: student's submission in course 2
    INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id)
    VALUES ('${crossCourseSubId}', '${studentId}', 'Cross Course Sub', 'desc', 'test3.pdf', 1024, '/tmp/nonexistent3.pdf', 'pending', '${course2Id}');
  `);

  // Assign RBAC roles
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [adminId, 'role_admin']);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [instructorAId, 'role_instructor']);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [instructorBId, 'role_instructor']);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [studentUserId, 'role_student']);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [otherStudentUserId, 'role_student']);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [taId, 'role_ta']);

  return {
    adminId, instructorAId, instructorBId,
    studentUserId, studentId, otherStudentUserId, otherStudentId,
    taId, courseId, course2Id,
    pendingSubId, approvedSubId, crossCourseSubId,
  };
}

describe('WI-12 — DELETE /submissions/:id authorization', () => {
  it('DEL-01 — submitter deletes own pending submission', async () => {
    const { studentUserId, studentId, pendingSubId } = seedSubmissionDeleteData();
    const token = makeToken({ userId: studentUserId, email: `stud-${studentUserId.slice(0, 6)}@test.com`, role: 'student', studentId });

    const res = await request(app)
      .delete(`/api/v1/submissions/${pendingSubId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DEL-02 — submitter cannot delete own reviewed submission', async () => {
    const { studentUserId, studentId, approvedSubId } = seedSubmissionDeleteData();
    const token = makeToken({ userId: studentUserId, email: `stud-${studentUserId.slice(0, 6)}@test.com`, role: 'student', studentId });

    const res = await request(app)
      .delete(`/api/v1/submissions/${approvedSubId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('DEL-03 — assigned instructor deletes submission in own course', async () => {
    const { instructorAId, pendingSubId } = seedSubmissionDeleteData();
    const token = makeToken({ userId: instructorAId, email: `inst-a-${instructorAId.slice(0, 6)}@test.com`, role: 'lecturer' });

    const res = await request(app)
      .delete(`/api/v1/submissions/${pendingSubId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DEL-04 — cross-course instructor denied (teaches course 1, submission in course 2)', async () => {
    const { instructorAId, crossCourseSubId } = seedSubmissionDeleteData();
    const token = makeToken({ userId: instructorAId, email: `inst-a-${instructorAId.slice(0, 6)}@test.com`, role: 'lecturer' });

    // Instructor A teaches course 1, but crossCourseSubId is in course 2
    // Even though the student IS enrolled in instructor A's course 1,
    // the submission belongs to course 2 — should be denied
    const res = await request(app)
      .delete(`/api/v1/submissions/${crossCourseSubId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('DEL-05 — admin deletes any submission', async () => {
    const { adminId, crossCourseSubId } = seedSubmissionDeleteData();
    const token = makeToken({ userId: adminId, email: `admin-del-${adminId.slice(0, 6)}@test.com`, role: 'admin' });

    const res = await request(app)
      .delete(`/api/v1/submissions/${crossCourseSubId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DEL-06 — TA cannot delete submissions', async () => {
    const { taId, pendingSubId } = seedSubmissionDeleteData();
    const token = makeToken({ userId: taId, email: `ta-del-${taId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .delete(`/api/v1/submissions/${pendingSubId}`)
      .set('Authorization', `Bearer ${token}`);

    // TA has no studentId matching the submission's student_id, and lacks admin/lecturer role
    expect(res.status).toBe(403);
  });

  it('DEL-07 — learner cannot delete another learner\'s submission', async () => {
    const { otherStudentUserId, otherStudentId, pendingSubId } = seedSubmissionDeleteData();
    const token = makeToken({ userId: otherStudentUserId, email: `other-${otherStudentUserId.slice(0, 6)}@test.com`, role: 'student', studentId: otherStudentId });

    const res = await request(app)
      .delete(`/api/v1/submissions/${pendingSubId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('DEL-08 — nonexistent submission returns 404', async () => {
    const { adminId } = seedSubmissionDeleteData();
    const token = makeToken({ userId: adminId, email: `admin-del-${adminId.slice(0, 6)}@test.com`, role: 'admin' });

    const res = await request(app)
      .delete(`/api/v1/submissions/${uuidv4()}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('DEL-09 — unauthenticated access returns 401', async () => {
    const { pendingSubId } = seedSubmissionDeleteData();

    const res = await request(app)
      .delete(`/api/v1/submissions/${pendingSubId}`);

    expect(res.status).toBe(401);
  });

  it('DEL-10 — route-level requirePermission blocks users without course.view', async () => {
    const userId = uuidv4();
    db.exec(`
      INSERT INTO users (id, name, email, password_hash, role)
      VALUES ('${userId}', 'No Perms', 'noperms-${userId.slice(0, 6)}@test.com', '${HASH}', 'student');
    `);
    // Remove auto-assigned student role, replace with a custom role that has no course permissions
    execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    const customRoleId = `role_${uuidv4().slice(0, 12)}`;
    execute('INSERT INTO roles (id, name, label, is_system) VALUES (?, ?, ?, 0)', [customRoleId, `norole-${userId.slice(0, 6)}`, 'No Role']);
    execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, customRoleId]);

    const token = makeToken({ userId, email: `noperms-${userId.slice(0, 6)}@test.com`, role: 'student' });

    const res = await request(app)
      .delete(`/api/v1/submissions/${uuidv4()}`)
      .set('Authorization', `Bearer ${token}`);

    // Should be 403 from requirePermission('course.view') middleware
    expect(res.status).toBe(403);
  });
});
