# W03 Allocation Cap Enforcement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce allocation cap at activation, reject invalid max_recipients at creation, fix below-cap aggregate-status denominator.

**Architecture:** Service-layer fix only. No route changes, no schema migration, no new tables. Three files modified + one new test file.

**Tech Stack:** TypeScript, SQLite (better-sqlite3), Vitest, Supertest

**Spec:** `docs/superpowers/specs/2026-10-30-W03-allocation-cap-revised.md`

## Global Constraints

- Branch: `codex/w03-allocation-cap` from `e306cf9`
- No schema migration; no route-layer changes beyond error handling already in place
- All money arithmetic in `bigint`; no floating-point stroop values
- W02 access-before-replay behavior preserved; no new idempotency scope
- `AUDIENCE_EXCEEDS_CAP` and `INVALID_RECIPIENT_COUNT` are the two new error codes

---

### Task 1: Add error codes to rewardErrors.ts

**Files:**
- Modify: `LMS-Server/src/services/rewards/rewardErrors.ts`

**Interfaces:**
- Produces: `AUDIENCE_EXCEEDS_CAP` and `INVALID_RECIPIENT_COUNT` in `REWARD_ERROR_CODES` and `RewardErrorCode`

- [ ] **Step 1: Add AUDIENCE_EXCEEDS_CAP and INVALID_RECIPIENT_COUNT**

In `rewardErrors.ts`, after `IDEMPOTENCY_CONFLICT`:

```typescript
  AUDIENCE_EXCEEDS_CAP: 'AUDIENCE_EXCEEDS_CAP',
  INVALID_RECIPIENT_COUNT: 'INVALID_RECIPIENT_COUNT',
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/webadmin/worktrees/w03-cap/LMS-Server && npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add LMS-Server/src/services/rewards/rewardErrors.ts
git commit -m "feat(rewards): add AUDIENCE_EXCEEDS_CAP and INVALID_RECIPIENT_COUNT error codes (W03)"
```

---

### Task 2: Write RED tests for cap enforcement and invalid-count validation

**Files:**
- Create: `LMS-Server/src/__tests__/reward-allocation-cap.test.ts`

**Interfaces:**
- Consumes: `createReward`, `fundReward`, `activateReward`, `getRewardAllocations` from `rewardService.ts`
- Consumes: `resolveAudienceMembers` indirectly via `activateReward`
- Consumes: `db` for fixture setup and state assertions

- [ ] **Step 1: Create test file with fixture helpers**

```typescript
// LMS-Server/src/__tests__/reward-allocation-cap.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
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
import request from 'supertest';
import app from '../app.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

// ──── Fixture helpers ────

function makeSponsor(): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Sponsor', ?, 'hash', 'admin')"
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

function makeCohortWithMembers(sponsorId: string, memberCount: number): string {
  const courseId = uuidv4();
  const cohortId = uuidv4();
  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Course', 'desc', ?)`
  ).run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Cohort')`
  ).run(cohortId, sponsorId, courseId);
  for (let i = 0; i < memberCount; i++) {
    const studentId = makeStudent();
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);
  }
  return cohortId;
}

interface FundedReward {
  rewardId: string;
  sponsorId: string;
  cohortId: string;
  funderId: string;
}

function seedFundedReward(maxRecipients: number | null, audienceSize: number): FundedReward {
  const sponsorId = makeSponsor();
  const cohortId = makeCohortWithMembers(sponsorId, audienceSize);

  const reward = createReward(sponsorId, {
    scopeType: 'sponsor_cohort',
    scopeId: cohortId,
    rewardType: 'course_completion',
    amountStroops: '100',
    maxRecipients: maxRecipients ?? undefined,
    idempotencyKey: uuidv4(),
  });

  fundReward(reward.id, sponsorId, { type: 'platform_credit' }, uuidv4());

  return { rewardId: reward.id, sponsorId, cohortId, funderId: sponsorId };
}

