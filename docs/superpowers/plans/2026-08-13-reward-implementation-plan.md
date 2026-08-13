# LMS XLM Reward System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a complete reward lifecycle (create → fund → activate → eligibility → release → refund) for sponsor, employer, parent, and teacher roles with integer-stroop accounting, scope enforcement, transactional outbox, and immutable ledger.

**Architecture:** Centralized modular service under `src/services/rewards/` with 10 files. Role routes are thin adapters delegating to `rewardService.ts`. All financial mutations are atomic SQLite transactions writing to an immutable ledger (`reward_transactions`). Eligibility uses a transactional outbox pattern. Balance tracking uses `reward_accounts` with available/reserved buckets.

**Tech Stack:** Node.js/Express 4, SQLite/better-sqlite3 v11.3.0, Vitest, Supertest, TypeScript, uuid v4

## Global Constraints

- All monetary values: INTEGER stroops (1 XLM = 10,000,000 stroops)
- No floating-point arithmetic in any accounting path
- MAX_SAFE_STROOPS = 9,007,199,254,740,991 (Number.MAX_SAFE_INTEGER)
- Currency: XLM only (currency-aware schema)
- All financial FKs: ON DELETE RESTRICT (never CASCADE)
- No external network calls inside SQLite transactions
- BigInt for arithmetic only; store/retrieve as number within MAX_SAFE ceiling
- Do NOT enable `safeIntegers(true)` globally
- Reward state count: exactly 13
- Allocation state count: exactly 5
- All responses: `{ success: true/false, data/error: {...} }`
- RBAC: `authenticate` → `requirePermission()` → handler
- IDs: `uuidv4()` TEXT PRIMARY KEY
- Baseline: Backend 853/853, Frontend 193/193

## Authoritative Specifications

- `docs/superpowers/specs/2026-08-13-reward-foundation-spec.md` — schema, state machine, ledger, permissions
- `docs/superpowers/specs/2026-08-13-sponsor-employer-rewards-spec.md` — BR phase
- `docs/superpowers/specs/2026-08-13-parent-rewards-spec.md` — CR phase
- `docs/superpowers/specs/2026-08-13-teacher-rewards-spec.md` — CTR phase

## File Structure

### New files to create

```
LMS-Server/src/services/rewards/
  currencyConfig.ts          # XLM constants, stroop scale, parseStroops(), calculateMaxExposure()
  rewardTypes.ts             # TypeScript interfaces and type unions
  rewardErrors.ts            # Typed domain error class with error codes
  rewardBalanceService.ts    # Available/reserved balance CRUD, getOrCreateAccount()
  rewardLedger.ts            # Immutable ledger writes, reconciliation query
  rewardIdempotencyService.ts # Duplicate detection by idempotency key
  rewardStateMachine.ts      # State transitions, validation, aggregate status
  rewardScopeService.ts      # Relationship scope validation, audience snapshot
  rewardEligibilityService.ts # Outbox processing, condition evaluation, retry
  rewardService.ts           # Public orchestration facade (all financial mutations)

LMS-Server/src/routes/
  rewards.ts                 # Admin reward endpoints (reconciliation, verify-funding)

LMS-Server/src/__tests__/
  reward-schema.test.ts      # R-SCHEMA-* tests
  reward-currency.test.ts    # R-CURR-* tests
  reward-balance.test.ts     # R-BAL-* account tests
  reward-ledger.test.ts      # R-LED-*, R-IDEM-* tests
  reward-state-machine.test.ts # R-SM-* tests
  reward-scope.test.ts       # R-SCOPE-* tests
  reward-sponsor.test.ts     # BR-S-* tests
  reward-employer.test.ts    # BR-E-* tests
  reward-parent.test.ts      # CR-P-* tests
  reward-teacher.test.ts     # CTR-T-* tests
  reward-eligibility.test.ts # R-ELIG-* tests
  reward-release.test.ts     # R-REL-* tests
  reward-lifecycle.test.ts   # R-LIFE-* tests
  reward-security.test.ts    # R-SEC-* tests

LMS-Frontend/src/components/
  RewardDashboard.tsx        # Role-specific reward list and management
  RewardCreateForm.tsx       # Create reward form with stroop validation
  RewardStatusBadge.tsx      # 13-state status badge component

LMS-Frontend/src/services/
  rewardService.ts           # API client for reward endpoints

LMS-Frontend/src/__tests__/
  reward-components.test.tsx  # R-FE-* tests
```

### Existing files to modify

```
LMS-Server/src/config/database.ts          # New ensure* functions, seedRbacData() updates, migration
LMS-Server/src/app.ts                      # Mount reward routes
LMS-Server/src/routes/sponsor.ts           # Add reward endpoints
LMS-Server/src/routes/employer.ts          # Add reward endpoints
LMS-Server/src/routes/parent.ts            # Add reward endpoints, update /parent/wallets
LMS-Server/src/routes/teacher.ts           # Add reward endpoints
LMS-Server/src/routes/disputes.ts          # Extend for reward disputes
LMS-Server/src/__tests__/rbac-wallet-invariant.test.ts  # Update for new permissions
LMS-Server/src/controllers/lessonCompletions.ts   # Add outbox event production
LMS-Server/src/controllers/quizzesController.ts   # Add outbox event production
LMS-Server/src/controllers/submissionsController.ts # Add outbox event production
```

---

## Task 1: Schema and Migration (R2)

**Dependencies:** None (R0/R1 are complete)
**Files:**
- Create: `LMS-Server/src/__tests__/reward-schema.test.ts`
- Modify: `LMS-Server/src/config/database.ts`

**Interfaces:**
- Produces: 9 new database tables (reward_accounts, rewards, reward_allocations, reward_transactions, reward_audience_snapshots, reward_eligibility_events, reward_event_outbox, reward_refund_attempts), `ensureRewardTables()` function, `migrateRewardBalance()` function

- [ ] **Step 1: Write the failing schema tests**

