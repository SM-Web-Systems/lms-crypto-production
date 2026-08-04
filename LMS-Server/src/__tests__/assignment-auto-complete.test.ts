/**
 * Phase 4 — Assignment auto-complete on approval.
 * When an admin approves a submission linked to a course item, the course item
 * is automatically marked complete via lesson_completions INSERT OR IGNORE.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedAssignmentAutoComplete() {
  const adminId = uuidv4();
  const studentUserId = uuidv4();
  const studentId = uuidv4();
  const courseId = uuidv4();
  const code = `AAC-${uuidv4().slice(0, 6)}`;
  const assignmentItemId = uuidv4();
  const sectionId = uuidv4();
  const submissionId = uuidv4();

  const sections = JSON.stringify([
    {
      id: sectionId,
      title: 'Section 1',
      items: [
        { id: assignmentItemId, type: 'assignment', title: 'Assignment Item' },
      ],
    },
  ]);

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}', 'Admin', 'aac-admin-${adminId}@test.com', '${HASH}', 'admin'),
      ('${studentUserId}', 'Student', 'aac-student-${studentUserId}@test.com', '${HASH}', 'student');

    INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
    VALUES ('${studentId}', '${studentUserId}', 'Student', 'aac-student-${studentUserId}@test.com', 'AAC-001', 'CS', 1);

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'Assignment AC Course', 'Test', '${code}', '${sections.replace(/'/g, "''")}');

    INSERT INTO user_course_codes (user_id, course_code)
    VALUES ('${studentUserId}', '${code}');

    INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id, item_id)
    VALUES ('${submissionId}', '${studentId}', 'My Work', 'Test submission', 'work.pdf', 1024, '/tmp/test/work.pdf', 'pending', '${courseId}', '${assignmentItemId}');
  `);

  return { adminId, studentUserId, studentId, courseId, code, assignmentItemId, sectionId, submissionId };
}

describe('Assignment auto-complete on approval', () => {
  beforeEach(() => {
    db.exec('DELETE FROM lesson_completions');
  });

  it('creates lesson_completion when submission is approved', async () => {
    const { adminId, studentUserId, courseId, assignmentItemId, submissionId } = seedAssignmentAutoComplete();
    const token = makeToken({ userId: adminId, email: `aac-admin-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', feedback: 'Good work' });

    expect(res.status).toBe(200);

    const row = db.prepare(
      'SELECT * FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(studentUserId, courseId, assignmentItemId) as { marked_by: string | null } | undefined;

    expect(row).toBeTruthy();
    expect(row!.marked_by).toBeNull();
  });

  it('does not create lesson_completion when submission is rejected', async () => {
    const { adminId, studentUserId, courseId, assignmentItemId, submissionId } = seedAssignmentAutoComplete();
    const token = makeToken({ userId: adminId, email: `aac-admin-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'rejected', feedback: 'Needs improvement' });

    expect(res.status).toBe(200);

    const row = db.prepare(
      'SELECT * FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(studentUserId, courseId, assignmentItemId);

    expect(row).toBeUndefined();
  });

  it('handles submission with no course_id gracefully', async () => {
    const adminId = uuidv4();
    const studentUserId = uuidv4();
    const studentId = uuidv4();
    const submissionId = uuidv4();

    db.exec(`
      INSERT INTO users (id, name, email, password_hash, role)
      VALUES
        ('${adminId}', 'Admin NC', 'aac-nc-admin-${adminId}@test.com', '${HASH}', 'admin'),
        ('${studentUserId}', 'Student NC', 'aac-nc-stu-${studentUserId}@test.com', '${HASH}', 'student');

      INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
      VALUES ('${studentId}', '${studentUserId}', 'Student NC', 'aac-nc-stu-${studentUserId}@test.com', 'AAC-NC', 'CS', 1);

      INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status)
      VALUES ('${submissionId}', '${studentId}', 'No Course', 'Test', 'nc.pdf', 512, '/tmp/test/nc.pdf', 'pending');
    `);

    const token = makeToken({ userId: adminId, email: `aac-nc-admin-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', feedback: 'OK' });

    expect(res.status).toBe(200);

    const count = db.prepare('SELECT COUNT(*) as c FROM lesson_completions WHERE user_id = ?').get(studentUserId) as { c: number };
    expect(count.c).toBe(0);
  });

  it('is idempotent on re-approval', async () => {
    const { adminId, studentUserId, courseId, assignmentItemId, submissionId } = seedAssignmentAutoComplete();
    const token = makeToken({ userId: adminId, email: `aac-admin-${adminId}@test.com`, role: 'admin' });

    // First approval
    await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', feedback: 'Good' });

    // Second approval
    const res = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', feedback: 'Still good' });

    expect(res.status).toBe(200);

    const rows = db.prepare(
      'SELECT * FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).all(studentUserId, courseId, assignmentItemId);

    expect(rows).toHaveLength(1);
  });
});