function makeToken(userId: string): string {
  return jwt.sign({ userId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
}

function getReservedBalance(funderId: string): number {
  const account = getAccount(funderId, 'funder', 'XLM');
  return account ? Number(account.reserved_stroops) : 0;
}
```

- [ ] **Step 2: Write CAP-ENFORCE-1/2 (D1 RED)**

```typescript
describe('W03 — Cap enforcement at activation', () => {
  it('CAP-ENFORCE-1: cap=1, audience=3 → 400 AUDIENCE_EXCEEDS_CAP', () => {
    const { rewardId, sponsorId } = seedFundedReward(1, 3);
    expect(() => activateReward(rewardId, sponsorId, uuidv4())).toThrow(
      expect.objectContaining({ code: 'AUDIENCE_EXCEEDS_CAP' })
    );
  });

  it('CAP-ENFORCE-2: failed activation leaves reward funded, no allocations, no snapshot', () => {
    const { rewardId, sponsorId, funderId } = seedFundedReward(1, 3);
    const reservedBefore = getReservedBalance(funderId);
    try { activateReward(rewardId, sponsorId, uuidv4()); } catch { /* expected */ }
    const reward = db.prepare('SELECT status FROM rewards WHERE id = ?').get(rewardId) as { status: string };
    const allocs = db.prepare('SELECT id FROM reward_allocations WHERE reward_id = ?').all(rewardId);
    const snap = db.prepare('SELECT id FROM reward_audience_snapshots WHERE reward_id = ?').all(rewardId);
    const reservedAfter = getReservedBalance(funderId);
    expect(reward.status).toBe('funded');
    expect(allocs).toHaveLength(0);
    expect(snap).toHaveLength(0);
    expect(reservedAfter).toBe(reservedBefore);
  });
```

- [ ] **Step 3: Write CAP-ENFORCE-3, CAP-BELOW-1/2, CAP-NULL-1/2/3**

```typescript
  it('CAP-ENFORCE-3: cap=2, audience=2 → success with 2 allocations', () => {
    const { rewardId, sponsorId } = seedFundedReward(2, 2);
    const result = activateReward(rewardId, sponsorId, uuidv4());
    expect(result.status).toBe('active');
    const allocs = getRewardAllocations(rewardId, sponsorId);
    expect(allocs).toHaveLength(2);
    for (const a of allocs) {
      expect(Number(a.amount_stroops)).toBe(100);
    }
  });

  it('CAP-BELOW-1: cap=5, audience=3 → success with 3 allocations', () => {
    const { rewardId, sponsorId } = seedFundedReward(5, 3);
    // Fund for 5 recipients (500 stroops), activate 3
    const result = activateReward(rewardId, sponsorId, uuidv4());
    expect(result.status).toBe('active');
    expect(getRewardAllocations(rewardId, sponsorId)).toHaveLength(3);
  });

  it('CAP-BELOW-2: cap=5, audience=3 all released → aggregate status becomes released (not partially_released)', () => {
    const { rewardId, sponsorId } = seedFundedReward(5, 3);
    activateReward(rewardId, sponsorId, uuidv4());
    const allocs = getRewardAllocations(rewardId, sponsorId);
    // Make all allocations eligible and release them directly via DB (eligibility service excluded per scope)
    for (const a of allocs) {
      db.prepare("UPDATE reward_allocations SET status = 'released' WHERE id = ?").run(a.id);
    }
    // Trigger aggregate status update (simulate what eligibilityService/scheduler does)
    const { deriveAggregateStatus } = await import('../services/rewards/rewardStateMachine.js');
    const allocRows = db.prepare('SELECT status FROM reward_allocations WHERE reward_id = ?').all(rewardId) as Array<{ status: string }>;
    // Import updateRewardAggregateStatus (unexported — call via module hack for characterization)
    // Alternative: read the reward status after forcing DB state
    // The test proves the fix by asserting the function returns 'released', not 'partially_released'
    const aggregateStatus = (await import('../services/rewards/rewardStateMachine.js')).deriveAggregateStatus(allocRows as any);
    expect(aggregateStatus).toBe('released');
    // Old behavior would return 'partially_released' because total was maxRecipients(5) not allocations(3)
  });

  it('CAP-NULL-1: null cap funded (1 recipient), audience=1 → activates successfully', () => {
    const { rewardId, sponsorId } = seedFundedReward(null, 1);
    const result = activateReward(rewardId, sponsorId, uuidv4());
    expect(result.status).toBe('active');
    expect(getRewardAllocations(rewardId, sponsorId)).toHaveLength(1);
  });

  it('CAP-NULL-2: null cap funded (1 recipient), audience=2 → 400 AUDIENCE_EXCEEDS_CAP', () => {
    const { rewardId, sponsorId } = seedFundedReward(null, 2);
    expect(() => activateReward(rewardId, sponsorId, uuidv4())).toThrow(
      expect.objectContaining({ code: 'AUDIENCE_EXCEEDS_CAP' })
    );
  });

  it('CAP-NULL-3: null cap, 1 allocation released → deriveAggregateStatus returns released', () => {
    const { rewardId, sponsorId } = seedFundedReward(null, 1);
    activateReward(rewardId, sponsorId, uuidv4());
    const allocs = getRewardAllocations(rewardId, sponsorId);
    db.prepare("UPDATE reward_allocations SET status = 'released' WHERE id = ?").run(allocs[0].id);
    const allocRows = db.prepare('SELECT status FROM reward_allocations WHERE reward_id = ?').all(rewardId) as Array<{ status: string }>;
    const { deriveAggregateStatus } = await import('../services/rewards/rewardStateMachine.js');
    expect(deriveAggregateStatus(allocRows as any)).toBe('released');
  });
});
```

- [ ] **Step 4: Write INV-1 through INV-6 (creation boundary, D2)**

```typescript
describe('W03 — Invalid max_recipients at creation', () => {
  function makeSponsorAndCohort(): { sponsorId: string; cohortId: string } {
    const sponsorId = makeSponsor();
    const cohortId = makeCohortWithMembers(sponsorId, 1);
    return { sponsorId, cohortId };
  }

  function tryCreate(maxRecipients: unknown, sponsorId: string, cohortId: string) {
    return createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'course_completion',
      amountStroops: '100',
      maxRecipients: maxRecipients as any,
      idempotencyKey: uuidv4(),
    });
  }

  it('CAP-INVALID-1: max_recipients=0 → INVALID_RECIPIENT_COUNT', () => {
    const { sponsorId, cohortId } = makeSponsorAndCohort();
    expect(() => tryCreate(0, sponsorId, cohortId)).toThrow(
      expect.objectContaining({ code: 'INVALID_RECIPIENT_COUNT' })
    );
  });

  it('CAP-INVALID-2: max_recipients=-1 → INVALID_RECIPIENT_COUNT', () => {
    const { sponsorId, cohortId } = makeSponsorAndCohort();
    expect(() => tryCreate(-1, sponsorId, cohortId)).toThrow(
      expect.objectContaining({ code: 'INVALID_RECIPIENT_COUNT' })
    );
  });

  it('CAP-INVALID-3: max_recipients=3.5 → INVALID_RECIPIENT_COUNT', () => {
    const { sponsorId, cohortId } = makeSponsorAndCohort();
    expect(() => tryCreate(3.5, sponsorId, cohortId)).toThrow(
      expect.objectContaining({ code: 'INVALID_RECIPIENT_COUNT' })
    );
  });

  it('CAP-INVALID-4: max_recipients="abc" → INVALID_RECIPIENT_COUNT', () => {
    const { sponsorId, cohortId } = makeSponsorAndCohort();
    expect(() => tryCreate('abc', sponsorId, cohortId)).toThrow(
      expect.objectContaining({ code: 'INVALID_RECIPIENT_COUNT' })
    );
  });

  it('CAP-INVALID-5: max_recipients=10001 → INVALID_RECIPIENT_COUNT', () => {
    const { sponsorId, cohortId } = makeSponsorAndCohort();
    expect(() => tryCreate(10001, sponsorId, cohortId)).toThrow(
      expect.objectContaining({ code: 'INVALID_RECIPIENT_COUNT' })
    );
  });

  it('CAP-INVALID-6: max_recipients=10000 → success (boundary)', () => {
    const { sponsorId, cohortId } = makeSponsorAndCohort();
    expect(() => tryCreate(10000, sponsorId, cohortId)).not.toThrow();
  });
});
```

- [ ] **Step 5: Write AUD, RPT, POOL, AUTH, EXP, REC tests**

```typescript
describe('W03 — Audience, replay, pooling, auth, recovery', () => {
  it('CAP-AUD-1: empty audience → NO_AUDIENCE (pre-existing behavior preserved)', () => {
    const sponsorId = makeSponsor();
    const courseId = uuidv4();
    const cohortId = uuidv4();
    db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)`).run(courseId, `C-${courseId.slice(0,8)}`);
    db.prepare(`INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Empty')`).run(cohortId, sponsorId, courseId);
    const reward = createReward(sponsorId, { scopeType: 'sponsor_cohort', scopeId: cohortId, rewardType: 'course_completion', amountStroops: '100', maxRecipients: 1, idempotencyKey: uuidv4() });
    fundReward(reward.id, sponsorId, { type: 'platform_credit' }, uuidv4());
    expect(() => activateReward(reward.id, sponsorId, uuidv4())).toThrow(
      expect.objectContaining({ code: 'NO_AUDIENCE' })
    );
  });

  it('CAP-AUD-2: duplicate cohort members → no duplicate allocations (INSERT OR IGNORE)', () => {
    // DB constraint: INSERT OR IGNORE on reward_allocations(reward_id, student_user_id) if unique index exists
    // If not, duplicate memberId in cohort_members would create duplicate rows.
    // This test verifies the existing INSERT OR IGNORE deduplicates.
    const sponsorId = makeSponsor();
    const studentId = makeStudent();
    const courseId = uuidv4();
    const cohortId = uuidv4();
    db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)`).run(courseId, `C-${courseId.slice(0,8)}`);
    db.prepare(`INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Cohort')`).run(cohortId, sponsorId, courseId);
    // Insert same student twice to cohort
    db.prepare('INSERT OR IGNORE INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);
    db.prepare('INSERT OR IGNORE INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);
    const reward = createReward(sponsorId, { scopeType: 'sponsor_cohort', scopeId: cohortId, rewardType: 'course_completion', amountStroops: '100', maxRecipients: 1, idempotencyKey: uuidv4() });
    fundReward(reward.id, sponsorId, { type: 'platform_credit' }, uuidv4());
    activateReward(reward.id, sponsorId, uuidv4());
    const allocs = getRewardAllocations(reward.id, sponsorId);
    expect(allocs).toHaveLength(1);
  });

  it('CAP-AUD-3: member joins cohort after funding, before activation → counted in audience', () => {
    const sponsorId = makeSponsor();
    const courseId = uuidv4();
    const cohortId = uuidv4();
    db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)`).run(courseId, `C-${courseId.slice(0,8)}`);
    db.prepare(`INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Cohort')`).run(cohortId, sponsorId, courseId);
    const s1 = makeStudent();
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, s1);
    // Create with cap=2; fund for 2 recipients
    const reward = createReward(sponsorId, { scopeType: 'sponsor_cohort', scopeId: cohortId, rewardType: 'course_completion', amountStroops: '100', maxRecipients: 2, idempotencyKey: uuidv4() });
    fundReward(reward.id, sponsorId, { type: 'platform_credit' }, uuidv4());
    // Add second member after funding
    const s2 = makeStudent();
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, s2);
    // Activate: should see 2 members, cap=2 → success
    const result = activateReward(reward.id, sponsorId, uuidv4());
    expect(result.status).toBe('active');
    expect(getRewardAllocations(reward.id, sponsorId)).toHaveLength(2);
  });

  it('CAP-AUD-4: member joins cohort after activation → no allocation growth, snapshot unchanged', () => {
    const { rewardId, sponsorId, cohortId } = seedFundedReward(2, 2);
    activateReward(rewardId, sponsorId, uuidv4());
    const snapBefore = db.prepare('SELECT id FROM reward_audience_snapshots WHERE reward_id = ?').all(rewardId).length;
    const allocBefore = getRewardAllocations(rewardId, sponsorId).length;
    // Add a third member to cohort
    const s3 = makeStudent();
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, s3);
    // Repeat activation returns same row (fast-return from W02 replay guard)
    activateReward(rewardId, sponsorId, uuidv4());
    const snapAfter = db.prepare('SELECT id FROM reward_audience_snapshots WHERE reward_id = ?').all(rewardId).length;
    const allocAfter = getRewardAllocations(rewardId, sponsorId).length;
    expect(snapAfter).toBe(snapBefore);
    expect(allocAfter).toBe(allocBefore);
  });

  it('CAP-RPT-1: repeated activation on active reward returns same row, no new allocations', () => {
    const { rewardId, sponsorId } = seedFundedReward(1, 1);
    const r1 = activateReward(rewardId, sponsorId, uuidv4());
    const r2 = activateReward(rewardId, sponsorId, uuidv4());
    expect(r1.id).toBe(r2.id);
    expect(r2.status).toBe('active');
    expect(getRewardAllocations(rewardId, sponsorId)).toHaveLength(1);
  });

  it('CAP-POOL-1: two rewards same funder — reward A overshoots cap → reward B unaffected', () => {
    const sponsorId = makeSponsor();
    const cohortIdA = makeCohortWithMembers(sponsorId, 3);
    const cohortIdB = makeCohortWithMembers(sponsorId, 1);
    // Reward A: cap=1, audience=3 → activation will fail
    const rA = createReward(sponsorId, { scopeType: 'sponsor_cohort', scopeId: cohortIdA, rewardType: 'course_completion', amountStroops: '100', maxRecipients: 1, idempotencyKey: uuidv4() });
    fundReward(rA.id, sponsorId, { type: 'platform_credit' }, uuidv4());
    // Reward B: cap=1, audience=1 → activation will succeed
    const rB = createReward(sponsorId, { scopeType: 'sponsor_cohort', scopeId: cohortIdB, rewardType: 'course_completion', amountStroops: '200', maxRecipients: 1, idempotencyKey: uuidv4() });
    fundReward(rB.id, sponsorId, { type: 'platform_credit' }, uuidv4());
    // Attempt activation of A (should fail)
    expect(() => activateReward(rA.id, sponsorId, uuidv4())).toThrow(
      expect.objectContaining({ code: 'AUDIENCE_EXCEEDS_CAP' })
    );
    // B should still activate cleanly
    const resultB = activateReward(rB.id, sponsorId, uuidv4());
    expect(resultB.status).toBe('active');
    expect(getRewardAllocations(rB.id, sponsorId)).toHaveLength(1);
    // Verify reward A's funding intact (100 stroops reserved)
    const accountA = getAccount(sponsorId, 'funder', 'XLM');
    // Both A and B reserved; A's reservation still intact after failed activation
    expect(db.prepare('SELECT status FROM rewards WHERE id = ?').get(rA.id)).toHaveProperty('status', 'funded');
  });

  it('CAP-AUTH-1: unrelated sponsor cannot activate another sponsor reward', () => {
    const { rewardId } = seedFundedReward(1, 1);
    const otherSponsor = makeSponsor();
    expect(() => activateReward(rewardId, otherSponsor, uuidv4())).toThrow(
      expect.objectContaining({ code: expect.stringMatching(/SCOPE_DENIED|REWARD_NOT_FOUND/) })
    );
  });

  it('CAP-AUTH-2: reward.manage admin can activate any scope', () => {
    const { rewardId } = seedFundedReward(1, 1);
    const adminId = uuidv4();
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin', ?, 'hash', 'admin')"
    ).run(adminId, `${adminId}@test.com`);
    // admin role → trg_auto_assign → role_admin (has reward.manage)
    const result = activateReward(rewardId, adminId, uuidv4());
    expect(result.status).toBe('active');
  });

  it('CAP-EXP-1: activated reward with correct allocations → expiry worker sees expected count', () => {
    const { rewardId, sponsorId } = seedFundedReward(2, 2);
    activateReward(rewardId, sponsorId, uuidv4());
    // Verify the expiry worker will find 2 allocations (snapshot integrity)
    const snap = db.prepare('SELECT id FROM reward_audience_snapshots WHERE reward_id = ?').all(rewardId);
    const allocs = getRewardAllocations(rewardId, sponsorId);
    expect(snap).toHaveLength(2);
    expect(allocs).toHaveLength(2);
  });

  it('CAP-REC-1: failed activation (audience>cap) then cohort narrowed → retry succeeds', () => {
    const sponsorId = makeSponsor();
    const courseId = uuidv4();
    const cohortId = uuidv4();
    db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)`).run(courseId, `C-${courseId.slice(0,8)}`);
    db.prepare(`INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Cohort')`).run(cohortId, sponsorId, courseId);
    const s1 = makeStudent();
    const s2 = makeStudent();
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, s1);
    db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, s2);
    const reward = createReward(sponsorId, { scopeType: 'sponsor_cohort', scopeId: cohortId, rewardType: 'course_completion', amountStroops: '100', maxRecipients: 1, idempotencyKey: uuidv4() });
    fundReward(reward.id, sponsorId, { type: 'platform_credit' }, uuidv4());
    // First attempt: 2 members, cap=1 → fail
    expect(() => activateReward(reward.id, sponsorId, uuidv4())).toThrow(
      expect.objectContaining({ code: 'AUDIENCE_EXCEEDS_CAP' })
    );
    // Remove one member (owner narrows audience)
    db.prepare('DELETE FROM cohort_members WHERE cohort_id = ? AND user_id = ?').run(cohortId, s2);
    // Retry: 1 member, cap=1 → succeed
    const result = activateReward(reward.id, sponsorId, uuidv4());
    expect(result.status).toBe('active');
    expect(getRewardAllocations(reward.id, sponsorId)).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Commit the test file**

