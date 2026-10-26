/**
 * WI-04 — Sponsor reward isolation acceptance tests
 *
 * Tests GET /api/v1/sponsor/rewards/:id with ownership/scope enforcement.
 *
 * The expected authorization model:
 *   - Sponsor A can retrieve reward details for rewards scoped to their own cohort
 *   - Sponsor A CANNOT retrieve Sponsor B's reward by changing the reward ID
 *   - Admin (reward.manage) can retrieve any reward
 *   - Nonexistent reward ID returns 404
 *   - Unauthenticated requests return 401
 *   - Student (no reward.view_assigned) is denied
 *
 * These tests should FAIL against the current unpatched code because
 * the route handler performs no ownership check — any user with
 * reward.view_assigned can retrieve any reward by ID.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

/**
 * Seed two sponsors, each with their own cohort, course, and reward.
 * Also seeds an admin and a student.
 */
function seedSponsorIsolation() {
  const adminId = uuidv4();
  const sponsorAId = uuidv4();
  const sponsorBId = uuidv4();
  const studentId = uuidv4();
  const courseId = uuidv4();
  const cohortAId = uuidv4();
  const cohortBId = uuidv4();
  const rewardAId = uuidv4();
  const rewardBId = uuidv4();
  const code = `WI04-${uuidv4().slice(0, 6)}`;

  // --- Users ---
  // Sponsors use legacy role='student' — RBAC role_sponsor provides the real
  // permissions. This avoids the trg_auto_assign_user_role trigger granting
  // role_admin (which includes reward.manage admin bypass).
  db.exec(`
    INSERT INTO users (id,name,email,password_hash)
    VALUES
      ('${adminId}','WI04 Admin','wi04-admin-${adminId}@test.com','hash'),
      ('${sponsorAId}','WI04 Sponsor A','wi04-spa-${sponsorAId}@test.com','hash'),
      ('${sponsorBId}','WI04 Sponsor B','wi04-spb-${sponsorBId}@test.com','hash'),
      ('${studentId}','WI04 Student','wi04-student-${studentId}@test.com','hash');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${adminId}','role_admin');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${sponsorAId}','role_student');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${sponsorBId}','role_student');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${studentId}','role_student');

  `);

  // --- RBAC role assignments ---
  // Sponsors get role_sponsor which includes reward.view_assigned, reward.create, etc.
  // The trigger already gave them role_student; add role_sponsor on top.
  db.exec(`
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${sponsorAId}', 'role_sponsor');
    INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${sponsorBId}', 'role_sponsor');
  `);

  // --- Course ---
  db.exec(`
    INSERT INTO courses (id, title, description, course_code)
    VALUES ('${courseId}', 'WI04 Course', 'Test course', '${code}');
  `);

  // --- Sponsor cohorts (ownership link) ---
  db.exec(`
    INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name)
    VALUES
      ('${cohortAId}', '${sponsorAId}', '${courseId}', 'Cohort A'),
      ('${cohortBId}', '${sponsorBId}', '${courseId}', 'Cohort B');
  `);

  // --- Cohort members (needed for audience) ---
  db.exec(`
    INSERT INTO cohort_members (cohort_id, user_id) VALUES ('${cohortAId}', '${studentId}');
    INSERT INTO cohort_members (cohort_id, user_id) VALUES ('${cohortBId}', '${studentId}');
  `);

  // --- Rewards (created directly in DB to avoid route dependencies) ---
  db.exec(`
    INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
      amount_stroops, currency_code, max_recipients, auto_release,
      description, status, idempotency_key)
    VALUES
      ('${rewardAId}', '${sponsorAId}', 'sponsor_cohort', '${cohortAId}', 'custom',
       10000000, 'XLM', 1, 0, 'Sponsor A Reward', 'draft', 'idem-a-${rewardAId}'),
      ('${rewardBId}', '${sponsorBId}', 'sponsor_cohort', '${cohortBId}', 'custom',
       20000000, 'XLM', 1, 0, 'Sponsor B Reward', 'draft', 'idem-b-${rewardBId}');
  `);

  return {
    adminId, sponsorAId, sponsorBId, studentId,
    courseId, cohortAId, cohortBId,
    rewardAId, rewardBId,
  };
}

