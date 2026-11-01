/**
 * W08-R1 Backend capability-gating integration tests
 *
 * Proves UI capability map corresponds to server permission policy.
 * Uses real HTTP endpoints with synthetic users and in-memory DB.
 *
 * W8R1-BACKEND-1: POST /teacher/rewards — reward.create required
 * W8R1-BACKEND-2: POST /teacher/classes — group.create required
 * W8R1-BACKEND-3: POST /employer/teams — group.create required
 * W8R1-BACKEND-4: POST /sponsor/rewards — reward.create required
 * W8R1-BACKEND-5: POST /teacher/rewards/:id/activate — reward.activate required
 * W8R1-BACKEND-6: POST /teacher/rewards/:id/cancel — reward.cancel required
 */

import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { v4 as uuidv4 } from 'uuid';

// ──── Seed helpers ──────────────────────────────────────────────────────────

/** Create a user with the given RBAC role; returns userId and token */
function seedUserWithRole(roleId: string): { userId: string; token: string } {
  const userId = uuidv4();
  const email = `${userId.slice(0, 8)}@test-w08r1.com`;
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'W08R1 User', ?, 'hash', 'student')",
  ).run(userId, email);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, roleId);
  const token = makeToken({ userId, email, role: 'student' });
  return { userId, token };
}

/** Create a user with a custom permission set (not via role) */
function seedUserWithPermissions(permNames: string[]): { userId: string; token: string } {
  const userId = uuidv4();
  const email = `${userId.slice(0, 8)}@test-w08r1-custom.com`;
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Custom Perm User', ?, 'hash', 'student')",
  ).run(userId, email);

  // Create a temporary role with a unique name and assign only the requested permissions.
  // roles.name is UNIQUE; use a slug derived from userId. roles has no workspace column.
  const tempRoleId = `role_tmp_${userId.slice(0, 8)}`;
  const tempRoleName = `tmp_${userId.slice(0, 8)}`;
  db.prepare(
    "INSERT OR IGNORE INTO roles (id, name, label, description) VALUES (?, ?, 'Temp Role', 'Temporary test role')",
  ).run(tempRoleId, tempRoleName);
  for (const permName of permNames) {
    const perm = db.prepare('SELECT id FROM permissions WHERE name = ?').get(permName) as { id: string } | undefined;
    if (perm) {
      db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)').run(tempRoleId, perm.id);
    }
  }
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, tempRoleId);
  const token = makeToken({ userId, email, role: 'student' });
  return { userId, token };
}

/** Seed a teacher class group owned by userId */
function seedClass(ownerId: string): string {
  const classId = uuidv4();
  db.prepare(
    "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Test Class W08R1', ?, ?)",
  ).run(classId, 'class', ownerId);
  return classId;
}

/** Seed an employer team group owned by userId */
function seedTeam(ownerId: string): string {
  const teamId = uuidv4();
  db.prepare(
    "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Test Team W08R1', ?, ?)",
  ).run(teamId, 'team', ownerId);
  return teamId;
}

/** Seed a minimal course (required as FK for sponsor_cohorts) */
function seedCourse(): string {
  const courseId = uuidv4();
  db.prepare(
    "INSERT INTO courses (id, title, course_code, sections) VALUES (?, 'W08R1 Test Course', ?, '[]')",
  ).run(courseId, `W08R1-${courseId.slice(0, 6)}`);
  return courseId;
}

/** Seed a sponsor cohort owned by userId.
 *  Sponsor cohorts live in sponsor_cohorts, not user_groups. */
function seedCohort(ownerId: string): string {
  const cohortId = uuidv4();
  const courseId = seedCourse();
  db.prepare(
    "INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier, status, created_at) VALUES (?, 'Test Cohort W08R1', ?, ?, 'free', 'draft', datetime('now'))",
  ).run(cohortId, ownerId, courseId);
  return cohortId;
}

