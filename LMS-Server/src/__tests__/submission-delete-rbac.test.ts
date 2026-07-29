/**
 * LMS-RBAC-006 — Lecturer for student's course can delete submission;
 * lecturer for different course gets 403.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedDeleteData() {
  const adminId = uuidv4();
  const studentUserId = uuidv4();
  const studentId = uuidv4();
  const lecturerAId = uuidv4(); // assigned to course
  const lecturerBId = uuidv4(); // NOT assigned to course
  const courseId = uuidv4();
  const course2Id = uuidv4();
  const code = `DEL-${uuidv4().slice(0, 6)}`;
  const code2 = `DEL2-${uuidv4().slice(0, 6)}`;
  const submissionId = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}', 'Del Admin', 'del-admin-${adminId}@test.com', '${HASH}', 'admin'),
      ('${studentUserId}', 'Del Student', 'del-student-${studentUserId}@test.com', '${HASH}', 'student'),
      ('${lecturerAId}', 'Lecturer A', 'del-lect-a-${lecturerAId}@test.com', '${HASH}', 'lecturer'),
      ('${lecturerBId}', 'Lecturer B', 'del-lect-b-${lecturerBId}@test.com', '${HASH}', 'lecturer');

    INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
    VALUES ('${studentId}', '${studentUserId}', 'Del Student', 'del-student-${studentUserId}@test.com', 'DEL-001', 'CS', 1);

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES
      ('${courseId}', 'Del Course 1', 'Test', '${code}', '[]'),
      ('${course2Id}', 'Del Course 2', 'Test', '${code2}', '[]');

    INSERT INTO user_course_codes (user_id, course_code)
    VALUES ('${studentUserId}', '${code}');

    INSERT INTO course_lecturers (course_id, user_id, assigned_by)
    VALUES ('${courseId}', '${lecturerAId}', '${adminId}');

    INSERT INTO course_lecturers (course_id, user_id, assigned_by)
    VALUES ('${course2Id}', '${lecturerBId}', '${adminId}');

    INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status)
    VALUES ('${submissionId}', '${studentId}', 'Test Sub', 'desc', 'test.pdf', 1024, '/tmp/nonexistent.pdf', 'pending');
  `);

  return { adminId, studentUserId, studentId, lecturerAId, lecturerBId, courseId, course2Id, submissionId };
}

describe('LMS-RBAC-006 — lecturer delete submission permissions', () => {
  it('lecturer for student course can delete pending submission', async () => {
    const { lecturerAId, submissionId } = seedDeleteData();
    const token = makeToken({ userId: lecturerAId, email: `del-lect-a-${lecturerAId}@test.com`, role: 'lecturer' });

    const res = await request(app)
      .delete(`/api/v1/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('lecturer for different course gets 403', async () => {
    const { lecturerBId, submissionId } = seedDeleteData();
    const token = makeToken({ userId: lecturerBId, email: `del-lect-b-${lecturerBId}@test.com`, role: 'lecturer' });

    const res = await request(app)
      .delete(`/api/v1/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
