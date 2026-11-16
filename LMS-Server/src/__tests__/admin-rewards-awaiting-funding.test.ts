import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

function user(roleId: string, legacy: 'student' | 'lecturer' | 'admin') {
  const id = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'hash', ?)").run(id, `U ${roleId} ${id.slice(0, 6)}`, `${id}@test.invalid`, legacy);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, roleId);
  return { id, token: makeToken({ userId: id, email: `${id}@test.invalid`, role: legacy }) };
}

function draftReward(creatorId: string, groupId: string, status = 'draft') {
  const id = uuidv4();
  db.prepare(`INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, description, status, idempotency_key)
    VALUES (?, ?, 'teacher_class', ?, 'custom', 1000000, 'Well Done', ?, ?)`).run(id, creatorId, groupId, status, uuidv4());
  return id;
}

describe('GET /admin/rewards/awaiting-funding', () => {
  it('lists draft rewards made by someone else, with the class name and creator, and nothing the caller created', async () => {
    const teacher = user('role_teacher', 'lecturer');
    const admin = user('role_admin', 'admin');
    const groupId = uuidv4();
    db.prepare("INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Class A', 'class', ?)").run(groupId, teacher.id);
    const theirs = draftReward(teacher.id, groupId);
    draftReward(teacher.id, groupId, 'active');
    const mine = draftReward(admin.id, groupId);

    const res = await request(app).get('/api/v1/admin/rewards/awaiting-funding').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: { id: string }) => r.id);
    expect(ids).toContain(theirs);
    expect(ids).not.toContain(mine);
    const row = res.body.data.find((r: { id: string }) => r.id === theirs);
    expect(row).toMatchObject({ description: 'Well Done', amountStroops: 1000000, scopeName: 'Class A', creatorName: expect.stringContaining('U role_teacher') });
    expect(res.body.data.every((r: { status?: string }) => r.status === undefined)).toBe(true);
  });

  it('is closed to a teacher without the reward-manage permission', async () => {
    const teacher = user('role_teacher', 'lecturer');
    const res = await request(app).get('/api/v1/admin/rewards/awaiting-funding').set('Authorization', `Bearer ${teacher.token}`);
    expect(res.status).toBe(403);
  });
});
