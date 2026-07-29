/**
 * Security tests for quiz endpoints.
 *
 * LMS-QUIZ-001 — Student responses must NOT contain correctIndex / correctAnswer
 * LMS-QUIZ-002 — Students can only query their own quiz completions
 * LMS-QUIZ-003 — Students can only query their own single quiz completion
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedQuizData() {
  const adminId = uuidv4();
  const studentAId = uuidv4();
  const studentBId = uuidv4();
  const courseId = uuidv4();
  const code = `QSec-${uuidv4().slice(0, 6)}`;
  const quizId = uuidv4();
  const mcId = uuidv4();
  const saId = uuidv4();

  const questions = JSON.stringify([
    {
      id: mcId,
      type: 'multiple_choice',
      question: 'What is 2+2?',
      options: ['3', '4', '5'],
      correctIndex: 1,
      order: 0,
    },
    {
      id: saId,
      type: 'short_answer',
      question: 'Capital of France?',
      correctAnswer: 'Paris',
      order: 1,
    },
  ]);

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}', 'QSec Admin', 'qsec-admin-${adminId}@test.com', '${HASH}', 'admin'),
      ('${studentAId}', 'Student A', 'qsec-a-${studentAId}@test.com', '${HASH}', 'student'),
      ('${studentBId}', 'Student B', 'qsec-b-${studentBId}@test.com', '${HASH}', 'student');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'Security Course', 'Test', '${code}', '[]');

    INSERT INTO user_course_codes (user_id, course_code)
    VALUES ('${studentAId}', '${code}'), ('${studentBId}', '${code}');

    INSERT INTO quizzes (id, title, course_id, passing_score, questions)
    VALUES ('${quizId}', 'Security Quiz', '${courseId}', 70,
      '${questions.replace(/'/g, "''")}');
  `);

  return { adminId, studentAId, studentBId, courseId, code, quizId, mcId, saId };
}

// ─── LMS-QUIZ-001: Answer key stripping ────────────────────────────────────────

describe('LMS-QUIZ-001 — student must not see answer keys', () => {
  it('GET /quizzes strips correctIndex and correctAnswer for students', async () => {
    const { studentAId } = seedQuizData();
    const token = makeToken({ userId: studentAId, email: `qsec-a-${studentAId}@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/quizzes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const quizzes = res.body.data.quizzes as { questions: Record<string, unknown>[] }[];
    expect(quizzes.length).toBeGreaterThan(0);

    for (const quiz of quizzes) {
      for (const q of quiz.questions) {
        expect(q).not.toHaveProperty('correctIndex');
        expect(q).not.toHaveProperty('correctAnswer');
      }
    }
  });

  it('GET /quizzes/:id strips correctIndex and correctAnswer for students', async () => {
    const { studentAId, quizId } = seedQuizData();
    const token = makeToken({ userId: studentAId, email: `qsec-a-${studentAId}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const questions = res.body.data.questions as Record<string, unknown>[];
    for (const q of questions) {
      expect(q).not.toHaveProperty('correctIndex');
      expect(q).not.toHaveProperty('correctAnswer');
    }
  });

  it('GET /quizzes still returns correctIndex and correctAnswer for admins', async () => {
    const { adminId } = seedQuizData();
    const token = makeToken({ userId: adminId, email: `qsec-admin-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .get('/api/v1/quizzes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const quizzes = res.body.data.quizzes as { questions: { correctIndex?: number; correctAnswer?: string }[] }[];
    const quiz = quizzes[0];
    const mcQ = quiz.questions.find((q: Record<string, unknown>) => q.type === 'multiple_choice');
    expect(mcQ?.correctIndex).toBe(1);
    const saQ = quiz.questions.find((q: Record<string, unknown>) => q.type === 'short_answer');
    expect(saQ?.correctAnswer).toBe('Paris');
  });
});

// ─── LMS-QUIZ-002: Completion IDOR (list) ──────────────────────────────────────

describe('LMS-QUIZ-002 — student cannot query another student completions', () => {
  function seedWithCompletion() {
    const data = seedQuizData();
    const completionId = uuidv4();
    // Student B has a quiz completion
    db.exec(`
      INSERT INTO quiz_completions (id, quiz_id, user_id, score, total, passed, answers, completed_at)
      VALUES ('${completionId}', '${data.quizId}', '${data.studentBId}', 50, 100, 0, '{}', datetime('now'));
    `);
    return { ...data, completionId };
  }

  it('student A cannot fetch student B completions — returns 403', async () => {
    const { studentAId, studentBId } = seedWithCompletion();
    const token = makeToken({ userId: studentAId, email: `qsec-a-${studentAId}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/quizzes/completions?userId=${studentBId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('student A can fetch own completions', async () => {
    const { studentAId } = seedWithCompletion();
    const token = makeToken({ userId: studentAId, email: `qsec-a-${studentAId}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/quizzes/completions?userId=${studentAId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('admin can fetch any student completions', async () => {
    const { adminId, studentBId } = seedWithCompletion();
    const token = makeToken({ userId: adminId, email: `qsec-admin-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .get(`/api/v1/quizzes/completions?userId=${studentBId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ─── LMS-QUIZ-003: Completion IDOR (single) ────────────────────────────────────

describe('LMS-QUIZ-003 — student cannot query another student single completion', () => {
  function seedWithCompletion() {
    const data = seedQuizData();
    const completionId = uuidv4();
    db.exec(`
      INSERT INTO quiz_completions (id, quiz_id, user_id, score, total, passed, answers, completed_at)
      VALUES ('${completionId}', '${data.quizId}', '${data.studentBId}', 50, 100, 0, '{}', datetime('now'));
    `);
    return { ...data, completionId };
  }

  it('student A cannot fetch student B single completion — returns 403', async () => {
    const { studentAId, studentBId, quizId } = seedWithCompletion();
    const token = makeToken({ userId: studentAId, email: `qsec-a-${studentAId}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}/completion?userId=${studentBId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('student A can fetch own single completion', async () => {
    const { studentAId, quizId } = seedWithCompletion();
    const token = makeToken({ userId: studentAId, email: `qsec-a-${studentAId}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}/completion?userId=${studentAId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