Create `LMS-Server/src/__tests__/reward-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { db } from '../config/database.js';

describe('Reward Schema', () => {
  it('R-SCHEMA-1: rewards table has 13-state CHECK constraint', () => {
    const id = 'test-reward-schema-1';
    // Valid state
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${id}', 'Test', '${id}@test.com', 'hash', 'admin')`);
    expect(() => {
      db.prepare(
        `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key, status)
         VALUES (?, ?, 'sponsor_cohort', 'scope1', 'custom', 100, 'idem-s1', 'draft')`
      ).run(id, id);
    }).not.toThrow();

    // Invalid state
    expect(() => {
      db.prepare(
        `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key, status)
         VALUES (?, ?, 'sponsor_cohort', 'scope2', 'custom', 100, 'idem-s1b', 'invalid_state')`
      ).run(`${id}-bad`, id);
    }).toThrow();
  });

  it('R-SCHEMA-2: reward_accounts created with funder/recipient/platform types', () => {
    const uid = 'test-ra-user';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);

    // Valid types
    for (const type of ['funder', 'recipient', 'platform']) {
      expect(() => {
        db.prepare(
          `INSERT INTO reward_accounts (id, user_id, account_type) VALUES (?, ?, ?)`
        ).run(`ra-${type}`, uid, type);
      }).not.toThrow();
    }

    // Invalid type
    expect(() => {
      db.prepare(
        `INSERT INTO reward_accounts (id, user_id, account_type) VALUES (?, ?, 'invalid')`
      ).run('ra-bad', uid);
    }).toThrow();
  });

  it('R-SCHEMA-3: reward_transactions has all CHECK constraints', () => {
    // Actor consistency: system actor must have NULL user_id
    const uid = 'test-txn-user';
    const rid = 'test-txn-reward';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);
    db.exec(`INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key) VALUES ('${rid}', '${uid}', 'sponsor_cohort', 's1', 'custom', 100, 'idem-txn1')`);

    // system actor with user_id should fail
    expect(() => {
      db.prepare(
        `INSERT INTO reward_transactions (id, reward_id, source_account_type, destination_account_type, destination_bucket,
         actor_type, actor_user_id, transaction_type, amount_stroops, previous_state, new_state, idempotency_key,
         funding_source_type, source_user_id, destination_user_id)
         VALUES (?, ?, 'external', 'funder', 'available', 'system', ?, 'fund', 100, 'draft', 'funded', 'idem-txn-bad', 'stellar', NULL, ?)`
      ).run('txn-bad', rid, uid, uid);
    }).toThrow();
  });

  it('R-SCHEMA-4: reward_allocations UNIQUE(reward_id, student_user_id)', () => {
    const uid = 'test-alloc-user';
    const rid = 'test-alloc-reward';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);
    db.exec(`INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key) VALUES ('${rid}', '${uid}', 'sponsor_cohort', 's1', 'custom', 100, 'idem-alloc1')`);

    db.prepare(
      `INSERT INTO reward_allocations (id, reward_id, student_user_id, amount_stroops, idempotency_key) VALUES (?, ?, ?, 100, ?)`
    ).run('alloc1', rid, uid, 'idem-a1');

    expect(() => {
      db.prepare(
        `INSERT INTO reward_allocations (id, reward_id, student_user_id, amount_stroops, idempotency_key) VALUES (?, ?, ?, 100, ?)`
      ).run('alloc2', rid, uid, 'idem-a2');
    }).toThrow(); // UNIQUE violation
  });

  it('R-SCHEMA-5: reward_eligibility_events composite unique', () => {
    const uid = 'test-elig-user';
    const rid = 'test-elig-reward';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);
    db.exec(`INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key) VALUES ('${rid}', '${uid}', 'sponsor_cohort', 's1', 'custom', 100, 'idem-elig1')`);

    db.prepare(
      `INSERT INTO reward_eligibility_events (id, reward_id, event_type, event_source_id, student_user_id, result, idempotency_key) VALUES (?, ?, 'course_completion', 'src1', ?, 'eligible', ?)`
    ).run('elig1', rid, uid, 'idem-e1');

    expect(() => {
      db.prepare(
        `INSERT INTO reward_eligibility_events (id, reward_id, event_type, event_source_id, student_user_id, result, idempotency_key) VALUES (?, ?, 'course_completion', 'src1', ?, 'eligible', ?)`
      ).run('elig2', rid, uid, 'idem-e2');
    }).toThrow(); // composite UNIQUE violation
  });

  it('R-SCHEMA-6: reward_audience_snapshots table exists', () => {
    const uid = 'test-snap-user';
    const rid = 'test-snap-reward';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);
    db.exec(`INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key) VALUES ('${rid}', '${uid}', 'sponsor_cohort', 's1', 'custom', 100, 'idem-snap1')`);

    expect(() => {
      db.prepare(
        `INSERT INTO reward_audience_snapshots (id, reward_id, student_user_id) VALUES (?, ?, ?)`
      ).run('snap1', rid, uid);
    }).not.toThrow();
  });

  it('R-SCHEMA-7: invalid enum values rejected', () => {
    const uid = 'test-enum-user';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);

    // Invalid scope_type
    expect(() => {
      db.prepare(
        `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key)
         VALUES (?, ?, 'invalid_scope', 's1', 'custom', 100, 'idem-enum1')`
      ).run('r-enum1', uid);
    }).toThrow();

    // Invalid reward_type
    expect(() => {
      db.prepare(
        `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key)
         VALUES (?, ?, 'sponsor_cohort', 's1', 'invalid_type', 100, 'idem-enum2')`
      ).run('r-enum2', uid);
    }).toThrow();
  });

  it('R-SCHEMA-8: ON DELETE RESTRICT prevents cascade deletion', () => {
    const uid = 'test-del-user';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);
    db.prepare(
      `INSERT INTO reward_accounts (id, user_id, account_type) VALUES (?, ?, 'funder')`
    ).run('ra-del', uid);

    // Deleting user with reward account should fail
    expect(() => {
      db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    }).toThrow();
  });

  it('R-SCHEMA-9: XLM-only currency enforced', () => {
    const uid = 'test-curr-user';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);

    expect(() => {
      db.prepare(
        `INSERT INTO reward_accounts (id, user_id, account_type, currency_code) VALUES (?, ?, 'funder', 'USD')`
      ).run('ra-usd', uid);
    }).toThrow();
  });

  it('R-SCHEMA-10: reward_event_outbox created with composite unique', () => {
    const uid = 'test-outbox-user';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);

    db.prepare(
      `INSERT INTO reward_event_outbox (id, event_type, event_source_id, student_user_id) VALUES (?, 'course_completion', 'src1', ?)`
    ).run('outbox1', uid);

    // Duplicate (event_type, event_source_id, student_user_id) should fail
    expect(() => {
      db.prepare(
        `INSERT INTO reward_event_outbox (id, event_type, event_source_id, student_user_id) VALUES (?, 'course_completion', 'src1', ?)`
      ).run('outbox2', uid);
    }).toThrow();
  });

  it('R-SCHEMA-11: reward_refund_attempts created with RESTRICT FKs', () => {
    const uid = 'test-rra-user';
    const rid = 'test-rra-reward';
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${uid}', 'Test', '${uid}@test.com', 'hash', 'admin')`);
    db.exec(`INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key) VALUES ('${rid}', '${uid}', 'sponsor_cohort', 's1', 'custom', 100, 'idem-rra1')`);
    db.prepare(
      `INSERT INTO reward_allocations (id, reward_id, student_user_id, amount_stroops, idempotency_key) VALUES (?, ?, ?, 100, ?)`
    ).run('alloc-rra', rid, uid, 'idem-rra-a');

    expect(() => {
      db.prepare(
        `INSERT INTO reward_refund_attempts (id, reward_id, allocation_id, attempted_by_user_id, attempted_amount_stroops, recipient_available_stroops)
         VALUES (?, ?, ?, ?, 100, 50)`
      ).run('rra1', rid, 'alloc-rra', uid);
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd LMS-Server && npx vitest run src/__tests__/reward-schema.test.ts
```
Expected: FAIL — tables do not exist yet.

- [ ] **Step 3: Implement schema in database.ts**

Add to `LMS-Server/src/config/database.ts` after the existing `ensureDisputesTable()` call (around line 1816):

```typescript
function ensureRewardTables(): void {
  // Must run with foreign_keys OFF (already disabled at top of file)
  db.exec(`
    CREATE TABLE IF NOT EXISTS reward_accounts (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      account_type      TEXT NOT NULL CHECK (account_type IN ('funder', 'recipient', 'platform')),
      available_stroops INTEGER NOT NULL DEFAULT 0 CHECK (available_stroops >= 0),
      reserved_stroops  INTEGER NOT NULL DEFAULT 0 CHECK (reserved_stroops >= 0),
      currency_code     TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, account_type, currency_code)
    );
    CREATE INDEX IF NOT EXISTS idx_reward_accounts_user ON reward_accounts(user_id);
  `);

  // Drop and recreate the 3-state stub
  const hasOldRewards = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name='rewards'").get() as { c: number };
  if (hasOldRewards.c > 0) {
    // Check if stub (has amount_xlm column) vs new schema
    const cols = db.pragma('table_info(rewards)') as Array<{ name: string }>;
    const hasAmountXlm = cols.some(c => c.name === 'amount_xlm');
    if (hasAmountXlm) {
      // Old stub — safe to drop (no functional data)
      db.exec('DROP TABLE IF EXISTS rewards');
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS rewards (
      id                    TEXT PRIMARY KEY,
      creator_user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      scope_type            TEXT NOT NULL CHECK (scope_type IN (
        'sponsor_cohort', 'employer_team', 'parent_child', 'parent_family', 'teacher_class'
      )),
      scope_id              TEXT NOT NULL,
      reward_type           TEXT NOT NULL CHECK (reward_type IN (
        'individual', 'milestone', 'course_completion', 'grade', 'custom'
      )),
      amount_mode           TEXT NOT NULL DEFAULT 'per_recipient' CHECK (amount_mode IN ('per_recipient')),
      amount_stroops        INTEGER NOT NULL CHECK (amount_stroops > 0),
      max_recipients        INTEGER CHECK (max_recipients IS NULL OR max_recipients > 0),
      currency_code         TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
      description           TEXT,
      auto_release          INTEGER NOT NULL DEFAULT 0 CHECK (auto_release IN (0, 1)),
      eligibility_config    TEXT,
      status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'pending_funding', 'funded', 'active',
        'eligible_pending_approval', 'approved', 'eligible_auto_release',
        'partially_released', 'released',
        'cancelled', 'expired',
        'partially_refunded', 'refunded'
      )),
      idempotency_key       TEXT NOT NULL UNIQUE,
      expires_at            TEXT,
      funded_at             TEXT,
      activated_at          TEXT,
      eligible_at           TEXT,
      approved_at           TEXT,
      released_at           TEXT,
      cancelled_at          TEXT,
      refunded_at           TEXT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rewards_creator ON rewards(creator_user_id);
    CREATE INDEX IF NOT EXISTS idx_rewards_scope ON rewards(scope_type, scope_id);
    CREATE INDEX IF NOT EXISTS idx_rewards_status ON rewards(status);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reward_audience_snapshots (
      id              TEXT PRIMARY KEY,
      reward_id       TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
      student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      snapshot_at     TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(reward_id, student_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reward_audience_reward ON reward_audience_snapshots(reward_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reward_allocations (
      id                TEXT PRIMARY KEY,
      reward_id         TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
      student_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      amount_stroops    INTEGER NOT NULL CHECK (amount_stroops > 0),
      currency_code     TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
      status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'eligible', 'released', 'cancelled', 'refunded'
      )),
      idempotency_key   TEXT NOT NULL UNIQUE,
      eligible_at       TEXT,
      released_at       TEXT,
      cancelled_at      TEXT,
      refunded_at       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(reward_id, student_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reward_allocations_reward ON reward_allocations(reward_id);
    CREATE INDEX IF NOT EXISTS idx_reward_allocations_student ON reward_allocations(student_user_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reward_transactions (
      id                       TEXT PRIMARY KEY,
      reward_id                TEXT REFERENCES rewards(id) ON DELETE RESTRICT,
      allocation_id            TEXT REFERENCES reward_allocations(id) ON DELETE RESTRICT,
      source_account_type      TEXT NOT NULL CHECK (source_account_type IN ('external', 'platform', 'funder', 'recipient')),
      source_bucket            TEXT CHECK (source_bucket IN ('available', 'reserved')),
      source_user_id           TEXT REFERENCES users(id) ON DELETE RESTRICT,
      destination_account_type TEXT NOT NULL CHECK (destination_account_type IN ('funder', 'recipient', 'platform')),
      destination_bucket       TEXT NOT NULL CHECK (destination_bucket IN ('available', 'reserved')),
      destination_user_id      TEXT REFERENCES users(id) ON DELETE RESTRICT,
      actor_type               TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'system')),
      actor_user_id            TEXT REFERENCES users(id) ON DELETE RESTRICT,
      transaction_type         TEXT NOT NULL CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire')),
      amount_stroops           INTEGER NOT NULL CHECK (amount_stroops > 0),
      currency_code            TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
      previous_state           TEXT NOT NULL,
      new_state                TEXT NOT NULL,
      funding_source_type      TEXT CHECK (funding_source_type IN ('platform_credit', 'admin_grant', 'stellar', 'paystack')),
      funding_reference        TEXT,
      source_event_id          TEXT,
      idempotency_key          TEXT NOT NULL UNIQUE,
      reason                   TEXT,
      metadata                 TEXT,
      created_at               TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK ((actor_type = 'system' AND actor_user_id IS NULL) OR (actor_type = 'user' AND actor_user_id IS NOT NULL)),
      CHECK ((transaction_type = 'fund' AND funding_source_type IS NOT NULL) OR (transaction_type != 'fund')),
      CHECK ((transaction_type IN ('release', 'refund') AND allocation_id IS NOT NULL AND destination_user_id IS NOT NULL) OR (transaction_type NOT IN ('release', 'refund'))),
      CHECK ((transaction_type IN ('reserve', 'cancel', 'expire') AND source_user_id IS NOT NULL) OR (transaction_type NOT IN ('reserve', 'cancel', 'expire'))),
      CHECK ((transaction_type = 'fund' AND destination_user_id IS NOT NULL AND destination_account_type = 'funder') OR (transaction_type != 'fund'))
    );
    CREATE INDEX IF NOT EXISTS idx_reward_txn_reward ON reward_transactions(reward_id);
    CREATE INDEX IF NOT EXISTS idx_reward_txn_allocation ON reward_transactions(allocation_id);
    CREATE INDEX IF NOT EXISTS idx_reward_txn_idem ON reward_transactions(idempotency_key);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reward_eligibility_events (
      id              TEXT PRIMARY KEY,
      reward_id       TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
      allocation_id   TEXT REFERENCES reward_allocations(id) ON DELETE RESTRICT,
      event_type      TEXT NOT NULL CHECK (event_type IN ('course_completion', 'quiz_pass', 'milestone', 'grade_approved', 'custom')),
      event_source_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      evaluated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      result          TEXT NOT NULL CHECK (result IN ('eligible', 'ineligible', 'already_processed')),
      idempotency_key TEXT NOT NULL UNIQUE,
      UNIQUE(reward_id, event_type, event_source_id, student_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reward_elig_reward ON reward_eligibility_events(reward_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reward_event_outbox (
      id              TEXT PRIMARY KEY,
      event_type      TEXT NOT NULL CHECK (event_type IN ('course_completion', 'quiz_pass', 'milestone', 'grade_approved', 'custom')),
      event_source_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      event_data      TEXT,
      status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
      attempt_count   INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      completed_at    TEXT,
      error_message   TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(event_type, event_source_id, student_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reward_outbox_status ON reward_event_outbox(status);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reward_refund_attempts (
      id                       TEXT PRIMARY KEY,
      reward_id                TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
      allocation_id            TEXT NOT NULL REFERENCES reward_allocations(id) ON DELETE RESTRICT,
      attempted_by_user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      attempted_amount_stroops INTEGER NOT NULL CHECK (attempted_amount_stroops > 0),
      currency_code            TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
      recipient_available_stroops INTEGER NOT NULL,
      status                   TEXT NOT NULL DEFAULT 'blocked' CHECK (status IN ('blocked', 'resolved')),
      resolution               TEXT CHECK (resolution IN ('retried_success', 'waived', 'escalated')),
      resolved_at              TEXT,
      resolved_by_user_id      TEXT REFERENCES users(id) ON DELETE RESTRICT,
      created_at               TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_refund_attempts_reward ON reward_refund_attempts(reward_id);
    CREATE INDEX IF NOT EXISTS idx_refund_attempts_status ON reward_refund_attempts(status);
  `);
}
ensureRewardTables();
```

Also add reward_balance migration. Add before `ensureRewardTables()`:

```typescript
function migrateRewardBalance(): void {
  // Check if migration already done
  const cols = db.pragma('table_info(users)') as Array<{ name: string }>;
  const hasLegacy = cols.some(c => c.name === 'reward_balance_legacy_real');
  const hasOriginal = cols.some(c => c.name === 'reward_balance');

  if (hasLegacy || !hasOriginal) return; // Already migrated or no column

  // Step 1: Inventory
  const inventory = db.prepare(
    "SELECT COUNT(*) as cnt, COALESCE(SUM(reward_balance), 0) as total FROM users WHERE reward_balance != 0"
  ).get() as { cnt: number; total: number };

  // Step 2: Rename column (requires legacy_alter_table already ON)
  db.exec("ALTER TABLE users RENAME COLUMN reward_balance TO reward_balance_legacy_real");
}
migrateRewardBalance();
```

Also add the `reward_high_value_threshold` column to tenant_settings:

```typescript
function ensureTenantSettingsRewardColumn(): void {
  const cols = db.pragma('table_info(tenant_settings)') as Array<{ name: string }>;
  if (!cols.some(c => c.name === 'reward_high_value_threshold')) {
    db.exec('ALTER TABLE tenant_settings ADD COLUMN reward_high_value_threshold INTEGER DEFAULT NULL');
  }
}
ensureTenantSettingsRewardColumn();
```

- [ ] **Step 4: Run schema tests to verify they pass**

```bash
cd LMS-Server && npx vitest run src/__tests__/reward-schema.test.ts
```
Expected: 11 tests PASS.

- [ ] **Step 5: Run full backend suite to verify no regressions**

```bash
cd LMS-Server && npx vitest run
```
Expected: 853 + 11 = 864 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd LMS-Server && git add src/config/database.ts src/__tests__/reward-schema.test.ts
git commit -m "feat(rewards): R2 — reward schema, migration, and constraint tests

- 9 new tables: reward_accounts, rewards (13-state), reward_allocations,
  reward_transactions, reward_audience_snapshots, reward_eligibility_events,
  reward_event_outbox, reward_refund_attempts
- Migrate users.reward_balance → reward_balance_legacy_real
- Add reward_high_value_threshold to tenant_settings
- 11 R-SCHEMA-* tests passing

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Currency Configuration and BigInt Boundaries (R3)

**Dependencies:** Task 1 (schema exists)
**Files:**
- Create: `LMS-Server/src/services/rewards/currencyConfig.ts`
- Create: `LMS-Server/src/services/rewards/rewardTypes.ts`
- Create: `LMS-Server/src/services/rewards/rewardErrors.ts`
- Create: `LMS-Server/src/__tests__/reward-currency.test.ts`

**Interfaces:**
- Produces: `parseStroops(input: string): bigint`, `calculateMaxExposure(amount: string|bigint, recipients: string|bigint): bigint`, `decimalXlmToStroops(value: string): bigint`, `SUPPORTED_CURRENCIES`, `MAX_SAFE_STROOPS`, `HIGH_VALUE_THRESHOLD_STROOPS`, `RewardError` class, all TypeScript interfaces

- [ ] **Step 1: Create rewardErrors.ts**

```typescript
// LMS-Server/src/services/rewards/rewardErrors.ts
export const REWARD_ERROR_CODES = {
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  AMOUNT_EXCEEDS_MAXIMUM: 'AMOUNT_EXCEEDS_MAXIMUM',
  EXPOSURE_EXCEEDS_MAXIMUM: 'EXPOSURE_EXCEEDS_MAXIMUM',
  UNSUPPORTED_CURRENCY: 'UNSUPPORTED_CURRENCY',
  INVALID_PRECISION: 'INVALID_PRECISION',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  SCOPE_DENIED: 'SCOPE_DENIED',
  DUPLICATE_OPERATION: 'DUPLICATE_OPERATION',
  REWARD_NOT_FOUND: 'REWARD_NOT_FOUND',
  INVALID_FUNDING_SOURCE: 'INVALID_FUNDING_SOURCE',
  CONFLICT_OF_INTEREST: 'CONFLICT_OF_INTEREST',
  INSUFFICIENT_RECIPIENT_BALANCE: 'INSUFFICIENT_RECIPIENT_BALANCE',
  MISSING_TARGET_TYPE: 'MISSING_TARGET_TYPE',
} as const;

export type RewardErrorCode = typeof REWARD_ERROR_CODES[keyof typeof REWARD_ERROR_CODES];

export class RewardError extends Error {
  code: RewardErrorCode;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(code: RewardErrorCode, message?: string, statusCode = 400, details?: Record<string, unknown>) {
    super(message ?? code);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
```

- [ ] **Step 2: Create currencyConfig.ts**

```typescript
// LMS-Server/src/services/rewards/currencyConfig.ts
import { RewardError } from './rewardErrors.js';

export const SUPPORTED_CURRENCIES = ['XLM'] as const;
export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

export const CURRENCY_SCALES: Record<CurrencyCode, bigint> = {
  XLM: 10_000_000n,
};

export const MAX_SAFE_STROOPS = 9_007_199_254_740_991n;
export const MAX_INDIVIDUAL_AMOUNT_STROOPS = 1_000_000_000_000n; // 100,000 XLM
export const MAX_RECIPIENTS = 10_000;
export const HIGH_VALUE_THRESHOLD_STROOPS = 1_000_000_000n; // 100 XLM

export function parseStroops(input: string): bigint {
  if (input.includes('.') || input.includes('e') || input.includes('E')) {
    throw new RewardError('INVALID_AMOUNT', 'Amount must be a whole number string (integer stroops)');
  }
  let n: bigint;
  try {
    n = BigInt(input);
  } catch {
    throw new RewardError('INVALID_AMOUNT', `Invalid stroop value: ${input}`);
  }
  if (n <= 0n) throw new RewardError('INVALID_AMOUNT', 'Amount must be positive');
  if (n > MAX_SAFE_STROOPS) throw new RewardError('AMOUNT_EXCEEDS_MAXIMUM', `Amount exceeds maximum of ${MAX_SAFE_STROOPS}`);
  return n;
}

export function calculateMaxExposure(amountStroops: string | bigint, maxRecipients: string | bigint): bigint {
  const amount = typeof amountStroops === 'string' ? BigInt(amountStroops) : amountStroops;
  const recipients = typeof maxRecipients === 'string' ? BigInt(maxRecipients) : maxRecipients;
  const exposure = amount * recipients;
  if (exposure > MAX_SAFE_STROOPS) {
    throw new RewardError('EXPOSURE_EXCEEDS_MAXIMUM', `Total exposure ${exposure} exceeds maximum`);
  }
  return exposure;
}

export function decimalXlmToStroops(value: string): bigint {
  const [whole, frac = ''] = value.split('.');
  if (frac.length > 7) {
    throw new RewardError('INVALID_PRECISION', 'XLM supports at most 7 decimal places');
  }
  const paddedFrac = frac.padEnd(7, '0').slice(0, 7);
  return BigInt(whole) * 10_000_000n + BigInt(paddedFrac);
}

export function validateCurrency(code: string): asserts code is CurrencyCode {
  if (!SUPPORTED_CURRENCIES.includes(code as CurrencyCode)) {
    throw new RewardError('UNSUPPORTED_CURRENCY', `Currency ${code} is not supported`);
  }
}
```

- [ ] **Step 3: Create rewardTypes.ts**

```typescript
// LMS-Server/src/services/rewards/rewardTypes.ts
export const REWARD_STATES = [
  'draft', 'pending_funding', 'funded', 'active',
  'eligible_pending_approval', 'approved', 'eligible_auto_release',
  'partially_released', 'released',
  'cancelled', 'expired',
  'partially_refunded', 'refunded',
] as const;
export type RewardState = typeof REWARD_STATES[number];

export const ALLOCATION_STATES = ['pending', 'eligible', 'released', 'cancelled', 'refunded'] as const;
export type AllocationState = typeof ALLOCATION_STATES[number];

export const SCOPE_TYPES = ['sponsor_cohort', 'employer_team', 'parent_child', 'parent_family', 'teacher_class'] as const;
export type ScopeType = typeof SCOPE_TYPES[number];

export const TRANSACTION_TYPES = ['fund', 'reserve', 'release', 'cancel', 'refund', 'expire'] as const;
export type TransactionType = typeof TRANSACTION_TYPES[number];

export const ACCOUNT_TYPES = ['funder', 'recipient', 'platform'] as const;
export type AccountType = typeof ACCOUNT_TYPES[number];

export const FUNDING_SOURCE_TYPES = ['platform_credit', 'admin_grant', 'stellar', 'paystack'] as const;
export type FundingSourceType = typeof FUNDING_SOURCE_TYPES[number];

export interface ScopeContext {
  actorId: string;
  scopeType: ScopeType;
  scopeId: string;
  idempotencyKey: string;
  currency?: string;
  amountStroops?: number;
}

export interface RewardRow {
  id: string;
  creator_user_id: string;
  scope_type: ScopeType;
  scope_id: string;
  reward_type: string;
  amount_mode: string;
  amount_stroops: number;
  max_recipients: number | null;
  currency_code: string;
  description: string | null;
  auto_release: number;
  eligibility_config: string | null;
  status: RewardState;
  idempotency_key: string;
  expires_at: string | null;
  funded_at: string | null;
  activated_at: string | null;
  eligible_at: string | null;
  approved_at: string | null;
  released_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RewardAccountRow {
  id: string;
  user_id: string;
  account_type: AccountType;
  available_stroops: number;
  reserved_stroops: number;
  currency_code: string;
  created_at: string;
  updated_at: string;
}

export interface AllocationRow {
  id: string;
  reward_id: string;
  student_user_id: string;
  amount_stroops: number;
  currency_code: string;
  status: AllocationState;
  idempotency_key: string;
  eligible_at: string | null;
  released_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  created_at: string;
}
```

- [ ] **Step 4: Write failing currency tests and run them**

Create `LMS-Server/src/__tests__/reward-currency.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  parseStroops, calculateMaxExposure, decimalXlmToStroops,
  validateCurrency, MAX_SAFE_STROOPS,
} from '../services/rewards/currencyConfig.js';
import { RewardError } from '../services/rewards/rewardErrors.js';

describe('Currency and BigInt Boundaries', () => {
  it('R-CURR-1: 1.50 XLM → 15,000,000 stroops exactly', () => {
    expect(decimalXlmToStroops('1.50')).toBe(15_000_000n);
    expect(decimalXlmToStroops('1.5')).toBe(15_000_000n);
    expect(decimalXlmToStroops('0.0000001')).toBe(1n);
  });

  it('R-CURR-2: precision beyond 7 decimals rejected', () => {
    expect(() => decimalXlmToStroops('1.00000001')).toThrow(RewardError);
  });

  it('R-CURR-3: ZAR rejected', () => {
    expect(() => validateCurrency('ZAR')).toThrow(RewardError);
  });

  it('R-CURR-4: USD rejected', () => {
    expect(() => validateCurrency('USD')).toThrow(RewardError);
  });

  it('R-CURR-5: amount exceeding MAX_SAFE_STROOPS rejected', () => {
    const tooLarge = (MAX_SAFE_STROOPS + 1n).toString();
    expect(() => parseStroops(tooLarge)).toThrow(RewardError);
  });

  it('R-CURR-6: BigInt exposure calculation correct', () => {
    const result = calculateMaxExposure('1000000000000', '10000');
    expect(result).toBe(10_000_000_000_000_000n);
    // But this should be within MAX_SAFE — verify it doesn't throw
    // Exceeding MAX_SAFE should throw
    expect(() => calculateMaxExposure('1000000000000', '10001')).toThrow(RewardError);
  });

  it('R-CURR-7: negative amounts rejected', () => {
    expect(() => parseStroops('-100')).toThrow(RewardError);
  });

  it('R-CURR-8: zero amounts rejected', () => {
    expect(() => parseStroops('0')).toThrow(RewardError);
  });

  it('R-CURR-9: string parsing works correctly', () => {
    expect(parseStroops('10000000')).toBe(10_000_000n);
    expect(parseStroops('1')).toBe(1n);
    expect(parseStroops('9007199254740991')).toBe(MAX_SAFE_STROOPS);
  });

  it('R-CURR-10: floating-point input rejected', () => {
    expect(() => parseStroops('100.5')).toThrow(RewardError);
    expect(() => parseStroops('1e7')).toThrow(RewardError);
  });
});
```

```bash
cd LMS-Server && npx vitest run src/__tests__/reward-currency.test.ts
```
Expected: 10 tests PASS (implementation created in step 2).

- [ ] **Step 5: Run full suite and commit**

```bash
cd LMS-Server && npx vitest run
```
Expected: 864 + 10 = 874 tests PASS.

```bash
git add src/services/rewards/ src/__tests__/reward-currency.test.ts
git commit -m "feat(rewards): R3 — currency config, BigInt boundaries, types, and errors

- currencyConfig.ts: parseStroops(), calculateMaxExposure(), decimalXlmToStroops()
- rewardTypes.ts: 13 reward states, 5 allocation states, row interfaces
- rewardErrors.ts: typed RewardError with error codes
- 10 R-CURR-* tests passing

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Balance Service and Reward Accounts (R4)

**Dependencies:** Task 1, Task 2
**Files:**
- Create: `LMS-Server/src/services/rewards/rewardBalanceService.ts`
- Create: `LMS-Server/src/__tests__/reward-balance.test.ts`

**Interfaces:**
- Consumes: `currencyConfig.ts` (parseStroops, MAX_SAFE_STROOPS), `rewardTypes.ts` (RewardAccountRow, AccountType), database helpers
- Produces: `getOrCreateAccount(userId: string, accountType: AccountType, currency?: string): RewardAccountRow`, `creditAvailable(accountId: string, amount: number): void`, `debitAvailable(accountId: string, amount: number): void`, `creditReserved(accountId: string, amount: number): void`, `debitReserved(accountId: string, amount: number): void`, `getAccount(userId: string, accountType: AccountType, currency?: string): RewardAccountRow | null`

See the spec §2.2 and §2.9 for details. The tests should cover R-BAL-1 through R-BAL-10 from the todo list. Implementation uses `queryOne()` and `execute()` from `database.ts`.

- [ ] **Step 1: Write failing balance tests** (10 tests from todo R4)
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement rewardBalanceService.ts**
- [ ] **Step 4: Run tests to verify pass**
- [ ] **Step 5: Full suite and commit**

---

## Task 4: Ledger, Idempotency, and Transaction Helpers (R5)

**Dependencies:** Task 3
**Files:**
- Create: `LMS-Server/src/services/rewards/rewardLedger.ts`
- Create: `LMS-Server/src/services/rewards/rewardIdempotencyService.ts`
- Create: `LMS-Server/src/__tests__/reward-ledger.test.ts`

**Interfaces:**
- Consumes: `rewardBalanceService.ts` (credit/debit functions), database helpers, `rewardTypes.ts`
- Produces: `writeLedgerEntry(params: LedgerEntryParams): string`, `checkIdempotency(key: string): { exists: boolean; result?: unknown }`, `reconcileAccount(userId: string, accountType: AccountType): { computed: { available: number; reserved: number }; stored: { available: number; reserved: number }; matches: boolean }`

The 26 tests (R-LED-1 through R-LED-20, R-IDEM-1 through R-IDEM-6) verify all 6 transaction types, invalid shapes, reconciliation, and idempotency. Each test creates accounts, performs mutations, and checks ledger+balance consistency.

- [ ] **Step 1: Write failing ledger tests** (26 tests)
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement rewardLedger.ts and rewardIdempotencyService.ts**
- [ ] **Step 4: Run tests to verify pass**
- [ ] **Step 5: Full suite and commit**

---

## Task 5: Reward State Machine (R6)

**Dependencies:** Task 4
**Files:**
- Create: `LMS-Server/src/services/rewards/rewardStateMachine.ts`
- Create: `LMS-Server/src/__tests__/reward-state-machine.test.ts`

**Interfaces:**
- Consumes: `rewardTypes.ts` (RewardState, REWARD_STATES)
- Produces: `validateTransition(currentState: RewardState, targetState: RewardState, context?: { autoRelease?: boolean }): boolean`, `getNextStates(currentState: RewardState, context?: { autoRelease?: boolean }): RewardState[]`, `deriveAggregateStatus(allocations: Array<{ status: AllocationState }>): RewardState`

The state machine is a pure function — no database access. It validates transitions per the 20 allowed transitions and 5 blocked transitions in the spec §3.2. The `deriveAggregateStatus` function computes reward status from allocation states per §3.4.

- [ ] **Step 1: Write 9 failing R-SM-* tests**
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement rewardStateMachine.ts with transition map**
- [ ] **Step 4: Run tests to verify pass**
- [ ] **Step 5: Full suite and commit**

---

## Task 6: Audience Snapshots and Scope Service (R7)

**Dependencies:** Task 5
**Files:**
- Create: `LMS-Server/src/services/rewards/rewardScopeService.ts`
- Create: `LMS-Server/src/__tests__/reward-scope.test.ts`

**Interfaces:**
- Consumes: `rewardTypes.ts` (ScopeType), database helpers, `rewardErrors.ts`
- Produces: `validateScope(actorId: string, scopeType: ScopeType, scopeId: string): boolean`, `resolveAudienceMembers(scopeType: ScopeType, scopeId: string, actorId: string): string[]`, `createAudienceSnapshot(rewardId: string, memberIds: string[]): number`, `isSnapshotMember(rewardId: string, studentId: string): boolean`

Uses the scope queries from each role-specific spec (sponsor_cohorts JOIN cohort_members, user_groups JOIN user_group_members, user_links). Tests seed scope data (users, links, groups, cohorts) and verify positive/negative access.

- [ ] **Step 1: Write 9 failing R-SCOPE-* tests**
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement rewardScopeService.ts with 4 scope queries**
- [ ] **Step 4: Run tests to verify pass**
- [ ] **Step 5: Full suite and commit**

---

## Task 7: Permission Migration (R8 — permissions only)

**Dependencies:** Task 1 (schema)
**Files:**
- Modify: `LMS-Server/src/config/database.ts` (seedRbacData function)
- Modify: `LMS-Server/src/__tests__/rbac-wallet-invariant.test.ts`

**Interfaces:**
- Produces: 7 new permissions seeded, reward.give removed from all role assignments, updated invariant tests

This task updates `seedRbacData()` to INSERT the 7 new permissions (perm_reward_create, perm_reward_fund, perm_reward_activate, perm_reward_approve, perm_reward_cancel, perm_reward_view_assigned, perm_reward_refund), DELETE all role_permissions referencing perm_reward_give, and INSERT new role_permissions per the matrix in spec §4.2. The invariant test file is updated to assert the new permission names.

- [ ] **Step 1: Update seedRbacData() with new permissions and role assignments**
- [ ] **Step 2: Update rbac-wallet-invariant.test.ts to verify new permission names**
- [ ] **Step 3: Write 5 R-PERM-* tests**
- [ ] **Step 4: Run invariant tests and full suite**
- [ ] **Step 5: Commit**

---

## Task 8: Reward Orchestration Service (R8 — service)

**Dependencies:** Tasks 3-7
**Files:**
- Create: `LMS-Server/src/services/rewards/rewardService.ts`

**Interfaces:**
- Consumes: All reward service modules (balance, ledger, state machine, scope, idempotency, currency)
- Produces: `createReward(ctx: ScopeContext, params: CreateRewardParams): RewardRow`, `fundReward(rewardId: string, actorId: string, source: FundingSource, idempotencyKey: string): RewardRow`, `activateReward(rewardId: string, actorId: string, idempotencyKey: string): RewardRow`, `approveReward(rewardId: string, actorId: string, idempotencyKey: string): RewardRow`, `cancelReward(rewardId: string, actorId: string, reason: string, idempotencyKey: string): RewardRow`, `getReward(rewardId: string): RewardRow | null`, `listRewards(scopeType: ScopeType, scopeId: string, actorId: string, filters?: RewardFilters): RewardRow[]`, `releaseAllocation(allocationId: string, actorId: string, idempotencyKey: string): AllocationRow`, `refundAllocation(allocationId: string, actorId: string, idempotencyKey: string): AllocationRow | { blocked: true; attemptId: string }`

Each method wraps a `db.transaction()` that validates scope, checks state transition, checks idempotency, mutates balances, writes ledger entries, and updates status. The `fundReward` method creates 2 ledger entries (fund + reserve) atomically per spec §2.7.

- [ ] **Step 1: Implement rewardService.ts with all public methods**
- [ ] **Step 2: Run existing tests to verify no regressions**
- [ ] **Step 3: Commit**

---

## Task 9: Sponsor/Employer Reward Routes (R9)

**Dependencies:** Task 8
**Files:**
- Modify: `LMS-Server/src/routes/sponsor.ts` (add reward endpoints)
- Modify: `LMS-Server/src/routes/employer.ts` (add reward endpoints)
- Create: `LMS-Server/src/routes/rewards.ts` (admin reward endpoints)
- Modify: `LMS-Server/src/app.ts` (mount routes)
- Create: `LMS-Server/src/__tests__/reward-sponsor.test.ts`
- Create: `LMS-Server/src/__tests__/reward-employer.test.ts`

**Interfaces:**
- Consumes: `rewardService.ts` (all CRUD methods), `requirePermission()` middleware
- Produces: `POST /sponsor/rewards`, `POST /sponsor/rewards/:id/fund`, `POST /sponsor/rewards/:id/activate`, `POST /sponsor/rewards/:id/approve`, `POST /sponsor/rewards/:id/cancel`, `GET /sponsor/rewards`, `GET /sponsor/rewards/:id`, `GET /sponsor/rewards/:id/allocations`, `GET /sponsor/rewards/:id/transactions` (identical for employer with `/employer/` prefix), `GET /admin/rewards/reconciliation`, `POST /admin/rewards/:id/verify-funding`

Each route is a thin adapter: authenticate → requirePermission → extract body/params → call rewardService → return response. Tests use `makeToken()`, `seedUser()`, and seed scope data (cohorts, team groups) to verify 16 sponsor tests (BR-S-1 through BR-S-16) and 8 employer tests (BR-E-1 through BR-E-8).

- [ ] **Step 1: Write 16 failing BR-S-* sponsor tests**
- [ ] **Step 2: Write 8 failing BR-E-* employer tests**
- [ ] **Step 3: Run tests to verify failure**
- [ ] **Step 4: Implement sponsor reward routes in sponsor.ts**
- [ ] **Step 5: Implement employer reward routes in employer.ts**
- [ ] **Step 6: Implement admin reward routes in rewards.ts**
- [ ] **Step 7: Mount routes in app.ts**
- [ ] **Step 8: Run tests to verify pass**
- [ ] **Step 9: Full suite and commit**

---

## Task 10: Parent Reward Routes (R10)

**Dependencies:** Task 8
**Files:**
- Modify: `LMS-Server/src/routes/parent.ts` (add reward endpoints, update /parent/wallets)
- Create: `LMS-Server/src/__tests__/reward-parent.test.ts`

**Interfaces:**
- Consumes: `rewardService.ts`, `requirePermission()`, `rewardScopeService.ts`
- Produces: `POST /parent/rewards` (with `target_type` field), `POST /parent/rewards/:id/fund`, `POST /parent/rewards/:id/activate`, `POST /parent/rewards/:id/approve`, `POST /parent/rewards/:id/cancel`, `GET /parent/rewards`, `GET /parent/rewards/:id`, `GET /parent/rewards/:id/allocations`, `GET /parent/rewards/:id/transactions`

The create endpoint validates `target_type` (child|family) and maps to `scope_type` (parent_child|parent_family). The `/parent/wallets` endpoint is updated to query `reward_accounts` instead of `users.reward_balance_legacy_real`. Tests verify 20 parent cases including CR-P-19/CR-P-20 for target_type validation.

- [ ] **Step 1: Write 20 failing CR-P-* tests**
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement parent reward routes and update /parent/wallets**
- [ ] **Step 4: Run tests including wallet invariant**
- [ ] **Step 5: Full suite and commit**

---

## Task 11: Teacher Reward Routes (R11)

**Dependencies:** Task 8
**Files:**
- Modify: `LMS-Server/src/routes/teacher.ts` (add reward endpoints)
- Create: `LMS-Server/src/__tests__/reward-teacher.test.ts`

**Interfaces:**
- Consumes: `rewardService.ts`, `requirePermission()`, `rewardScopeService.ts`
- Produces: `POST /teacher/rewards`, `POST /teacher/rewards/:id/fund`, etc. (same pattern as sponsor)

- [ ] **Step 1: Write 18 failing CTR-T-* tests** (including grade safeguard tests CTR-T-13 through CTR-T-17)
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement teacher reward routes**
- [ ] **Step 4: Run tests including wallet invariant**
- [ ] **Step 5: Full suite and commit**

---

## Task 12: Outbox and Eligibility Processing (R12)

**Dependencies:** Tasks 9-11 (routes exist to trigger events)
**Files:**
- Create: `LMS-Server/src/services/rewards/rewardEligibilityService.ts`
- Modify: `LMS-Server/src/controllers/lessonCompletions.ts` (add outbox event)
- Modify: `LMS-Server/src/controllers/quizzesController.ts` (add outbox event)
- Modify: `LMS-Server/src/controllers/submissionsController.ts` (add outbox event for grade_approved)
- Create: `LMS-Server/src/__tests__/reward-eligibility.test.ts`

**Interfaces:**
- Consumes: `rewardService.ts`, database helpers, `rewardTypes.ts`
- Produces: `produceOutboxEvent(db: Database, eventType: string, sourceId: string, studentId: string, eventData?: Record<string, unknown>): void` (called inside existing controller transactions), `processPendingEvents(): { processed: number; failed: number }`, `evaluateEligibility(event: OutboxEvent, reward: RewardRow): 'eligible' | 'ineligible' | 'already_processed'`

Each controller that completes a lesson, passes a quiz, or approves a grade adds an `INSERT OR IGNORE INTO reward_event_outbox` inside the same db.transaction(). After the transaction commits, `processPendingEvents()` is called best-effort. The processor checks audience snapshot membership, evaluates conditions, creates eligibility events, and optionally triggers auto-release.

Grade safeguards: for `grade_approved` events, the processor queries `submissions.reviewed_by_id`, looks up the reviewer's roles via RBAC, and rejects if reviewer is TA-only or is the reward creator.

- [ ] **Step 1: Write 8 failing R-ELIG-* tests**
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement rewardEligibilityService.ts**
- [ ] **Step 4: Add outbox event production to 3 controllers**
- [ ] **Step 5: Run tests to verify pass**
- [ ] **Step 6: Full suite and commit**

---

## Task 13: Release Policies (R13)

**Dependencies:** Task 12
**Files:**
- Modify: `LMS-Server/src/services/rewards/rewardService.ts` (add release logic)
- Create: `LMS-Server/src/__tests__/reward-release.test.ts`

**Interfaces:**
- Consumes: `rewardStateMachine.ts` (deriveAggregateStatus), `rewardLedger.ts`, `rewardBalanceService.ts`
- Produces: Release flow integrated into eligibility processing — when `auto_release=1` and amount below high-value threshold, release executes automatically. When `auto_release=0` or above threshold, transitions to `eligible_pending_approval`.

Tests verify 9 R-REL-* cases: auto-release, manual approval, high-value override, balance mutations, group partially_released → released transitions.

- [ ] **Step 1: Write 9 failing R-REL-* tests**
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement release logic in rewardService.ts**
- [ ] **Step 4: Run tests to verify pass**
- [ ] **Step 5: Full suite and commit**

---

## Task 14: Cancellation, Expiry, and Refund/Dispute (R14)

**Dependencies:** Task 13
**Files:**
- Modify: `LMS-Server/src/services/rewards/rewardService.ts` (cancel, expire, refund methods)
- Modify: `LMS-Server/src/routes/disputes.ts` (extend for reward disputes)
- Create: `LMS-Server/src/__tests__/reward-lifecycle.test.ts`

**Interfaces:**
- Consumes: `rewardStateMachine.ts`, `rewardLedger.ts`, `rewardBalanceService.ts`, `notificationService.ts`
- Produces: `cancelReward()` returns reserved funds to funder.available, `expireReward()` is system-triggered with system actor, `refundAllocation()` checks recipient balance before refund — if insufficient, creates `reward_refund_attempts` record and returns 409

Tests verify 12 R-LIFE-* cases including blocked refund invariants (no ledger entry, no state change, no balance change).

- [ ] **Step 1: Write 12 failing R-LIFE-* tests**
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement cancel/expire/refund logic**
- [ ] **Step 4: Extend disputes.ts with reward dispute endpoint**
- [ ] **Step 5: Run tests to verify pass**
- [ ] **Step 6: Full suite and commit**

---

## Task 15: Frontend Reward Views (R15)

**Dependencies:** Task 14 (backend complete)
**Files:**
- Create: `LMS-Frontend/src/components/RewardDashboard.tsx`
- Create: `LMS-Frontend/src/components/RewardCreateForm.tsx`
- Create: `LMS-Frontend/src/components/RewardStatusBadge.tsx`
- Create: `LMS-Frontend/src/services/rewardService.ts`
- Create: `LMS-Frontend/src/__tests__/reward-components.test.tsx`

**Interfaces:**
- Consumes: Backend reward API endpoints
- Produces: React components for reward management per role

Tests verify 8 R-FE-* cases: render for each role, amount validation, status badge states, privacy (no funder data in student view).

- [ ] **Step 1: Write 8 failing R-FE-* tests**
- [ ] **Step 2: Run frontend tests to verify failure**
- [ ] **Step 3: Implement frontend components and service**
- [ ] **Step 4: Run frontend tests to verify pass**
- [ ] **Step 5: Full frontend suite and commit**

---

## Task 16: Security and Financial Invariant Verification (R16)

**Dependencies:** Task 15
**Files:**
- Create: `LMS-Server/src/__tests__/reward-security.test.ts`

**Interfaces:**
- Consumes: All reward endpoints, rewardService, rewardLedger
- Produces: 8 R-SEC-* integration tests verifying cross-cutting security

Tests are integration-level: verify non-parent roles cannot access wallets (via API), cross-scope access denied, student views have no funder data, no floating-point in accounting (inspect ledger entries), financial records not cascade-deletable, all ledger entries have idempotency keys, balance reconciliation matches.

- [ ] **Step 1: Write 8 failing R-SEC-* tests**
- [ ] **Step 2: Run tests to verify failure** (some may pass immediately as existing security is correct)
- [ ] **Step 3: Fix any security gaps found**
- [ ] **Step 4: Run full backend + frontend suites**
- [ ] **Step 5: Commit**

---

## Task 17: Full Regression Testing (R17)

**Dependencies:** Task 16
**Files:** None (test-only)

- [ ] **Step 1: Run complete backend suite**

```bash
cd LMS-Server && npx vitest run
```
Expected: ~983+ tests PASS (853 baseline + ~130 new reward tests).

- [ ] **Step 2: Run complete frontend suite**

```bash
cd LMS-Frontend && npx vitest run
```
Expected: ~201+ tests PASS (193 baseline + ~8 new reward tests).

- [ ] **Step 3: Run wallet invariant tests specifically**

```bash
cd LMS-Server && npx vitest run src/__tests__/rbac-wallet-invariant.test.ts
```
Expected: All WALLET-INV-* and REWARD-INV-* tests PASS.

- [ ] **Step 4: Verify state count = 13 in all documents**

```bash
grep -r "13" docs/superpowers/specs/*reward* docs/superpowers/diagrams/reward-state-machine.md | grep -i state
```

- [ ] **Step 5: Report actual test counts**

---

## Task 18: Code Review, Merge, Tag, and Push (R18)

**Dependencies:** Task 17
**Files:**
- Modify: `docs/superpowers/diagrams/phase-dependency.md` (update BR/CR/CTR status)
- Modify: `docs/superpowers/plans/2026-08-13-reward-build-todo.md` (mark all complete)

- [ ] **Step 1: Request code review** (using requesting-code-review skill)
- [ ] **Step 2: Address review feedback**
- [ ] **Step 3: Final full-suite run (backend + frontend)**
- [ ] **Step 4: Update phase-dependency.md — mark BR, CR, CTR as COMPLETE**
- [ ] **Step 5: Update reward-build-todo.md — mark all loops complete**
- [ ] **Step 6: Commit all changes**

```bash
git add -A
git commit -m "feat(rewards): complete LMS XLM Reward System

- Reward Foundation: 13-state machine, integer stroop ledger, balance buckets
- BR: Sponsor/employer reward routes (24 tests)
- CR: Parent reward routes with target_type (20 tests)
- CTR: Teacher reward routes with grade safeguards (18 tests)
- Transactional outbox for eligibility processing
- Blocked refunds: reward_refund_attempts audit table
- Permission migration: reward.give → 7 granular permissions
- Frontend: RewardDashboard, RewardCreateForm, RewardStatusBadge
- All specs, diagrams, and todo updated

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 7: Tag release**

```bash
git tag reward-system-complete-2026-08-13
```

- [ ] **Step 8: Push**

```bash
source ~/.env.git-write && git push https://"$GH_TOKEN"@github.com/SM-Web-Systems/lms-crypto-production.git main --tags
```

- [ ] **Step 9: Verify remote HEAD**

```bash
source ~/.env.git-write && git ls-remote https://"$GH_TOKEN"@github.com/SM-Web-Systems/lms-crypto-production.git HEAD
```

---

## Dependency Graph

```
Task 1 (Schema) ──────┬──► Task 2 (Currency) ──┬──► Task 3 (Balance) ──► Task 4 (Ledger) ──► Task 5 (State Machine)
                       │                        │                                              │
                       └──► Task 7 (Permissions) │                                              ▼
                                                 │                                    Task 6 (Scope) ──► Task 8 (Service)
                                                 │                                                         │
                                                 │                              ┌──────────────────────────┼──────────────┐
                                                 │                              ▼                          ▼              ▼
                                                 │                    Task 9 (Sponsor/Employer)  Task 10 (Parent)  Task 11 (Teacher)
                                                 │                              │                          │              │
                                                 │                              └──────────────────────────┼──────────────┘
                                                 │                                                         ▼
                                                 │                                               Task 12 (Eligibility)
                                                 │                                                         │
                                                 │                                               Task 13 (Release)
                                                 │                                                         │
                                                 │                                               Task 14 (Lifecycle)
                                                 │                                                         │
                                                 │                                               Task 15 (Frontend)
                                                 │                                                         │
                                                 │                                               Task 16 (Security)
                                                 │                                                         │
                                                 │                                               Task 17 (Regression)
                                                 │                                                         │
                                                 └─────────────────────────────────────────────► Task 18 (Ship)
```

**Parallelizable:** Tasks 9, 10, 11 (after Task 8 completes) — but only in separate worktrees. They share no files except reading from rewardService.ts.

**Cannot parallelize:** Tasks 1-8 (sequential foundation), Tasks 12-18 (sequential integration).

## Rollback Strategy

Each task is independently revertable:
- **Tasks 1-2:** Delete new files, revert database.ts
- **Tasks 3-6:** Delete service files under `src/services/rewards/`
- **Task 7:** Revert seedRbacData changes, revert invariant test
- **Task 8:** Delete rewardService.ts
- **Tasks 9-11:** Revert route file changes, delete test files
- **Tasks 12-14:** Revert controller hooks, delete eligibility/release/lifecycle tests
- **Task 15:** Delete frontend reward files
- **Tasks 16-18:** Test/doc-only, no production code to revert

Full rollback: `git revert` to the pre-reward tag.
