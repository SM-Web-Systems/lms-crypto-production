import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function user(roleId: string, legacy: string, email = `ei-${uuidv4()}@test.invalid`) {
  const id = uuidv4();
  db.prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(id, `User ${id.slice(0, 4)}`, email, HASH, legacy);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, roleId);
  return { id, email, token: makeToken({ userId: id, email, role: legacy }) };
}
const learner = (email?: string) => user('role_student', 'student', email);
const employer = () => user('role_employer', 'student');
const parent = () => user('role_parent', 'student');
function teamOf(owner: { id: string }) {
  const id = uuidv4();
  db.prepare("INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Ops team', 'team', ?)").run(id, owner.id);
  return id;
}
const members = (g: string) => (db.prepare('SELECT user_id FROM user_group_members WHERE group_id = ?').all(g) as { user_id: string }[]).map(m => m.user_id);
const outbox = (to: string) => db.prepare('SELECT email_type, html_body FROM email_outbox WHERE recipient = ? ORDER BY id').all(to.toLowerCase()) as { email_type: string; html_body: string }[];
const tokenIn = (html: string) => /join=([A-Za-z0-9_-]+)/.exec(html)?.[1] ?? '';
const auth = (u: { token: string }) => ({ Authorization: `Bearer ${u.token}` });

describe('employer teams: a learner joins only by accepting', () => {
  it('invites by email, emails the learner, and adds them only on accept', async () => {
    const e = employer(), l = learner(), t = teamOf(e);
    const res = await request(app).post(`/api/v1/employer/teams/${t}/invite`).set(auth(e)).send({ email: l.email });
    expect(res.status).toBe(202);
    expect(members(t)).toEqual([]);
    expect(outbox(l.email).map(o => o.email_type)).toEqual(['team-invitation']);
    const mine = await request(app).get('/api/v1/students/me/class-invitations').set(auth(l));
    expect(mine.body.data.invitations[0]).toMatchObject({ className: 'Ops team', groupType: 'team' });
    await request(app).post(`/api/v1/students/me/class-invitations/${mine.body.data.invitations[0].id}/accept`).set(auth(l));
    expect(members(t)).toEqual([l.id]);
    const list = await request(app).get(`/api/v1/employer/teams/${t}/members`).set(auth(e));
    expect(list.body.data.members.map((m: { id: string }) => m.id)).toEqual([l.id]);
  });

  it('no longer adds a learner directly by id', async () => {
    const e = employer(), l = learner(), t = teamOf(e);
    const res = await request(app).post(`/api/v1/employer/teams/${t}/members`).set(auth(e)).send({ userId: l.id });
    expect(res.status).toBe(404);
    expect(members(t)).toEqual([]);
  });

  it('only the team owner can invite, list or withdraw', async () => {
    const e = employer(), other = employer(), l = learner(), t = teamOf(e);
    expect((await request(app).post(`/api/v1/employer/teams/${t}/invite`).set(auth(other)).send({ email: l.email })).status).toBe(404);
    expect((await request(app).get(`/api/v1/employer/teams/${t}/invitations`).set(auth(other))).status).toBe(404);
    await request(app).post(`/api/v1/employer/teams/${t}/invite`).set(auth(e)).send({ email: l.email });
    const list = await request(app).get(`/api/v1/employer/teams/${t}/invitations`).set(auth(e));
    const id = list.body.data.invitations[0].id;
    expect((await request(app).delete(`/api/v1/employer/teams/${t}/invitations/${id}`).set(auth(other))).status).toBe(404);
    expect((await request(app).delete(`/api/v1/employer/teams/${t}/invitations/${id}`).set(auth(e))).status).toBe(200);
  });
});