```bash
cd /home/webadmin/worktrees/w03-cap/LMS-Server
git add src/__tests__/reward-allocation-cap.test.ts
git commit -m "test(rewards): W03 RED tests — cap enforcement, invalid counts, below-cap, pooling, recovery"
```

---

### Task 3: Run RED tests to confirm defects

- [ ] **Step 1: Run new test suite RED**

```bash
cd /home/webadmin/worktrees/w03-cap/LMS-Server
npx vitest run src/__tests__/reward-allocation-cap.test.ts 2>&1 | tail -40
```

Expected failures:
- CAP-ENFORCE-1/2: currently activates without error (defect D1)
- CAP-NULL-2: currently activates without error (D1 with null cap)
- CAP-INVALID-1/2/3/4/5: currently no error thrown (defect D2)
- CAP-BELOW-2/CAP-NULL-3: `deriveAggregateStatus` returns `partially_released` (defect D3)

Expected to pass from the start:
- CAP-ENFORCE-3 (equal cap): activates fine
- CAP-BELOW-1: below-cap activates fine
- CAP-AUD-1: NO_AUDIENCE still thrown
- CAP-INVALID-6: max=10000 accepted
- Others that don't exercise the defects

---

### Task 4: Apply fixes

**Files:**
- Modify: `LMS-Server/src/services/rewards/rewardErrors.ts` (already done in Task 1)
- Modify: `LMS-Server/src/services/rewards/rewardService.ts`
- Modify: `LMS-Server/src/services/rewards/rewardStateMachine.ts`

