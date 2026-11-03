/**
 * reward-allocation-cap.test.ts
 *
 * W03 — Allocation cap enforcement, funded-capacity contract, null-cap policy,
 *        below-cap aggregate status fix, invalid max_recipients rejection.
 *
 * Baseline: e306cf9 (W02 closure follow-up, PR #116)
 * Branch:   codex/w03-allocation-cap
 */
import { describe, it, expect } from 'vitest';
import './setup.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import {
  createReward,
  fundReward,
  activateReward,
  getRewardAllocations,
} from '../services/rewards/rewardService.js';
import { getAccount } from '../services/rewards/rewardBalanceService.js';
import { deriveAggregateStatus } from '../services/rewards/rewardStateMachine.js';

// ──────────────────────────────────────────────
// Fixture helpers
// ──────────────────────────────────────────────

function makeSponsor(): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Sponsor', ?, 'hash', 'admin')"
  ).run(id, `${id}@test.com`);
  return id;
}

/** Create an independent admin who can fund rewards (W01-R1: must not be the reward creator). */
function makeAdmin(): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin', ?, 'hash', 'admin')"
  ).run(id, `${id}@test.com`);
  return id;
}

function makeStudent(): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
  ).run(id, `${id}@test.com`);
  return id;
}

function makeCohortWithMembers(sponsorId: string, memberCount: number): { cohortId: string; studentIds: string[] } {
  const courseId = uuidv4();
  const cohortId = uuidv4();
  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(cohortId, sponsorId, courseId);
  const studentIds: string[] = [];
  for (let i = 0; i < memberCount; i++) {
    const sid = makeStudent();
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, sid);
    studentIds.push(sid);
  }
  return { cohortId, studentIds };
}

interface FundedScenario {
  rewardId: string;
  sponsorId: string;
  cohortId: string;
  studentIds: string[];
}

/** Create a funded reward with a given cap and audience size.
 *  W01-R1: funding actor (adminId) must differ from reward creator (sponsorId). */
function seedFundedReward(maxRecipients: number | null, audienceSize: number): FundedScenario {
  const sponsorId = makeSponsor();
  const adminId = makeAdmin();          // independent funder
  const { cohortId, studentIds } = makeCohortWithMembers(sponsorId, audienceSize);
  const reward = createReward(sponsorId, {
    scopeType: 'sponsor_cohort',
    scopeId: cohortId,
    rewardType: 'course_completion',
    amountStroops: '100',
    maxRecipients: maxRecipients ?? undefined,
    idempotencyKey: uuidv4(),
  });
  fundReward(reward.id, adminId, { type: 'admin_grant' }, uuidv4());
  return { rewardId: reward.id, sponsorId, cohortId, studentIds };
}

function getReservedBalance(userId: string): number {
  const acct = getAccount(userId, 'funder', 'XLM');
  return acct ? Number(acct.reserved_stroops) : 0;
}

// ──────────────────────────────────────────────
// D1 — Cap enforcement at activation
// ──────────────────────────────────────────────

