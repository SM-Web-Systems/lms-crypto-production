import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);
function user(roles: string[]) {
  const id = uuidv4(), email = `cs-${id}@test.invalid`;
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'student')").run(id, `User ${id.slice(0, 4)}`, email, HASH);
  for (const r of roles) db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, r);
  return { id, auth: { Authorization: `Bearer ${makeToken({ userId: id, email, role: 'student' })}` } };
}
function course() {
  const id = uuidv4();
  db.prepare('INSERT INTO courses (id, title, course_code, sections) VALUES (?, ?, ?, ?)').run(id, 'Cohort course', `CS-${id.slice(0, 8)}`, '[]');
  return id;
}
const sponsorOf = (cohortId: string) => (db.prepare('SELECT sponsor_user_id FROM sponsor_cohorts WHERE id = ?').get(cohortId) as { sponsor_user_id: string }).sponsor_user_id;
const idOf = (body: { data: { id?: string; cohortId?: string } }) => body.data.id ?? body.data.cohortId!;

describe('an administrator creates a cohort for a sponsor', () => {
  it('the cohort belongs to the named sponsor', async () => {
    const admin = user(['role_admin']), sponsor = user(['role_sponsor']), c = course();
    const r = await request(app).post('/api/v1/admin/cohorts').set(admin.auth).send({ name: 'For sponsor', courseId: c, sponsorUserId: sponsor.id });
    expect(r.status).toBe(201);
    expect(sponsorOf(idOf(r.body))).toBe(sponsor.id);
  });

  it('refuses a user without the sponsor role', async () => {
    const admin = user(['role_admin']), learner = user(['role_student']), c = course();
    expect((await request(app).post('/api/v1/admin/cohorts').set(admin.auth).send({ name: 'x', courseId: c, sponsorUserId: learner.id })).status).toBe(400);
  });

  it('a sponsor cannot create a cohort for another sponsor', async () => {
    const a = user(['role_sponsor']), b = user(['role_sponsor']), c = course();
    expect((await request(app).post('/api/v1/admin/cohorts').set(a.auth).send({ name: 'x', courseId: c, sponsorUserId: b.id })).status).toBe(403);
  });

  it('without sponsorUserId the caller is still the sponsor', async () => {
    const admin = user(['role_admin']), c = course();
    const r = await request(app).post('/api/v1/admin/cohorts').set(admin.auth).send({ name: 'Mine', courseId: c });
    expect(r.status).toBe(201);
    expect(sponsorOf(idOf(r.body))).toBe(admin.id);
  });
});