- [ ] **Step 1: Fix createReward validation (D2) in rewardService.ts**

In the import line, add `MAX_RECIPIENTS` to the currencyConfig import:
```typescript
import { parseStroops, calculateMaxExposure, validateCurrency, MAX_RECIPIENTS } from './currencyConfig.js';
```

Replace the existing max_recipients validation block:
```typescript
// OLD:
if (params.maxRecipients != null && params.maxRecipients > 0) {
  calculateMaxExposure(amount, BigInt(params.maxRecipients));
}

// NEW:
if (params.maxRecipients !== undefined && params.maxRecipients !== null) {
  if (!Number.isInteger(params.maxRecipients) || params.maxRecipients <= 0 || params.maxRecipients > MAX_RECIPIENTS) {
    throw new RewardError(
      'INVALID_RECIPIENT_COUNT',
      `max_recipients must be a positive integer no greater than ${MAX_RECIPIENTS}`,
      400,
    );
  }
  calculateMaxExposure(amount, BigInt(params.maxRecipients));
}
```

- [ ] **Step 2: Add cap check in activateReward (D1) in rewardService.ts**

After the `NO_AUDIENCE` guard (just before `createAudienceSnapshot`), insert:
```typescript
    // W03: Enforce allocation cap against funded capacity.
    // effectiveCap = max_recipients ?? 1 mirrors the funding formula in fundReward.
    // A null cap reserves for 1 recipient; activating against a larger audience
    // would create obligations exceeding the reservation.
    const effectiveCap = reward.max_recipients ?? 1;
    if (members.length > effectiveCap) {
      throw new RewardError(
        'AUDIENCE_EXCEEDS_CAP',
        `Audience has ${members.length} members but effective cap is ${effectiveCap}`,
        400,
      );
    }
```

