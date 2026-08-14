/**
 * reward-refund-admin.test.ts — N4-N6: Admin refund review/retry/resolve API tests
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

function seedRefundScenario() {
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
  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(cohortId, sponsorId, courseId);
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);

  // Create, fund, activate, and release a reward
  const key = uuidv4();
  const reward = createReward(sponsorId, {
    scopeType: 'sponsor_cohort',
    scopeId: cohortId,
    rewardType: 'course_completion',
    amountStroops: '10000000', // 1 XLM
    maxRecipients: 1,
    idempotencyKey: key,
  });

  fundReward(reward.id, sponsorId, { type: 'platform_credit' }, `${key}-fund`);
  activateReward(reward.id, sponsorId, `${key}-activate`);

  // Mark allocation eligible and release
  const alloc = db.prepare(
    `SELECT id FROM reward_allocations WHERE reward_id = ? AND student_user_id = ?`
  ).get(reward.id, studentId) as { id: string };
  db.prepare(`UPDATE reward_allocations SET status = 'eligible', eligible_at = datetime('now') WHERE id = ?`).run(alloc.id);
  releaseAllocation(alloc.id, sponsorId, `${key}-release`);

  // Drain recipient balance to create a blocked refund scenario
  db.prepare(
    `UPDATE reward_accounts SET available_stroops = 0 WHERE user_id = ? AND account_type = 'recipient'`
  ).run(studentId);

  return { sponsorId, studentId, courseId, cohortId, rewardId: reward.id, allocationId: alloc.id };
}

function createBlockedAttempt(data: ReturnType<typeof seedRefundScenario>) {
  const attemptId = uuidv4();
  db.prepare(
    `INSERT INTO reward_refund_attempts
     (id, reward_id, allocation_id, attempted_by_user_id, attempted_amount_stroops,
      recipient_available_stroops, status)
     VALUES (?, ?, ?, ?, 10000000, 0, 'blocked')`
  ).run(attemptId, data.rewardId, data.allocationId, data.sponsorId);
  return attemptId;
}

function makeAdminUser(role: string): { userId: string; token: string } {
  const userId = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'hash', 'admin')"
  ).run(userId, `Admin ${role}`, `${userId}@test.com`);
  // Assign the specific admin role
  const roleId = role === 'admin' ? 'role_admin'
    : role === 'admin-2' ? 'role_admin2'
    : 'role_super_admin';
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, roleId);
  const token = makeToken({ userId, email: `${userId}@test.com`, role: 'admin' });
  return { userId, token };
}

function makeStudentUser(): { userId: string; token: string } {
  const userId = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
  ).run(userId, `${userId}@test.com`);
  return { userId, token: makeToken({ userId, email: `${userId}@test.com`, role: 'student' }) };
}

describe('Admin Refund Review API — N4-N6', () => {
  // ── N4: GET /admin/rewards/refund-attempts ──
  describe('GET /admin/rewards/refund-attempts', () => {
    it('REFUND-READ-1: lists blocked refund attempts with pagination', async () => {
      const data = seedRefundScenario();
      createBlockedAttempt(data);
      createBlockedAttempt(data);
      const { token } = makeAdminUser('admin');

      const res = await request(app)
        .get('/api/v1/admin/rewards/refund-attempts?page=1&limit=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('REFUND-READ-2: filters by status', async () => {
      const data = seedRefundScenario();
      createBlockedAttempt(data);
      const { token } = makeAdminUser('admin');

      const res = await request(app)
        .get('/api/v1/admin/rewards/refund-attempts?status=blocked')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((a: { status: string }) => a.status === 'blocked')).toBe(true);
    });

    it('REFUND-READ-3: student gets 403', async () => {
      const { token } = makeStudentUser();

      const res = await request(app)
        .get('/api/v1/admin/rewards/refund-attempts')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });

  // ── N5: POST /admin/rewards/refund-attempts/:id/retry ──
  describe('POST /admin/rewards/refund-attempts/:id/retry', () => {
    it('REFUND-RETRY-1: successful retry updates attempt + allocation', async () => {
      const data = seedRefundScenario();
      const attemptId = createBlockedAttempt(data);
      const { token } = makeAdminUser('admin');

      // Restore recipient balance so retry can succeed
      db.prepare(
        `UPDATE reward_accounts SET available_stroops = 10000000 WHERE user_id = ? AND account_type = 'recipient'`
      ).run(data.studentId);

      const res = await request(app)
        .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
        .set('Authorization', `Bearer ${token}`)
        .send({ idempotencyKey: uuidv4() });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
      expect(res.body.data.resolution).toBe('retried_success');

      // Allocation should be refunded
      const alloc = db.prepare('SELECT status FROM reward_allocations WHERE id = ?')
        .get(data.allocationId) as { status: string };
      expect(alloc.status).toBe('refunded');
    });

    it('REFUND-RETRY-2: already-resolved attempt returns 409', async () => {
      const data = seedRefundScenario();
      const attemptId = createBlockedAttempt(data);
      const { token, userId } = makeAdminUser('admin-2');

      // Manually resolve the attempt
      db.prepare(
        `UPDATE reward_refund_attempts SET status = 'resolved', resolution = 'waived',
         resolved_at = datetime('now'), resolved_by_user_id = ? WHERE id = ?`
      ).run(userId, attemptId);

      const res = await request(app)
        .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
        .set('Authorization', `Bearer ${token}`)
        .send({ idempotencyKey: uuidv4() });

      expect(res.status).toBe(409);
    });

    it('REFUND-RETRY-3: student gets 403', async () => {
      const data = seedRefundScenario();
      const attemptId = createBlockedAttempt(data);
      const { token } = makeStudentUser();

      const res = await request(app)
        .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
        .set('Authorization', `Bearer ${token}`)
        .send({ idempotencyKey: uuidv4() });

      expect(res.status).toBe(403);
    });
  });

  // ── N6: POST /admin/rewards/refund-attempts/:id/resolve ──
  describe('POST /admin/rewards/refund-attempts/:id/resolve', () => {
    it('REFUND-RESOLVE-1: waive creates audit log, no ledger entry', async () => {
      const data = seedRefundScenario();
      const attemptId = createBlockedAttempt(data);
      const { token } = makeAdminUser('admin-2'); // waive requires refund_resolve

      const res = await request(app)
        .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/resolve`)
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'waive', reason: 'Student left program', idempotencyKey: uuidv4() });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('resolved');
      expect(res.body.data.resolution).toBe('waived');

      // Audit log should exist
      const audit = db.prepare(
        'SELECT * FROM reward_refund_audit_log WHERE attempt_id = ?'
      ).get(attemptId) as Record<string, unknown>;
      expect(audit).toBeTruthy();
      expect(audit.action).toBe('waive');
      expect(audit.reason).toBe('Student left program');

      // No refund ledger entry should be created for waive
      const txns = db.prepare(
        "SELECT COUNT(*) as cnt FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'refund'"
      ).get(data.rewardId) as { cnt: number };
      expect(txns.cnt).toBe(0);
    });

    it('REFUND-RESOLVE-2: plain admin (not admin-2) gets 403 for waive', async () => {
      const data = seedRefundScenario();
      const attemptId = createBlockedAttempt(data);
      const { token } = makeAdminUser('admin');

      const res = await request(app)
        .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/resolve`)
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'waive', reason: 'Test', idempotencyKey: uuidv4() });

      expect(res.status).toBe(403);
    });

    it('REFUND-RESOLVE-3: escalate creates audit log', async () => {
      const data = seedRefundScenario();
      const attemptId = createBlockedAttempt(data);
      const { token } = makeAdminUser('admin'); // escalate only needs refund_review

      const res = await request(app)
        .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/resolve`)
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'escalate', reason: 'Needs higher review', idempotencyKey: uuidv4() });

      expect(res.status).toBe(200);
      expect(res.body.data.resolution).toBe('escalated');

      const audit = db.prepare(
        'SELECT * FROM reward_refund_audit_log WHERE attempt_id = ?'
      ).get(attemptId) as Record<string, unknown>;
      expect(audit.action).toBe('escalate');
    });

    it('REFUND-RESOLVE-4: cannot waive already-resolved attempt', async () => {
      const data = seedRefundScenario();
      const attemptId = createBlockedAttempt(data);
      const { token, userId } = makeAdminUser('super-admin');

      // Resolve first
      db.prepare(
        `UPDATE reward_refund_attempts SET status = 'resolved', resolution = 'escalated',
         resolved_at = datetime('now'), resolved_by_user_id = ? WHERE id = ?`
      ).run(userId, attemptId);

      const res = await request(app)
        .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/resolve`)
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'waive', reason: 'Test', idempotencyKey: uuidv4() });

      expect(res.status).toBe(409);
    });
  });

  // ── Manual outbox trigger ──
  describe('POST /admin/rewards/process-outbox', () => {
    it('OUTBOX-ADMIN-1: triggers outbox processing', async () => {
      const { token } = makeAdminUser('admin');

      const res = await request(app)
        .post('/api/v1/admin/rewards/process-outbox')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.processed).toBe('number');
    });

    it('OUTBOX-ADMIN-2: student gets 403', async () => {
      const { token } = makeStudentUser();

      const res = await request(app)
        .post('/api/v1/admin/rewards/process-outbox')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });
});
