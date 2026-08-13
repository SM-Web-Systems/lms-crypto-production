import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

function seedSponsor(): { sponsorId: string; token: string; cohortId: string; courseId: string; studentId: string } {
  const sponsorId = uuidv4();
  const studentId = uuidv4();
  const courseId = uuidv4();
  const cohortId = uuidv4();

  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Sponsor', ?, 'hash', 'admin')"
  ).run(sponsorId, `${sponsorId}@test.com`);
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
  ).run(studentId, `${studentId}@test.com`);

  // Assign sponsor role with reward permissions
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_sponsor');

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(cohortId, sponsorId, courseId);
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);

  const token = makeToken({ userId: sponsorId, email: `${sponsorId}@test.com`, role: 'admin' });
  return { sponsorId, token, cohortId, courseId, studentId };
}

describe('Sponsor Reward Routes', () => {
  it('BR-S-1: POST /sponsor/rewards creates draft reward', async () => {
    const { token, cohortId } = seedSponsor();
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: cohortId,
        rewardType: 'custom',
        amountStroops: '10000000',
        maxRecipients: 1,
        idempotencyKey: `idem-${uuidv4()}`,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.scope_type).toBe('sponsor_cohort');
  });

  it('BR-S-2: POST /sponsor/rewards rejects invalid scope', async () => {
    const { token } = seedSponsor();
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: uuidv4(), // non-existent cohort
        rewardType: 'custom',
        amountStroops: '10000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    expect(res.status).toBe(403);
  });

  it('BR-S-3: POST /sponsor/rewards/:id/fund transitions to funded', async () => {
    const { token, cohortId, sponsorId } = seedSponsor();
    // Create reward first
    const create = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: cohortId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    const res = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceType: 'admin_grant',
        idempotencyKey: `fund-${uuidv4()}`,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('funded');
  });

  it('BR-S-4: POST /sponsor/rewards/:id/activate transitions to active', async () => {
    const { token, cohortId } = seedSponsor();
    const create = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: cohortId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceType: 'admin_grant', idempotencyKey: `fund-${uuidv4()}` });

    const res = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `act-${uuidv4()}` });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  it('BR-S-5: POST /sponsor/rewards/:id/cancel cancels active reward', async () => {
    const { token, cohortId } = seedSponsor();
    const create = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: cohortId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceType: 'admin_grant', idempotencyKey: `fund-${uuidv4()}` });

    await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `act-${uuidv4()}` });

    const res = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Testing cancel', idempotencyKey: `cancel-${uuidv4()}` });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });

  it('BR-S-6: GET /sponsor/rewards lists rewards for scope', async () => {
    const { token, cohortId } = seedSponsor();
    await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: cohortId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });

    const res = await request(app)
      .get(`/api/v1/sponsor/rewards?scopeId=${cohortId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('BR-S-7: GET /sponsor/rewards/:id returns single reward', async () => {
    const { token, cohortId } = seedSponsor();
    const create = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: cohortId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    const res = await request(app)
      .get(`/api/v1/sponsor/rewards/${rewardId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(rewardId);
  });

  it('BR-S-8: GET /sponsor/rewards/:id/allocations returns allocations', async () => {
    const { token, cohortId } = seedSponsor();
    const create = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: cohortId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceType: 'admin_grant', idempotencyKey: `fund-${uuidv4()}` });

    await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `act-${uuidv4()}` });

    const res = await request(app)
      .get(`/api/v1/sponsor/rewards/${rewardId}/allocations`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('BR-S-9: GET /sponsor/rewards/:id/transactions returns ledger', async () => {
    const { token, cohortId } = seedSponsor();
    const create = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: cohortId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceType: 'admin_grant', idempotencyKey: `fund-${uuidv4()}` });

    const res = await request(app)
      .get(`/api/v1/sponsor/rewards/${rewardId}/transactions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('BR-S-10: student cannot create sponsor rewards', async () => {
    const { cohortId, studentId } = seedSponsor();
    const studentToken = makeToken({ userId: studentId, email: `${studentId}@test.com`, role: 'student' });
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(studentId, 'role_student');

    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        scopeId: cohortId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    expect(res.status).toBe(403);
  });

  it('BR-S-11: unauthenticated request returns 401', async () => {
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .send({
        scopeId: uuidv4(),
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    expect(res.status).toBe(401);
  });
});
