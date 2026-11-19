/**
 * AUDIT-2026-11 S2 — web sessions use an HttpOnly cookie instead of a token in localStorage.
 */
import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { execute, queryOne, hashToken } from '../config/database.js';
import { generateToken } from '../config/jwt.js';

const password = 'cookie-test-password';
function createStudent(): { id: string; email: string } {
  const id = uuidv4();
  const email = `${id}@cookie.invalid`;
  execute("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Cookie learner', ?, ?, 'student')",
    [id, email, bcrypt.hashSync(password, 4)]);
  execute("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 'role_student')", [id]);
  return { id, email };
}
function sessionCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find(c => c.startsWith('lms_session='));
  expect(cookie).toBeDefined();
  return cookie!;
}

describe('AUDIT-2026-11 S2: HttpOnly session cookie', () => {
  it('S2-1: login sets an HttpOnly, SameSite=Lax cookie scoped to /api that authenticates /auth/me', async () => {
    const u = createStudent();
    const login = await request(app).post('/api/v1/auth/login').send({ email: u.email, password });
    expect(login.status).toBe(200);
    const cookie = sessionCookie(login);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api/);
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie.split(';')[0]);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(u.email);
  });

  it('S2-2: a cookie-authenticated write without the CSRF header is refused; with it, it works', async () => {
    const u = createStudent();
    const cookie = sessionCookie(await request(app).post('/api/v1/auth/login').send({ email: u.email, password })).split(';')[0];
    const blocked = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(blocked.status).toBe(403);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(200);
    const ok = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).set('X-LMS-CSRF', '1');
    expect(ok.status).toBe(200);
    expect(([] as string[]).concat(ok.headers['set-cookie'] ?? []).some(c => c.startsWith('lms_session=;'))).toBe(true);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('S2-3: bearer clients need no CSRF header (native apps and API clients are unchanged)', async () => {
    const u = createStudent();
    const token = generateToken({ userId: u.id, email: u.email, role: 'student' });
    expect((await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`)).status).toBe(200);
  });

  it('S2-4: POST /auth/session moves a valid bearer token (SSO or a legacy localStorage token) into the cookie', async () => {
    const u = createStudent();
    const token = generateToken({ userId: u.id, email: u.email, role: 'student' });
    const res = await request(app).post('/api/v1/auth/session').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.established).toBe(true);
    const cookie = sessionCookie(res).split(';')[0];
    expect(decodeURIComponent(cookie.slice('lms_session='.length))).toBe(token);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(200);
  });

  it('S2-5: POST /auth/session refuses an invalid token and sets no cookie', async () => {
    const res = await request(app).post('/api/v1/auth/session').set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('S2-6: the sessions list marks the cookie session as current', async () => {
    const u = createStudent();
    const login = await request(app).post('/api/v1/auth/login').send({ email: u.email, password });
    const cookie = sessionCookie(login).split(';')[0];
    const res = await request(app).get('/api/v1/sessions').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const current = queryOne<{ id: string }>('SELECT id FROM active_sessions WHERE token_hash = ?', [hashToken(login.body.data.token)]);
    expect(res.body.data.sessions.find((s: { current: boolean }) => s.current)?.id).toBe(current?.id);
  });

  it('S2-7: the Secure flag follows SESSION_COOKIE_SECURE', async () => {
    process.env.SESSION_COOKIE_SECURE = 'true';
    try {
      const u = createStudent();
      const login = await request(app).post('/api/v1/auth/login').send({ email: u.email, password });
      expect(sessionCookie(login)).toMatch(/Secure/i);
    } finally { delete process.env.SESSION_COOKIE_SECURE; }
  });
});
