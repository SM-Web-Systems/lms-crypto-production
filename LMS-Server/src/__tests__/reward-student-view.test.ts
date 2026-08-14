/**
 * R14: Student Rewards View — privacy-safe endpoint tests
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import {
  createReward,
  fundReward,
  activateReward,
  releaseAllocation,
} from '../services/rewards/rewardService.js';

function seedStudentWithReleasedReward(): {
  studentId: string;
  studentToken: string;
  sponsorId: string;
  rewardId: string;
} {
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
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_sponsor');

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(cohortId, sponsorId, courseId);
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);

  const reward = createReward(sponsorId, {
    scopeType: 'sponsor_cohort',
    scopeId: cohortId,
    rewardType: 'custom',
    amountStroops: '10000000',
    autoRelease: false,
    idempotencyKey: `idem-${uuidv4()}`,
  });
  fundReward(reward.id, sponsorId, { type: 'platform_credit' }, `fund-${uuidv4()}`);
  activateReward(reward.id, sponsorId, `act-${uuidv4()}`);

  // Make allocation eligible and release it
  const allocs = db.prepare('SELECT id FROM reward_allocations WHERE reward_id = ?').all(reward.id) as Array<{ id: string }>;
  db.prepare("UPDATE reward_allocations SET status = 'eligible', eligible_at = datetime('now') WHERE id = ?").run(allocs[0].id);
  releaseAllocation(allocs[0].id, sponsorId, `rel-${uuidv4()}`);

  const studentToken = makeToken({ userId: studentId, email: `${studentId}@test.com`, role: 'student' });

  return { studentId, studentToken, sponsorId, rewardId: reward.id };
}

describe('R14 Student Rewards View', () => {
  it('R14-SV-1: GET /students/me/rewards returns released rewards', async () => {
    const { studentToken } = seedStudentWithReleasedReward();

    const res = await request(app)
      .get('/api/v1/students/me/rewards')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const reward = res.body.data[0];
    expect(reward).toHaveProperty('allocationId');
    expect(reward).toHaveProperty('rewardType');
    expect(reward).toHaveProperty('amountStroops');
    expect(reward).toHaveProperty('status');
    expect(reward.status).toBe('released');
  });

  it('R14-SV-2: No funder data exposed in student rewards', async () => {
    const { studentToken, sponsorId } = seedStudentWithReleasedReward();

    const res = await request(app)
      .get('/api/v1/students/me/rewards')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    // Must not contain sponsor/creator IDs
    expect(body).not.toContain(sponsorId);
    expect(body).not.toContain('creator_user_id');
    expect(body).not.toContain('scope_id');
    expect(body).not.toContain('scope_type');
  });

  it('R14-SV-3: Returns empty array for student with no rewards', async () => {
    const studentId = uuidv4();
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'No-Reward Student', ?, 'hash', 'student')"
    ).run(studentId, `${studentId}@test.com`);
    const token = makeToken({ userId: studentId, email: `${studentId}@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/students/me/rewards')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('R14-SV-4: Unauthenticated request returns 401', async () => {
    const res = await request(app)
      .get('/api/v1/students/me/rewards');

    expect(res.status).toBe(401);
  });

  it('R14-SV-5: Does not show pending/eligible allocations', async () => {
    const sponsorId = uuidv4();
    const studentId = uuidv4();
    const courseId = uuidv4();
    const cohortId = uuidv4();

    db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'admin')").run(sponsorId, `${sponsorId}@t.com`);
    db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'ST', ?, 'hash', 'student')").run(studentId, `${studentId}@t.com`);
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_sponsor');
    db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)`).run(courseId, `C-${courseId.slice(0,8)}`);
    db.prepare(`INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'C')`).run(cohortId, sponsorId, courseId);
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort', scopeId: cohortId,
      rewardType: 'custom', amountStroops: '10000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });
    fundReward(reward.id, sponsorId, { type: 'platform_credit' }, `fund-${uuidv4()}`);
    activateReward(reward.id, sponsorId, `act-${uuidv4()}`);
    // Allocations are in 'pending' status — should NOT appear

    const token = makeToken({ userId: studentId, email: `${studentId}@t.com`, role: 'student' });
    const res = await request(app)
      .get('/api/v1/students/me/rewards')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
