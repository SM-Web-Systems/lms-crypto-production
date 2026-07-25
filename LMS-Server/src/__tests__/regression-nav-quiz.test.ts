/**
 * Regression tests — learner navigation, text-item visibility, answer-key export,
 * and quiz-review correctness data.
 *
 * Covers the 2026-07-20 work:
 *   RN1 — Course API returns items of type "text" (previously invisible in UI)
 *   RN2 — Admin GET /quizzes/answer-keys returns structured data with correctAnswer
 *   RN3 — Student cannot access /quizzes/answer-keys → 403
 *   RN4 — Answer key includes correct option for multiple_choice questions
 *   RN5 — Quiz submit response includes submitted answers (needed for client correctness display)
 *   RN6 — Short-answer correctAnswer is present in quiz question data returned to admin
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

const SECTIONS_WITH_TEXT = JSON.stringify([
  {
    id: 'sec-nav-1',
    title: 'Module 1',
    items: [
      { id: 'item-nav-text',  type: 'text', title: 'Lesson Notes', url: 'https://example.com/notes.md', order: 1 },
      { id: 'item-nav-link',  type: 'link', title: 'Flashcards',   url: 'https://example.com/flash',   order: 2 },
      { id: 'item-nav-video', type: 'video', title: 'Intro Video', url: 'https://youtube.com/watch?v=x', order: 3 },
    ],
  },
]);

function seedNavBase() {
  const adminId   = uuidv4();
  const studentId = uuidv4();
  const courseId  = uuidv4();
  const code      = `NAV-${uuidv4().slice(0, 8)}`;

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${adminId}', 'Nav Admin', 'admin-nav-${adminId}@test.com', '${HASH}', 'admin');

    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${studentId}', 'Nav Student', 'student-nav-${studentId}@test.com', '${HASH}', 'student');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'Nav Course', 'Test', '${code}', '${SECTIONS_WITH_TEXT.replace(/'/g, "''")}');

    INSERT INTO user_course_codes (user_id, course_code)
    VALUES ('${studentId}', '${code}');
  `);

  return { adminId, studentId, courseId, code };
}

function seedNavQuiz(courseId: string) {
  const quizId  = uuidv4();
  const mcId    = uuidv4();
  const saId    = uuidv4();
  const questions = JSON.stringify([
    {
      id: mcId,
      type: 'multiple_choice',
      question: 'Best blockchain?',
      options: ['Bitcoin', 'Ethereum', 'Stellar'],
      correctIndex: 2,
      order: 0,
    },
    {
      id: saId,
      type: 'short_answer',
      question: 'What does DeFi stand for?',
      correctAnswer: 'Decentralized Finance',
      order: 1,
    },
  ]);
  db.exec(`
    INSERT INTO quizzes (id, title, course_id, passing_score, questions)
    VALUES ('${quizId}', 'Nav Quiz', '${courseId}', 70,
      '${questions.replace(/'/g, "''")}')
  `);
  return { quizId, mcId, saId };
}

// ─── RN1: Course API includes text-type items ────────────────────────────────

describe('RN1 — GET course returns text-type items', () => {
  it('returns all 3 items including the text-type one', async () => {
    const { studentId, courseId } = seedNavBase();
    const token = makeToken({ userId: studentId, email: `student-nav-${studentId}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const sections = res.body.data.sections as { items: { id: string; type: string }[] }[];
    const items = sections.flatMap((s) => s.items);
    expect(items).toHaveLength(3);
    const textItem = items.find((i) => i.id === 'item-nav-text');
    expect(textItem).toBeDefined();
    expect(textItem?.type).toBe('text');
  });
});

// ─── RN2: Admin gets answer keys ─────────────────────────────────────────────

describe('RN2 — GET /quizzes/answer-keys (admin)', () => {
  it('returns 200 with structured answer key data', async () => {
    const { adminId, courseId } = seedNavBase();
    seedNavQuiz(courseId);
    const token = makeToken({ userId: adminId, email: `admin-nav-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .get('/api/v1/quizzes/answer-keys')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.quizzes)).toBe(true);
    expect(typeof res.body.generatedAt).toBe('string');

    // Find our seeded quiz
    const key = (res.body.data.quizzes as { quizTitle: string; questions: { type: string; correctAnswer: string | null }[] }[])
      .find((q) => q.quizTitle === 'Nav Quiz');
    expect(key).toBeDefined();
    expect(key?.questions).toHaveLength(2);
  });
});

// ─── RN3: Student cannot access answer keys ───────────────────────────────────

describe('RN3 — GET /quizzes/answer-keys (student) → 403', () => {
  it('returns 403 for a student token', async () => {
    const { studentId } = seedNavBase();
    const token = makeToken({ userId: studentId, email: `student-nav-${studentId}@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/quizzes/answer-keys')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ─── RN4: Answer key has correct option for multiple-choice ──────────────────

describe('RN4 — answer key correctAnswer is correct option text for MC questions', () => {
  it('correctAnswer = options[correctIndex] for multiple_choice', async () => {
    const { adminId, courseId } = seedNavBase();
    const { quizId, mcId } = seedNavQuiz(courseId);
    const token = makeToken({ userId: adminId, email: `admin-nav-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .get('/api/v1/quizzes/answer-keys')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const key = (res.body.data.quizzes as { quizId: string; questions: { questionId: string; type: string; correctAnswer: string | null; correctIndex: number | null }[] }[])
      .find((q) => q.quizId === quizId);
    expect(key).toBeDefined();

    const mcQ = key!.questions.find((q) => q.questionId === mcId);
    expect(mcQ).toBeDefined();
    expect(mcQ?.type).toBe('multiple_choice');
    expect(mcQ?.correctIndex).toBe(2);
    expect(mcQ?.correctAnswer).toBe('Stellar');
  });
});

// ─── RN5: Submit returns answers for client-side correctness display ──────────

describe('RN5 — quiz submit response includes submitted answers', () => {
  it('completion.answers maps questionId → submitted value', async () => {
    const { studentId, courseId } = seedNavBase();
    const { quizId, saId } = seedNavQuiz(courseId);
    const token = makeToken({ userId: studentId, email: `student-nav-${studentId}@test.com`, role: 'student' });

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { [saId]: 'Decentralized Finance' } });

    expect(res.status).toBe(201);
    expect(res.body.data.answers).toMatchObject({ [saId]: 'Decentralized Finance' });
    expect(res.body.data.score).toBe(50);   // 1/2 correct (mc not answered)
    expect(res.body.data.passed).toBe(false);
  });
});

// ─── RN6: Quiz question correctAnswer is in GET /quizzes/:id response ─────────

describe('RN6 — GET quiz question has correctAnswer in API response', () => {
  it('short_answer question exposes correctAnswer to admins (for review UI)', async () => {
    const { adminId, courseId } = seedNavBase();
    const { quizId, saId } = seedNavQuiz(courseId);
    const token = makeToken({ userId: adminId, email: `admin-nav-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const questions = res.body.data.questions as { id: string; correctAnswer?: string }[];
    const saQ = questions.find((q) => q.id === saId);
    expect(saQ).toBeDefined();
    expect(saQ?.correctAnswer).toBe('Decentralized Finance');
  });
});