describe('W03 D1 — Cap enforcement at activation', () => {
  it('CAP-ENFORCE-1: cap=1, audience=3 → 400 AUDIENCE_EXCEEDS_CAP', () => {
    const { rewardId, sponsorId } = seedFundedReward(1, 3);
    expect(() => activateReward(rewardId, sponsorId, uuidv4())).toThrow(
      expect.objectContaining({ code: 'AUDIENCE_EXCEEDS_CAP' })
    );
  });

  it('CAP-ENFORCE-2: failed activation leaves reward funded, no allocations, no snapshot, reservation unchanged', () => {
    const { rewardId, sponsorId } = seedFundedReward(1, 3);
    const reservedBefore = getReservedBalance(sponsorId);
    try { activateReward(rewardId, sponsorId, uuidv4()); } catch { /* expected */ }
    const row = db.prepare('SELECT status FROM rewards WHERE id = ?').get(rewardId) as { status: string };
    const allocs = db.prepare('SELECT id FROM reward_allocations WHERE reward_id = ?').all(rewardId);
    const snap = db.prepare('SELECT id FROM reward_audience_snapshots WHERE reward_id = ?').all(rewardId);
    expect(row.status).toBe('funded');
    expect(allocs).toHaveLength(0);
    expect(snap).toHaveLength(0);
    expect(getReservedBalance(sponsorId)).toBe(reservedBefore);
  });

  it('CAP-ENFORCE-3: cap=2, audience=2 (equal to cap) → success, 2 allocations, correct amounts', () => {
    const { rewardId, sponsorId } = seedFundedReward(2, 2);
    const result = activateReward(rewardId, sponsorId, uuidv4());
    expect(result.status).toBe('active');
    const allocs = getRewardAllocations(rewardId);
    expect(allocs).toHaveLength(2);
    for (const a of allocs) {
      expect(Number(a.amount_stroops)).toBe(100);
    }
  });

  it('CAP-BELOW-1: cap=5, audience=3 (below cap) → success, exactly 3 allocations created', () => {
    const { rewardId, sponsorId } = seedFundedReward(5, 3);
    const result = activateReward(rewardId, sponsorId, uuidv4());
    expect(result.status).toBe('active');
    expect(getRewardAllocations(rewardId)).toHaveLength(3);
  });

  it('CAP-BELOW-2: cap=5, audience=3, all 3 released → deriveAggregateStatus returns released (not partially_released)', () => {
    const { rewardId, sponsorId } = seedFundedReward(5, 3);
    activateReward(rewardId, sponsorId, uuidv4());
    // Release all 3 allocations directly
    db.prepare("UPDATE reward_allocations SET status = 'released' WHERE reward_id = ?").run(rewardId);
    const allocRows = db.prepare('SELECT status FROM reward_allocations WHERE reward_id = ?')
      .all(rewardId) as Array<{ status: string }>;
    // With fix: total = allocations.length (3); terminal(3) === total(3) → released
    // Without fix: total = maxRecipients (5); terminal(3) ≠ total(5) → partially_released
    expect(deriveAggregateStatus(allocRows as any)).toBe('released');
  });
});

// ──────────────────────────────────────────────
// D1 — Null-cap policy
// ──────────────────────────────────────────────

describe('W03 — Null-cap policy (effective cap = 1)', () => {
  it('CAP-NULL-1: null cap, audience=1 → activates (effective cap matches funding)', () => {
    const { rewardId, sponsorId } = seedFundedReward(null, 1);
    const result = activateReward(rewardId, sponsorId, uuidv4());
    expect(result.status).toBe('active');
    expect(getRewardAllocations(rewardId)).toHaveLength(1);
  });

  it('CAP-NULL-2: null cap, audience=2 → 400 AUDIENCE_EXCEEDS_CAP (funded for 1)', () => {
    const { rewardId, sponsorId } = seedFundedReward(null, 2);
    expect(() => activateReward(rewardId, sponsorId, uuidv4())).toThrow(
      expect.objectContaining({ code: 'AUDIENCE_EXCEEDS_CAP' })
    );
  });

  it('CAP-NULL-3: null cap, 1 allocation released → deriveAggregateStatus returns released', () => {
    const { rewardId, sponsorId } = seedFundedReward(null, 1);
    activateReward(rewardId, sponsorId, uuidv4());
    db.prepare("UPDATE reward_allocations SET status = 'released' WHERE reward_id = ?").run(rewardId);
    const allocRows = db.prepare('SELECT status FROM reward_allocations WHERE reward_id = ?')
      .all(rewardId) as Array<{ status: string }>;
    expect(deriveAggregateStatus(allocRows as any)).toBe('released');
  });
});

// ──────────────────────────────────────────────
// D2 — Invalid max_recipients at creation
// ──────────────────────────────────────────────

