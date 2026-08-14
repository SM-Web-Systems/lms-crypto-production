import { describe, it, expect } from 'vitest';
import './setup.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import {
  createReward,
  fundReward,
  activateReward,
  approveReward,
  cancelReward,
  releaseAllocation,
  refundAllocation,
  getReward,
  getRewardAllocations,
} from '../services/rewards/rewardService.js';
import { expireReward } from '../services/rewards/rewardService.js';
import { getAccount } from '../services/rewards/rewardBalanceService.js';
import { reconcileAccount } from '../services/rewards/rewardLedger.js';

// ──── Test Helpers ────

function seedRewardScenario(): {
  sponsorId: string;
  studentId: string;
  cohortId: string;
  courseId: string;
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

  return { sponsorId, studentId, cohortId, courseId };
}

function createFundedActiveReward(
  sponsorId: string,
  cohortId: string,
  amountStroops = '10000000',
  autoRelease = false,
): string {
  const reward = createReward(sponsorId, {
    scopeType: 'sponsor_cohort',
    scopeId: cohortId,
    rewardType: 'custom',
    amountStroops,
    autoRelease,
    idempotencyKey: `idem-${uuidv4()}`,
  });
  fundReward(reward.id, sponsorId, { type: 'platform_credit' }, `fund-${uuidv4()}`);
  activateReward(reward.id, sponsorId, `act-${uuidv4()}`);
  return reward.id;
}

function makeAllocationEligible(allocationId: string): void {
  db.prepare(
    `UPDATE reward_allocations SET status = 'eligible', eligible_at = datetime('now') WHERE id = ?`
  ).run(allocationId);
}

function setRewardApproved(rewardId: string): void {
  db.prepare(`UPDATE rewards SET status = 'approved' WHERE id = ?`).run(rewardId);
}

// ──── Tests ────

