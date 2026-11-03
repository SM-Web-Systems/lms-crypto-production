import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

function seedEmployer(): { employerId: string; token: string; adminToken: string; teamId: string; studentId: string } {
  const employerId = uuidv4();
  const studentId = uuidv4();
  const teamId = uuidv4();

  // W01-R1: Use legacy role 'lecturer' to avoid trigger auto-assigning role_admin
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Employer', ?, 'hash', 'lecturer')"
  ).run(employerId, `${employerId}@test.com`);
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
  ).run(studentId, `${studentId}@test.com`);

  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(employerId, 'role_employer');

  // W01-R1: Independent admin for funding authorization
  const adminId = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'FundAdmin', ?, 'hash', 'admin')"
  ).run(adminId, `${adminId}@test.com`);

  db.prepare(
    'INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, ?, ?, ?)'
  ).run(teamId, 'Test Team', 'team', employerId);
  db.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(teamId, studentId);

  const token = makeToken({ userId: employerId, email: `${employerId}@test.com`, role: 'lecturer' });
  const adminToken = makeToken({ userId: adminId, email: `${adminId}@test.com`, role: 'admin' });
  return { employerId, token, adminToken, teamId, studentId };
}

describe('Employer Reward Routes', () => {
  it('BR-E-1: POST /employer/rewards creates draft reward', async () => {
    const { token, teamId } = seedEmployer();
    const res = await request(app)
      .post('/api/v1/employer/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: teamId,
        rewardType: 'custom',
        amountStroops: '10000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.scope_type).toBe('employer_team');
  });

  it('BR-E-2: POST /employer/rewards/:id/fund transitions to funded', async () => {
    const { token, adminToken, teamId } = seedEmployer();
    const create = await request(app)
      .post('/api/v1/employer/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: teamId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    // W01-R1: Independent admin funds (has reward.manage, ≠ creator)
    const res = await request(app)
      .post(`/api/v1/employer/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceType: 'admin_grant', idempotencyKey: `fund-${uuidv4()}` });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('funded');
  });

  it('BR-E-3: POST /employer/rewards/:id/activate transitions to active', async () => {
    const { token, adminToken, teamId } = seedEmployer();
    const create = await request(app)
      .post('/api/v1/employer/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: teamId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    // W01-R1: Independent admin funds
    await request(app)
      .post(`/api/v1/employer/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceType: 'admin_grant', idempotencyKey: `fund-${uuidv4()}` });

    const res = await request(app)
      .post(`/api/v1/employer/rewards/${rewardId}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `act-${uuidv4()}` });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  it('BR-E-4: GET /employer/rewards lists rewards', async () => {
    const { token, teamId } = seedEmployer();
    await request(app)
      .post('/api/v1/employer/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: teamId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });

    const res = await request(app)
      .get(`/api/v1/employer/rewards?scopeId=${teamId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('BR-E-5: cross-role access denied — employer cannot use sponsor cohort', async () => {
    const { token } = seedEmployer();
    // Employer tries to create reward with a non-existent scopeId (would be a cohort)
    const res = await request(app)
      .post('/api/v1/employer/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: uuidv4(),
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    expect(res.status).toBe(403);
  });

  it('BR-E-6: POST /employer/rewards/:id/cancel cancels reward', async () => {
    const { token, adminToken, teamId } = seedEmployer();
    const create = await request(app)
      .post('/api/v1/employer/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: teamId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    // W01-R1: Independent admin funds
    await request(app)
      .post(`/api/v1/employer/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceType: 'admin_grant', idempotencyKey: `fund-${uuidv4()}` });

    // Cancel funded (before activation)
    const res = await request(app)
      .post(`/api/v1/employer/rewards/${rewardId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Budget cut', idempotencyKey: `cancel-${uuidv4()}` });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });

  it('BR-E-7: GET /employer/rewards/:id returns single reward', async () => {
    const { token, teamId } = seedEmployer();
    const create = await request(app)
      .post('/api/v1/employer/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: teamId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    const res = await request(app)
      .get(`/api/v1/employer/rewards/${rewardId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(rewardId);
  });

  it('BR-E-8: unauthenticated request returns 401', async () => {
    const res = await request(app)
      .post('/api/v1/employer/rewards')
      .send({
        scopeId: uuidv4(),
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    expect(res.status).toBe(401);
  });
});
