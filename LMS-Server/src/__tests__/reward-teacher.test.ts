import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

function seedTeacher(): { teacherId: string; token: string; classId: string; studentId: string } {
  const teacherId = uuidv4();
  const studentId = uuidv4();
  const classId = uuidv4();

  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Teacher', ?, 'hash', 'admin')").run(teacherId, `${teacherId}@test.com`);
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')").run(studentId, `${studentId}@test.com`);

  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(teacherId, 'role_teacher');

  db.prepare('INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, ?, ?, ?)').run(classId, 'Test Class', 'class', teacherId);
  db.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(classId, studentId);

  const token = makeToken({ userId: teacherId, email: `${teacherId}@test.com`, role: 'admin' });
  return { teacherId, token, classId, studentId };
}

describe('Teacher Reward Routes', () => {
  it('CTR-T-1: POST /teacher/rewards creates draft reward', async () => {
    const { token, classId } = seedTeacher();
    const res = await request(app)
      .post('/api/v1/teacher/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: classId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.scope_type).toBe('teacher_class');
  });

  it('CTR-T-2: POST /teacher/rewards/:id/fund transitions to funded', async () => {
    const { token, classId } = seedTeacher();
    const create = await request(app)
      .post('/api/v1/teacher/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: classId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    const res = await request(app)
      .post(`/api/v1/teacher/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceType: 'admin_grant', idempotencyKey: `fund-${uuidv4()}` });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('funded');
  });

  it('CTR-T-3: POST /teacher/rewards/:id/activate transitions to active', async () => {
    const { token, classId } = seedTeacher();
    const create = await request(app)
      .post('/api/v1/teacher/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: classId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    await request(app)
      .post(`/api/v1/teacher/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceType: 'admin_grant', idempotencyKey: `fund-${uuidv4()}` });

    const res = await request(app)
      .post(`/api/v1/teacher/rewards/${rewardId}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `act-${uuidv4()}` });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  it('CTR-T-4: GET /teacher/rewards lists rewards', async () => {
    const { token, classId } = seedTeacher();
    await request(app)
      .post('/api/v1/teacher/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: classId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });

    const res = await request(app)
      .get(`/api/v1/teacher/rewards?scopeId=${classId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('CTR-T-5: GET /teacher/rewards/:id returns single reward', async () => {
    const { token, classId } = seedTeacher();
    const create = await request(app)
      .post('/api/v1/teacher/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: classId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    const res = await request(app)
      .get(`/api/v1/teacher/rewards/${rewardId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(rewardId);
  });

  it('CTR-T-6: POST /teacher/rewards/:id/cancel cancels reward', async () => {
    const { token, classId } = seedTeacher();
    const create = await request(app)
      .post('/api/v1/teacher/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: classId,
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    const rewardId = create.body.data.id;

    await request(app)
      .post(`/api/v1/teacher/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceType: 'admin_grant', idempotencyKey: `fund-${uuidv4()}` });

    const res = await request(app)
      .post(`/api/v1/teacher/rewards/${rewardId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Class ended', idempotencyKey: `cancel-${uuidv4()}` });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });

  it('CTR-T-7: rejects non-owned class scope', async () => {
    const { token } = seedTeacher();
    const res = await request(app)
      .post('/api/v1/teacher/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scopeId: uuidv4(),
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    expect(res.status).toBe(403);
  });

  it('CTR-T-8: unauthenticated returns 401', async () => {
    const res = await request(app)
      .post('/api/v1/teacher/rewards')
      .send({
        scopeId: uuidv4(),
        rewardType: 'custom',
        amountStroops: '5000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    expect(res.status).toBe(401);
  });
});
