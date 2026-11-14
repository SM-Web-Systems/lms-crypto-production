import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function user(roleId: 'role_teacher' | 'role_student', legacy: 'lecturer' | 'student') {
  const id = uuidv4();
  const email = `ci-${id}@test.invalid`;
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)").run(id, `User ${id.slice(0, 4)}`, email, HASH, legacy);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, roleId);
  return { id, email, token: makeToken({ userId: id, email, role: legacy }) };
}
const teacher = () => user('role_teacher', 'lecturer');
const learner = () => user('role_student', 'student');
function classOf(owner: { id: string }) {
  const id = uuidv4();
  db.prepare("INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Class', 'class', ?)").run(id, owner.id);
  return id;
}
const members = (groupId: string) => (db.prepare('SELECT user_id FROM user_group_members WHERE group_id = ?').all(groupId) as { user_id: string }[]).map(m => m.user_id);
const invite = (t: { token: string }, classId: string, email: string) =>
  request(app).post(`/api/v1/teacher/classes/${classId}/invite`).set('Authorization', `Bearer ${t.token}`).send({ email });

describe('class invitations: a learner joins only by accepting', () => {
  it('does not add the learner to the class when invited', async () => {
    const t = teacher(), l = learner(), c = classOf(t);
    const res = await invite(t, c, l.email);
    expect(res.status).toBe(202);
    expect(members(c)).toEqual([]);
    const mine = await request(app).get('/api/v1/students/me/class-invitations').set('Authorization', `Bearer ${l.token}`);
    expect(mine.body.data.invitations).toHaveLength(1);
    expect(mine.body.data.invitations[0]).toMatchObject({ className: 'Class' });
  });

  it('adds the learner when they accept, and only then', async () => {
    const t = teacher(), l = learner(), c = classOf(t);
    await invite(t, c, l.email);
    const id = (db.prepare("SELECT id FROM class_invitations WHERE group_id = ?").get(c) as { id: string }).id;
    const ok = await request(app).post(`/api/v1/students/me/class-invitations/${id}/accept`).set('Authorization', `Bearer ${l.token}`);
    expect(ok.status).toBe(200);
    expect(members(c)).toEqual([l.id]);
    const again = await request(app).post(`/api/v1/students/me/class-invitations/${id}/accept`).set('Authorization', `Bearer ${l.token}`);
    expect(again.status).toBe(404);
  });

  it('keeps the learner out when they decline', async () => {
    const t = teacher(), l = learner(), c = classOf(t);
    await invite(t, c, l.email);
    const id = (db.prepare("SELECT id FROM class_invitations WHERE group_id = ?").get(c) as { id: string }).id;
    expect((await request(app).post(`/api/v1/students/me/class-invitations/${id}/decline`).set('Authorization', `Bearer ${l.token}`)).status).toBe(200);
    expect(members(c)).toEqual([]);
    expect((await request(app).get('/api/v1/students/me/class-invitations').set('Authorization', `Bearer ${l.token}`)).body.data.invitations).toEqual([]);
  });

  it('does not let someone else answer an invitation', async () => {
    const t = teacher(), l = learner(), other = learner(), c = classOf(t);
    await invite(t, c, l.email);
    const id = (db.prepare("SELECT id FROM class_invitations WHERE group_id = ?").get(c) as { id: string }).id;
    expect((await request(app).post(`/api/v1/students/me/class-invitations/${id}/accept`).set('Authorization', `Bearer ${other.token}`)).status).toBe(404);
    expect(members(c)).toEqual([]);
  });

  it('answers the same whether or not the email has an account, and sends nothing for non-learners', async () => {
    const t = teacher(), c = classOf(t), staff = teacher();
    const unknown = await invite(t, c, 'nobody@test.invalid');
    const colleague = await invite(t, c, staff.email);
    expect(unknown.status).toBe(202);
    expect(colleague.status).toBe(202);
    expect(unknown.body).toEqual(colleague.body);
    expect(db.prepare('SELECT COUNT(*) n FROM class_invitations WHERE group_id = ?').get(c)).toEqual({ n: 0 });
  });

  it('only the class owner can invite, list or withdraw', async () => {
    const t = teacher(), stranger = teacher(), l = learner(), c = classOf(t);
    expect((await invite(stranger, c, l.email)).status).toBe(404);
    await invite(t, c, l.email);
    expect((await request(app).get(`/api/v1/teacher/classes/${c}/invitations`).set('Authorization', `Bearer ${stranger.token}`)).status).toBe(404);
    const id = (db.prepare("SELECT id FROM class_invitations WHERE group_id = ?").get(c) as { id: string }).id;
    expect((await request(app).delete(`/api/v1/teacher/classes/${c}/invitations/${id}`).set('Authorization', `Bearer ${stranger.token}`)).status).toBe(404);
    const list = await request(app).get(`/api/v1/teacher/classes/${c}/invitations`).set('Authorization', `Bearer ${t.token}`);
    expect(list.body.data.invitations).toHaveLength(1);
    expect((await request(app).delete(`/api/v1/teacher/classes/${c}/invitations/${id}`).set('Authorization', `Bearer ${t.token}`)).status).toBe(200);
  });

  it('does not duplicate a pending invitation or re-invite a member', async () => {
    const t = teacher(), l = learner(), c = classOf(t);
    await invite(t, c, l.email); await invite(t, c, l.email);
    expect(db.prepare('SELECT COUNT(*) n FROM class_invitations WHERE group_id = ?').get(c)).toEqual({ n: 1 });
    const id = (db.prepare("SELECT id FROM class_invitations WHERE group_id = ?").get(c) as { id: string }).id;
    await request(app).post(`/api/v1/students/me/class-invitations/${id}/accept`).set('Authorization', `Bearer ${l.token}`);
    await invite(t, c, l.email);
    expect(db.prepare('SELECT COUNT(*) n FROM class_invitations WHERE group_id = ?').get(c)).toEqual({ n: 1 });
  });
});