describe('WI-04 — Sponsor reward isolation (GET /sponsor/rewards/:id)', () => {

  describe('Authorized sponsor access', () => {
    it('sponsor A can retrieve their own reward → 200', async () => {
      const ids = seedSponsorIsolation();
      const token = makeToken({ userId: ids.sponsorAId, email: `wi04-spa-${ids.sponsorAId}@test.com`, role: 'student' });

      const res = await request(app)
        .get(`/api/v1/sponsor/rewards/${ids.rewardAId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(ids.rewardAId);
      expect(res.body.data.description).toBe('Sponsor A Reward');
    });

    it('sponsor B can retrieve their own reward → 200', async () => {
      const ids = seedSponsorIsolation();
      const token = makeToken({ userId: ids.sponsorBId, email: `wi04-spb-${ids.sponsorBId}@test.com`, role: 'student' });

      const res = await request(app)
        .get(`/api/v1/sponsor/rewards/${ids.rewardBId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(ids.rewardBId);
      expect(res.body.data.description).toBe('Sponsor B Reward');
    });
  });

  describe('Cross-sponsor denial (core WI-04 gap)', () => {
    it('sponsor A cannot retrieve sponsor B\'s reward → 403', async () => {
      const ids = seedSponsorIsolation();
      const token = makeToken({ userId: ids.sponsorAId, email: `wi04-spa-${ids.sponsorAId}@test.com`, role: 'student' });

      const res = await request(app)
        .get(`/api/v1/sponsor/rewards/${ids.rewardBId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('sponsor B cannot retrieve sponsor A\'s reward → 403', async () => {
      const ids = seedSponsorIsolation();
      const token = makeToken({ userId: ids.sponsorBId, email: `wi04-spb-${ids.sponsorBId}@test.com`, role: 'student' });

      const res = await request(app)
        .get(`/api/v1/sponsor/rewards/${ids.rewardAId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Administrator access', () => {
    it('admin (reward.manage) can retrieve any reward → 200', async () => {
      const ids = seedSponsorIsolation();
      const token = makeToken({ userId: ids.adminId, email: `wi04-admin-${ids.adminId}@test.com`, role: 'admin' });

      const resA = await request(app)
        .get(`/api/v1/sponsor/rewards/${ids.rewardAId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data.id).toBe(ids.rewardAId);

      const resB = await request(app)
        .get(`/api/v1/sponsor/rewards/${ids.rewardBId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.id).toBe(ids.rewardBId);
    });
  });

  describe('Invalid/nonexistent resource', () => {
    it('nonexistent reward ID returns 404', async () => {
      const ids = seedSponsorIsolation();
      const token = makeToken({ userId: ids.sponsorAId, email: `wi04-spa-${ids.sponsorAId}@test.com`, role: 'student' });
      const fakeId = uuidv4();

      const res = await request(app)
        .get(`/api/v1/sponsor/rewards/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Unauthenticated access', () => {
    it('unauthenticated request returns 401', async () => {
      const ids = seedSponsorIsolation();

      const res = await request(app)
        .get(`/api/v1/sponsor/rewards/${ids.rewardAId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('Adjacent endpoints — allocations and transactions isolation', () => {
    it('sponsor A cannot view sponsor B\'s reward allocations → 403', async () => {
      const ids = seedSponsorIsolation();
      const token = makeToken({ userId: ids.sponsorAId, email: `wi04-spa-${ids.sponsorAId}@test.com`, role: 'student' });

      const res = await request(app)
        .get(`/api/v1/sponsor/rewards/${ids.rewardBId}/allocations`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('sponsor A cannot view sponsor B\'s reward transactions → 403', async () => {
      const ids = seedSponsorIsolation();
      const token = makeToken({ userId: ids.sponsorAId, email: `wi04-spa-${ids.sponsorAId}@test.com`, role: 'student' });

      const res = await request(app)
        .get(`/api/v1/sponsor/rewards/${ids.rewardBId}/transactions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('admin can view any reward allocations → 200', async () => {
      const ids = seedSponsorIsolation();
      const token = makeToken({ userId: ids.adminId, email: `wi04-admin-${ids.adminId}@test.com`, role: 'admin' });

      const res = await request(app)
        .get(`/api/v1/sponsor/rewards/${ids.rewardAId}/allocations`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Role/scope edge cases', () => {
    it('student (no reward.view_assigned) is denied → 403', async () => {
      const ids = seedSponsorIsolation();
      const token = makeToken({ userId: ids.studentId, email: `wi04-student-${ids.studentId}@test.com`, role: 'student' });

      const res = await request(app)
        .get(`/api/v1/sponsor/rewards/${ids.rewardAId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });
});