describe('W03 D2 — Invalid max_recipients at creation boundary', () => {
  function makeSponsorCohort(): { sponsorId: string; cohortId: string } {
    const sponsorId = makeSponsor();
    const { cohortId } = makeCohortWithMembers(sponsorId, 1);
    return { sponsorId, cohortId };
  }

  function tryCreate(maxRecipients: unknown, sponsorId: string, cohortId: string) {
    return createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'course_completion',
      amountStroops: '100',
      maxRecipients: maxRecipients as number,
      idempotencyKey: uuidv4(),
    });
  }

  it('CAP-INVALID-1: max_recipients=0 → INVALID_RECIPIENT_COUNT', () => {
    const { sponsorId, cohortId } = makeSponsorCohort();
    expect(() => tryCreate(0, sponsorId, cohortId)).toThrow(
      expect.objectContaining({ code: 'INVALID_RECIPIENT_COUNT' })
    );
  });

  it('CAP-INVALID-2: max_recipients=-1 → INVALID_RECIPIENT_COUNT', () => {
    const { sponsorId, cohortId } = makeSponsorCohort();
    expect(() => tryCreate(-1, sponsorId, cohortId)).toThrow(
      expect.objectContaining({ code: 'INVALID_RECIPIENT_COUNT' })
    );
  });

  it('CAP-INVALID-3: max_recipients=3.5 → INVALID_RECIPIENT_COUNT', () => {
    const { sponsorId, cohortId } = makeSponsorCohort();
    expect(() => tryCreate(3.5, sponsorId, cohortId)).toThrow(
      expect.objectContaining({ code: 'INVALID_RECIPIENT_COUNT' })
    );
  });

  it('CAP-INVALID-4: max_recipients="abc" → INVALID_RECIPIENT_COUNT', () => {
    const { sponsorId, cohortId } = makeSponsorCohort();
    expect(() => tryCreate('abc', sponsorId, cohortId)).toThrow(
      expect.objectContaining({ code: 'INVALID_RECIPIENT_COUNT' })
    );
  });

  it('CAP-INVALID-5: max_recipients=10001 → INVALID_RECIPIENT_COUNT (exceeds MAX_RECIPIENTS)', () => {
    const { sponsorId, cohortId } = makeSponsorCohort();
    expect(() => tryCreate(10001, sponsorId, cohortId)).toThrow(
      expect.objectContaining({ code: 'INVALID_RECIPIENT_COUNT' })
    );
  });

  it('CAP-INVALID-6: max_recipients=10000 → success (at boundary MAX_RECIPIENTS)', () => {
    const { sponsorId, cohortId } = makeSponsorCohort();
    expect(() => tryCreate(10000, sponsorId, cohortId)).not.toThrow();
  });

  it('CAP-INVALID-7: max_recipients=null → success (null deferred, effective cap=1 applied at activation)', () => {
    const { sponsorId, cohortId } = makeSponsorCohort();
    expect(() => tryCreate(null, sponsorId, cohortId)).not.toThrow();
  });
});

// ──────────────────────────────────────────────
// Audience membership dynamics
// ──────────────────────────────────────────────

