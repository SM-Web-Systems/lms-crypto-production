/**
 * LMS-INVITE-002/J1-003 — Email binding on invite acceptance.
 * The accepting user's email must match the invite email.
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

function seedData() {
  ensureInvitesTable();

  const wrongUserId = uuidv4();
  const correctUserId = uuidv4();
  const courseId = uuidv4();
  const code = `EBT-${uuidv4().slice(0, 6)}`;
  const inviteToken = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      ('${wrongUserId}', 'Wrong User', 'wrong@test.com', '${HASH}', 'student'),
      ('${correctUserId}', 'Correct User', 'invited@test.com', '${HASH}', 'student');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'Email Bind Course', 'Test', '${code}', '[]');

    INSERT INTO course_invites (id, course_id, email, token, status, expires_at)
    VALUES ('${uuidv4()}', '${courseId}', 'invited@test.com', '${inviteToken}', 'pending', datetime('now', '+1 day'));
  `);

  return { wrongUserId, correctUserId, courseId, code, inviteToken };
}

describe('LMS-INVITE-002/J1-003 — email binding on invite acceptance', () => {
  it('rejects acceptance when user email does not match invite email', async () => {
    const { wrongUserId, inviteToken } = seedData();
    const jwt = makeToken({ userId: wrongUserId, email: 'wrong@test.com', role: 'student' });

    const res = await request(app)
      .post('/api/v1/accept')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ token: inviteToken });

    expect(res.status).toBe(403);
  });

  it('allows acceptance when user email matches invite email', async () => {
    const { correctUserId, inviteToken } = seedData();
    const jwt = makeToken({ userId: correctUserId, email: 'invited@test.com', role: 'student' });

    const res = await request(app)
      .post('/api/v1/accept')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ token: inviteToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
