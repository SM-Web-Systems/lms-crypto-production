import { describe, it, expect } from 'vitest';
import request from 'supertest';
import './setup.js';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { createReward } from '../services/rewards/rewardService.js';

function fixture() {
  const owner = uuidv4(), admin = uuidv4(), stranger = uuidv4(), course = uuidv4(), cohort = uuidv4();
  for (const [id, role] of [[owner, 'lecturer'], [admin, 'admin'], [stranger, 'lecturer']]) {
    db.prepare("INSERT INTO users(id,name,email,password_hash,role) VALUES (?,'Synthetic',?,'hash',?)").run(id, `${id}@test.invalid`, role);
  }
  for (const id of [owner, stranger]) db.prepare('INSERT INTO user_roles(user_id,role_id) VALUES (?,?)').run(id, 'role_sponsor');
  db.prepare("INSERT INTO courses(id,title,course_code) VALUES (?,'Funding',?)").run(course, course);
  db.prepare("INSERT INTO sponsor_cohorts(id,sponsor_user_id,course_id,name) VALUES (?,?,?,'Funding')").run(cohort, owner, course);
  const reward = createReward(owner, {scopeType: 'sponsor_cohort', scopeId: cohort, rewardType: 'custom', amountStroops: '1111111', maxRecipients: 2, idempotencyKey: uuidv4()});
  const token = (id: string) => makeToken({userId: id, email: `${id}@test.invalid`, role: id === admin ? 'admin' : 'lecturer'});
  return {owner, admin, stranger, reward, token};
}

describe('funding availability and intent HTTP contract', () => {
  it('exposes the same authenticated contract for all four portal routes', async () => {
    const f = fixture();
    for (const role of ['sponsor', 'employer', 'parent', 'teacher']) {
      const result = await request(app).get(`/api/v1/${role}/rewards/${f.reward.id}/funding-options`).set('Authorization', `Bearer ${f.token(f.admin)}`);
      expect(result.status).toBe(200);
      expect(result.body.data.filter((option: {available: boolean}) => option.available)).toEqual([{sourceType: 'admin_grant', available: true, reason: null}]);
    }
    const anonymous = await request(app).get(`/api/v1/sponsor/rewards/${f.reward.id}/funding-options`);
    expect(anonymous.status).toBe(401);
  });

  it('hides cross-owner options and keeps owner self-grants unavailable', async () => {
    const f = fixture(), url = `/api/v1/sponsor/rewards/${f.reward.id}`;
    expect((await request(app).get(`${url}/funding-options`).set('Authorization', `Bearer ${f.token(f.stranger)}`)).status).toBe(404);
    const owner = await request(app).get(`${url}/funding-options`).set('Authorization', `Bearer ${f.token(f.owner)}`);
    expect(owner.status).toBe(200);
    expect(owner.body.data.every((option: {available: boolean}) => !option.available)).toBe(true);
    const grant = await request(app).post(`${url}/funding-intents`).set('Authorization', `Bearer ${f.token(f.owner)}`)
      .send({sourceType: 'admin_grant', idempotencyKey: 'self'});
    expect(grant.status).toBe(403);
  });

  it('ignores caller financial assertions, persists the exact intent, and replays the HTTP fund request', async () => {
    const f = fixture(), url = `/api/v1/sponsor/rewards/${f.reward.id}`, authorization = `Bearer ${f.token(f.admin)}`;
    const intent = await request(app).post(`${url}/funding-intents`).set('Authorization', authorization).send({sourceType: 'admin_grant',
      idempotencyKey: 'prepare', owner_user_id: f.admin, amount_stroops: 1, network: 'public', currency_code: 'USD', verified: true});
    expect(intent.status).toBe(201);
    expect(intent.body.data).toMatchObject({owner_user_id: f.owner, amount_stroops: 2222222, currency_code: 'XLM', network: 'internal'});
    for (let retry = 0; retry < 2; retry++) {
      const fund = await request(app).post(`${url}/fund`).set('Authorization', authorization)
        .send({sourceType: 'admin_grant', intentId: intent.body.data.id, idempotencyKey: 'consume'});
      expect(fund.status).toBe(200);
      expect(fund.body.data.status).toBe('funded');
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM reward_funding_evidence').get()).toEqual({n: 1});
  });

  it('rejects malformed sources and keys as controlled errors without writing financial rows', async () => {
    const f = fixture(), authorization = `Bearer ${f.token(f.admin)}`;
    for (const payload of [{sourceType: []}, {sourceType: 'admin_grant', reference: {}}, {sourceType: 'admin_grant', idempotencyKey: '   '}]) {
      const result = await request(app).post(`/api/v1/sponsor/rewards/${f.reward.id}/fund`).set('Authorization', authorization).send(payload);
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe('INVALID_FUNDING_SOURCE');
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM reward_transactions').get()).toEqual({n: 0});
  });
});
