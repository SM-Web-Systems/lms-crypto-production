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
});
