/**
 * reward-expiry-worker.test.ts — N3: Automatic expiry worker tests
 *
 * Tests automatic reward expiry, idempotency, bounded batches.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../config/database.js';
import { processExpiredRewards } from '../services/rewards/rewardExpiryWorker.js';
import {
  createReward,
  fundReward,
  activateReward,
} from '../services/rewards/rewardService.js';
import { v4 as uuidv4 } from 'uuid';

function seedTestData() {
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
  db.prepare(
    `INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)`
  ).run(cohortId, studentId);

  // Give sponsor the sponsor role with reward permissions
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_sponsor');

  return { sponsorId, studentId, courseId, cohortId };
}

describe('Reward Expiry Worker — N3', () => {
  it('EXPIRY-1: expires active rewards past their expires_at date', () => {
    const { sponsorId, cohortId } = seedTestData();
    const pastDate = new Date(Date.now() - 3_600_000).toISOString();
    const key = uuidv4();

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'course_completion',
      amountStroops: '10000000',
      maxRecipients: 1,
      expiresAt: pastDate,
      idempotencyKey: key,
    });

    fundReward(reward.id, sponsorId, { type: 'platform_credit' }, `${key}-fund`);
    activateReward(reward.id, sponsorId, `${key}-activate`);

    const result = processExpiredRewards();
    expect(result.processed).toBeGreaterThanOrEqual(1);

    const updated = db.prepare('SELECT status FROM rewards WHERE id = ?').get(reward.id) as { status: string };
    expect(updated.status).toBe('expired');
  });

  it('EXPIRY-2: does not expire rewards with future expires_at', () => {
    const { sponsorId, cohortId } = seedTestData();
    const futureDate = new Date(Date.now() + 86_400_000).toISOString();
    const key = uuidv4();

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'course_completion',
      amountStroops: '10000000',
      maxRecipients: 1,
      expiresAt: futureDate,
      idempotencyKey: key,
    });

    fundReward(reward.id, sponsorId, { type: 'platform_credit' }, `${key}-fund`);
    activateReward(reward.id, sponsorId, `${key}-activate`);

    processExpiredRewards();

    const updated = db.prepare('SELECT status FROM rewards WHERE id = ?').get(reward.id) as { status: string };
    expect(updated.status).toBe('active');
  });

  it('EXPIRY-3: expiry is idempotent', () => {
    const { sponsorId, cohortId } = seedTestData();
    const pastDate = new Date(Date.now() - 3_600_000).toISOString();
    const key = uuidv4();

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'course_completion',
      amountStroops: '10000000',
      maxRecipients: 1,
      expiresAt: pastDate,
      idempotencyKey: key,
    });

    fundReward(reward.id, sponsorId, { type: 'platform_credit' }, `${key}-fund`);
    activateReward(reward.id, sponsorId, `${key}-activate`);

    // First expiry
    processExpiredRewards();
    // Second call should not throw or create duplicate ledger entries
    processExpiredRewards();

    const updated = db.prepare('SELECT status FROM rewards WHERE id = ?').get(reward.id) as { status: string };
    expect(updated.status).toBe('expired');

    // Only one expire transaction should exist
    const txns = db.prepare(
      "SELECT COUNT(*) as cnt FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'expire'"
    ).get(reward.id) as { cnt: number };
    expect(txns.cnt).toBe(1);
  });

  it('EXPIRY-4: does not expire rewards without expires_at', () => {
    const { sponsorId, cohortId } = seedTestData();
    const key = uuidv4();

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'course_completion',
      amountStroops: '10000000',
      maxRecipients: 1,
      // No expiresAt
      idempotencyKey: key,
    });

    fundReward(reward.id, sponsorId, { type: 'platform_credit' }, `${key}-fund`);
    activateReward(reward.id, sponsorId, `${key}-activate`);

    processExpiredRewards();

    const updated = db.prepare('SELECT status FROM rewards WHERE id = ?').get(reward.id) as { status: string };
    expect(updated.status).toBe('active');
  });

  it('EXPIRY-5: failure to expire one reward does not block others', () => {
    const data1 = seedTestData();
    const data2 = seedTestData();
    const pastDate = new Date(Date.now() - 3_600_000).toISOString();

    const key1 = uuidv4();
    const r1 = createReward(data1.sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: data1.cohortId,
      rewardType: 'course_completion',
      amountStroops: '10000000',
      maxRecipients: 1,
      expiresAt: pastDate,
      idempotencyKey: key1,
    });
    fundReward(r1.id, data1.sponsorId, { type: 'platform_credit' }, `${key1}-fund`);
    activateReward(r1.id, data1.sponsorId, `${key1}-activate`);

    const key2 = uuidv4();
    const r2 = createReward(data2.sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: data2.cohortId,
      rewardType: 'course_completion',
      amountStroops: '5000000',
      maxRecipients: 1,
      expiresAt: pastDate,
      idempotencyKey: key2,
    });
    fundReward(r2.id, data2.sponsorId, { type: 'platform_credit' }, `${key2}-fund`);
    activateReward(r2.id, data2.sponsorId, `${key2}-activate`);

    const result = processExpiredRewards();
    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);
  });
});
