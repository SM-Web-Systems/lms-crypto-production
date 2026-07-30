/**
 * LMS-J1-001 — Unenrolled student cannot view own course progress.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedData() {
  const studentId = uuidv4();
  const courseId = uuidv4();
  const code = `PROG-${uuidv4().slice(0, 6)}`;

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${studentId}', 'Unenrolled Student', 'unenrolled-${studentId}@test.com', '${HASH}', 'student');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'Enrollment Check Course', 'Test', '${code}', '[]');
  `);

  return { studentId, courseId, code };
}

describe('LMS-J1-001 — enrollment check on own progress', () => {
  it('unenrolled student gets 403 on own progress', async () => {
    const { studentId, courseId } = seedData();
    const jwt = makeToken({ userId: studentId, email: `unenrolled-${studentId}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/progress`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('enrolled student gets 200 on own progress', async () => {
    const { studentId, courseId, code } = seedData();

    // Enroll the student
    db.exec(`INSERT INTO user_course_codes (user_id, course_code) VALUES ('${studentId}', '${code}');`);

    const jwt = makeToken({ userId: studentId, email: `unenrolled-${studentId}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/progress`)
      .set('Authorization', `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
