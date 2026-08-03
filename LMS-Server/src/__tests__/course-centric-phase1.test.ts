/**
 * Phase 1 Course-Centric IA — schema migration, course-scoped submissions,
 * GET /courses/:courseId/submissions endpoint, extended CourseItem types.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

/** Seed data for course-centric tests. */
function seedCourseCtx() {
  const adminId = uuidv4();
  const studentUserId = uuidv4();
  const studentId = uuidv4();
  const student2UserId = uuidv4();
  const student2Id = uuidv4();
  const lecturerId = uuidv4();
  const courseId = uuidv4();
  const course2Id = uuidv4();
  const code = `CC-${uuidv4().slice(0, 6)}`;
  const code2 = `CC2-${uuidv4().slice(0, 6)}`;

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}', 'CC Admin', 'cc-admin-${adminId}@t.com', '${HASH}', 'admin'),
      ('${studentUserId}', 'CC Student', 'cc-stu-${studentUserId}@t.com', '${HASH}', 'student'),
      ('${student2UserId}', 'CC Student2', 'cc-stu2-${student2UserId}@t.com', '${HASH}', 'student'),
      ('${lecturerId}', 'CC Lecturer', 'cc-lec-${lecturerId}@t.com', '${HASH}', 'lecturer');

    INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
    VALUES
      ('${studentId}', '${studentUserId}', 'CC Student', 'cc-stu-${studentUserId}@t.com', 'CC-001', 'CS', 1),
      ('${student2Id}', '${student2UserId}', 'CC Student2', 'cc-stu2-${student2UserId}@t.com', 'CC-002', 'CS', 1);

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES
      ('${courseId}', 'CC Course 1', 'Test', '${code}', '[]'),
      ('${course2Id}', 'CC Course 2', 'Test', '${code2}', '[]');

    INSERT INTO user_course_codes (user_id, course_code)
    VALUES
      ('${studentUserId}', '${code}'),
      ('${student2UserId}', '${code}');

    INSERT INTO course_lecturers (course_id, user_id, assigned_by)
    VALUES ('${courseId}', '${lecturerId}', '${adminId}');
  `);

  return { adminId, studentUserId, studentId, student2UserId, student2Id, lecturerId, courseId, course2Id, code, code2 };
}

// ─── Schema migration tests ─────────────────────────────────────

describe('Phase 1 schema — course context columns', () => {
  it('submissions table has course_id, week_id, item_id columns', () => {
    const cols = db.prepare("SELECT name FROM pragma_table_info('submissions')").all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain('course_id');
    expect(names).toContain('week_id');
    expect(names).toContain('item_id');
  });

  it('course_documents table has week_id column', () => {
    const cols = db.prepare("SELECT name FROM pragma_table_info('course_documents')").all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain('week_id');
  });

  it('submissions.course_id is nullable (old rows unaffected)', () => {
    const { studentId } = seedCourseCtx();
    const subId = uuidv4();
    // Insert without course_id — should succeed
    db.prepare(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status)
       VALUES (?, ?, 'Old Sub', 'no course', 'f.pdf', 100, '/tmp/f.pdf', 'pending')`
    ).run(subId, studentId);

    const row = db.prepare('SELECT course_id, week_id, item_id FROM submissions WHERE id = ?').get(subId) as any;
    expect(row.course_id).toBeNull();
    expect(row.week_id).toBeNull();
    expect(row.item_id).toBeNull();
  });

  it('submissions.course_id FK references courses(id)', () => {
    const { studentId, courseId } = seedCourseCtx();
    const subId = uuidv4();
    // Insert with valid course_id — should succeed
    db.prepare(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id, week_id, item_id)
       VALUES (?, ?, 'Course Sub', 'with course', 'f.pdf', 100, '/tmp/f.pdf', 'pending', ?, 'week-1', 'item-1')`
    ).run(subId, studentId, courseId);

    const row = db.prepare('SELECT course_id, week_id, item_id FROM submissions WHERE id = ?').get(subId) as any;
    expect(row.course_id).toBe(courseId);
    expect(row.week_id).toBe('week-1');
    expect(row.item_id).toBe('item-1');
  });
});

// ─── GET /courses/:courseId/submissions ─────────────────────────

describe('GET /courses/:courseId/submissions', () => {
  it('admin sees all submissions for the course', async () => {
    const { adminId, studentId, student2Id, courseId } = seedCourseCtx();
    const sub1 = uuidv4();
    const sub2 = uuidv4();
    db.prepare(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id)
       VALUES (?, ?, 'Sub A', 'desc', 'a.pdf', 100, '/tmp/a.pdf', 'pending', ?)`
    ).run(sub1, studentId, courseId);
    db.prepare(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id)
       VALUES (?, ?, 'Sub B', 'desc', 'b.pdf', 200, '/tmp/b.pdf', 'pending', ?)`
    ).run(sub2, student2Id, courseId);

    const token = makeToken({ userId: adminId, email: `cc-admin-${adminId}@t.com`, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/submissions`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.submissions).toHaveLength(2);
    expect(res.body.data.submissions.every((s: any) => s.courseId === courseId)).toBe(true);
  });

  it('student sees only own submissions for the course', async () => {
    const { studentUserId, studentId, student2Id, courseId } = seedCourseCtx();
    const sub1 = uuidv4();
    const sub2 = uuidv4();
    db.prepare(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id)
       VALUES (?, ?, 'Mine', 'desc', 'a.pdf', 100, '/tmp/a.pdf', 'pending', ?)`
    ).run(sub1, studentId, courseId);
    db.prepare(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id)
       VALUES (?, ?, 'Other', 'desc', 'b.pdf', 200, '/tmp/b.pdf', 'pending', ?)`
    ).run(sub2, student2Id, courseId);

    const token = makeToken({ userId: studentUserId, email: `cc-stu-${studentUserId}@t.com`, role: 'student', studentId });
    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/submissions`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.submissions).toHaveLength(1);
    expect(res.body.data.submissions[0].title).toBe('Mine');
  });

  it('lecturer sees all submissions for their course', async () => {
    const { lecturerId, studentId, courseId } = seedCourseCtx();
    const sub1 = uuidv4();
    db.prepare(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id)
       VALUES (?, ?, 'Lec View', 'desc', 'a.pdf', 100, '/tmp/a.pdf', 'pending', ?)`
    ).run(sub1, studentId, courseId);

    const token = makeToken({ userId: lecturerId, email: `cc-lec-${lecturerId}@t.com`, role: 'lecturer' });
    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/submissions`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.submissions).toHaveLength(1);
  });

  it('returns 404 for non-existent course', async () => {
    const { adminId } = seedCourseCtx();
    const token = makeToken({ userId: adminId, email: `cc-admin-${adminId}@t.com`, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${uuidv4()}/submissions`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('does not leak submissions from other courses', async () => {
    const { adminId, studentId, courseId, course2Id } = seedCourseCtx();
    const sub1 = uuidv4();
    const sub2 = uuidv4();
    db.prepare(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id)
       VALUES (?, ?, 'Course1 Sub', 'desc', 'a.pdf', 100, '/tmp/a.pdf', 'pending', ?)`
    ).run(sub1, studentId, courseId);
    db.prepare(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id)
       VALUES (?, ?, 'Course2 Sub', 'desc', 'b.pdf', 100, '/tmp/b.pdf', 'pending', ?)`
    ).run(sub2, studentId, course2Id);

    const token = makeToken({ userId: adminId, email: `cc-admin-${adminId}@t.com`, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/submissions`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.submissions).toHaveLength(1);
    expect(res.body.data.submissions[0].title).toBe('Course1 Sub');
  });

  it('response includes courseId, weekId, itemId fields', async () => {
    const { adminId, studentId, courseId } = seedCourseCtx();
    const sub = uuidv4();
    db.prepare(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id, week_id, item_id)
       VALUES (?, ?, 'Full Ctx', 'desc', 'a.pdf', 100, '/tmp/a.pdf', 'pending', ?, 'w-1', 'i-1')`
    ).run(sub, studentId, courseId);

    const token = makeToken({ userId: adminId, email: `cc-admin-${adminId}@t.com`, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/submissions`)
      .set('Authorization', `Bearer ${token}`);

    const s = res.body.data.submissions[0];
    expect(s.courseId).toBe(courseId);
    expect(s.weekId).toBe('w-1');
    expect(s.itemId).toBe('i-1');
  });
});

// ─── Submissions courseId filter on existing endpoint ────────────

describe('GET /submissions?courseId= filter', () => {
  it('filters submissions by courseId query param', async () => {
    const { adminId, studentId, courseId, course2Id } = seedCourseCtx();
    const sub1 = uuidv4();
    const sub2 = uuidv4();
    db.prepare(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id)
       VALUES (?, ?, 'Filter C1', 'desc', 'a.pdf', 100, '/tmp/a.pdf', 'pending', ?)`
    ).run(sub1, studentId, courseId);
    db.prepare(
      `INSERT INTO submissions (id, student_id, title, description, file_name, file_size, file_path, status, course_id)
       VALUES (?, ?, 'Filter C2', 'desc', 'b.pdf', 100, '/tmp/b.pdf', 'pending', ?)`
    ).run(sub2, studentId, course2Id);

    const token = makeToken({ userId: adminId, email: `cc-admin-${adminId}@t.com`, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/submissions?courseId=${courseId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const subs = res.body.data.submissions;
    expect(subs.every((s: any) => s.courseId === courseId)).toBe(true);
  });
});

// ─── CourseItem type roundtrip (sections JSON) ──────────────────

describe('CourseItem extended types — roundtrip via sections JSON', () => {
  it('stores and retrieves audio, quiz, assignment, download item types', async () => {
    const { adminId } = seedCourseCtx();
    const cId = uuidv4();
    const sections = JSON.stringify([
      {
        id: uuidv4(),
        title: 'Mixed Items',
        items: [
          { id: uuidv4(), type: 'video', title: 'Intro', url: 'https://yt.com/1' },
          { id: uuidv4(), type: 'audio', title: 'Podcast', url: 'https://cdn.com/ep1.mp3' },
          { id: uuidv4(), type: 'quiz', title: 'Midterm', quizId: 'q-123' },
          { id: uuidv4(), type: 'assignment', title: 'Homework 1', description: 'Submit PDF', maxFileSize: 5242880 },
          { id: uuidv4(), type: 'download', title: 'Cheatsheet', fileName: 'cheat.pdf', fileUrl: 'https://cdn.com/cheat.pdf' },
        ],
      },
    ]);

    const code = `MIX-${uuidv4().slice(0, 6)}`;
    db.prepare(
      `INSERT INTO courses (id, title, course_code, sections) VALUES (?, 'Mixed Course', ?, ?)`
    ).run(cId, code, sections);

    const token = makeToken({ userId: adminId, email: `cc-admin-${adminId}@t.com`, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${cId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const items = res.body.data.sections[0].items;
    expect(items).toHaveLength(5);
    expect(items.map((i: any) => i.type)).toEqual(['video', 'audio', 'quiz', 'assignment', 'download']);
    expect(items[1].url).toBe('https://cdn.com/ep1.mp3');
    expect(items[2].quizId).toBe('q-123');
    expect(items[3].maxFileSize).toBe(5242880);
    expect(items[4].fileName).toBe('cheat.pdf');
  });
});
