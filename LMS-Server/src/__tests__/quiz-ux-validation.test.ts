/**
 * Phase 21 C2 — Quiz UX validation tests
 *
 * QZ-1 — Submit response includes submitted answers
 * QZ-2 — Submit response includes score, total, passed
 * QZ-3 — Re-submit overwrites previous completion
 * QZ-4 — Student quiz GET has no correctIndex/correctAnswer
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('pass', 4);

function seedQuizUxData() {
  const studentId = uuidv4();
  const quizId = uuidv4();
  const q1Id = uuidv4();
  const q2Id = uuidv4();

  const questions = JSON.stringify([
    { id: q1Id, type: 'multiple_choice', question: 'Pick 4', options: ['3', '4', '5'], correctIndex: 1, order: 0 },
    { id: q2Id, type: 'short_answer', question: 'Capital?', correctAnswer: 'Paris', order: 1 },
  ]);

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${studentId}', 'QZ Student', 'qz-${studentId}@test.com', '${HASH}', 'student');

    INSERT INTO quizzes (id, title, passing_score, questions)
    VALUES ('${quizId}', 'UX Quiz', 50, '${questions}');
  `);

  return { studentId, quizId, q1Id, q2Id };
}

describe('QZ-1 — Submit response includes submitted answers', () => {
  it('should return answers object in completion response', async () => {
    const { studentId, quizId, q1Id, q2Id } = seedQuizUxData();
    const token = makeToken({ userId: studentId, role: 'student' });

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { [q1Id]: '4', [q2Id]: 'Paris' } });

    expect(res.status).toBe(201);
    expect(res.body.data.answers).toBeDefined();
    expect(res.body.data.answers[q1Id]).toBe('4');
    expect(res.body.data.answers[q2Id]).toBe('Paris');
  });
});

describe('QZ-2 — Submit response includes score breakdown', () => {
  it('should return score, total, and passed fields', async () => {
    const { studentId, quizId, q1Id, q2Id } = seedQuizUxData();
    const token = makeToken({ userId: studentId, role: 'student' });

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { [q1Id]: '4', [q2Id]: 'Paris' } });

    expect(res.status).toBe(201);
    expect(typeof res.body.data.score).toBe('number');
    expect(typeof res.body.data.total).toBe('number');
    expect(typeof res.body.data.passed).toBe('boolean');
    expect(res.body.data.score).toBe(100); // score is percentage
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.passed).toBe(true);
  });
});

describe('QZ-3 — Re-submit overwrites previous completion', () => {
  it('should replace first attempt with second', async () => {
    const { studentId, quizId, q1Id, q2Id } = seedQuizUxData();
    const token = makeToken({ userId: studentId, role: 'student' });

    // First attempt — wrong answers
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { [q1Id]: '3', [q2Id]: 'London' } });

    // Second attempt — correct answers
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { [q1Id]: '4', [q2Id]: 'Paris' } });

    expect(res.body.data.score).toBe(100); // score is percentage
    expect(res.body.data.passed).toBe(true);

    // Only one completion should exist
    const completions = db.prepare(
      'SELECT * FROM quiz_completions WHERE quiz_id = ? AND user_id = ?'
    ).all(quizId, studentId);
    expect(completions).toHaveLength(1);
  });
});

describe('QZ-4 — Student quiz GET strips answer keys', () => {
  it('should not expose correctIndex or correctAnswer to students', async () => {
    const { studentId, quizId } = seedQuizUxData();
    const token = makeToken({ userId: studentId, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const questions = res.body.data.questions;
    expect(Array.isArray(questions)).toBe(true);
    for (const q of questions) {
      expect(q.correctIndex).toBeUndefined();
      expect(q.correctAnswer).toBeUndefined();
    }
  });
});
