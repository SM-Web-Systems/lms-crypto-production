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

  it('D1-AC8: complete sets completed_at on progress-only row', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    // First PUT progress (creates row with no completed_at)
    await request(app)
      .put(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ positionSeconds: 30, progressPercent: 25 });
    const before = db.prepare(
      'SELECT completed_at FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(ids.studentId, ids.courseId, 'item-d-1') as any;
    expect(before.completed_at).toBeNull();
    // Then POST complete (sets completed_at via ON CONFLICT)
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const after = db.prepare(
      'SELECT completed_at, progress_pct FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(ids.studentId, ids.courseId, 'item-d-1') as any;
    expect(after.completed_at).not.toBeNull();
    expect(after.progress_pct).toBe(100);
  });

  it('D1-AC9: complete is idempotent on already-completed item', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    // POST complete first time
    await request(app)
      .post(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/complete`)
      .set('Authorization', `Bearer ${token}`);
    const first = db.prepare(
      'SELECT completed_at FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(ids.studentId, ids.courseId, 'item-d-1') as any;
    // POST complete second time
    const res = await request(app)
      .post(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const second = db.prepare(
      'SELECT completed_at FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(ids.studentId, ids.courseId, 'item-d-1') as any;
    expect(second.completed_at).toBe(first.completed_at);
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
// D3 — PUT /courses/:courseId/lessons/:itemId/progress
// ═══════════════════════════════════════════════════════════════════════════════

describe('D3 — PUT /courses/:courseId/lessons/:itemId/progress', () => {
  let ids: ReturnType<typeof seedBase>;
  beforeEach(() => { ids = seedBase(); });

  it('D3-AC1: enrolled student saves progress', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .put(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ positionSeconds: 60, progressPercent: 25 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.progressPercent).toBe(25);
    expect(res.body.data.positionSeconds).toBe(60);
    // Verify row exists with no completed_at
    const row = db.prepare(
      'SELECT completed_at, progress_pct, last_position_s FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(ids.studentId, ids.courseId, 'item-d-1') as any;
    expect(row.completed_at).toBeNull();
    expect(row.progress_pct).toBe(25);
    expect(row.last_position_s).toBe(60);
  });

  it('D3-AC2: second progress update overwrites', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const url = `/api/v1/courses/${ids.courseId}/lessons/item-d-1/progress`;
    await request(app).put(url).set('Authorization', `Bearer ${token}`)
      .send({ positionSeconds: 30, progressPercent: 10 });
    const res = await request(app).put(url).set('Authorization', `Bearer ${token}`)
      .send({ positionSeconds: 90, progressPercent: 50 });
    expect(res.status).toBe(200);
    const row = db.prepare(
      'SELECT progress_pct, last_position_s FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(ids.studentId, ids.courseId, 'item-d-1') as any;
    expect(row.progress_pct).toBe(50);
    expect(row.last_position_s).toBe(90);
  });

  it('D3-AC3: progress on completed item preserves completed_at', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    // First complete the item
    await request(app)
      .post(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/complete`)
      .set('Authorization', `Bearer ${token}`);
    const before = db.prepare(
      'SELECT completed_at FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(ids.studentId, ids.courseId, 'item-d-1') as any;
    // Then send progress
    const res = await request(app)
      .put(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ positionSeconds: 120, progressPercent: 75 });
    expect(res.status).toBe(200);
    const after = db.prepare(
      'SELECT completed_at, progress_pct, last_position_s FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(ids.studentId, ids.courseId, 'item-d-1') as any;
    expect(after.completed_at).toBe(before.completed_at);
    expect(after.progress_pct).toBe(75);
    expect(after.last_position_s).toBe(120);
  });

  it('D3-AC4: rejects progressPercent > 100', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .put(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ positionSeconds: 60, progressPercent: 101 });
    expect(res.status).toBe(400);
  });

  it('D3-AC5: rejects negative positionSeconds', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .put(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ positionSeconds: -1, progressPercent: 25 });
    expect(res.status).toBe(400);
  });

  it('D3-AC6: 403 for non-enrolled student', async () => {
    const token = makeToken({ userId: ids.student2Id, email: 'student2-d@test.com', role: 'student' });
    const res = await request(app)
      .put(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ positionSeconds: 60, progressPercent: 25 });
    expect(res.status).toBe(403);
  });

  it('D3-AC7: 404 for nonexistent course', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .put(`/api/v1/courses/${uuidv4()}/lessons/item-d-1/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ positionSeconds: 60, progressPercent: 25 });
    expect(res.status).toBe(404);
  });

  it('D3-AC8: 404 for item not in course', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    const res = await request(app)
      .put(`/api/v1/courses/${ids.courseId}/lessons/nonexistent-item/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ positionSeconds: 60, progressPercent: 25 });
    expect(res.status).toBe(404);
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

  it('D1b-AC7: GET completions includes progress_pct and last_position_s', async () => {
    const token = makeToken({ userId: ids.studentId, email: 'student-d@test.com', role: 'student' });
    // PUT progress for item-d-1
    await request(app)
      .put(`/api/v1/courses/${ids.courseId}/lessons/item-d-1/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ positionSeconds: 45, progressPercent: 30 });
    // GET completions
    const res = await request(app)
      .get(`/api/v1/courses/${ids.courseId}/lessons/completions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Should include both the pre-seeded completion AND the progress-only row
    const progressRow = res.body.data.completions.find((c: any) => c.item_id === 'item-d-1' && c.progress_pct === 30);
    expect(progressRow).toBeDefined();
    expect(progressRow.last_position_s).toBe(45);
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