describe('W03 — Audience membership dynamics', () => {
  it('CAP-AUD-1: empty audience → NO_AUDIENCE (pre-existing behavior preserved)', () => {
    const sponsorId = makeSponsor();
    const courseId = uuidv4();
    const cohortId = uuidv4();
    db.prepare(
      `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'desc', ?)`
    ).run(courseId, `C-${courseId.slice(0, 8)}`);
    db.prepare(
      `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Empty')`
    ).run(cohortId, sponsorId, courseId);
    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'course_completion',
      amountStroops: '100',
      maxRecipients: 1,
      idempotencyKey: uuidv4(),
    });
    fundReward(reward.id, makeAdmin(), { type: 'admin_grant' }, uuidv4());
    expect(() => activateReward(reward.id, sponsorId, uuidv4())).toThrow(
      expect.objectContaining({ code: 'NO_AUDIENCE' })
    );
  });

  it('CAP-AUD-2: duplicate cohort member entries → no duplicate allocations (INSERT OR IGNORE)', () => {
    const sponsorId = makeSponsor();
    const courseId = uuidv4();
    const cohortId = uuidv4();
    db.prepare(
      `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'desc', ?)`
    ).run(courseId, `C-${courseId.slice(0, 8)}`);
    db.prepare(
      `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Cohort')`
    ).run(cohortId, sponsorId, courseId);
    const studentId = makeStudent();
    // cohort_members has a unique constraint so OR IGNORE dedups here too
    db.prepare('INSERT OR IGNORE INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);
    db.prepare('INSERT OR IGNORE INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);
    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'course_completion',
      amountStroops: '100',
      maxRecipients: 1,
      idempotencyKey: uuidv4(),
    });
    fundReward(reward.id, makeAdmin(), { type: 'admin_grant' }, uuidv4());
    activateReward(reward.id, sponsorId, uuidv4());
    expect(getRewardAllocations(reward.id)).toHaveLength(1);
  });

  it('CAP-AUD-3: member joins cohort after funding, before activation → is included in audience', () => {
    const sponsorId = makeSponsor();
    const courseId = uuidv4();
    const cohortId = uuidv4();
    db.prepare(
      `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'desc', ?)`
    ).run(courseId, `C-${courseId.slice(0, 8)}`);
    db.prepare(
      `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Cohort')`
    ).run(cohortId, sponsorId, courseId);
    const s1 = makeStudent();
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, s1);
    // Create and fund with cap=2
    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'course_completion',
      amountStroops: '100',
      maxRecipients: 2,
      idempotencyKey: uuidv4(),
    });
    fundReward(reward.id, makeAdmin(), { type: 'admin_grant' }, uuidv4());
    // Add second member AFTER funding
    const s2 = makeStudent();
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, s2);
    // Activate: both members counted, cap=2 → success
    const result = activateReward(reward.id, sponsorId, uuidv4());
    expect(result.status).toBe('active');
    expect(getRewardAllocations(reward.id)).toHaveLength(2);
  });

  it('CAP-AUD-4: member joins cohort AFTER activation → snapshot and allocations unchanged', () => {
    const { rewardId, sponsorId, cohortId } = seedFundedReward(2, 2);
    activateReward(rewardId, sponsorId, uuidv4());
    const snapBefore = (db.prepare('SELECT id FROM reward_audience_snapshots WHERE reward_id = ?').all(rewardId) as []).length;
    const allocBefore = getRewardAllocations(rewardId).length;
    // Add late joiner
    const lateJoiner = makeStudent();
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, lateJoiner);
    // Repeat activation returns cached row (W02 fast-return)
    activateReward(rewardId, sponsorId, uuidv4());
    const snapAfter = (db.prepare('SELECT id FROM reward_audience_snapshots WHERE reward_id = ?').all(rewardId) as []).length;
    const allocAfter = getRewardAllocations(rewardId).length;
    expect(snapAfter).toBe(snapBefore);
    expect(allocAfter).toBe(allocBefore);
  });
});

// ──────────────────────────────────────────────
// Replay / idempotency
// ──────────────────────────────────────────────

