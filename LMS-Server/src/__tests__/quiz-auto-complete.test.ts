/**
 * Phase 4 — Quiz auto-complete on pass.
 * When a student passes a quiz linked to a course item, the course item
 * is automatically marked complete via lesson_completions INSERT OR IGNORE.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedQuizAutoComplete() {
  const adminId = uuidv4();
  const studentUserId = uuidv4();
  const studentId = uuidv4();
  const courseId = uuidv4();
  const code = `QAC-${uuidv4().slice(0, 6)}`;
  const quizId = uuidv4();
  const quizItemId = uuidv4();
  const sectionId = uuidv4();
  const mcId = uuidv4();

  const sections = JSON.stringify([
    {
      id: sectionId,
      title: 'Section 1',
      items: [
        { id: quizItemId, type: 'quiz', title: 'Quiz Item', quizId },
      ],
    },
  ]);

  const questions = JSON.stringify([
    {
      id: mcId,
      type: 'multiple_choice',
      question: 'What is 2+2?',
      options: ['3', '4', '5'],
      correctIndex: 1,
      order: 0,
    },
  ]);

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}', 'Admin', 'qac-admin-${adminId}@test.com', '${HASH}', 'admin'),
      ('${studentUserId}', 'Student', 'qac-student-${studentUserId}@test.com', '${HASH}', 'student');

    INSERT INTO students (id, user_id, name, email, enrollment_number, department, semester)
    VALUES ('${studentId}', '${studentUserId}', 'Student', 'qac-student-${studentUserId}@test.com', 'QAC-001', 'CS', 1);

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'Quiz AC Course', 'Test', '${code}', '${sections.replace(/'/g, "''")}');

    INSERT INTO user_course_codes (user_id, course_code)
    VALUES ('${studentUserId}', '${code}');

    INSERT INTO quizzes (id, title, course_id, passing_score, questions)
    VALUES ('${quizId}', 'AC Quiz', '${courseId}', 70, '${questions.replace(/'/g, "''")}');
  `);

  return { adminId, studentUserId, studentId, courseId, code, quizId, quizItemId, sectionId, mcId };
}

describe('Quiz auto-complete on pass', () => {
  beforeEach(() => {
    db.exec('DELETE FROM lesson_completions');
    db.exec('DELETE FROM quiz_completions');
  });

  it('creates lesson_completion when student passes linked quiz', async () => {
    const { studentUserId, quizId, quizItemId, courseId, mcId } = seedQuizAutoComplete();
    const token = makeToken({ userId: studentUserId, email: `qac-student-${studentUserId}@test.com`, role: 'student' });

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { [mcId]: '4' } }); // correct answer (option text at correctIndex 1)

    expect(res.status).toBe(201);
    expect(res.body.data.passed).toBe(true);

    const row = db.prepare(
      'SELECT * FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(studentUserId, courseId, quizItemId) as { marked_by: string | null } | undefined;

    expect(row).toBeTruthy();
    expect(row!.marked_by).toBeNull();
  });

  it('does not create lesson_completion when student fails quiz', async () => {
    const { studentUserId, quizId, quizItemId, courseId, mcId } = seedQuizAutoComplete();
    const token = makeToken({ userId: studentUserId, email: `qac-student-${studentUserId}@test.com`, role: 'student' });

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { [mcId]: '0' } }); // wrong answer

    expect(res.status).toBe(201);
    expect(res.body.data.passed).toBe(false);

    const row = db.prepare(
      'SELECT * FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).get(studentUserId, courseId, quizItemId);

    expect(row).toBeUndefined();
  });

  it('does not error when quiz has no course_id', async () => {
    const studentUserId = uuidv4();
    const quizId = uuidv4();
    const mcId = uuidv4();

    const questions = JSON.stringify([
      { id: mcId, type: 'multiple_choice', question: 'Q?', options: ['A', 'B'], correctIndex: 1, order: 0 },
    ]);

    db.exec(`
      INSERT INTO users (id, name, email, password_hash, role)
      VALUES ('${studentUserId}', 'No-Course Student', 'nc-${studentUserId}@test.com', '${HASH}', 'student');

      INSERT INTO quizzes (id, title, course_id, passing_score, questions)
      VALUES ('${quizId}', 'Standalone Quiz', NULL, 70, '${questions.replace(/'/g, "''")}');
    `);

    const token = makeToken({ userId: studentUserId, email: `nc-${studentUserId}@test.com`, role: 'student' });

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { [mcId]: 'B' } }); // correct answer (option text at correctIndex 1)

    expect(res.status).toBe(201);
    expect(res.body.data.passed).toBe(true);

    const count = db.prepare('SELECT COUNT(*) as c FROM lesson_completions WHERE user_id = ?').get(studentUserId) as { c: number };
    expect(count.c).toBe(0);
  });

  it('is idempotent on re-submission', async () => {
    const { studentUserId, quizId, quizItemId, courseId, mcId } = seedQuizAutoComplete();
    const token = makeToken({ userId: studentUserId, email: `qac-student-${studentUserId}@test.com`, role: 'student' });

    // First passing submission
    await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { [mcId]: '4' } });

    // Second passing submission
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { [mcId]: '4' } });

    expect(res.status).toBe(201);

    const rows = db.prepare(
      'SELECT * FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?'
    ).all(studentUserId, courseId, quizItemId);

    expect(rows).toHaveLength(1);
  });
});
