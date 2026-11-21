/**
 * UX-007 — parent family groups: list with members, create with children, rename, change members, delete.
 * A parent may only put their own linked children in a group, and only touch their own groups.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';
import request from 'supertest';
import app from '../app.js';
import { execute, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import { v4 as uuidv4 } from 'uuid';

function createUser(roleId: string, label: string) {
  const userId = uuidv4();
  const email = `${label}-${userId.slice(0, 8)}@test.com`;
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', 'student')",
    [userId, `Test ${label}`, email],
  );
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
  return { userId, token: generateToken({ userId, email, role: 'student' as any }) };
}

function link(parentId: string, childId: string) {
  execute(
    "INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')",
    [uuidv4(), parentId, childId],
  );
}

function insertReward(creatorId: string, groupId: string, status: string) {
  execute(
    `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, status, idempotency_key)
     VALUES (?, ?, 'parent_family', ?, 'custom', 10000000, ?, ?)`,
    [uuidv4(), creatorId, groupId, status, uuidv4()],
  );
}

describe('UX-007 parent family groups', () => {
  let parent: ReturnType<typeof createUser>;
  let otherParent: ReturnType<typeof createUser>;
  let childA: ReturnType<typeof createUser>;
  let childB: ReturnType<typeof createUser>;
  let stranger: ReturnType<typeof createUser>;

  const as = (u: { token: string }) => ({ Authorization: `Bearer ${u.token}` });
  const create = (body: object, u = parent) =>
    request(app).post('/api/v1/parent/groups').set(as(u)).send(body);

  beforeEach(() => {
    parent = createUser('role_parent', 'parent');
    otherParent = createUser('role_parent', 'other');
    childA = createUser('role_student', 'childa');
    childB = createUser('role_student', 'childb');
    stranger = createUser('role_student', 'stranger');
    link(parent.userId, childA.userId);
    link(parent.userId, childB.userId);
  });

  it('creates a group with linked children and lists it with its members', async () => {
    const res = await create({ name: '  The Smiths ', memberIds: [childA.userId, childB.userId] });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('The Smiths');

    const list = await request(app).get('/api/v1/parent/groups').set(as(parent));
    expect(list.status).toBe(200);
    const [g] = list.body.data.groups;
    expect(g.member_count).toBe(2);
    expect(g.members.map((m: { id: string }) => m.id).sort()).toEqual([childA.userId, childB.userId].sort());
    expect(g.members[0]).toHaveProperty('name');
    expect(g.members[0]).not.toHaveProperty('email');
  });

  it('refuses a child who is not linked to this parent and creates nothing', async () => {
    const res = await create({ name: 'Mixed', memberIds: [childA.userId, stranger.userId] });
    expect(res.status).toBe(403);
    expect(queryOne("SELECT id FROM user_groups WHERE owner_user_id = ? AND name = 'Mixed'", [parent.userId])).toBeNull();
  });

  it('rejects a missing, blank or too-long name and a malformed member list', async () => {
    expect((await create({ name: '   ' })).status).toBe(400);
    expect((await create({ name: 'x'.repeat(81) })).status).toBe(400);
    expect((await create({ name: 'Ok', memberIds: 'nope' })).status).toBe(400);
    expect((await create({ name: 'Ok', memberIds: [42] })).status).toBe(400);
  });

  it('renames a group and replaces its members', async () => {
    const id = (await create({ name: 'Old', memberIds: [childA.userId] })).body.data.id;
    const res = await request(app).put(`/api/v1/parent/groups/${id}`).set(as(parent))
      .send({ name: 'New', memberIds: [childB.userId] });
    expect(res.status).toBe(200);

    const [g] = (await request(app).get('/api/v1/parent/groups').set(as(parent))).body.data.groups;
    expect(g.name).toBe('New');
    expect(g.members.map((m: { id: string }) => m.id)).toEqual([childB.userId]);
  });

  it('update keeps members unchanged when memberIds is omitted, and refuses unlinked children', async () => {
    const id = (await create({ name: 'Keep', memberIds: [childA.userId] })).body.data.id;
    expect((await request(app).put(`/api/v1/parent/groups/${id}`).set(as(parent)).send({ name: 'Kept' })).status).toBe(200);
    const bad = await request(app).put(`/api/v1/parent/groups/${id}`).set(as(parent))
      .send({ name: 'Kept', memberIds: [stranger.userId] });
    expect(bad.status).toBe(403);

    const [g] = (await request(app).get('/api/v1/parent/groups').set(as(parent))).body.data.groups;
    expect(g.name).toBe('Kept');
    expect(g.members.map((m: { id: string }) => m.id)).toEqual([childA.userId]);
  });

  it("another parent cannot see, rename or delete someone else's group", async () => {
    const id = (await create({ name: 'Private', memberIds: [childA.userId] })).body.data.id;
    const list = await request(app).get('/api/v1/parent/groups').set(as(otherParent));
    expect(list.body.data.groups).toEqual([]);
    expect((await request(app).put(`/api/v1/parent/groups/${id}`).set(as(otherParent)).send({ name: 'Mine' })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/parent/groups/${id}`).set(as(otherParent))).status).toBe(404);
    expect(queryOne('SELECT name FROM user_groups WHERE id = ?', [id])).toEqual({ name: 'Private' });
  });

  it('deletes a group and its memberships', async () => {
    const id = (await create({ name: 'Gone', memberIds: [childA.userId] })).body.data.id;
    const res = await request(app).delete(`/api/v1/parent/groups/${id}`).set(as(parent));
    expect(res.status).toBe(200);
    expect(queryOne('SELECT id FROM user_groups WHERE id = ?', [id])).toBeNull();
    expect(queryOne('SELECT user_id FROM user_group_members WHERE group_id = ?', [id])).toBeNull();
  });

  it('refuses to delete a group that has a reward holding or paying out money', async () => {
    const id = (await create({ name: 'Funded', memberIds: [childA.userId] })).body.data.id;
    insertReward(parent.userId, id, 'funded');
    const res = await request(app).delete(`/api/v1/parent/groups/${id}`).set(as(parent));
    expect(res.status).toBe(409);
    // The web client shows error.message, so the reason must arrive in that shape.
    expect(res.body.error.code).toBe('GROUP_HAS_FUNDED_REWARDS');
    expect(res.body.error.message).toMatch(/funded or paid/);
    expect(queryOne('SELECT id FROM user_groups WHERE id = ?', [id])).toBeTruthy();
  });

  it.each(['pending_funding', 'refunded', 'released'])('refuses to delete while a reward is %s', async (status) => {
    const id = (await create({ name: status, memberIds: [childA.userId] })).body.data.id;
    insertReward(parent.userId, id, status);
    expect((await request(app).delete(`/api/v1/parent/groups/${id}`).set(as(parent))).status).toBe(409);
  });

  it('returns validation and scoping errors as { code, message }', async () => {
    const bad = await create({ name: '' });
    expect(bad.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Group name is required' });
    const unlinked = await create({ name: 'X', memberIds: [stranger.userId] });
    expect(unlinked.body.error.message).toBe('You can only add children linked to you.');
  });

  it("will not touch the parent's own non-family group through these endpoints", async () => {
    const classId = uuidv4();
    execute("INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'A class', 'class', ?)", [classId, parent.userId]);
    expect((await request(app).put(`/api/v1/parent/groups/${classId}`).set(as(parent)).send({ name: 'Renamed' })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/parent/groups/${classId}`).set(as(parent))).status).toBe(404);
  });

  it('allows deleting a group whose only rewards are drafts or cancelled', async () => {
    const id = (await create({ name: 'Drafty', memberIds: [childA.userId] })).body.data.id;
    insertReward(parent.userId, id, 'draft');
    insertReward(parent.userId, id, 'cancelled');
    expect((await request(app).delete(`/api/v1/parent/groups/${id}`).set(as(parent))).status).toBe(200);
    // Drafts left behind would be invisible, so they are cancelled with the group.
    expect(queryOne("SELECT id FROM rewards WHERE scope_id = ? AND status = 'draft'", [id])).toBeNull();
  });
});