describe('R13: Cancellation, Expiry, and Refunds', () => {
  it('R-LIFE-1: Cancel before release returns reserved funds to funder available', () => {
    const { sponsorId, cohortId } = seedRewardScenario();
    const rewardId = createFundedActiveReward(sponsorId, cohortId, '10000000');

    cancelReward(rewardId, sponsorId, 'no longer needed', `cancel-${uuidv4()}`);

    const reward = getReward(rewardId)!;
    expect(reward.status).toBe('cancelled');

    const funder = getAccount(sponsorId, 'funder')!;
    expect(funder.available_stroops).toBe(10000000);
    expect(funder.reserved_stroops).toBe(0);

    // All allocations cancelled
    const allocations = getRewardAllocations(rewardId);
    for (const a of allocations) {
      expect(a.status).toBe('cancelled');
    }

    // Reconciliation matches
    const recon = reconcileAccount(sponsorId, 'funder');
    expect(recon.matches).toBe(true);
  });

  it('R-LIFE-2: Cancel after release only returns unreleased funds', () => {
    const { sponsorId, studentId, cohortId } = seedRewardScenario();

    // Create a reward with 2 students
    const studentId2 = uuidv4();
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student2', ?, 'hash', 'student')"
    ).run(studentId2, `${studentId2}@test.com`);
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId2);

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '5000000',
      maxRecipients: 2,
      autoRelease: false,
      idempotencyKey: `idem-${uuidv4()}`,
    });
    fundReward(reward.id, sponsorId, { type: 'platform_credit' }, `fund-${uuidv4()}`);
    activateReward(reward.id, sponsorId, `act-${uuidv4()}`);

    // Release first allocation
    const allocs = getRewardAllocations(reward.id);
    makeAllocationEligible(allocs[0].id);
    releaseAllocation(allocs[0].id, sponsorId, `rel-${uuidv4()}`);

    // Now cancel — should return only the unreleased portion
    cancelReward(reward.id, sponsorId, 'cancelled partially', `cancel-${uuidv4()}`);

    const updated = getReward(reward.id)!;
    expect(updated.status).toBe('cancelled');

    const funder = getAccount(sponsorId, 'funder')!;
    // Total funded: 5M * 2 = 10M; Released 5M; Cancelled should return 5M
    expect(funder.available_stroops).toBe(5000000);
    expect(funder.reserved_stroops).toBe(0);

    const recon = reconcileAccount(sponsorId, 'funder');
    expect(recon.matches).toBe(true);
  });

  it('R-LIFE-3: Expire returns reserved funds (system actor)', () => {
    const { sponsorId, cohortId } = seedRewardScenario();
    const rewardId = createFundedActiveReward(sponsorId, cohortId, '10000000');

    const result = expireReward(rewardId, `expire-${uuidv4()}`);
    expect(result.status).toBe('expired');

    const funder = getAccount(sponsorId, 'funder')!;
    expect(funder.available_stroops).toBe(10000000);
    expect(funder.reserved_stroops).toBe(0);

    // Verify system actor in ledger
    const expireEntry = db.prepare(
      `SELECT actor_type, actor_user_id FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'expire'`
    ).get(rewardId) as { actor_type: string; actor_user_id: string | null };
    expect(expireEntry.actor_type).toBe('system');
    expect(expireEntry.actor_user_id).toBeNull();

    const recon = reconcileAccount(sponsorId, 'funder');
    expect(recon.matches).toBe(true);
  });

  it('R-LIFE-4: Expire cancels pending allocations', () => {
    const { sponsorId, cohortId } = seedRewardScenario();
    const rewardId = createFundedActiveReward(sponsorId, cohortId);

    expireReward(rewardId, `expire-${uuidv4()}`);

    const allocations = getRewardAllocations(rewardId);
    for (const a of allocations) {
      expect(a.status).toBe('cancelled');
    }
  });

  it('R-LIFE-5: Expire is idempotent', () => {
    const { sponsorId, cohortId } = seedRewardScenario();
    const rewardId = createFundedActiveReward(sponsorId, cohortId);
    const idemKey = `expire-${uuidv4()}`;

    const first = expireReward(rewardId, idemKey);
    expect(first.status).toBe('expired');

    // Second call with same key returns same result
    const second = expireReward(rewardId, idemKey);
    expect(second.status).toBe('expired');

    // Balances unchanged
    const funder = getAccount(sponsorId, 'funder')!;
    expect(funder.available_stroops).toBe(10000000);
    expect(funder.reserved_stroops).toBe(0);
  });

  it('R-LIFE-6: Expire only works on active rewards', () => {
    const { sponsorId, cohortId } = seedRewardScenario();

    // Create draft — cannot expire
    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '10000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });

    expect(() => {
      expireReward(reward.id, `expire-${uuidv4()}`);
    }).toThrow(/Cannot transition/);
  });

  it('R-LIFE-7: Refund blocked on insufficient recipient balance returns 409-like response', () => {
    const { sponsorId, studentId, cohortId } = seedRewardScenario();
    const rewardId = createFundedActiveReward(sponsorId, cohortId, '10000000');

    setRewardApproved(rewardId);

    // Make allocation eligible and release
    const allocs = getRewardAllocations(rewardId);
    makeAllocationEligible(allocs[0].id);
    releaseAllocation(allocs[0].id, sponsorId, `rel-${uuidv4()}`);

    // Drain recipient balance
    const recipientAccount = getAccount(studentId, 'recipient')!;
    db.prepare('UPDATE reward_accounts SET available_stroops = 0 WHERE id = ?').run(recipientAccount.id);

    // Refund should be blocked
    const result = refundAllocation(allocs[0].id, sponsorId, `refund-${uuidv4()}`);
    expect('blocked' in result).toBe(true);
    if ('blocked' in result) {
      expect(result.blocked).toBe(true);
      expect(result.attemptId).toBeDefined();
    }
  });

  it('R-LIFE-7a: Blocked refund leaves all balances unchanged', () => {
    const { sponsorId, studentId, cohortId } = seedRewardScenario();
    const rewardId = createFundedActiveReward(sponsorId, cohortId, '10000000');

    setRewardApproved(rewardId);

    const allocs = getRewardAllocations(rewardId);
    makeAllocationEligible(allocs[0].id);
    releaseAllocation(allocs[0].id, sponsorId, `rel-${uuidv4()}`);

    // Drain recipient
    const recipientAccount = getAccount(studentId, 'recipient')!;
    db.prepare('UPDATE reward_accounts SET available_stroops = 0 WHERE id = ?').run(recipientAccount.id);

    // Snapshot balances
    const funderBefore = getAccount(sponsorId, 'funder')!;

    refundAllocation(allocs[0].id, sponsorId, `refund-${uuidv4()}`);

    // Balances unchanged
    const funderAfter = getAccount(sponsorId, 'funder')!;
    expect(funderAfter.available_stroops).toBe(funderBefore.available_stroops);
    expect(funderAfter.reserved_stroops).toBe(funderBefore.reserved_stroops);

    const recipientAfter = getAccount(studentId, 'recipient')!;
    expect(recipientAfter.available_stroops).toBe(0);
  });

  it('R-LIFE-7b: Blocked refund leaves reward/allocation state unchanged', () => {
    const { sponsorId, studentId, cohortId } = seedRewardScenario();
    const rewardId = createFundedActiveReward(sponsorId, cohortId, '10000000');

    // Transition reward to approved so aggregate can update properly
    setRewardApproved(rewardId);

    const allocs = getRewardAllocations(rewardId);
    makeAllocationEligible(allocs[0].id);
    releaseAllocation(allocs[0].id, sponsorId, `rel-${uuidv4()}`);

    const recipientAccount = getAccount(studentId, 'recipient')!;
    db.prepare('UPDATE reward_accounts SET available_stroops = 0 WHERE id = ?').run(recipientAccount.id);

    refundAllocation(allocs[0].id, sponsorId, `refund-${uuidv4()}`);

    // Reward state unchanged (released)
    const reward = getReward(rewardId)!;
    expect(reward.status).toBe('released');

    // Allocation state unchanged (released)
    const updatedAllocs = getRewardAllocations(rewardId);
    expect(updatedAllocs[0].status).toBe('released');
  });

  it('R-LIFE-7c: Blocked refund creates reward_refund_attempts record (NOT ledger entry)', () => {
    const { sponsorId, studentId, cohortId } = seedRewardScenario();
    const rewardId = createFundedActiveReward(sponsorId, cohortId, '10000000');

    setRewardApproved(rewardId);

    const allocs = getRewardAllocations(rewardId);
    makeAllocationEligible(allocs[0].id);
    releaseAllocation(allocs[0].id, sponsorId, `rel-${uuidv4()}`);

    const recipientAccount = getAccount(studentId, 'recipient')!;
    db.prepare('UPDATE reward_accounts SET available_stroops = 0 WHERE id = ?').run(recipientAccount.id);

    const result = refundAllocation(allocs[0].id, sponsorId, `refund-${uuidv4()}`);
    expect('blocked' in result).toBe(true);

    // Verify refund_attempts record exists
    const attempt = db.prepare(
      `SELECT * FROM reward_refund_attempts WHERE allocation_id = ? AND status = 'blocked'`
    ).get(allocs[0].id) as { status: string; attempted_amount_stroops: number } | undefined;
    expect(attempt).toBeDefined();
    expect(attempt!.status).toBe('blocked');
    expect(attempt!.attempted_amount_stroops).toBe(10000000);

    // No refund ledger entry
    const refundEntries = db.prepare(
      `SELECT * FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'refund'`
    ).all(rewardId);
    expect(refundEntries.length).toBe(0);
  });

  it('R-LIFE-8: Group refund → partially_refunded', () => {
    const { sponsorId, studentId, cohortId } = seedRewardScenario();

    const studentId2 = uuidv4();
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student2', ?, 'hash', 'student')"
    ).run(studentId2, `${studentId2}@test.com`);
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId2);

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '5000000',
      maxRecipients: 2,
      autoRelease: false,
      idempotencyKey: `idem-${uuidv4()}`,
    });
    fundReward(reward.id, sponsorId, { type: 'platform_credit' }, `fund-${uuidv4()}`);
    activateReward(reward.id, sponsorId, `act-${uuidv4()}`);

    // Set to approved so aggregate can transition
    setRewardApproved(reward.id);

    const allocs = getRewardAllocations(reward.id);
    makeAllocationEligible(allocs[0].id);
    makeAllocationEligible(allocs[1].id);
    releaseAllocation(allocs[0].id, sponsorId, `rel-${uuidv4()}`);
    releaseAllocation(allocs[1].id, sponsorId, `rel2-${uuidv4()}`);

    // Refund only the first
    refundAllocation(allocs[0].id, sponsorId, `refund-${uuidv4()}`);

    const updated = getReward(reward.id)!;
    expect(updated.status).toBe('partially_refunded');
  });

  it('R-LIFE-9: All released allocs refunded → refunded', () => {
    const { sponsorId, cohortId } = seedRewardScenario();
    const rewardId = createFundedActiveReward(sponsorId, cohortId, '10000000');

    // Set to approved so aggregate can transition through released → refunded
    setRewardApproved(rewardId);

    const allocs = getRewardAllocations(rewardId);
    makeAllocationEligible(allocs[0].id);
    releaseAllocation(allocs[0].id, sponsorId, `rel-${uuidv4()}`);
    refundAllocation(allocs[0].id, sponsorId, `refund-${uuidv4()}`);

    const updated = getReward(rewardId)!;
    expect(updated.status).toBe('refunded');
  });

  it('R-LIFE-10: Duplicate cancel is idempotent', () => {
    const { sponsorId, cohortId } = seedRewardScenario();
    const rewardId = createFundedActiveReward(sponsorId, cohortId, '10000000');
    const idemKey = `cancel-${uuidv4()}`;

    const first = cancelReward(rewardId, sponsorId, 'test', idemKey);
    expect(first.status).toBe('cancelled');

    const second = cancelReward(rewardId, sponsorId, 'test', idemKey);
    expect(second.status).toBe('cancelled');
  });

  it('R-LIFE-11: Expire with metadata stores system metadata', () => {
    const { sponsorId, cohortId } = seedRewardScenario();
    const rewardId = createFundedActiveReward(sponsorId, cohortId, '10000000');

    const metadata = { triggeredBy: 'scheduler', reason: 'past_expires_at' };
    expireReward(rewardId, `expire-${uuidv4()}`, metadata);

    const entry = db.prepare(
      `SELECT metadata FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'expire'`
    ).get(rewardId) as { metadata: string | null };
    expect(entry.metadata).toBeDefined();
    const parsed = JSON.parse(entry.metadata!);
    expect(parsed.triggeredBy).toBe('scheduler');
  });
});
