/**
 * AUDIT-2026-11 S1 — the session check fails closed.
 *
 * authenticate() accepts a JWT only while its active_sessions row exists, is not revoked
 * and has not expired. A validly signed token whose row is missing (pruned, deleted, or
 * restored from an older backup) is refused, so revocation cannot be undone by losing rows.
 */

import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { execute, queryOne, hashToken } from '../config/database.js';
import { generateToken } from '../config/jwt.js';

function createStudent(): string {
  const id = uuidv4();
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test student', ?, '$2a$10$test', 'student')",
    [id, `${id}@test.com`],
  );
  execute("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 'role_student')", [id]);
  return id;
}

const me = (token: string) => request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

describe('AUDIT-2026-11 S1: fail-closed session check', () => {
  it('S1-1: generateToken records a session row that expires with the JWT', () => {
    const userId = createStudent();
    const token = generateToken({ userId, email: `${userId}@test.com`, role: 'student' });
    const row = queryOne<{ user_id: string; expires_at: string }>(
      'SELECT user_id, expires_at FROM active_sessions WHERE token_hash = ?', [hashToken(token)]);
    expect(row?.user_id).toBe(userId);
    const exp = (jwt.decode(token) as { exp: number }).exp;
    expect(new Date(row!.expires_at).getTime()).toBe(exp * 1000);
  });

  it('S1-2: a token with a live session row is accepted', async () => {
    const userId = createStudent();
    const token = generateToken({ userId, email: `${userId}@test.com`, role: 'student' });
    expect((await me(token)).status).toBe(200);
  });

  it('S1-3: a validly signed token whose session row was deleted is refused', async () => {
    const userId = createStudent();
    const token = generateToken({ userId, email: `${userId}@test.com`, role: 'student' });
    execute('DELETE FROM active_sessions WHERE token_hash = ?', [hashToken(token)]);
    const res = await me(token);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Session revoked or expired');
  });

  it('S1-4: a token signed outside generateToken (no session row) is refused', async () => {
    const userId = createStudent();
    const token = jwt.sign({ userId, email: `${userId}@test.com`, role: 'student', authorizationVersion: 0 },
      process.env.JWT_SECRET!, { expiresIn: '1h' });
    expect((await me(token)).status).toBe(401);
  });

  it('S1-5: a revoked session stays refused after logout', async () => {
    const userId = createStudent();
    const token = generateToken({ userId, email: `${userId}@test.com`, role: 'student' });
    expect((await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    expect((await me(token)).status).toBe(401);
  });
});
