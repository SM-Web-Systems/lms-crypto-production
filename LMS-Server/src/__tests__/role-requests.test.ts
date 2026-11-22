import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);
function user(roles: string[]) {
  const id = uuidv4(), email = `rr-${id}@test.invalid`;
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'student')").run(id, `User ${id.slice(0, 4)}`, email, HASH);
  for (const r of roles) db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, r);
  return { id, email, token: () => makeToken({ userId: id, email, role: 'student' }) };
}
const auth = (u: { token: () => string }) => ({ Authorization: `Bearer ${u.token()}` });
const hasRole = (u: { id: string }, r: string) => !!db.prepare('SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ?').get(u.id, r);
const ask = (u: { token: () => string }, roleId: string, reason = 'I run a maths class at Hillside School') =>
  request(app).post('/api/v1/role-requests').set(auth(u)).send({ roleId, reason });

describe('requesting a role', () => {
  it('a learner asks to be a parent, an extended admin approves, and the role is added', async () => {
    const l = user(['role_student']), ea = user(['role_admin2']);
    const created = await ask(l, 'role_parent');
    expect(created.status).toBe(201);
    expect(hasRole(l, 'role_parent')).toBe(false);
    const queue = await request(app).get('/api/v1/admin/role-requests').set(auth(ea));
    const mine = queue.body.data.requests.find((r: { userId: string }) => r.userId === l.id);
    expect(mine).toMatchObject({ roleId: 'role_parent', status: 'pending' });
    const ok = await request(app).post(`/api/v1/admin/role-requests/${mine.id}/approve`).set(auth(ea)).send({ note: 'Welcome' });
    expect(ok.status).toBe(200);
    expect(hasRole(l, 'role_parent')).toBe(true);
    expect(db.prepare("SELECT COUNT(*) n FROM email_outbox WHERE recipient = ? AND email_type = 'role-request-decision'").get(l.email)).toEqual({ n: 1 });
    expect((await request(app).post(`/api/v1/admin/role-requests/${mine.id}/approve`).set(auth(ea))).status).toBe(409);
  });

  it('a declined request adds nothing', async () => {
    const l = user(['role_student']), ea = user(['role_admin2']);
    const id = (await ask(l, 'role_employer')).body.data.id;
    expect((await request(app).post(`/api/v1/admin/role-requests/${id}/decline`).set(auth(ea)).send({ note: 'Need a company email' })).status).toBe(200);
    expect(hasRole(l, 'role_employer')).toBe(false);
    const mine = await request(app).get('/api/v1/role-requests/mine').set(auth(l));
    expect(mine.body.data.requests[0]).toMatchObject({ status: 'declined', reviewNote: 'Need a company email' });
  });

  it('only parent, teacher, employer, sponsor and (for super students) teaching assistant can be requested', async () => {
    const l = user(['role_student']);
    expect((await ask(l, 'role_admin')).status).toBe(400);
    expect((await ask(l, 'role_supporter_student')).status).toBe(400);
    expect((await ask(l, 'role_ta')).status).toBe(403);
    const roles = (await request(app).get('/api/v1/role-requests/mine').set(auth(l))).body.data.roles.map((r: { id: string }) => r.id);
    expect(roles).toEqual(['role_parent', 'role_teacher', 'role_employer', 'role_sponsor']);
  });

  it('a super student can ask to be a teaching assistant', async () => {
    const s = user(['role_student', 'role_supporter_student']), ea = user(['role_admin2']);
    const roles = (await request(app).get('/api/v1/role-requests/mine').set(auth(s))).body.data.roles.map((r: { id: string }) => r.id);
    expect(roles).toContain('role_ta');
    const id = (await ask(s, 'role_ta', 'I finished three courses and want to help')).body.data.id;
    expect((await request(app).post(`/api/v1/admin/role-requests/${id}/approve`).set(auth(ea))).status).toBe(200);
    expect(hasRole(s, 'role_ta')).toBe(true);
  });

  it('does not offer roles the user already has or is already waiting on', async () => {
    const l = user(['role_student', 'role_parent']);
    await ask(l, 'role_employer');
    const roles = (await request(app).get('/api/v1/role-requests/mine').set(auth(l))).body.data.roles.map((r: { id: string }) => r.id);
    expect(roles).not.toContain('role_parent');
    expect(roles).not.toContain('role_employer');
    expect(roles).toContain('role_sponsor');
  });

  it('no duplicates, a reason is required, and the user can withdraw', async () => {
    const l = user(['role_student']);
    expect((await ask(l, 'role_teacher', '')).status).toBe(400);
    const id = (await ask(l, 'role_teacher')).body.data.id;
    expect((await ask(l, 'role_teacher')).status).toBe(409);
    expect((await request(app).delete(`/api/v1/role-requests/${id}`).set(auth(l))).status).toBe(200);
    expect((await ask(l, 'role_teacher')).status).toBe(201);
  });

  it('learners and plain admins cannot see or decide the queue', async () => {
    const l = user(['role_student']), admin = user(['role_admin']);
    const id = (await ask(l, 'role_sponsor')).body.data.id;
    expect((await request(app).get('/api/v1/admin/role-requests').set(auth(l))).status).toBe(403);
    expect((await request(app).post(`/api/v1/admin/role-requests/${id}/approve`).set(auth(l))).status).toBe(403);
    expect((await request(app).post(`/api/v1/admin/role-requests/${id}/approve`).set(auth(admin))).status).toBe(403);
    expect(hasRole(l, 'role_sponsor')).toBe(false);
  });
});
