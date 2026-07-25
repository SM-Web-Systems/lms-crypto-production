/**
 * Phase C tests — lecturer role operational
 *
 * Covers:
 *  C1  — GET/POST/DELETE /courses/:id/lecturers
 *  C2  — PATCH /users/:id/role
 *  C3  — Lecturer-scoped submission review (GET list, GET single, POST review)
 *  C3+ — Lecturer course visibility (GET /courses, GET /courses/:id)
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
  const adminId      = uuidv4();
  const lecturerId   = uuidv4();
  const lecturer2Id  = uuidv4();
  const studentId    = uuidv4();
  const student2Id   = uuidv4();
  const courseId     = uuidv4();
  const course2Id    = uuidv4();
  const stuRecordId  = uuidv4();
  const stu2RecordId = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}',     'Admin',      'admin-c@test.com',     '${HASH}', 'admin'),
      ('${lecturerId}',  'Lecturer',   'lecturer-c@test.com',  '${HASH}', 'lecturer'),
      ('${lecturer2Id}', 'Lecturer2',  'lecturer2-c@test.com', '${HASH}', 'lecturer'),
      ('${studentId}',   'Student',    'student-c@test.com',   '${HASH}', 'student'),
      ('${student2Id}',  'Student2',   'student2-c@test.com',  '${HASH}', 'student');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES
      ('${courseId}',  'Course C One', 'desc', 'C-C-001', '[]'),
      ('${course2Id}', 'Course C Two', 'desc', 'C-C-002', '[]');

    INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
    VALUES
      ('${stuRecordId}',  '${studentId}',  'Student',  'student-c@test.com',  'STU-C-001', 'General', 1),
      ('${stu2RecordId}', '${student2Id}', 'Student2', 'student2-c@test.com', 'STU-C-002', 'General', 1);

    -- Enroll student in course 1 only
    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${studentId}', 'C-C-001');

    -- Assign lecturer to course 1 only (not course 2)
    INSERT INTO course_lecturers (course_id, user_id) VALUES ('${courseId}', '${lecturerId}');
  `);

  return {
    adminId, lecturerId, lecturer2Id, studentId, student2Id,
    courseId, course2Id, stuRecordId, stu2RecordId,
  };
}

/** Seeds a submission for a student and returns its id */
function seedSubmission(stuRecordId: string): string {
  const subId = uuidv4();
  db.exec(`
    INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, file_mime_type)
    VALUES ('${subId}', '${stuRecordId}', 'Test Sub', 'Description', 'file.pdf', 1024, '/tmp/file.pdf', 'application/pdf')
  `);
  return subId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// C1 — Lecturer assignment routes
// ═══════════════════════════════════════════════════════════════════════════════

describe('C1 — GET /courses/:id/lecturers', () => {
  let ids: ReturnType<typeof seedBase>;
  beforeEach(() => { ids = seedBase(); });

  it('admin gets lecturer list for a course', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/lecturers`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.lecturers)).toBe(true);
    expect(res.body.data.lecturers).toHaveLength(1);
    expect(res.body.data.lecturers[0].userId).toBe(ids.lecturerId);
  });

  it('returns empty list for course with no lecturers', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.course2Id}/lecturers`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.lecturers).toHaveLength(0);
  });

  it('returns 404 for nonexistent course', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${uuidv4()}/lecturers`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 for non-admin', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-c@test.com', role: 'student' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/lecturers`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('C1 — POST /courses/:id/lecturers', () => {
  let ids: ReturnType<typeof seedBase>;
  beforeEach(() => { ids = seedBase(); });

  it('admin assigns a lecturer to a course', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.course2Id}/lecturers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: ids.lecturerId });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.courseId).toBe(ids.course2Id);
    expect(res.body.data.userId).toBe(ids.lecturerId);
    expect(res.body.data.assignedAt).toBeTruthy();
  });

  it('returns 409 if lecturer already assigned', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/lecturers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: ids.lecturerId }); // already assigned in seedBase
    expect(res.status).toBe(409);
  });

  it('returns 422 if user is not a lecturer', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/lecturers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: ids.studentId }); // student, not lecturer
    expect(res.status).toBe(422);
  });

  it('returns 404 if course not found', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${uuidv4()}/lecturers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: ids.lecturerId });
    expect(res.status).toBe(404);
  });

  it('returns 404 if user not found', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/lecturers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: uuidv4() });
    expect(res.status).toBe(404);
  });

  it('returns 403 if caller is not admin', async () => {
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-c@test.com', role: 'lecturer' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/lecturers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: ids.lecturer2Id });
    expect(res.status).toBe(403);
  });
});

