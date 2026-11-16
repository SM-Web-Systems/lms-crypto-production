import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function user(roleId: 'role_parent' | 'role_student' | 'role_teacher', legacy: string) {
  const id = uuidv4();
  const email = `pi-${id}@test.invalid`;
  db.prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(id, `User ${id.slice(0, 4)}`, email, HASH, legacy);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, roleId);
  return { id, email, token: makeToken({ userId: id, email, role: legacy }) };
}
const parent = () => user('role_parent', 'student');
const learner = () => user('role_student', 'student');
const linked = (p: { id: string }) => (db.prepare("SELECT child_user_id FROM user_links WHERE parent_user_id = ? AND link_type = 'parent'").all(p.id) as { child_user_id: string }[]).map(r => r.child_user_id);
const invite = (p: { token: string }, email: string) =>
  request(app).post('/api/v1/parent/children/invite').set('Authorization', `Bearer ${p.token}`).send({ email });
const invitationId = (p: { id: string }) => (db.prepare('SELECT id FROM parent_invitations WHERE parent_user_id = ?').get(p.id) as { id: string }).id;

describe('parent invitations: an existing learner is linked only by accepting', () => {
  it('does not link the learner when invited, and shows them the invitation', async () => {
    const p = parent(), l = learner();
    expect((await invite(p, l.email)).status).toBe(202);
    expect(linked(p)).toEqual([]);
    const mine = await request(app).get('/api/v1/students/me/parent-invitations').set('Authorization', `Bearer ${l.token}`);
    expect(mine.body.data.invitations).toHaveLength(1);
    const children = await request(app).get('/api/v1/parent/children').set('Authorization', `Bearer ${p.token}`);
    expect(children.body.data.children).toEqual([]);
  });

  it('links the learner when they accept, and the parent then sees them', async () => {
    const p = parent(), l = learner();
    await invite(p, l.email);
    const id = invitationId(p);
    expect((await request(app).post(`/api/v1/students/me/parent-invitations/${id}/accept`).set('Authorization', `Bearer ${l.token}`)).status).toBe(200);
    expect(linked(p)).toEqual([l.id]);
    const children = await request(app).get('/api/v1/parent/children').set('Authorization', `Bearer ${p.token}`);
    expect(children.body.data.children.map((c: { id: string }) => c.id)).toEqual([l.id]);
    expect((await request(app).post(`/api/v1/students/me/parent-invitations/${id}/accept`).set('Authorization', `Bearer ${l.token}`)).status).toBe(404);
  });

  it('keeps the learner unlinked when they decline', async () => {
    const p = parent(), l = learner();
    await invite(p, l.email);
    expect((await request(app).post(`/api/v1/students/me/parent-invitations/${invitationId(p)}/decline`).set('Authorization', `Bearer ${l.token}`)).status).toBe(200);
    expect(linked(p)).toEqual([]);
  });

  it('does not let someone else answer an invitation', async () => {
    const p = parent(), l = learner(), other = learner();
    await invite(p, l.email);
    expect((await request(app).post(`/api/v1/students/me/parent-invitations/${invitationId(p)}/accept`).set('Authorization', `Bearer ${other.token}`)).status).toBe(404);
    expect(linked(p)).toEqual([]);
  });

  it('answers the same whether or not the email has an account, and never invites staff', async () => {
    const p = parent(), staff = user('role_teacher', 'lecturer');
    const unknown = await invite(p, 'nobody@test.invalid');
    const colleague = await invite(p, staff.email);
    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual(colleague.body);
    expect(db.prepare('SELECT COUNT(*) n FROM parent_invitations WHERE parent_user_id = ?').get(p.id)).toEqual({ n: 0 });
  });

  it('only the inviting parent can list or withdraw, and a learner cannot invite', async () => {
    const p = parent(), stranger = parent(), l = learner();
    await invite(p, l.email);
    const id = invitationId(p);
    expect((await request(app).get('/api/v1/parent/children/invitations').set('Authorization', `Bearer ${stranger.token}`)).body.data.invitations).toEqual([]);
    expect((await request(app).delete(`/api/v1/parent/children/invitations/${id}`).set('Authorization', `Bearer ${stranger.token}`)).status).toBe(404);
    expect((await invite(learner(), l.email)).status).toBe(403);
    expect((await request(app).get('/api/v1/parent/children/invitations').set('Authorization', `Bearer ${p.token}`)).body.data.invitations).toHaveLength(1);
    expect((await request(app).delete(`/api/v1/parent/children/invitations/${id}`).set('Authorization', `Bearer ${p.token}`)).status).toBe(200);
    expect((await request(app).get('/api/v1/students/me/parent-invitations').set('Authorization', `Bearer ${l.token}`)).body.data.invitations).toEqual([]);
  });

  it('does not duplicate a pending invitation or re-invite a linked child', async () => {
    const p = parent(), l = learner();
    await invite(p, l.email); await invite(p, l.email);
    expect(db.prepare('SELECT COUNT(*) n FROM parent_invitations WHERE parent_user_id = ?').get(p.id)).toEqual({ n: 1 });
    await request(app).post(`/api/v1/students/me/parent-invitations/${invitationId(p)}/accept`).set('Authorization', `Bearer ${l.token}`);
    await invite(p, l.email);
    expect(db.prepare('SELECT COUNT(*) n FROM parent_invitations WHERE parent_user_id = ?').get(p.id)).toEqual({ n: 1 });
  });

  it('lets a learner be linked to more than one parent', async () => {
    const p1 = parent(), p2 = parent(), l = learner();
    for (const p of [p1, p2]) {
      await invite(p, l.email);
      await request(app).post(`/api/v1/students/me/parent-invitations/${invitationId(p)}/accept`).set('Authorization', `Bearer ${l.token}`);
    }
    expect(linked(p1)).toEqual([l.id]);
    expect(linked(p2)).toEqual([l.id]);
  });
});
