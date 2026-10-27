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
