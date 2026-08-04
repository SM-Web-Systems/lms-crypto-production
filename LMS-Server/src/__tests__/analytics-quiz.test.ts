/**
 * Tests for GET /api/v1/analytics/quizzes (Phase 10 C2 — quiz analytics).
 *
 * QA-B1 — Returns quiz stats with correct aggregates
 * QA-B2 — Returns empty array when no quizzes exist
 * QA-B3 — Handles quizzes with zero completions
 * QA-B4 — Requires admin auth (401 unauthenticated, 403 student)
 * QA-B5 — Includes course info for linked quizzes, null for unlinked
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(role: 'admin' | 'student', suffix: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${userId}', 'QA User', 'qa-${suffix}@test.com', '${HASH}', '${role}');
  `);
  return userId;
}

function seedCourse(title: string, code: string) {
  const courseId = uuidv4();
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections)
    VALUES ('${courseId}', '${title}', '${code}', '[]');
  `);
  return courseId;
}

function seedQuiz(title: string, courseId?: string) {
  const quizId = uuidv4();
  const cid = courseId ? `'${courseId}'` : 'NULL';
  db.exec(`
    INSERT INTO quizzes (id, title, passing_score, questions, course_id)
    VALUES ('${quizId}', '${title}', 70, '[]', ${cid});
  `);
  return quizId;
}

function seedCompletion(quizId: string, userId: string, score: number, passed: boolean) {
  const compId = uuidv4();
  db.exec(`
    INSERT INTO quiz_completions (id, quiz_id, user_id, score, total, passed, answers)
    VALUES ('${compId}', '${quizId}', '${userId}', ${score}, 100, ${passed ? 1 : 0}, '{}');
  `);
  return compId;
}

describe('GET /api/v1/analytics/quizzes', () => {
  // QA-B4: Auth checks
  it('QA-B4 — 401 when no token', async () => {
    const res = await request(app).get('/api/v1/analytics/quizzes');
    expect(res.status).toBe(401);
  });

  it('QA-B4 — 403 when student token', async () => {
    const userId = seedUser('student', uuidv4().slice(0, 8));
    const token = makeToken({ userId, email: `qa-${userId.slice(0, 8)}@test.com`, role: 'student' });
    const res = await request(app)
      .get('/api/v1/analytics/quizzes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  // QA-B2: Empty state
  it('QA-B2 — returns empty array when no quizzes exist', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `qa-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/analytics/quizzes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.quizzes).toEqual([]);
  });

  // QA-B3: Quiz with zero completions
  it('QA-B3 — quiz with zero completions returns 0 for all metrics', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `qa-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const quizId = seedQuiz('Empty Quiz');

    const res = await request(app)
      .get('/api/v1/analytics/quizzes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const quiz = res.body.data.quizzes.find((q: { quizId: string }) => q.quizId === quizId);
    expect(quiz).toBeDefined();
    expect(quiz.attempts).toBe(0);
    expect(quiz.passedCount).toBe(0);
    expect(quiz.passRate).toBe(0);
    expect(quiz.avgScore).toBe(0);
  });

  // QA-B1: Correct aggregates
  it('QA-B1 — returns correct aggregate stats', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `qa-${adminId.slice(0, 8)}@test.com`, role: 'admin' });

    const quizId = seedQuiz('Agg Quiz');
    const s1 = seedUser('student', uuidv4().slice(0, 8));
    const s2 = seedUser('student', uuidv4().slice(0, 8));
    seedCompletion(quizId, s1, 80, true);
    seedCompletion(quizId, s2, 40, false);

    const res = await request(app)
      .get('/api/v1/analytics/quizzes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const quiz = res.body.data.quizzes.find((q: { quizId: string }) => q.quizId === quizId);
    expect(quiz).toBeDefined();
    expect(quiz.attempts).toBe(2);
    expect(quiz.passedCount).toBe(1);
    expect(quiz.passRate).toBe(50);
    expect(quiz.avgScore).toBe(60);
  });

  // QA-B5: Course info
  it('QA-B5 — includes course info for linked quizzes, null for unlinked', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `qa-${adminId.slice(0, 8)}@test.com`, role: 'admin' });

    const code = `QAB5-${uuidv4().slice(0, 6).toUpperCase()}`;
    const courseId = seedCourse('Analytics Course', code);
    const linkedQuizId = seedQuiz('Linked Quiz', courseId);
    const unlinkedQuizId = seedQuiz('Unlinked Quiz');

    const res = await request(app)
      .get('/api/v1/analytics/quizzes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const linked = res.body.data.quizzes.find((q: { quizId: string }) => q.quizId === linkedQuizId);
    const unlinked = res.body.data.quizzes.find((q: { quizId: string }) => q.quizId === unlinkedQuizId);
    expect(linked.courseTitle).toBe('Analytics Course');
    expect(linked.courseCode).toBe(code);
    expect(unlinked.courseTitle).toBeNull();
    expect(unlinked.courseCode).toBeNull();
  });
});
