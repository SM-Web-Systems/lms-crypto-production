/**
 * Regression tests — student quiz submission and lesson completion.
 *
 * Covers the 2026-07-20 regression where ensureLecturerRole() renamed
 * "users" → "_users_old" without PRAGMA legacy_alter_table=ON. SQLite
 * ≥3.26.0 silently rewrote FK text in 13 tables (including quiz_completions)
 * to reference "_users_old". With foreign_keys=ON, any DML on those tables
 * then failed at prepare time with "no such table: main._users_old", causing:
 *   - POST /quizzes/:id/submit → 500 (DELETE FROM quiz_completions failed)
 *   - All 13 affected tables were unusable for writes
 *
 * These tests guard against that class of regression:
 *   R1 — student can submit a quiz for the first time → 201
 *   R2 — student can retake a quiz (DELETE existing row first) → 201
 *   R3 — student can mark a lesson item as complete → 200
 *   R4 — GET lesson completions returns the persisted item → 200
 *   R5 — GET course progress returns quiz pass status after submission → 200
 *   R6 — unauthenticated quiz submit → 401 (auth guard still works)
 *   R7 — student submitting quiz not found → 404
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

const SECTIONS = JSON.stringify([
  {
    id: 'sec-reg-1',
    title: 'Regression Section',
    items: [
      { id: 'item-reg-1', type: 'video', title: 'Intro Video', url: 'https://example.com/v1' },
      { id: 'item-reg-2', type: 'link',  title: 'Docs Link',  url: 'https://example.com/l1' },
    ],
  },
]);

// ─── Seed helpers ──────────────────────────────────────────────────────────────

function seedBase() {
  const studentId = uuidv4();
  const courseId  = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${studentId}', 'Reg Student', 'student-reg@test.com', '${HASH}', 'student');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'Regression Course', 'Test', 'REG-2026-01', '${SECTIONS.replace(/'/g, "''")}');

    INSERT INTO user_course_codes (user_id, course_code)
    VALUES ('${studentId}', 'REG-2026-01');
  `);

  return { studentId, courseId };
}

/** Seed a quiz with one question, linked to a course. Returns the quiz id. */
function seedQuiz(courseId: string): string {
  const quizId = uuidv4();
  const questions = JSON.stringify([
    { id: 'q-reg-1', type: 'short_answer', question: 'What is 1+1?', correctAnswer: '2', order: 0 },
  ]);
  db.exec(`
    INSERT INTO quizzes (id, title, course_id, passing_score, questions)
    VALUES ('${quizId}', 'Regression Quiz', '${courseId}', 70, '${questions.replace(/'/g, "''")}')
  `);
  return quizId;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('R1 — student submits quiz for the first time', () => {
  it('returns 201 with score and passed=false on wrong answer', async () => {
    const { studentId, courseId } = seedBase();
    const quizId = seedQuiz(courseId);
    const token = makeToken({ userId: studentId, email: 'student-reg@test.com', role: 'student' });

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { 'q-reg-1': 'wrong' } });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.quizId).toBe(quizId);
    expect(res.body.data.userId).toBe(studentId);
    expect(res.body.data.score).toBe(0);
    expect(res.body.data.passed).toBe(false);
  });
});

describe('R2 — student can retake quiz (DELETE + INSERT on quiz_completions)', () => {
  it('second submit overwrites first and returns 201 with correct score', async () => {
    const { studentId, courseId } = seedBase();
    const quizId = seedQuiz(courseId);
    const token = makeToken({ userId: studentId, email: 'student-reg@test.com', role: 'student' });

    // First submit — wrong answer
    const first = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { 'q-reg-1': 'wrong' } });
    expect(first.status).toBe(201);
    expect(first.body.data.passed).toBe(false);

    // Second submit — correct answer (retake)
    const second = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { 'q-reg-1': '2' } });
    expect(second.status).toBe(201);
    expect(second.body.data.passed).toBe(true);
    expect(second.body.data.score).toBe(100);

    // Only one row should exist (first was overwritten)
    const rows = db.prepare(
      'SELECT COUNT(*) as n FROM quiz_completions WHERE quiz_id = ? AND user_id = ?'
    ).get(quizId, studentId) as { n: number };
    expect(rows.n).toBe(1);
  });
});

describe('R3 — student marks a lesson item as complete', () => {
  it('returns 200 and inserts into lesson_completions', async () => {
    const { studentId, courseId } = seedBase();
    const token = makeToken({ userId: studentId, email: 'student-reg@test.com', role: 'student' });

    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/item-reg-1/complete`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.itemId).toBe('item-reg-1');
    expect(res.body.data.sectionId).toBe('sec-reg-1');

    // Verify persisted
    const row = db.prepare(
      'SELECT item_id FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(studentId, courseId, 'item-reg-1');
    expect(row).not.toBeNull();
  });
});

describe('R4 — GET lesson completions returns persisted items', () => {
  it('returns 200 with array including the marked item', async () => {
    const { studentId, courseId } = seedBase();
    const token = makeToken({ userId: studentId, email: 'student-reg@test.com', role: 'student' });

    // Mark two items
    await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/item-reg-1/complete`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/item-reg-2/complete`)
      .set('Authorization', `Bearer ${token}`);

    // GET completions
    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/lessons/completions`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const ids = (res.body.data.completions as { item_id: string }[]).map((c) => c.item_id);
    expect(ids).toContain('item-reg-1');
    expect(ids).toContain('item-reg-2');
  });
});

describe('R5 — GET course progress reflects quiz completion', () => {
  it('shows quiz as passed after a successful submit', async () => {
    const { studentId, courseId } = seedBase();
    const quizId = seedQuiz(courseId);

    // Set up course requirements pointing at this quiz
    db.exec(`
      INSERT INTO course_completion_requirements
        (id, course_id, require_all_lessons, lesson_threshold, required_quiz_ids, min_quiz_score, require_submissions)
      VALUES
        ('${uuidv4()}', '${courseId}', 0, 0, '["${quizId}"]', 70, 0)
    `);

    const token = makeToken({ userId: studentId, email: 'student-reg@test.com', role: 'student' });

    // Submit with correct answer
    const submit = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { 'q-reg-1': '2' } });
    expect(submit.status).toBe(201);
    expect(submit.body.data.passed).toBe(true);

    // Check progress
    const progress = await request(app)
      .get(`/api/v1/courses/${courseId}/progress`)
      .set('Authorization', `Bearer ${token}`);

    expect(progress.status).toBe(200);
    expect(progress.body.data.allRequiredQuizzesPassed).toBe(true);
    const quizItem = progress.body.data.requiredQuizzes.find(
      (q: { quizId: string }) => q.quizId === quizId
    );
    expect(quizItem?.passed).toBe(true);
    expect(quizItem?.score).toBe(100);
  });
});

describe('R6 — unauthenticated quiz submit is rejected', () => {
  it('returns 401 when no token is provided', async () => {
    const { courseId } = seedBase();
    const quizId = seedQuiz(courseId);

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .send({ answers: {} });

    expect(res.status).toBe(401);
  });
});

describe('R7 — quiz submit for non-existent quiz returns 404', () => {
  it('returns 404 when the quiz id does not exist', async () => {
    const { studentId } = seedBase();
    const token = makeToken({ userId: studentId, email: 'student-reg@test.com', role: 'student' });

    const res = await request(app)
      .post(`/api/v1/quizzes/${uuidv4()}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: {} });

    expect(res.status).toBe(404);
  });
});