describe('invitations to an email with no account', () => {
  it('sends a sign-up link, and the new learner gets the request after claiming it', async () => {
    const p = parent(), email = `new-${uuidv4()}@test.invalid`;
    const res = await request(app).post('/api/v1/parent/children/invite').set(auth(p)).send({ email });
    expect(res.status).toBe(202);
    const mail = outbox(email);
    expect(mail.map(m => m.email_type)).toEqual(['parent-invitation']);
    const token = tokenIn(mail[0].html_body);
    expect(token.length).toBeGreaterThan(20);
    const sent = await request(app).get('/api/v1/parent/children/invitations').set(auth(p));
    expect(sent.body.data.emailed).toHaveLength(1);

    const l = learner(email);
    const claim = await request(app).post('/api/v1/invitations/claim').set(auth(l)).send({ token });
    expect(claim.status).toBe(200);
    const mine = await request(app).get('/api/v1/students/me/parent-invitations').set(auth(l));
    expect(mine.body.data.invitations).toHaveLength(1);
    // still not linked until they accept
    expect(db.prepare("SELECT COUNT(*) n FROM user_links WHERE parent_user_id = ? AND link_type = 'parent'").get(p.id)).toEqual({ n: 0 });
    expect((await request(app).post('/api/v1/invitations/claim').set(auth(l)).send({ token })).status).toBe(404);
  });

  it('only the account with the invited email can claim a link', async () => {
    const e = employer(), t = teamOf(e), email = `new-${uuidv4()}@test.invalid`;
    await request(app).post(`/api/v1/employer/teams/${t}/invite`).set(auth(e)).send({ email });
    const token = tokenIn(outbox(email)[0].html_body);
    const someoneElse = learner();
    const res = await request(app).post('/api/v1/invitations/claim').set(auth(someoneElse)).send({ token });
    expect(res.status).toBe(403);
    expect((await request(app).get('/api/v1/students/me/class-invitations').set(auth(someoneElse))).body.data.invitations).toEqual([]);
    const right = learner(email);
    expect((await request(app).post('/api/v1/invitations/claim').set(auth(right)).send({ token })).status).toBe(200);
    expect((await request(app).get('/api/v1/students/me/class-invitations').set(auth(right))).body.data.invitations).toHaveLength(1);
  });

  it('rejects unknown tokens and sends nothing to staff addresses', async () => {
    const p = parent(), staff = employer(), l = learner();
    db.prepare("DELETE FROM user_roles WHERE user_id = ? AND role_id = 'role_student'").run(staff.id);
    expect((await request(app).post('/api/v1/invitations/claim').set(auth(l)).send({ token: 'nope' })).status).toBe(404);
    const res = await request(app).post('/api/v1/parent/children/invite').set(auth(p)).send({ email: staff.email });
    expect(res.status).toBe(202);
    expect(outbox(staff.email)).toEqual([]);
  });

  it('does not send a second sign-up link for the same open invitation, and can be withdrawn', async () => {
    const p = parent(), email = `new-${uuidv4()}@test.invalid`;
    await request(app).post('/api/v1/parent/children/invite').set(auth(p)).send({ email });
    await request(app).post('/api/v1/parent/children/invite').set(auth(p)).send({ email });
    expect(outbox(email)).toHaveLength(1);
    const sent = await request(app).get('/api/v1/parent/children/invitations').set(auth(p));
    const id = sent.body.data.emailed[0].id;
    expect((await request(app).delete(`/api/v1/parent/children/invitations/${id}`).set(auth(p))).status).toBe(200);
    const token = tokenIn(outbox(email)[0].html_body);
    expect((await request(app).post('/api/v1/invitations/claim').set(auth(learner(email))).send({ token })).status).toBe(404);
  });

  it('a teacher class invite to a new address works the same way', async () => {
    const teacher = user('role_teacher', 'lecturer'), email = `new-${uuidv4()}@test.invalid`;
    const c = uuidv4();
    db.prepare("INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Maths', 'class', ?)").run(c, teacher.id);
    expect((await request(app).post(`/api/v1/teacher/classes/${c}/invite`).set(auth(teacher)).send({ email })).status).toBe(202);
    expect(outbox(email).map(m => m.email_type)).toEqual(['class-invitation']);
    const l = learner(email);
    await request(app).post('/api/v1/invitations/claim').set(auth(l)).send({ token: tokenIn(outbox(email)[0].html_body) });
    const mine = await request(app).get('/api/v1/students/me/class-invitations').set(auth(l));
    expect(mine.body.data.invitations[0]).toMatchObject({ className: 'Maths', groupType: 'class' });
  });
});
