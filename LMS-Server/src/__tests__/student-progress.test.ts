/**
 * Tests for GET /api/v1/students/me/progress (L-006 student progress endpoint).
 *
 * SMP1 — 401 when no auth token
 * SMP2 — 200 empty courses array when student is not enrolled in any course
 * SMP3 — 200 with course data including required fields when enrolled
 * SMP4 — certificateStatus is 'eligible' when all requirements met
 * SMP5 — certificateStatus reflects existing pending application
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedStudent(suffix: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES ('${userId}', 'SMP Student', 'smp-${suffix}@test.com', '${HASH}', 'student',
            'GSMPWALLET${userId.slice(0, 8).toUpperCase()}', 'linked');
  `);
  return userId;
}

function seedCourse(code?: string) {
  const courseId = uuidv4();
  const courseCode = code ?? `SMP-${uuidv4().slice(0, 8)}`;
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections)
    VALUES ('${courseId}', 'SMP Test Course', '${courseCode}', '[]');
  `);
  return { courseId, courseCode };
}

function enrolStudent(userId: string, courseCode: string) {
  db.exec(`
    INSERT INTO user_course_codes (user_id, course_code)
    VALUES ('${userId}', '${courseCode}');
  `);
}

function seedCourseWithItems(count: number, code?: string) {
  const courseId = uuidv4();
  const courseCode = code ?? `SMP-${uuidv4().slice(0, 8)}`;
  const items = Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}-${courseId.slice(0, 6)}`,
    type: 'video',
    title: `Item ${i + 1}`,
    url: 'https://example.com',
  }));
  const sections = JSON.stringify([{ id: 'section-1', title: 'Week 1', items }]);
  db.prepare(
    'INSERT INTO courses (id, title, course_code, sections) VALUES (?, ?, ?, ?)'
  ).run(courseId, 'SMP Test Course', courseCode, sections);
  return { courseId, courseCode, items };
}

function markComplete(userId: string, courseId: string, itemIds: string[]) {
  const stmt = db.prepare(
    'INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id) VALUES (?, ?, ?, ?, ?)'
  );
  for (const itemId of itemIds) {
    stmt.run(uuidv4(), userId, courseId, itemId, 'section-1');
  }
}

describe('GET /api/v1/students/me/progress', () => {
  it('SMP1 — 401 when no token', async () => {
    const res = await request(app).get('/api/v1/students/me/progress');
    expect(res.status).toBe(401);
  });

  it('SMP2 — 200 empty courses when not enrolled in any course', async () => {
    const userId = seedStudent(uuidv4().slice(0, 8));
    const token = makeToken({ userId, email: `smp-${userId.slice(0, 8)}@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/students/me/progress')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.courses).toEqual([]);
  });

  it('SMP3 — 200 with course data including required fields when enrolled', async () => {
    const userId = seedStudent(uuidv4().slice(0, 8));
    const { courseId, courseCode } = seedCourse();
    enrolStudent(userId, courseCode);
    const token = makeToken({ userId, email: `smp-${userId.slice(0, 8)}@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/students/me/progress')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const courses = res.body.data.courses;
    expect(courses).toHaveLength(1);

    const course = courses[0];
    expect(course.courseId).toBe(courseId);
    expect(course.courseName).toBe('SMP Test Course');
    expect(course.courseCode).toBe(courseCode);
    expect(typeof course.lessonsCompleted).toBe('number');
    expect(typeof course.totalLessons).toBe('number');
    expect(typeof course.lessonPercentage).toBe('number');
    expect(Array.isArray(course.requiredQuizzes)).toBe(true);
    expect(typeof course.allRequiredQuizzesPassed).toBe('boolean');
    expect(typeof course.canApplyForCertificate).toBe('boolean');
    expect(['not_eligible', 'eligible', 'pending', 'approved', 'minted', 'rejected']).toContain(
      course.certificateStatus
    );
  });

  it('SMP4 — certificateStatus is eligible by default (no requirements row → all defaults pass)', async () => {
    const userId = seedStudent(uuidv4().slice(0, 8));
    const { courseCode } = seedCourse();
    enrolStudent(userId, courseCode);
    const token = makeToken({ userId, email: `smp-${userId.slice(0, 8)}@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/students/me/progress')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // When no course_completion_requirements row exists, DEFAULT_REQS has no lesson/quiz/submission
    // requirements — so meetsAllRequirements=true → canApplyForCertificate=true → eligible
    const course = res.body.data.courses[0];
    expect(course.certificateStatus).toBe('eligible');
    expect(course.canApplyForCertificate).toBe(true);
    expect(course.allRequiredQuizzesPassed).toBe(true);
  });

  it('SMP5 — certificateStatus reflects existing pending application', async () => {
    const userId = seedStudent(uuidv4().slice(0, 8));
    const { courseId, courseCode } = seedCourse();
    enrolStudent(userId, courseCode);

    // Insert a pending application directly
    const appId = uuidv4();
    db.exec(`
      INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status)
      VALUES ('${appId}', '${userId}', '${courseId}',
              'GSMPWALLET${userId.slice(0, 8).toUpperCase()}', 'pending');
    `);

    const token = makeToken({ userId, email: `smp-${userId.slice(0, 8)}@test.com`, role: 'student' });
    const res = await request(app)
      .get('/api/v1/students/me/progress')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const course = res.body.data.courses[0];
    expect(course.certificateStatus).toBe('pending');
    expect(course.applicationId).toBe(appId);
  });

  it('SMP6 — lessonPercentage is 0 when student has no completions in a course with items', async () => {
    const userId = seedStudent(uuidv4().slice(0, 8));
    const { courseCode } = seedCourseWithItems(3);
    enrolStudent(userId, courseCode);
    const token = makeToken({ userId, email: `smp-${userId.slice(0, 8)}@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/students/me/progress')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const course = res.body.data.courses[0];
    expect(course.lessonsCompleted).toBe(0);
    expect(course.totalLessons).toBe(3);
    expect(course.lessonPercentage).toBe(0);
  });

  it('SMP7 — lessonPercentage is 100 when student has completed all lessons', async () => {
    const userId = seedStudent(uuidv4().slice(0, 8));
    const { courseId, courseCode, items } = seedCourseWithItems(3);
    enrolStudent(userId, courseCode);
    markComplete(userId, courseId, items.map((i) => i.id));
    const token = makeToken({ userId, email: `smp-${userId.slice(0, 8)}@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/students/me/progress')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const course = res.body.data.courses[0];
    expect(course.lessonsCompleted).toBe(3);
    expect(course.totalLessons).toBe(3);
    expect(course.lessonPercentage).toBe(100);
  });

  it('SMP8 — lessonPercentage rounds correctly (1/3 → 33, 2/3 → 67)', async () => {
    const userId = seedStudent(uuidv4().slice(0, 8));
    const { courseId, courseCode, items } = seedCourseWithItems(3);
    enrolStudent(userId, courseCode);
    const token = makeToken({ userId, email: `smp-${userId.slice(0, 8)}@test.com`, role: 'student' });

    // 1 of 3 completed
    markComplete(userId, courseId, [items[0].id]);
    const res1 = await request(app)
      .get('/api/v1/students/me/progress')
      .set('Authorization', `Bearer ${token}`);
    expect(res1.status).toBe(200);
    expect(res1.body.data.courses[0].lessonPercentage).toBe(33);

    // 2 of 3 completed
    markComplete(userId, courseId, [items[1].id]);
    const res2 = await request(app)
      .get('/api/v1/students/me/progress')
      .set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(200);
    expect(res2.body.data.courses[0].lessonPercentage).toBe(67);
  });

  it('SMP9 — /students/me/progress and /courses/:id/progress return consistent lesson counts', async () => {
    const userId = seedStudent(uuidv4().slice(0, 8));
    const { courseId, courseCode, items } = seedCourseWithItems(4);
    enrolStudent(userId, courseCode);
    markComplete(userId, courseId, [items[0].id, items[1].id]);
    const token = makeToken({ userId, email: `smp-${userId.slice(0, 8)}@test.com`, role: 'student' });

    const [meRes, courseRes] = await Promise.all([
      request(app)
        .get('/api/v1/students/me/progress')
        .set('Authorization', `Bearer ${token}`),
      request(app)
        .get(`/api/v1/courses/${courseId}/progress`)
        .set('Authorization', `Bearer ${token}`),
    ]);

    expect(meRes.status).toBe(200);
    expect(courseRes.status).toBe(200);

    const me = meRes.body.data.courses[0];
    const direct = courseRes.body.data;

    // Field names differ but values must be identical
    expect(me.lessonsCompleted).toBe(direct.completedLessonItems);
    expect(me.totalLessons).toBe(direct.totalLessonItems);
    expect(me.lessonPercentage).toBe(direct.lessonPercentage);
    expect(me.lessonsCompleted).toBe(2);
    expect(me.totalLessons).toBe(4);
    expect(me.lessonPercentage).toBe(50);
  });
});
