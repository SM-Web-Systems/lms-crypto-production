import { describe, it, expect } from 'vitest';
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
  listRewards,
  getRewardAllocations,
  getRewardTransactions,
} from '../services/rewards/rewardService.js';
import { getOrCreateAccount } from '../services/rewards/rewardBalanceService.js';
import { RewardError } from '../services/rewards/rewardErrors.js';

function createUser(role = 'student'): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test', ?, 'hash', ?)"
  ).run(id, `${id}@test.com`, role);
  return id;
}

function createCohort(sponsorId: string): { cohortId: string; courseId: string } {
  const courseId = uuidv4();
  const cohortId = uuidv4();
  const code = `C-${courseId.slice(0, 8)}`;
  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, code);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(cohortId, sponsorId, courseId);
  return { cohortId, courseId };
}

function addCohortMember(cohortId: string, userId: string): void {
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, userId);
}

function createParentLink(parentId: string, childId: string): void {
  db.prepare(
    "INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')"
  ).run(uuidv4(), parentId, childId);
}

describe('Reward Orchestration Service', () => {
  it('R-ORCH-1: createReward creates a draft reward', () => {
    const sponsor = createUser('admin');
    const { cohortId } = createCohort(sponsor);

    const reward = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '10000000', // 1 XLM
      idempotencyKey: `idem-${uuidv4()}`,
    });

    expect(reward.status).toBe('draft');
    expect(reward.creator_user_id).toBe(sponsor);
    expect(reward.amount_stroops).toBe(10000000);
  });

  it('R-ORCH-2: createReward is idempotent', () => {
    const sponsor = createUser('admin');
    const { cohortId } = createCohort(sponsor);
    const key = `idem-${uuidv4()}`;

    const r1 = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '10000000',
      idempotencyKey: key,
    });
    const r2 = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '10000000',
      idempotencyKey: key,
    });

    expect(r1.id).toBe(r2.id);
  });

  it('R-ORCH-3: createReward rejects invalid scope', () => {
    const sponsor = createUser('admin');
    const other = createUser('admin');
    const { cohortId } = createCohort(sponsor);

    expect(() => createReward(other, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '10000000',
      idempotencyKey: `idem-${uuidv4()}`,
    })).toThrow(RewardError);
  });

  it('R-ORCH-4: fundReward transitions draft → funded with 2 ledger entries', () => {
    const sponsor = createUser('admin');
    const { cohortId } = createCohort(sponsor);

    const reward = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '10000000',
      maxRecipients: 2,
      idempotencyKey: `idem-${uuidv4()}`,
    });

    const funded = fundReward(reward.id, sponsor, { type: 'admin_grant' }, `fund-${uuidv4()}`);
    expect(funded.status).toBe('funded');

    // Check funder account: available should be 0, reserved should be 20000000 (10M * 2)
    const account = getOrCreateAccount(sponsor, 'funder', 'XLM');
    expect(account.reserved_stroops).toBe(20000000);

    // Check ledger entries
    const txns = getRewardTransactions(reward.id);
    const fundTxns = txns.filter((t: any) => t.transaction_type === 'fund');
    const reserveTxns = txns.filter((t: any) => t.transaction_type === 'reserve');
    expect(fundTxns).toHaveLength(1);
    expect(reserveTxns).toHaveLength(1);
  });

  it('R-ORCH-5: activateReward creates audience snapshot and allocations', () => {
    const sponsor = createUser('admin');
    const student1 = createUser();
    const student2 = createUser();
    const { cohortId } = createCohort(sponsor);
    addCohortMember(cohortId, student1);
    addCohortMember(cohortId, student2);

    const reward = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '5000000',
      maxRecipients: 2,
      idempotencyKey: `idem-${uuidv4()}`,
    });

    fundReward(reward.id, sponsor, { type: 'admin_grant' }, `fund-${uuidv4()}`);
    const activated = activateReward(reward.id, sponsor, `act-${uuidv4()}`);

    expect(activated.status).toBe('active');

    const allocations = getRewardAllocations(reward.id);
    expect(allocations).toHaveLength(2);
    expect(allocations.every(a => a.status === 'pending')).toBe(true);
  });

  it('R-ORCH-6: releaseAllocation moves funds to recipient', () => {
    const sponsor = createUser('admin');
    const student = createUser();
    const { cohortId } = createCohort(sponsor);
    addCohortMember(cohortId, student);

    const reward = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '5000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });

    fundReward(reward.id, sponsor, { type: 'admin_grant' }, `fund-${uuidv4()}`);
    activateReward(reward.id, sponsor, `act-${uuidv4()}`);

    // Mark allocation as eligible first
    const allocations = getRewardAllocations(reward.id);
    db.prepare(`UPDATE reward_allocations SET status = 'eligible' WHERE id = ?`).run(allocations[0].id);

    const released = releaseAllocation(allocations[0].id, sponsor, `rel-${uuidv4()}`);
    expect(released.status).toBe('released');

    // Check recipient account
    const recipientAccount = getOrCreateAccount(student, 'recipient', 'XLM');
    expect(recipientAccount.available_stroops).toBe(5000000);
  });

  it('R-ORCH-7: cancelReward returns reserved funds and cancels allocations', () => {
    const sponsor = createUser('admin');
    const student = createUser();
    const { cohortId } = createCohort(sponsor);
    addCohortMember(cohortId, student);

    const reward = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '5000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });

    fundReward(reward.id, sponsor, { type: 'admin_grant' }, `fund-${uuidv4()}`);
    activateReward(reward.id, sponsor, `act-${uuidv4()}`);

    const cancelled = cancelReward(reward.id, sponsor, 'Testing cancellation', `cancel-${uuidv4()}`);
    expect(cancelled.status).toBe('cancelled');

    // Funder reserved should be 0, available should have the funds back
    const account = getOrCreateAccount(sponsor, 'funder', 'XLM');
    expect(account.reserved_stroops).toBe(0);
    expect(account.available_stroops).toBe(5000000);

    // All allocations should be cancelled
    const allocations = getRewardAllocations(reward.id);
    expect(allocations.every(a => a.status === 'cancelled')).toBe(true);
  });

  it('R-ORCH-8: refundAllocation moves funds back to funder', () => {
    const sponsor = createUser('admin');
    const student = createUser();
    const { cohortId } = createCohort(sponsor);
    addCohortMember(cohortId, student);

    const reward = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '5000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });

    fundReward(reward.id, sponsor, { type: 'admin_grant' }, `fund-${uuidv4()}`);
    activateReward(reward.id, sponsor, `act-${uuidv4()}`);

    const allocations = getRewardAllocations(reward.id);
    db.prepare(`UPDATE reward_allocations SET status = 'eligible' WHERE id = ?`).run(allocations[0].id);
    releaseAllocation(allocations[0].id, sponsor, `rel-${uuidv4()}`);

    const result = refundAllocation(allocations[0].id, sponsor, `refund-${uuidv4()}`);
    expect('blocked' in result).toBe(false);
    expect((result as any).status).toBe('refunded');
  });

  it('R-ORCH-9: refundAllocation blocks when recipient has insufficient balance', () => {
    const sponsor = createUser('admin');
    const student = createUser();
    const { cohortId } = createCohort(sponsor);
    addCohortMember(cohortId, student);

    const reward = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '5000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });

    fundReward(reward.id, sponsor, { type: 'admin_grant' }, `fund-${uuidv4()}`);
    activateReward(reward.id, sponsor, `act-${uuidv4()}`);

    const allocations = getRewardAllocations(reward.id);
    db.prepare(`UPDATE reward_allocations SET status = 'eligible' WHERE id = ?`).run(allocations[0].id);
    releaseAllocation(allocations[0].id, sponsor, `rel-${uuidv4()}`);

    // Drain recipient balance
    const recipientAccount = getOrCreateAccount(student, 'recipient', 'XLM');
    db.prepare(`UPDATE reward_accounts SET available_stroops = '0' WHERE id = ?`).run(recipientAccount.id);

    const result = refundAllocation(allocations[0].id, sponsor, `refund-${uuidv4()}`);
    expect('blocked' in result && result.blocked).toBe(true);
  });

  it('R-ORCH-10: listRewards returns rewards for a scope', () => {
    const sponsor = createUser('admin');
    const { cohortId } = createCohort(sponsor);

    createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '10000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });

    createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '20000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });

    const rewards = listRewards('sponsor_cohort', cohortId, sponsor);
    expect(rewards).toHaveLength(2);
  });

  it('R-ORCH-11: full lifecycle draft → funded → active → release → refund', () => {
    const parent = createUser('admin');
    const child = createUser();
    createParentLink(parent, child);

    const reward = createReward(parent, {
      scopeType: 'parent_child',
      scopeId: child,
      rewardType: 'custom',
      amountStroops: '1000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });
    expect(reward.status).toBe('draft');

    const funded = fundReward(reward.id, parent, { type: 'admin_grant' }, `fund-${uuidv4()}`);
    expect(funded.status).toBe('funded');

    const activated = activateReward(reward.id, parent, `act-${uuidv4()}`);
    expect(activated.status).toBe('active');

    const allocations = getRewardAllocations(reward.id);
    expect(allocations).toHaveLength(1);
    expect(allocations[0].student_user_id).toBe(child);

    // Make eligible and release
    db.prepare(`UPDATE reward_allocations SET status = 'eligible' WHERE id = ?`).run(allocations[0].id);
    const released = releaseAllocation(allocations[0].id, parent, `rel-${uuidv4()}`);
    expect(released.status).toBe('released');

    // Refund
    const refunded = refundAllocation(allocations[0].id, parent, `refund-${uuidv4()}`);
    expect('blocked' in refunded).toBe(false);
    expect((refunded as any).status).toBe('refunded');
  });

  it('R-ORCH-12: fundReward is idempotent', () => {
    const sponsor = createUser('admin');
    const { cohortId } = createCohort(sponsor);

    const reward = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'custom',
      amountStroops: '10000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });

    const fundKey = `fund-${uuidv4()}`;
    const r1 = fundReward(reward.id, sponsor, { type: 'admin_grant' }, fundKey);
    const r2 = fundReward(reward.id, sponsor, { type: 'admin_grant' }, fundKey);
    expect(r1.id).toBe(r2.id);
    expect(r2.status).toBe('funded');
  });
});