describe('C1 — DELETE /courses/:id/lecturers/:lecturerUserId', () => {
  let ids: ReturnType<typeof seedBase>;
  beforeEach(() => { ids = seedBase(); });

  it('admin removes a lecturer from a course', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .delete(`/api/v1/courses/${ids.courseId}/lecturers/${ids.lecturerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Verify removed from DB
    const row = db.prepare(
      'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?'
    ).get(ids.courseId, ids.lecturerId);
    expect(row).toBeFalsy();
  });

  it('returns 404 if assignment does not exist', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .delete(`/api/v1/courses/${ids.courseId}/lecturers/${ids.lecturer2Id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C2 — Role management
// ═══════════════════════════════════════════════════════════════════════════════

describe('C2 — PATCH /users/:id/role', () => {
  let ids: ReturnType<typeof seedBase>;
  beforeEach(() => { ids = seedBase(); });

  it('admin promotes student to lecturer', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .patch(`/api/v1/users/${ids.studentId}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'lecturer' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe('lecturer');
    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(ids.studentId) as { role: string };
    expect(row.role).toBe('lecturer');
  });

  it('admin demotes lecturer to student', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .patch(`/api/v1/users/${ids.lecturerId}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'student' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('student');
  });

  it('admin promotes student to admin', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .patch(`/api/v1/users/${ids.studentId}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
  });

  it('returns 400 for invalid role value', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .patch(`/api/v1/users/${ids.studentId}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'superuser' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when admin tries to change own role', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .patch(`/api/v1/users/${ids.adminId}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'student' });
    expect(res.status).toBe(400);
  });

  it('returns 404 if user not found', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .patch(`/api/v1/users/${uuidv4()}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'lecturer' });
    expect(res.status).toBe(404);
  });

  it('returns 403 if caller is not admin', async () => {
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-c@test.com', role: 'lecturer' });
    const res = await request(app)
      .patch(`/api/v1/users/${ids.studentId}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C3+ — Lecturer course visibility
// ═══════════════════════════════════════════════════════════════════════════════

describe('C3+ — Lecturer course visibility', () => {
  let ids: ReturnType<typeof seedBase>;
  beforeEach(() => { ids = seedBase(); });

  it('lecturer sees assigned course in GET /courses', async () => {
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-c@test.com', role: 'lecturer' });
    const res = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const courseIds = res.body.data.courses.map((c: { id: string }) => c.id);
    expect(courseIds).toContain(ids.courseId);
    expect(courseIds).not.toContain(ids.course2Id); // not assigned to course 2
  });

  it('lecturer can GET /courses/:id for assigned course', async () => {
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-c@test.com', role: 'lecturer' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ids.courseId);
  });

  it('lecturer gets 403 for GET /courses/:id on unassigned course', async () => {
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-c@test.com', role: 'lecturer' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.course2Id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('lecturer with no assigned courses sees empty list', async () => {
    const token = makeToken({ userId: ids.lecturer2Id, email: 'lecturer2-c@test.com', role: 'lecturer' });
    const res = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.courses).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C3 — Lecturer-scoped submission review
// ═══════════════════════════════════════════════════════════════════════════════

describe('C3 — Lecturer submission list', () => {
  let ids: ReturnType<typeof seedBase>;
  let subId: string;

  beforeEach(() => {
    ids = seedBase();
    subId = seedSubmission(ids.stuRecordId);
  });

  it('lecturer sees submissions of students in their courses', async () => {
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-c@test.com', role: 'lecturer' });
    const res = await request(app)
      .get('/api/v1/submissions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids2 = res.body.data.submissions.map((s: { id: string }) => s.id);
    expect(ids2).toContain(subId);
  });

  it('lecturer sees no submissions if student is not in their courses', async () => {
    // student2 is not enrolled in any course; lecturer is not assigned to student2's courses
    const sub2Id = seedSubmission(ids.stu2RecordId);
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-c@test.com', role: 'lecturer' });
    const res = await request(app)
      .get('/api/v1/submissions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const returnedIds = res.body.data.submissions.map((s: { id: string }) => s.id);
    expect(returnedIds).not.toContain(sub2Id); // student2 not in lecturer's courses
  });

  it('unassigned lecturer sees empty submissions list', async () => {
    const token = makeToken({ userId: ids.lecturer2Id, email: 'lecturer2-c@test.com', role: 'lecturer' });
    const res = await request(app)
      .get('/api/v1/submissions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.submissions).toHaveLength(0);
  });
});

describe('C3 — Lecturer GET single submission', () => {
  let ids: ReturnType<typeof seedBase>;
  let subId: string;

  beforeEach(() => {
    ids = seedBase();
    subId = seedSubmission(ids.stuRecordId);
  });

  it('lecturer can view submission of student in their courses', async () => {
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-c@test.com', role: 'lecturer' });
    const res = await request(app)
      .get(`/api/v1/submissions/${subId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(subId);
  });

  it('lecturer gets 403 for submission of student NOT in their courses', async () => {
    const sub2Id = seedSubmission(ids.stu2RecordId); // student2 not in lecturer's course
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-c@test.com', role: 'lecturer' });
    const res = await request(app)
      .get(`/api/v1/submissions/${sub2Id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('C3 — Lecturer review submission', () => {
  let ids: ReturnType<typeof seedBase>;
  let subId: string;

  beforeEach(() => {
    ids = seedBase();
    subId = seedSubmission(ids.stuRecordId);
  });

  it('lecturer can review (approve) submission of student in their courses', async () => {
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-c@test.com', role: 'lecturer' });
    const res = await request(app)
      .post(`/api/v1/submissions/${subId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', feedback: 'Great work' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
  });

  it('lecturer cannot review submission of student NOT in their courses', async () => {
    const sub2Id = seedSubmission(ids.stu2RecordId);
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-c@test.com', role: 'lecturer' });
    const res = await request(app)
      .post(`/api/v1/submissions/${sub2Id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' });
    expect(res.status).toBe(403);
  });

  it('admin can still review any submission (regression)', async () => {
    const sub2Id = seedSubmission(ids.stu2RecordId);
    const token = makeToken({ userId: ids.adminId, email: 'admin-c@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/submissions/${sub2Id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' });
    expect(res.status).toBe(200);
  });

  it('student cannot review submissions', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-c@test.com', role: 'student' });
    const res = await request(app)
      .post(`/api/v1/submissions/${subId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' });
    expect(res.status).toBe(403);
  });
});
