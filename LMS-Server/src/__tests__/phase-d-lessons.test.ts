/**
 * Phase D tests — lesson completion tracking and progress routes
 *
 * Covers:
 *  D1  — POST /courses/:courseId/lessons/:itemId/complete (self-mark)
 *  D1a — POST /courses/:courseId/students/:userId/lessons/:itemId/complete (admin/lecturer marks)
 *  D1b — GET  /courses/:courseId/lessons/completions
 *  D2  — GET  /courses/:courseId/progress (own)
 *  D2a — GET  /courses/:courseId/students/:userId/progress
 *  D2b — GET  /courses/:courseId/progress/all
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

// Two lesson items in one section
const SECTIONS = JSON.stringify([
  {
    id: 'sec-d-1',
    title: 'Section 1',
    items: [
      { id: 'item-d-1', type: 'video', title: 'Video 1', url: 'https://example.com/v1' },
      { id: 'item-d-2', type: 'link',  title: 'Link 1',  url: 'https://example.com/l1' },
    ],
  },
]);

// ─── Seed helpers ──────────────────────────────────────────────────────────────

function seedBase() {
  const adminId     = uuidv4();
  const lecturerId  = uuidv4();
  const lecturer2Id = uuidv4();
  const studentId   = uuidv4();
  const student2Id  = uuidv4();
  const courseId    = uuidv4();
  const course2Id   = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}',     'Admin',     'admin-d@test.com',     '${HASH}', 'admin'),
      ('${lecturerId}',  'Lecturer',  'lecturer-d@test.com',  '${HASH}', 'lecturer'),
      ('${lecturer2Id}', 'Lecturer2', 'lecturer2-d@test.com', '${HASH}', 'lecturer'),
      ('${studentId}',   'Student',   'student-d@test.com',   '${HASH}', 'student'),
      ('${student2Id}',  'Student2',  'student2-d@test.com',  '${HASH}', 'student');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES
      ('${courseId}',  'Course D One', 'desc', 'D-D-001', '${SECTIONS}'),
      ('${course2Id}', 'Course D Two', 'desc', 'D-D-002', '${SECTIONS}');

    -- Enroll student1 in course1 only
    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${studentId}', 'D-D-001');

    -- Assign lecturer to course1 only
    INSERT INTO course_lecturers (course_id, user_id) VALUES ('${courseId}', '${lecturerId}');
  `);

  return { adminId, lecturerId, lecturer2Id, studentId, student2Id, courseId, course2Id };
}

// ═══════════════════════════════════════════════════════════════════════════════
// D1 — POST /courses/:courseId/lessons/:itemId/complete (self-mark)
// ═══════════════════════════════════════════════════════════════════════════════

describe('D1 — POST /courses/:courseId/lessons/:itemId/complete (self-mark)', () => {
  let ids: ReturnType<typeof seedBase>;
  beforeEach(() => { ids = seedBase(); });

  it('enrolled student can mark a lesson item complete', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.itemId).toBe('item-d-1');
    expect(res.body.data.sectionId).toBe('sec-d-1');
  });

  it('second call for same item is idempotent (200 again)', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const url = `/api/v1/courses/${ids.courseId}/lessons/item-d-1/complete`;
    await request(app).post(url).set('Authorization', `Bearer ${token}`);
    const res = await request(app).post(url).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 for invalid itemId not in sections', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/lessons/nonexistent-item/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 for student not enrolled in the course', async () => {
    const token = makeToken({ userId: ids.student2Id, email: 'student2-d@test.com', role: 'student' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for nonexistent course', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .post(`/api/v1/courses/${uuidv4()}/lessons/item-d-1/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('admin can mark own progress on any course without enrollment', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-d@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/complete`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D1a — POST /courses/:courseId/students/:userId/lessons/:itemId/complete
// ═══════════════════════════════════════════════════════════════════════════════

describe('D1a — POST /courses/:courseId/students/:userId/lessons/:itemId/complete', () => {
  let ids: ReturnType<typeof seedBase>;
  beforeEach(() => { ids = seedBase(); });

  it('admin can mark a lesson item complete for a student', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-d@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/students/${ids.studentId}/lessons/item-d-1/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(ids.studentId);
    expect(res.body.data.itemId).toBe('item-d-1');
  });

  it('assigned lecturer can mark a lesson item complete for a student', async () => {
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-d@test.com', role: 'lecturer' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/students/${ids.studentId}/lessons/item-d-2/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('unassigned lecturer gets 403', async () => {
    const token = makeToken({ userId: ids.lecturer2Id, email: 'lecturer2-d@test.com', role: 'lecturer' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/students/${ids.studentId}/lessons/item-d-1/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for nonexistent user', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-d@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/students/${uuidv4()}/lessons/item-d-1/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for invalid itemId', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-d@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/students/${ids.studentId}/lessons/bad-item/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('student cannot use the admin mark-for-student endpoint (403)', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/students/${ids.studentId}/lessons/item-d-1/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D1b — GET /courses/:courseId/lessons/completions
// ═══════════════════════════════════════════════════════════════════════════════

describe('D1b — GET /courses/:courseId/lessons/completions', () => {
  let ids: ReturnType<typeof seedBase>;
  beforeEach(() => {
    ids = seedBase();
    // Pre-mark item-d-1 for student1
    db.exec(`
      INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by)
      VALUES ('${uuidv4()}', '${ids.studentId}', '${ids.courseId}', 'item-d-1', 'sec-d-1', '${ids.studentId}')
    `);
  });

  it('student sees only own completions', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/lessons/completions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.completions).toHaveLength(1);
    expect(res.body.data.completions[0].item_id).toBe('item-d-1');
    expect(res.body.data.completions[0].user_id).toBe(ids.studentId);
  });

  it('admin sees all completions for the course', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-d@test.com', role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/lessons/completions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.completions).toHaveLength(1);
  });

  it('admin can filter by ?userId=', async () => {
    // Add a completion for student2 (even though not enrolled — admin can still track)
    db.exec(`
      INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by)
      VALUES ('${uuidv4()}', '${ids.student2Id}', '${ids.courseId}', 'item-d-2', 'sec-d-1', '${ids.adminId}')
    `);
    const token = makeToken({ userId: ids.adminId, email: 'admin-d@test.com', role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/lessons/completions?userId=${ids.studentId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.completions.every((c: { user_id: string }) => c.user_id === ids.studentId)).toBe(true);
  });

  it('assigned lecturer sees all completions for their course', async () => {
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-d@test.com', role: 'lecturer' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/lessons/completions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.completions).toHaveLength(1);
  });

  it('unassigned lecturer gets 403', async () => {
    const token = makeToken({ userId: ids.lecturer2Id, email: 'lecturer2-d@test.com', role: 'lecturer' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/lessons/completions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent course', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-d@test.com', role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${uuidv4()}/lessons/completions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D2 — GET /courses/:courseId/progress (own)
// ═══════════════════════════════════════════════════════════════════════════════

describe('D2 — GET /courses/:courseId/progress (own progress)', () => {
  let ids: ReturnType<typeof seedBase>;
  beforeEach(() => { ids = seedBase(); });

  it('student gets own progress with correct lesson counts', async () => {
    // Mark item-d-1 complete
    db.exec(`
      INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by)
      VALUES ('${uuidv4()}', '${ids.studentId}', '${ids.courseId}', 'item-d-1', 'sec-d-1', '${ids.studentId}')
    `);
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/progress`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalLessonItems).toBe(2);
    expect(res.body.data.completedLessonItems).toBe(1);
    expect(res.body.data.lessonPercentage).toBe(50);
    expect(res.body.data.userId).toBe(ids.studentId);
    expect(res.body.data.courseId).toBe(ids.courseId);
  });

  it('returns 0 completed and 0% when no items marked', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/progress`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.completedLessonItems).toBe(0);
    expect(res.body.data.lessonPercentage).toBe(0);
  });

  it('returns 404 for nonexistent course', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .get(`/api/v1/courses/${uuidv4()}/progress`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/progress`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D2a — GET /courses/:courseId/students/:userId/progress
// ═══════════════════════════════════════════════════════════════════════════════

describe('D2a — GET /courses/:courseId/students/:userId/progress', () => {
  let ids: ReturnType<typeof seedBase>;
  beforeEach(() => { ids = seedBase(); });

  it('admin gets specific student progress', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-d@test.com', role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/students/${ids.studentId}/progress`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(ids.studentId);
    expect(res.body.data.totalLessonItems).toBe(2);
  });

  it('assigned lecturer gets specific student progress', async () => {
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-d@test.com', role: 'lecturer' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/students/${ids.studentId}/progress`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(ids.studentId);
  });

  it('unassigned lecturer gets 403', async () => {
    const token = makeToken({ userId: ids.lecturer2Id, email: 'lecturer2-d@test.com', role: 'lecturer' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/students/${ids.studentId}/progress`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('student gets 403 (cannot view others)', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/students/${ids.student2Id}/progress`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent course', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-d@test.com', role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${uuidv4()}/students/${ids.studentId}/progress`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for nonexistent user', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-d@test.com', role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/students/${uuidv4()}/progress`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D2b — GET /courses/:courseId/progress/all
// ═══════════════════════════════════════════════════════════════════════════════

describe('D2b — GET /courses/:courseId/progress/all', () => {
  let ids: ReturnType<typeof seedBase>;
  beforeEach(() => { ids = seedBase(); });

  it('admin gets progress list for all enrolled students', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-d@test.com', role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/progress/all`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // student1 is enrolled in course1; student2 is not
    expect(Array.isArray(res.body.data.progress)).toBe(true);
    expect(res.body.data.progress).toHaveLength(1);
    expect(res.body.data.progress[0].userId).toBe(ids.studentId);
  });

  it('assigned lecturer gets progress/all for their course', async () => {
    const token = makeToken({ userId: ids.lecturerId, email: 'lecturer-d@test.com', role: 'lecturer' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/progress/all`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.progress).toHaveLength(1);
  });

  it('unassigned lecturer gets 403', async () => {
    const token = makeToken({ userId: ids.lecturer2Id, email: 'lecturer2-d@test.com', role: 'lecturer' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/progress/all`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('student gets 403', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/progress/all`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for nonexistent course', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-d@test.com', role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${uuidv4()}/progress/all`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns empty list when no students are enrolled', async () => {
    const token = makeToken({ userId: ids.adminId, email: 'admin-d@test.com', role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/courses/${ids.course2Id}/progress/all`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.progress).toHaveLength(0);
  });
});
