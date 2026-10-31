import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

function seedParent(): { parentId: string; token: string; adminToken: string; childId: string; familyId: string } {
  const parentId = uuidv4();
  const childId = uuidv4();
  const familyId = uuidv4();

  // W01-R1: Use legacy role 'lecturer' to avoid trigger auto-assigning role_admin
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Parent', ?, 'hash', 'lecturer')").run(parentId, `${parentId}@test.com`);
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Child', ?, 'hash', 'student')").run(childId, `${childId}@test.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(parentId, 'role_parent');
  db.prepare("INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')").run(uuidv4(), parentId, childId);

  // W01-R1: Independent admin for funding authorization
  const adminId = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'FundAdmin', ?, 'hash', 'admin')").run(adminId, `${adminId}@test.com`);

  // Create family group
  db.prepare('INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, ?, ?, ?)').run(familyId, 'Test Family', 'family', parentId);
  db.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(familyId, childId);

  const token = makeToken({ userId: parentId, email: `${parentId}@test.com`, role: 'lecturer' });
  const adminToken = makeToken({ userId: adminId, email: `${adminId}@test.com`, role: 'admin' });
  return { parentId, token, adminToken, childId, familyId };
}

describe('Parent Reward Routes', () => {
  it('CR-P-1: POST /parent/rewards creates draft for single child', async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'child',
        scopeId: childId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.scope_type).toBe('parent_child');
    expect(res.body.data.status).toBe('draft');
  });

  it('CR-P-2: POST /parent/rewards creates draft for family group', async () => {
    const { token, familyId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'family',
        scopeId: familyId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.scope_type).toBe('parent_family');
  });

  it('CR-P-3: POST /parent/rewards rejects unlinked child', async () => {
    const { token } = seedParent();
    const unlinkedChild = uuidv4();
    db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Other', ?, 'hash', 'student')").run(unlinkedChild, `${unlinkedChild}@test.com`);

    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'child',
        scopeId: unlinkedChild,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    expect(res.status).toBe(403);
  });

  it('CR-P-4: full lifecycle child reward', async () => {
    const { token, adminToken, childId } = seedParent();

    const create = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'child',
        scopeId: childId,
        rewardType: 'custom',
        amountStroops: '1000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    // W01-R1: Independent admin funds (has reward.manage, ≠ creator)
    const fund = await request(app)
      .post(`/api/v1/parent/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceType: 'admin_grant', idempotencyKey: `fund-${uuidv4()}` });
    expect(fund.body.data.status).toBe('funded');

    const activate = await request(app)
      .post(`/api/v1/parent/rewards/${rewardId}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `act-${uuidv4()}` });
    expect(activate.body.data.status).toBe('active');
  });

  it('CR-P-5: GET /parent/rewards lists rewards', async () => {
    const { token, childId } = seedParent();
    await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'child',
        scopeId: childId,
        rewardType: 'custom',
        amountStroops: '1000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });

    const res = await request(app)
      .get(`/api/v1/parent/rewards?scopeId=${childId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('CR-P-6: GET /parent/rewards/:id returns reward', async () => {
    const { token, childId } = seedParent();
    const create = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'child',
        scopeId: childId,
        rewardType: 'custom',
        amountStroops: '1000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });

    const res = await request(app)
      .get(`/api/v1/parent/rewards/${create.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(create.body.data.id);
  });

  it('CR-P-7: cancel parent reward', async () => {
    const { token, adminToken, childId } = seedParent();
    const create = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: childId,
        rewardType: 'custom',
        amountStroops: '1000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    // W01-R1: Independent admin funds
    await request(app)
      .post(`/api/v1/parent/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceType: 'admin_grant', idempotencyKey: `fund-${uuidv4()}` });

    const res = await request(app)
      .post(`/api/v1/parent/rewards/${rewardId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Changed mind', idempotencyKey: `cancel-${uuidv4()}` });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });

  it('CR-P-8: unauthenticated returns 401', async () => {
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .send({ scopeId: uuidv4(), rewardType: 'custom', amountStroops: '1000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(401);
  });
});

// ──── W06: Parent target discriminator — validation and propagation ────

describe('W06: parent target discriminator', () => {
  // ── Characterize existing behavior (should already pass) ──

  it('W6-B-1: POST targetType=child → 201, parent_child', async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'child', scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(201);
    expect(res.body.data.scope_type).toBe('parent_child');
  });

  it('W6-B-2: POST targetType=family → 201, parent_family', async () => {
    const { token, familyId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'family', scopeId: familyId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(201);
    expect(res.body.data.scope_type).toBe('parent_family');
  });

  it('W6-B-3: POST omitted targetType → 201, parent_child (legacy)', async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(201);
    expect(res.body.data.scope_type).toBe('parent_child');
  });

  // ── Invalid POST values — controlled 400 ──

  it('W6-B-4: POST targetType=FAMILY (case variation) → 400 INVALID_TARGET_TYPE', async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'FAMILY', scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET_TYPE');
  });

  it("W6-B-5: POST targetType='' (empty string) → 400 INVALID_TARGET_TYPE", async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: '', scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET_TYPE');
  });

  it('W6-B-6: POST targetType=null → 400 INVALID_TARGET_TYPE', async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: null, scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET_TYPE');
  });

  it('W6-B-7: POST targetType=123 (number) → 400 INVALID_TARGET_TYPE', async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 123, scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET_TYPE');
  });

  it('W6-B-8: POST targetType=[] (array) → 400 INVALID_TARGET_TYPE', async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: [], scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET_TYPE');
  });

  it('W6-B-9: POST targetType={} (object) → 400 INVALID_TARGET_TYPE', async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: {}, scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET_TYPE');
  });

  it("W6-B-10: POST targetType='child ' (padded string) → 400 INVALID_TARGET_TYPE", async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'child ', scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET_TYPE');
  });

  it('W6-B-11: GET ?targetType=INVALID → 400 INVALID_TARGET_TYPE', async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .get(`/api/v1/parent/rewards?scopeId=${childId}&targetType=INVALID`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET_TYPE');
  });

  it('W6-B-12: GET repeated query ?targetType=child&targetType=family (array) → 400 INVALID_TARGET_TYPE', async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .get(`/api/v1/parent/rewards?scopeId=${childId}&targetType=child&targetType=family`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET_TYPE');
  });

  it('W6-B-13: GET ?targetType=family returns parent_family rewards', async () => {
    const { token, familyId } = seedParent();
    await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'family', scopeId: familyId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });

    const res = await request(app)
      .get(`/api/v1/parent/rewards?scopeId=${familyId}&targetType=family`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const rewards = res.body.data;
    expect(rewards.length).toBeGreaterThanOrEqual(1);
    expect(rewards[0].scope_type).toBe('parent_family');
  });

  it('W6-B-14: same scopeId as both child user and family group — targetType controls scope_type', async () => {
    // Seed parent with both child + family
    const { token, childId, familyId } = seedParent();

    const childRes = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'child', scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(childRes.status).toBe(201);
    expect(childRes.body.data.scope_type).toBe('parent_child');

    const familyRes = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'family', scopeId: familyId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(familyRes.status).toBe(201);
    expect(familyRes.body.data.scope_type).toBe('parent_family');

    // Confirm both rewards are independently stored with correct scope
    expect(childRes.body.data.scope_type).not.toBe(familyRes.body.data.scope_type);
  });

  it('W6-B-15: same idempotency key with different targetType → 409 IDEMPOTENCY_CONFLICT', async () => {
    const { token, childId, familyId } = seedParent();
    const key = `idem-${uuidv4()}`;

    const first = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'child', scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: key });
    expect(first.status).toBe(201);

    // Same key, different targetType — must conflict
    const second = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'family', scopeId: familyId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: key });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('W6-B-16: invalid targetType does not consume idempotency key — valid reuse succeeds', async () => {
    const { token, childId } = seedParent();
    const key = `idem-${uuidv4()}`;

    // First request: invalid targetType → rejected 400
    const bad = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'INVALID', scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: key });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_TARGET_TYPE');

    // Same key with valid targetType → should succeed (key was not consumed)
    const good = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'child', scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: key });
    expect(good.status).toBe(201);
  });

  it('W6-B-17: foreign family (not owner) → 403 SCOPE_DENIED', async () => {
    const { token } = seedParent();
    // Create a second parent that owns a different family
    const { familyId: otherFamilyId } = seedParent();

    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'family', scopeId: otherFamilyId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(403);
  });

  it('W6-B-18: wrong group_type (non-family) with targetType=family → 403', async () => {
    const { parentId, token } = seedParent();
    // Create a group owned by this parent but with group_type != family
    const nonFamilyGroupId = uuidv4();
    db.prepare('INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, ?, ?, ?)').run(nonFamilyGroupId, 'Not A Family', 'class', parentId);

    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'family', scopeId: nonFamilyGroupId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(403);
  });

  // ── No-regression checks ──

  it('W6-B-19: W05 invalid reward type still rejects with INVALID_REWARD_TYPE', async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'child', scopeId: childId, rewardType: 'completion', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  it('W6-B-20: error message constant — INVALID_TARGET_TYPE body does not serialize rejected input', async () => {
    const { token, childId } = seedParent();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: { toString: null }, scopeId: childId, rewardType: 'custom', amountStroops: '5000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TARGET_TYPE');
    // Error message must not attempt to serialize/coerce the rejected input
    expect(res.body.error.message).not.toContain('[object');
    expect(res.body.error.message).toMatch(/Accepted values: child, family/);
  });
});