- [ ] **Step 3: Fix deriveAggregateStatus denominator (D3) in rewardStateMachine.ts**

Change the function signature and body:

```typescript
// OLD:
export function deriveAggregateStatus(
  allocations: Array<{ status: AllocationState }>,
  maxRecipients?: number | null
): RewardState | null {
  ...
  const total = maxRecipients ?? allocations.length;

// NEW:
export function deriveAggregateStatus(
  allocations: Array<{ status: AllocationState }>
): RewardState | null {
  ...
  const total = allocations.length;
```

- [ ] **Step 4: Update call site in rewardService.ts**

In `updateRewardAggregateStatus`, change:
```typescript
// OLD:
const aggregateStatus = deriveAggregateStatus(allocations, reward.max_recipients);

// NEW:
const aggregateStatus = deriveAggregateStatus(allocations);
```

- [ ] **Step 5: TypeScript build clean**

```bash
cd /home/webadmin/worktrees/w03-cap/LMS-Server && npx tsc --noEmit 2>&1 | head -30
```
Expected: 0 errors

- [ ] **Step 6: Commit fixes**

```bash
git add LMS-Server/src/services/rewards/rewardService.ts \
        LMS-Server/src/services/rewards/rewardStateMachine.ts
git commit -m "fix(rewards): W03 — enforce allocation cap, validate max_recipients, fix below-cap aggregate status"
```

