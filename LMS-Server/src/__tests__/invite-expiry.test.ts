/**
 * LMS-INVITE-001 — Expired invites must be rejected on acceptance.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function ensureInvitesTable() {
  const has = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='course_invites'")
    .get();
  if (!has) {
    db.exec(`
      CREATE TABLE course_invites (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT
      );
    `);
  }
}

function seedInviteData() {
  ensureInvitesTable();

  const adminId = uuidv4();
  const studentId = uuidv4();
  const courseId = uuidv4();
  const code = `INV-${uuidv4().slice(0, 6)}`;
  const expiredToken = uuidv4();
  const validToken = uuidv4();
  const noExpiryToken = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${adminId}', 'Inv Admin', 'inv-admin-${adminId}@test.com', '${HASH}', 'admin'),
      ('${studentId}', 'Inv Student', 'inv-student-${studentId}@test.com', '${HASH}', 'student');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'Invite Course', 'Test', '${code}', '[]');

    INSERT INTO course_invites (id, course_id, email, token, status, expires_at)
    VALUES
      ('${uuidv4()}', '${courseId}', 'inv-student-${studentId}@test.com', '${expiredToken}', 'pending', datetime('now', '-1 day')),
      ('${uuidv4()}', '${courseId}', 'inv-student-${studentId}@test.com', '${validToken}', 'pending', datetime('now', '+1 day')),
      ('${uuidv4()}', '${courseId}', 'inv-student-${studentId}@test.com', '${noExpiryToken}', 'pending', NULL);
  `);

  return { adminId, studentId, courseId, code, expiredToken, validToken, noExpiryToken };
}

describe('LMS-INVITE-001 — expired invite rejection', () => {
  it('expired invite returns 404 on accept', async () => {
    const { studentId, expiredToken } = seedInviteData();
    const token = makeToken({ userId: studentId, email: `inv-student-${studentId}@test.com`, role: 'student' });

    const res = await request(app)
      .post('/api/v1/accept')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: expiredToken });

    expect(res.status).toBe(404);
  });

  it('valid (future) invite is accepted', async () => {
    const { studentId, validToken } = seedInviteData();
    const token = makeToken({ userId: studentId, email: `inv-student-${studentId}@test.com`, role: 'student' });

    const res = await request(app)
      .post('/api/v1/accept')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: validToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('invite with no expiry (NULL) is accepted', async () => {
    const { studentId, noExpiryToken } = seedInviteData();
    const token = makeToken({ userId: studentId, email: `inv-student-${studentId}@test.com`, role: 'student' });

    const res = await request(app)
      .post('/api/v1/accept')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: noExpiryToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('expired invite returns 404 on getInviteByToken', async () => {
    const { studentId, expiredToken } = seedInviteData();
    const token = makeToken({ userId: studentId, email: `inv-student-${studentId}@test.com`, role: 'student' });

    const res = await request(app)
      .get(`/api/v1/accept?token=${expiredToken}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