/** Create a funded reward for a teacher class — returns rewardId.
 *  platform_credit is intentionally not provisioned (W01-R1 fails closed).
 *  We create the reward via the API then set status directly so lifecycle
 *  tests (activate, cancel) can exercise the permission checks. */
async function seedFundedTeacherReward(teacherToken: string, classId: string): Promise<string> {
  const createRes = await request(app)
    .post('/api/v1/teacher/rewards')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      scopeId: classId,
      rewardType: 'custom',
      amountStroops: '10000000',
      idempotencyKey: `seed-${uuidv4()}`,
    });
  if (createRes.status !== 201) throw new Error(`Seed create failed: ${createRes.status}`);

  const rewardId = createRes.body.data.id as string;
  // Bypass the API fund step — platform_credit has no provisioning mechanism.
  db.prepare("UPDATE rewards SET status = 'funded', funded_at = datetime('now') WHERE id = ?").run(rewardId);
  return rewardId;
}

// ──── Tests ─────────────────────────────────────────────────────────────────

describe('W08-R1 Backend — capability gating integration', () => {
  // ── POST /teacher/rewards — reward.create ───────────────────────────────

  describe('W8R1-BACKEND-1: POST /teacher/rewards — reward.create required', () => {
    it('POSITIVE: user with reward.create gets 201', async () => {
      const { userId, token } = seedUserWithRole('role_teacher');
      const classId = seedClass(userId);

      const res = await request(app)
        .post('/api/v1/teacher/rewards')
        .set('Authorization', `Bearer ${token}`)
        .send({
          scopeId: classId,
          rewardType: 'custom',
          amountStroops: '5000000',
          idempotencyKey: `ok-${uuidv4()}`,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.status).toBe('draft');
    });

    it('NEGATIVE: user with only reward.view_assigned gets 403', async () => {
      // This is the exact failure case: view-only user must be rejected server-side
      const { userId, token } = seedUserWithPermissions(['reward.view_assigned']);
      const classId = seedClass(userId);

      const res = await request(app)
        .post('/api/v1/teacher/rewards')
        .set('Authorization', `Bearer ${token}`)
        .send({
          scopeId: classId,
          rewardType: 'custom',
          amountStroops: '5000000',
          idempotencyKey: `deny-${uuidv4()}`,
        });

      expect(res.status).toBe(403);
    });

    it('NEGATIVE: unauthenticated request gets 401', async () => {
      const res = await request(app)
        .post('/api/v1/teacher/rewards')
        .send({ scopeId: 'x', rewardType: 'custom', amountStroops: '1', idempotencyKey: 'k' });

      expect(res.status).toBe(401);
    });
  });

  // ── POST /teacher/classes — group.create ────────────────────────────────

  describe('W8R1-BACKEND-2: POST /teacher/classes — group.create required', () => {
    it('POSITIVE: teacher (role_teacher) with group.create gets 201', async () => {
      const { token } = seedUserWithRole('role_teacher');

      const res = await request(app)
        .post('/api/v1/teacher/classes')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Physics 101' });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
    });

    it('NEGATIVE: user with only group.manage but no group.create gets 403', async () => {
      // Exact W08-R1 failure: group.manage is insufficient for class creation
      const { token } = seedUserWithPermissions(['group.manage', 'student.view_assigned', 'reward.view_assigned']);

      const res = await request(app)
        .post('/api/v1/teacher/classes')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'History 201' });

      expect(res.status).toBe(403);
    });
  });

  // ── POST /employer/teams — group.create ─────────────────────────────────

  describe('W8R1-BACKEND-3: POST /employer/teams — group.create required', () => {
    it('POSITIVE: employer (role_employer) with group.create gets 201', async () => {
      const { token } = seedUserWithRole('role_employer');

      const res = await request(app)
        .post('/api/v1/employer/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Alpha Squad' });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
    });

    it('NEGATIVE: user with only group.manage but no group.create gets 403', async () => {
      const { token } = seedUserWithPermissions(['group.manage', 'cohort.view_own', 'reward.view_assigned']);

      const res = await request(app)
        .post('/api/v1/employer/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Beta Squad' });

      expect(res.status).toBe(403);
    });
  });

  // ── POST /sponsor/rewards — reward.create ───────────────────────────────

  describe('W8R1-BACKEND-4: POST /sponsor/rewards — reward.create required', () => {
    it('POSITIVE: sponsor with reward.create gets 201', async () => {
      const { userId, token } = seedUserWithRole('role_sponsor');
      const cohortId = seedCohort(userId);

      const res = await request(app)
        .post('/api/v1/sponsor/rewards')
        .set('Authorization', `Bearer ${token}`)
        .send({
          scopeId: cohortId,
          rewardType: 'custom',
          amountStroops: '5000000',
          idempotencyKey: `ok-sponsor-${uuidv4()}`,
        });

      expect(res.status).toBe(201);
    });

    it('NEGATIVE: user with only reward.view_assigned gets 403', async () => {
      const { userId, token } = seedUserWithPermissions(['reward.view_assigned', 'cohort.view_own']);
      const cohortId = seedCohort(userId);

      const res = await request(app)
        .post('/api/v1/sponsor/rewards')
        .set('Authorization', `Bearer ${token}`)
        .send({
          scopeId: cohortId,
          rewardType: 'custom',
          amountStroops: '5000000',
          idempotencyKey: `deny-sponsor-${uuidv4()}`,
        });

      expect(res.status).toBe(403);
    });
  });

  // ── POST /teacher/rewards/:id/activate — reward.activate ────────────────

  describe('W8R1-BACKEND-5: POST /teacher/rewards/:id/activate — reward.activate required', () => {
    it('POSITIVE: teacher with reward.activate can activate a funded reward', async () => {
      const { userId, token } = seedUserWithRole('role_teacher');
      const classId = seedClass(userId);
      const rewardId = await seedFundedTeacherReward(token, classId);

      const res = await request(app)
        .post(`/api/v1/teacher/rewards/${rewardId}/activate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ idempotencyKey: `act-ok-${uuidv4()}` });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });

    it('NEGATIVE: user with only reward.view_assigned gets 403 on activate', async () => {
      const { userId: teacherId, token: teacherToken } = seedUserWithRole('role_teacher');
      const classId = seedClass(teacherId);
      const rewardId = await seedFundedTeacherReward(teacherToken, classId);

      // New user with view_assigned only attempts to activate
      const { token: viewToken } = seedUserWithPermissions(['reward.view_assigned']);

      const res = await request(app)
        .post(`/api/v1/teacher/rewards/${rewardId}/activate`)
        .set('Authorization', `Bearer ${viewToken}`)
        .send({ idempotencyKey: `act-deny-${uuidv4()}` });

      expect(res.status).toBe(403);
    });
  });

  // ── POST /teacher/rewards/:id/cancel — reward.cancel ────────────────────

  describe('W8R1-BACKEND-6: POST /teacher/rewards/:id/cancel — reward.cancel required', () => {
    it('NEGATIVE: user with only reward.view_assigned gets 403 on cancel', async () => {
      const { userId: teacherId, token: teacherToken } = seedUserWithRole('role_teacher');
      const classId = seedClass(teacherId);

      // Create a funded reward
      const rewardId = await seedFundedTeacherReward(teacherToken, classId);

      const { token: viewToken } = seedUserWithPermissions(['reward.view_assigned']);

      const res = await request(app)
        .post(`/api/v1/teacher/rewards/${rewardId}/cancel`)
        .set('Authorization', `Bearer ${viewToken}`)
        .send({ reason: 'test', idempotencyKey: `cancel-deny-${uuidv4()}` });

      expect(res.status).toBe(403);
    });
  });
});