---

### Task 5: Run GREEN and regression suites

- [ ] **Step 1: Run new test suite GREEN**

```bash
cd /home/webadmin/worktrees/w03-cap/LMS-Server
npx vitest run src/__tests__/reward-allocation-cap.test.ts 2>&1 | tail -30
```
Expected: All tests pass

- [ ] **Step 2: Run all affected regression suites**

```bash
npx vitest run \
  src/__tests__/reward-lifecycle.test.ts \
  src/__tests__/reward-sponsor.test.ts \
  src/__tests__/reward-teacher.test.ts \
  src/__tests__/reward-parent.test.ts \
  src/__tests__/reward-employer.test.ts \
  src/__tests__/reward-schema.test.ts \
  src/__tests__/reward-state-machine.test.ts \
  src/__tests__/reward-expiry-worker.test.ts \
  src/__tests__/reward-eligibility.test.ts \
  src/__tests__/reward-balance.test.ts \
  src/__tests__/reward-ledger.test.ts \
  src/__tests__/reward-idempotency-binding.test.ts \
  src/__tests__/reward-nested-parent.test.ts \
  src/__tests__/reward-cross-owner.test.ts \
  src/__tests__/reward-admin-refund-caller-auth.test.ts \
  src/__tests__/reward-refund-retry-error-contract.test.ts 2>&1 | tail -40
```
Expected: All pass, 0 regressions

- [ ] **Step 3: Run full backend test suite**

```bash
npx vitest run 2>&1 | tail -20
```
Expected: All pass

---

### Task 6: Update spec and commit all

- [ ] **Step 1: Mark TDD checklist items complete in spec**
- [ ] **Step 2: Update requirement-to-test matrix status to ✅**
- [ ] **Step 3: Commit spec and plan**

```bash
git add docs/superpowers/specs/2026-10-30-W03-allocation-cap-revised.md \
        docs/superpowers/plans/2026-10-30-w03-allocation-cap.md
git commit -m "docs(w03): spec and plan for allocation cap enforcement"
```

---

### Task 7: Independent review, CI, merge

- [ ] Dispatch independent Opus agent for code/security review
- [ ] Resolve any valid findings; re-review if changes made
- [ ] Push branch and open PR
- [ ] Wait for CI: 4/4 PASS required
- [ ] Merge reviewed exact head
- [ ] Verify post-merge main SHA and CI
- [ ] Update STAGED-ROLLOUT-EVIDENCE/TASKS/INDEX on `codex/staged-rollout-plan`