describe('W03 — Replay and idempotency', () => {
  it('CAP-RPT-1: repeated activation on already-active reward returns same row, no new allocations', () => {
    const { rewardId, sponsorId } = seedFundedReward(1, 1);
    const r1 = activateReward(rewardId, sponsorId, uuidv4());
    const r2 = activateReward(rewardId, sponsorId, uuidv4());
    expect(r1.id).toBe(r2.id);
    expect(r2.status).toBe('active');
    expect(getRewardAllocations(rewardId)).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────
// Monetary backing isolation
// ──────────────────────────────────────────────

describe('W03 — Monetary backing isolation (pooled funder)', () => {
  it('CAP-POOL-1: reward A cap exceeded → reward B activation unaffected; A reservation intact', () => {
    const sponsorId = makeSponsor();
    // Reward A: cap=1, 3 members → will fail activation
    const { cohortId: cohortA } = makeCohortWithMembers(sponsorId, 3);
    const rA = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortA,
      rewardType: 'course_completion',
      amountStroops: '100',
      maxRecipients: 1,
      idempotencyKey: uuidv4(),
    });
    fundReward(rA.id, makeAdmin(), { type: 'admin_grant' }, uuidv4());
    // Reward B: cap=1, 1 member → will succeed
    const { cohortId: cohortB } = makeCohortWithMembers(sponsorId, 1);
    const rB = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortB,
      rewardType: 'course_completion',
      amountStroops: '200',
      maxRecipients: 1,
      idempotencyKey: uuidv4(),
    });
    fundReward(rB.id, makeAdmin(), { type: 'admin_grant' }, uuidv4());
    // Activation of A fails
    expect(() => activateReward(rA.id, sponsorId, uuidv4())).toThrow(
      expect.objectContaining({ code: 'AUDIENCE_EXCEEDS_CAP' })
    );
    // Activation of B succeeds — A's failure did not corrupt shared funder state
    const resultB = activateReward(rB.id, sponsorId, uuidv4());
    expect(resultB.status).toBe('active');
    expect(getRewardAllocations(rB.id)).toHaveLength(1);
    // Reward A remains funded (reservation intact)
    const rowA = db.prepare('SELECT status FROM rewards WHERE id = ?').get(rA.id) as { status: string };
    expect(rowA.status).toBe('funded');
    // A has 0 allocations
    expect(db.prepare('SELECT id FROM reward_allocations WHERE reward_id = ?').all(rA.id)).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// Authorization
// ──────────────────────────────────────────────

describe('W03 — Authorization (W02 behavior preserved)', () => {
  it('CAP-AUTH-1: unrelated sponsor cannot activate another sponsor reward (SCOPE_DENIED / REWARD_NOT_FOUND)', () => {
    const { rewardId } = seedFundedReward(1, 1);
    const otherSponsor = makeSponsor();
    expect(() => activateReward(rewardId, otherSponsor, uuidv4())).toThrow(
      expect.objectContaining({ code: expect.stringMatching(/SCOPE_DENIED|REWARD_NOT_FOUND/) })
    );
  });

  it('CAP-AUTH-2: scope owner (sponsor) can activate their own funded reward', () => {
    const { rewardId, sponsorId } = seedFundedReward(1, 1);
    // The sponsor owns the cohort scope — direct activation is permitted
    const result = activateReward(rewardId, sponsorId, uuidv4());
    expect(result.status).toBe('active');
  });

  it('CAP-AUTH-3: reward.manage admin (not scope owner) cannot activate a funded reward (SCOPE_DENIED)', () => {
    // activateReward transaction path checks validateScope only — manage bypass applies to
    // fast-return (already-active) but not the initial activation transaction.
    const { rewardId } = seedFundedReward(1, 1);
    const nonOwnerAdmin = makeAdmin();
    // nonOwnerAdmin has reward.manage (role_admin via trigger) but doesn't own the sponsor_cohort scope
    expect(() => activateReward(rewardId, nonOwnerAdmin, uuidv4())).toThrow(
      expect.objectContaining({ code: 'SCOPE_DENIED' })
    );
  });
});

// ──────────────────────────────────────────────
// Expiry worker characterization
// ──────────────────────────────────────────────

describe('W03 — Expiry worker snapshot integrity', () => {
  it('CAP-EXP-1: activated reward has correct allocation and snapshot count for expiry worker', () => {
    const { rewardId, sponsorId } = seedFundedReward(2, 2);
    activateReward(rewardId, sponsorId, uuidv4());
    const snap = db.prepare('SELECT id FROM reward_audience_snapshots WHERE reward_id = ?').all(rewardId);
    const allocs = getRewardAllocations(rewardId);
    expect(snap).toHaveLength(2);
    expect(allocs).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────
// Recovery: fail then narrow audience
// ──────────────────────────────────────────────

describe('W03 — Recovery after AUDIENCE_EXCEEDS_CAP', () => {
  it('CAP-REC-1: failed activation then audience narrowed → retry activates cleanly', () => {
    const sponsorId = makeSponsor();
    const courseId = uuidv4();
    const cohortId = uuidv4();
    db.prepare(
      `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'desc', ?)`
    ).run(courseId, `C-${courseId.slice(0, 8)}`);
    db.prepare(
      `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Cohort')`
    ).run(cohortId, sponsorId, courseId);
    const s1 = makeStudent();
    const s2 = makeStudent();
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, s1);
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, s2);
    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'course_completion',
      amountStroops: '100',
      maxRecipients: 1,
      idempotencyKey: uuidv4(),
    });
    fundReward(reward.id, makeAdmin(), { type: 'admin_grant' }, uuidv4());
    // First attempt: 2 members, cap=1 → fail
    expect(() => activateReward(reward.id, sponsorId, uuidv4())).toThrow(
      expect.objectContaining({ code: 'AUDIENCE_EXCEEDS_CAP' })
    );
    // Narrow audience: remove s2
    db.prepare('DELETE FROM cohort_members WHERE cohort_id = ? AND user_id = ?').run(cohortId, s2);
    // Retry: 1 member, cap=1 → succeed
    const result = activateReward(reward.id, sponsorId, uuidv4());
    expect(result.status).toBe('active');
    expect(getRewardAllocations(reward.id)).toHaveLength(1);
    // Verify reservation and no phantom state
    expect(db.prepare('SELECT id FROM reward_audience_snapshots WHERE reward_id = ?').all(reward.id)).toHaveLength(1);
  });
});
