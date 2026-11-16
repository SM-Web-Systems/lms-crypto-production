import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);
function user(roleId: string, legacy = 'student') {
  const id = uuidv4(), email = `cn-${id}@test.invalid`;
  db.prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(id, `User ${id.slice(0, 4)}`, email, HASH, legacy);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, roleId);
  return { id, email, token: makeToken({ userId: id, email, role: legacy }) };
}
const auth = (u: { token: string }) => ({ Authorization: `Bearer ${u.token}` });
function link(parentId: string, childId: string) {
  db.prepare("INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')").run(uuidv4(), parentId, childId);
}
function group(ownerId: string, type: 'class' | 'team' | 'family', memberIds: string[]) {
  const id = uuidv4();
  db.prepare('INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, ?, ?, ?)').run(id, `G ${type}`, type, ownerId);
  for (const m of memberIds) db.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(id, m);
  return id;
}
const isMember = (g: string, u: string) => !!db.prepare('SELECT 1 FROM user_group_members WHERE group_id = ? AND user_id = ?').get(g, u);
const isLinked = (p: string, c: string) => !!db.prepare("SELECT 1 FROM user_links WHERE parent_user_id = ? AND child_user_id = ? AND link_type = 'parent'").get(p, c);

describe('a learner can end any link', () => {
  it('lists parents, classes and teams', async () => {
    const l = user('role_student'), p = user('role_parent'), t = user('role_teacher', 'lecturer'), e = user('role_employer');
    link(p.id, l.id); const c = group(t.id, 'class', [l.id]); const tm = group(e.id, 'team', [l.id]); group(p.id, 'family', [l.id]);
    const res = await request(app).get('/api/v1/students/me/connections').set(auth(l));
    expect(res.body.data.parents.map((x: { id: string }) => x.id)).toEqual([p.id]);
    expect(res.body.data.groups.map((x: { id: string }) => x.id).sort()).toEqual([c, tm].sort());
  });

  it('leaves a parent, which also takes them out of that parent\'s family groups', async () => {
    const l = user('role_student'), p = user('role_parent');
    link(p.id, l.id); const fam = group(p.id, 'family', [l.id]);
    expect((await request(app).delete(`/api/v1/students/me/parents/${p.id}`).set(auth(l))).status).toBe(200);
    expect(isLinked(p.id, l.id)).toBe(false);
    expect(isMember(fam, l.id)).toBe(false);
    const children = await request(app).get('/api/v1/parent/children').set(auth(p));
    expect(children.body.data.children).toEqual([]);
    expect((await request(app).delete(`/api/v1/students/me/parents/${p.id}`).set(auth(l))).status).toBe(404);
  });

  it('leaves a class and a team, but not a group they are not in', async () => {
    const l = user('role_student'), other = user('role_student'), t = user('role_teacher', 'lecturer'), e = user('role_employer');
    const c = group(t.id, 'class', [l.id, other.id]), tm = group(e.id, 'team', [l.id]);
    expect((await request(app).delete(`/api/v1/students/me/groups/${c}`).set(auth(l))).status).toBe(200);
    expect((await request(app).delete(`/api/v1/students/me/groups/${tm}`).set(auth(l))).status).toBe(200);
    expect(isMember(c, l.id)).toBe(false);
    expect(isMember(c, other.id)).toBe(true);
    expect((await request(app).delete(`/api/v1/students/me/groups/${c}`).set(auth(l))).status).toBe(404);
  });
});

describe('parents and teachers can remove one learner', () => {
  it('a parent unlinks a child, and cannot unlink someone else\'s', async () => {
    const l = user('role_student'), p = user('role_parent'), stranger = user('role_parent');
    link(p.id, l.id);
    expect((await request(app).delete(`/api/v1/parent/children/${l.id}`).set(auth(stranger))).status).toBe(404);
    expect(isLinked(p.id, l.id)).toBe(true);
    expect((await request(app).delete(`/api/v1/parent/children/${l.id}`).set(auth(p))).status).toBe(200);
    expect(isLinked(p.id, l.id)).toBe(false);
    expect(db.prepare('SELECT 1 FROM users WHERE id = ?').get(l.id)).toBeTruthy();
  });

  it('a teacher removes one learner from their own class only', async () => {
    const a = user('role_student'), b = user('role_student'), t = user('role_teacher', 'lecturer'), other = user('role_teacher', 'lecturer');
    const c = group(t.id, 'class', [a.id, b.id]);
    expect((await request(app).delete(`/api/v1/teacher/classes/${c}/students/${a.id}`).set(auth(other))).status).toBe(404);
    expect((await request(app).delete(`/api/v1/teacher/classes/${c}/students/${a.id}`).set(auth(t))).status).toBe(200);
    expect(isMember(c, a.id)).toBe(false);
    expect(isMember(c, b.id)).toBe(true);
  });
});
