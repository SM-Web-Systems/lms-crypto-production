# Reward Foundation Specification

**Date:** 2026-08-13
**Status:** Design — pending implementation
**Depends on:** Phase A (complete), Phase F (complete)
**Blocks:** BR (Sponsor/Employer rewards), CR (Parent rewards), CTR (Teacher rewards)

## 1. Scope

Build the shared reward domain: schema, state machine, ledger, balance service,
scope enforcement, idempotency, and currency configuration. All role-specific
reward routes (BR, CR, CTR) depend on this foundation.

### Non-Goals

- Multi-currency support (XLM only in this phase).
- Total-budget allocation mode (per-recipient only).
- Implicit foreign-exchange conversion.
- Blockchain-backed escrow.
- Student-wallet integration for reward payouts (rewards stay on-platform).
- Frontend reward views (separate phase after backend contracts are tested).

## 2. Data Model

### 2.1 Currency Configuration

All monetary values use integer stroops. 1 XLM = 10,000,000 stroops.

```typescript
// src/services/rewards/currencyConfig.ts
export const SUPPORTED_CURRENCIES = ['XLM'] as const;
export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

export const CURRENCY_SCALES: Record<CurrencyCode, bigint> = {
  XLM: 10_000_000n,
};

export const MAX_SAFE_STROOPS = 9_007_199_254_740_991n; // Number.MAX_SAFE_INTEGER as bigint
// Product limit: ~900,719 XLM per account. Documented ceiling.

export const MAX_INDIVIDUAL_AMOUNT_STROOPS = 1_000_000_000_000n; // 100,000 XLM
export const MAX_RECIPIENTS = 10_000;
// MAX_TOTAL_EXPOSURE = MAX_INDIVIDUAL_AMOUNT * MAX_RECIPIENTS checked via BigInt

// High-value auto-release threshold: rewards above this require manual
// approval regardless of auto_release setting.
// Resolution order: tenant_settings.reward_high_value_threshold → system default.
// Min: 10_000_000n (1 XLM). Max: MAX_SAFE_STROOPS. Evaluated at activation time.
export const HIGH_VALUE_THRESHOLD_STROOPS = 1_000_000_000n; // 100 XLM

// Tenant override: tenant_settings table already exists (Phase A8).
// Column: reward_high_value_threshold INTEGER DEFAULT NULL
// NULL = use system default. Non-null = override for that tenant.
// Service checks: tenantSettings?.reward_high_value_threshold ?? HIGH_VALUE_THRESHOLD_STROOPS
```

### 2.2 reward_accounts Table

Separates funder and recipient balances. Replaces `users.reward_balance`.

```sql
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
```

**Semantics:**
- **funder** (sponsor/employer/parent/teacher): `available_stroops` = can fund new
  rewards; `reserved_stroops` = locked in active/eligible rewards.
- **recipient** (student): `available_stroops` = rewards received and claimable;
  `reserved_stroops` = always 0 (no student reservation use case).
- **platform**: system-level account for admin grants and platform credits.

### 2.3 rewards Table

Replaces the existing 3-state stub.

```sql
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
  amount_mode           TEXT NOT NULL DEFAULT 'per_recipient' CHECK (
    amount_mode IN ('per_recipient')
  ),
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
```

**State count: 13** (draft, pending_funding, funded, active,
eligible_pending_approval, approved, eligible_auto_release,
partially_released, released, cancelled, expired, partially_refunded, refunded).

`approved` is a **persistent reward state** stored in the `status` column. It
represents the period after manual approval but before the release transaction
executes. The transition `approved → released` (or `approved → partially_released`
for group rewards) completes the release.

### 2.4 reward_audience_snapshots Table

Freezes group membership at activation time.

```sql
CREATE TABLE IF NOT EXISTS reward_audience_snapshots (
  id            TEXT PRIMARY KEY,
  reward_id     TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  snapshot_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(reward_id, student_user_id)
);
CREATE INDEX IF NOT EXISTS idx_reward_audience_reward ON reward_audience_snapshots(reward_id);
```

**Audience snapshot policy:** At activation, the service resolves all authorized
scope members (cohort members, team members, linked children, class students) and
inserts them into `reward_audience_snapshots`. Only snapshot members can receive
allocations. Later membership changes do not expand financial exposure.

### 2.5 reward_allocations Table

Per-student allocation for group and individual rewards.

```sql
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
```

### 2.6 reward_transactions Table (Immutable Ledger)

```sql
CREATE TABLE IF NOT EXISTS reward_transactions (
  id                      TEXT PRIMARY KEY,
  reward_id               TEXT REFERENCES rewards(id) ON DELETE RESTRICT,
  allocation_id           TEXT REFERENCES reward_allocations(id) ON DELETE RESTRICT,

  source_account_type     TEXT NOT NULL CHECK (source_account_type IN (
    'external', 'platform', 'funder', 'recipient'
  )),
  source_bucket           TEXT CHECK (source_bucket IN ('available', 'reserved')),
  source_user_id          TEXT REFERENCES users(id) ON DELETE RESTRICT,

  destination_account_type TEXT NOT NULL CHECK (destination_account_type IN (
    'funder', 'recipient', 'platform'
  )),
  destination_bucket      TEXT NOT NULL CHECK (destination_bucket IN ('available', 'reserved')),
  destination_user_id     TEXT REFERENCES users(id) ON DELETE RESTRICT,

  actor_type              TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'system')),
  actor_user_id           TEXT REFERENCES users(id) ON DELETE RESTRICT,

  transaction_type        TEXT NOT NULL CHECK (transaction_type IN (
    'fund', 'reserve', 'release', 'cancel', 'refund', 'expire'
  )),
  amount_stroops          INTEGER NOT NULL CHECK (amount_stroops > 0),
  currency_code           TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),

  previous_state          TEXT NOT NULL,
  new_state               TEXT NOT NULL,

  funding_source_type     TEXT CHECK (funding_source_type IN (
    'platform_credit', 'admin_grant', 'stellar', 'paystack'
  )),
  funding_reference       TEXT,

  source_event_id         TEXT,
  idempotency_key         TEXT NOT NULL UNIQUE,
  reason                  TEXT,
  metadata                TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),

  -- Actor consistency
  CHECK (
    (actor_type = 'system' AND actor_user_id IS NULL) OR
    (actor_type = 'user' AND actor_user_id IS NOT NULL)
  ),
  -- Fund transactions require funding source
  CHECK (
    (transaction_type = 'fund' AND funding_source_type IS NOT NULL) OR
    (transaction_type != 'fund')
  ),
  -- Release and refund require allocation and destination user
  CHECK (
    (transaction_type IN ('release', 'refund') AND allocation_id IS NOT NULL
      AND destination_user_id IS NOT NULL) OR
    (transaction_type NOT IN ('release', 'refund'))
  ),
  -- Reserve, cancel, expire require source user (funder)
  CHECK (
    (transaction_type IN ('reserve', 'cancel', 'expire') AND source_user_id IS NOT NULL) OR
    (transaction_type NOT IN ('reserve', 'cancel', 'expire'))
  ),
  -- Fund requires destination user (funder) and no destination of recipient type
  CHECK (
    (transaction_type = 'fund' AND destination_user_id IS NOT NULL
      AND destination_account_type = 'funder') OR
    (transaction_type != 'fund')
  )
);
CREATE INDEX IF NOT EXISTS idx_reward_txn_reward ON reward_transactions(reward_id);
CREATE INDEX IF NOT EXISTS idx_reward_txn_allocation ON reward_transactions(allocation_id);
CREATE INDEX IF NOT EXISTS idx_reward_txn_idem ON reward_transactions(idempotency_key);
```

### 2.7 Transaction Shape Definitions

| Type | source_account_type | source_bucket | source_user_id | dest_account_type | dest_bucket | dest_user_id | funding_source_type | allocation_id |
|------|-------------------|---------------|----------------|-------------------|-------------|-------------|-------------------|---------------|
| fund | external/platform | NULL | NULL | funder | available | funder | REQUIRED | NULL |
| reserve | funder | available | funder | funder | reserved | funder | NULL | NULL |
| release | funder | reserved | funder | recipient | available | student | NULL | REQUIRED |
| cancel | funder | reserved | funder | funder | available | funder | NULL | optional |
| expire | funder | reserved | funder | funder | available | funder | NULL | NULL |
| refund | recipient | available | student | funder | available | funder | NULL | REQUIRED |

**fund + reserve** are 2 separate ledger entries inside one atomic SQLite
transaction. The external/platform source must be verified before the
transaction begins (Paystack payment confirmed, Stellar tx verified, admin
grant authorized).

### 2.8 reward_eligibility_events Table

```sql
CREATE TABLE IF NOT EXISTS reward_eligibility_events (
  id              TEXT PRIMARY KEY,
  reward_id       TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
  allocation_id   TEXT REFERENCES reward_allocations(id) ON DELETE RESTRICT,
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'course_completion', 'quiz_pass', 'milestone', 'grade_approved', 'custom'
  )),
  event_source_id TEXT NOT NULL,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  evaluated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  result          TEXT NOT NULL CHECK (result IN (
    'eligible', 'ineligible', 'already_processed'
  )),
  idempotency_key TEXT NOT NULL UNIQUE,
  UNIQUE(reward_id, event_type, event_source_id, student_user_id)
);
CREATE INDEX IF NOT EXISTS idx_reward_elig_reward ON reward_eligibility_events(reward_id);
```

### 2.9 Migration Strategy

**Step 1:** Inventory existing `reward_balance` values.
```sql
SELECT COUNT(*), SUM(reward_balance), MIN(reward_balance), MAX(reward_balance)
FROM users WHERE reward_balance != 0;
```
If any non-zero values exist, convert using decimal-safe string parsing
(not `Number * scale`).

**Step 2:** Create `reward_accounts` table. For each user with non-zero
`reward_balance`, create a funder account with
`available_stroops = decimalToStroops(reward_balance)`.

**Step 3:** Verify: `SUM(reward_accounts.available_stroops)` equals
`decimalToStroops(SUM(users.reward_balance))`.

**Step 4:** Rename old column: `ALTER TABLE users RENAME COLUMN reward_balance
TO reward_balance_legacy_real`.

**Step 5:** Switch all application reads/writes to `reward_accounts`.

**Step 6:** Drop the existing `rewards` table (stub) and recreate with new
schema. The stub has no functional data.

**Step 7:** Create all new tables (reward_allocations, reward_transactions,
reward_eligibility_events, reward_audience_snapshots).

**Decimal-safe conversion:**
```typescript
function decimalXlmToStroops(value: string): bigint {
  // Parse "1.50" → 15000000n without floating-point multiplication
  const [whole, frac = ''] = value.split('.');
  const paddedFrac = frac.padEnd(7, '0').slice(0, 7);
  return BigInt(whole) * 10_000_000n + BigInt(paddedFrac);
}
```

**Restart safety:** Migration checks if `reward_accounts` table exists before
running. If table exists and `reward_balance_legacy_real` column exists,
migration is already complete.

## 3. Reward State Machine

### 3.1 Reward States (13 total)

| # | State | Description |
|---|-------|-------------|
| 1 | draft | Created, not yet submitted for funding |
| 2 | pending_funding | Awaiting external/platform funding |
| 3 | funded | Funds deposited and reserved in funder account |
| 4 | active | Monitoring eligibility events; audience snapshot frozen |
| 5 | eligible_pending_approval | Eligibility met, auto_release=0, awaiting creator/admin approval |
| 6 | approved | Manually approved, release transaction pending |
| 7 | eligible_auto_release | Eligibility met, auto_release=1, release proceeding automatically |
| 8 | partially_released | Group reward: at least one allocation released, more pending |
| 9 | released | All allocations in terminal state, at least one was released |
| 10 | cancelled | Cancelled before any release; reserved funds returned to funder |
| 11 | expired | Expired (system); unreleased reserved funds returned to funder |
| 12 | partially_refunded | Some released allocations refunded, not all |
| 13 | refunded | All released allocations refunded via dispute workflow |

### 3.2 Allowed Transitions

```
draft → pending_funding                    [creator submits]
pending_funding → funded                   [funding verified + reserved]
funded → active                            [creator activates; audience snapshot created]
active → eligible_pending_approval         [event triggers; auto_release=0]
active → eligible_auto_release             [event triggers; auto_release=1, below threshold]
eligible_pending_approval → approved       [creator/admin approves]
approved → released                        [individual: release executes]
approved → partially_released              [group: first allocation released]
eligible_auto_release → released           [individual: auto-release executes]
eligible_auto_release → partially_released [group: first auto-release]
partially_released → partially_released    [additional allocations released]
partially_released → released              [all allocations in terminal state]
active → cancelled                         [creator cancels]
active → expired                           [system: expires_at passed]
eligible_pending_approval → cancelled      [creator cancels before approval]
eligible_auto_release → cancelled          [creator cancels before release]
funded → cancelled                         [creator cancels before activation]
released → partially_refunded              [first allocation refunded via dispute]
released → refunded                        [single-allocation reward fully refunded]
partially_refunded → partially_refunded    [additional refunds]
partially_refunded → refunded              [all released allocations refunded]
```

**Blocked transitions:**
- `partially_released → cancelled` — cannot cancel after any release
- `released → cancelled` — must use dispute/refund
- No state → `eligible_auto_release` if `auto_release=0`
- No state → `approved` if `auto_release=1` (auto skips approval)
- `eligible_pending_approval → eligible_auto_release` — cannot change release policy

### 3.3 Allocation State Transitions

```
pending → eligible      [eligibility event matches]
eligible → released     [approved or auto-released]
eligible → cancelled    [creator cancels before release]
pending → cancelled     [reward cancelled/expired]
released → refunded     [dispute workflow, subject to recipient balance]
```

### 3.4 Aggregate Status Rules

- **partially_released**: ≥1 allocation `released`, but not all `max_recipients`
  slots resolved.
- **released**: All allocations in terminal state (released/cancelled/refunded)
  AND ≥1 was released.
- **partially_refunded**: ≥1 released allocation refunded, but not all.
- **refunded**: ALL released allocations refunded.
- **expired**: System-triggered when `expires_at` has passed and reward is in
  `active` state. All pending allocations → cancelled. Reserved funds → funder
  available via `expire` transaction.

## 4. Permission Model

### 4.1 New Granular Permissions

The existing `reward.give` permission is replaced by granular permissions.
Migration adds new permissions and reassigns roles. `reward.give` is retained
in the database but removed from all role assignments (backward-compatible
deprecation).

| Permission ID | Permission Name | Category | Description |
|--------------|-----------------|----------|-------------|
| perm_reward_create | reward.create | reward | Create reward drafts |
| perm_reward_fund | reward.fund | reward | Fund rewards |
| perm_reward_activate | reward.activate | reward | Activate funded rewards |
| perm_reward_approve | reward.approve | reward | Approve eligible rewards |
| perm_reward_cancel | reward.cancel | reward | Cancel rewards before release |
| perm_reward_view_own | reward.view_own | reward | View own created/received (EXISTING) |
| perm_reward_view_assigned | reward.view_assigned | reward | View rewards in authorized scope |
| perm_reward_manage | reward.manage | reward | Admin: manage all rewards (EXISTING) |
| perm_reward_refund | reward.refund | reward | Initiate reward refund via dispute |
| perm_reward_setup | reward.setup | reward | Configure policies/thresholds (EXISTING) |

### 4.2 Role-Permission Matrix

| Role | create | fund | activate | approve | cancel | view_own | view_assigned | manage | refund | setup |
|------|--------|------|----------|---------|--------|----------|---------------|--------|--------|-------|
| role_student | | | | | | X | | | | |
| role_supporter_student | | | | | | X | | | | |
| role_parent | X | X | X | X | X | X | X | | | |
| role_teacher | X | X | X | X | X | X | X | | | |
| role_employer | X | X | X | X | X | X | X | | | |
| role_sponsor | X | X | X | X | X | X | X | | | |
| role_instructor | | | | | | X | | | | |
| role_ta | | | | | | | | | | |
| role_admin | | | | X | | X | X | X | | |
| role_admin2 | | | | X | | X | X | X | X | |
| role_super_admin | X | X | X | X | X | X | X | X | X | X |
| role_custom | | | | | | | | | | |

### 4.3 Seed Migration

**Current state:** `perm_reward_give` is assigned to 7 roles (parent, teacher,
employer, sponsor, admin, admin-2, super-admin). It is a single permission
covering all reward operations.

**Migration steps (in `seedRbacData()`):**
1. INSERT new permissions: `perm_reward_create`, `perm_reward_fund`,
   `perm_reward_activate`, `perm_reward_approve`, `perm_reward_cancel`,
   `perm_reward_view_assigned`, `perm_reward_refund`.
2. DELETE all `role_permissions` rows referencing `perm_reward_give`.
3. INSERT new `role_permissions` rows per the §4.2 matrix.
4. Keep `perm_reward_give` row in `permissions` table (backward-compatible
   deprecation — no roles reference it).
5. Update CI invariant tests to:
   - Assert `perm_reward_give` has zero role assignments.
   - Assert each role has exactly the new permissions listed in §4.2.

**Idempotency:** All INSERT statements use `INSERT OR IGNORE` so the
migration is safe to re-run. DELETE of `role_permissions` uses
`WHERE permission_id = 'perm_reward_give'`.

## 5. Funding Source Verification

### 5.1 Source Types

| funding_source_type | source_account_type | Verification |
|--------------------|--------------------|----|
| paystack | external | Paystack payment_id must reference a `payments` record with status='confirmed' |
| stellar | external | Stellar tx hash (64-char lowercase hex, SHA-256) format-validated; admin attestation via `POST /admin/rewards/:id/verify-funding` required before activation; network recorded; Horizon API verification deferred. |
| admin_grant | platform | Actor must have `reward.manage` permission; audit record required |
| platform_credit | platform | Actor must have `reward.manage` permission; must not be self-authorized by the funder |

### 5.2 Security Rules

- A creator (sponsor/employer/parent/teacher) CANNOT self-authorize
  `platform_credit` or `admin_grant`. Only `reward.manage` holders (admin,
  admin-2, super-admin) can authorize these.
- Paystack references are validated against the `payments` table.
- Stellar transaction hashes must be exactly 64 lowercase hex characters
  (SHA-256 format, as returned by the Horizon API). Do not confuse with
  56-character StrKey-encoded public keys (GA... prefix). The funding
  reference must also record: network (public/testnet), attesting admin
  user ID, attestation timestamp, and verification status
  (pending_attestation/attested/horizon_verified).
- Duplicate `funding_reference` values are rejected (idempotency).

### 5.3 Conflict of Interest Rules

- **Self-approval:** A reward creator CAN approve their own reward (the
  creator already funded it with their own money; approval is just
  confirming the release). Exception: teacher rewards with `grade_approved`
  eligibility — see teacher spec §4.
- **Admin approval of own reward:** An admin who is also a reward creator
  (e.g., a parent with admin privileges) CAN approve their own reward.
  This is logged with `actor_user_id == creator_user_id` for audit.
- **Platform credit / admin grant:** The actor authorizing the funding
  MUST NOT be the same user as the funder (prevent self-enrichment).
  Enforced by: `actor_user_id != reward.creator_user_id` when
  `funding_source_type IN ('platform_credit', 'admin_grant')`.
- **Stellar attestation:** The admin attesting the Stellar transaction
  MUST NOT be the reward creator. Enforced by the same check.

## 6. Centralized Service Structure

```
LMS-Server/src/services/rewards/
  rewardService.ts              # Public orchestration facade
  rewardStateMachine.ts         # State transitions, validation
  rewardLedger.ts               # Immutable ledger writes, reconciliation
  rewardBalanceService.ts       # Available/reserved balance operations
  rewardEligibilityService.ts   # Event processing, condition evaluation
  rewardScopeService.ts         # Relationship scope validation
  rewardIdempotencyService.ts   # Duplicate detection
  currencyConfig.ts             # XLM config, stroop scale, validation
  rewardErrors.ts               # Typed domain errors
  rewardTypes.ts                # Shared TypeScript contracts
```

**Rules:**
- All financial mutations go through `rewardService.ts`.
- Role routes are thin adapters passing scope context.
- No route directly updates `reward_accounts`, `rewards`, `reward_allocations`,
  or `reward_transactions`.
- Every operation requires a scope context: `{ actorId, scopeType, scopeId,
  idempotencyKey, currency, amountStroops? }`.
- Scope validation uses `rewardScopeService` to verify ownership.

### 6.1 Event Processor Architecture — Transactional Outbox

Eligibility events use a **transactional outbox** pattern to prevent lost
events. The primary LMS operation and an outbox row are written in one
atomic SQLite transaction.

#### 6.1.1 reward_event_outbox Table

```sql
CREATE TABLE IF NOT EXISTS reward_event_outbox (
  id              TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'course_completion', 'quiz_pass', 'milestone', 'grade_approved', 'custom'
  )),
  event_source_id TEXT NOT NULL,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_data      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'completed', 'failed'
  )),
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  completed_at    TEXT,
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_type, event_source_id, student_user_id)
);
CREATE INDEX IF NOT EXISTS idx_reward_outbox_status ON reward_event_outbox(status);
```

#### 6.1.2 Event Production

When a lesson completion, quiz submission, or grade approval succeeds, the
controller inserts an outbox row **inside the same database transaction** as
the primary operation:

```typescript
const txn = db.transaction(() => {
  // 1. Primary operation (e.g., INSERT INTO lesson_completions)
  execute(primarySQL, primaryParams);
  // 2. Outbox event (same transaction — if primary rolls back, event is lost safely)
  execute(
    `INSERT OR IGNORE INTO reward_event_outbox (id, event_type, event_source_id,
     student_user_id, event_data) VALUES (?, ?, ?, ?, ?)`,
    [uuid(), eventType, sourceId, studentId, JSON.stringify(eventData)]
  );
});
txn();
```

If the primary operation rolls back, the outbox row is also rolled back
(no orphaned events). If the primary succeeds, the outbox row is guaranteed
to exist.

#### 6.1.3 Event Processing

A processor runs after the controller response (best-effort synchronous,
with retry):

```typescript
// After primary transaction commits, attempt immediate processing
try {
  rewardEligibilityService.processPendingEvents();
} catch (err) {
  logger.error({ module: 'reward-eligibility', err }, 'Immediate processing failed');
  // Event stays in outbox for retry
}
```

The processor:
1. Queries `reward_event_outbox WHERE status = 'pending' ORDER BY created_at`.
2. Sets `status = 'processing'`, `attempt_count += 1`, `last_attempt_at = now`.
3. For each matching active reward, checks audience snapshot membership.
4. Creates `reward_eligibility_events` with idempotency key.
5. If eligible + auto-release, executes release atomically.
6. On success: `status = 'completed'`, `completed_at = now`.
7. On failure: `status = 'failed'`, `error_message` set.

#### 6.1.4 Retry and Reconciliation

- Failed events remain in the outbox for retry.
- A periodic reconciliation check (admin endpoint or cron) retries failed
  events up to `MAX_RETRY_ATTEMPTS = 3`.
- The composite unique `(event_type, event_source_id, student_user_id)` on
  the outbox table prevents duplicate event production.
- The composite unique on `reward_eligibility_events` prevents duplicate
  eligibility processing.
- A completed outbox event cannot be processed twice (status check).

#### 6.1.5 Idempotency Guarantees

- Primary rollback → no outbox row → no eligibility event → safe.
- Outbox row exists, processing fails → event retryable → safe.
- Duplicate controller delivery → `INSERT OR IGNORE` → single outbox row → safe.
- Processing succeeds, allocates once → idempotency key on eligibility → safe.
- Release succeeds → idempotency key on ledger transaction → safe.

**Known limitation:** If the server crashes after the primary transaction
commits but before the immediate processing attempt, events remain in
`pending` status until the next request triggers `processPendingEvents()`
or a reconciliation check runs. This is acceptable for the initial release;
a background worker can be added later for guaranteed delivery.

## 7. BigInt Boundaries

### 7.1 API Input Parsing

```typescript
// All stroop amounts accepted as string at the API boundary
function parseStroops(input: string): bigint {
  const n = BigInt(input); // throws on invalid
  if (n <= 0n) throw new RewardError('INVALID_AMOUNT');
  if (n > MAX_SAFE_STROOPS) throw new RewardError('AMOUNT_EXCEEDS_MAXIMUM');
  return n;
}

function calculateMaxExposure(
  amountStroops: string | bigint,
  maxRecipients: string | bigint
): bigint {
  const amount = typeof amountStroops === 'string'
    ? BigInt(amountStroops) : amountStroops;
  const recipients = typeof maxRecipients === 'string'
    ? BigInt(maxRecipients) : maxRecipients;
  const exposure = amount * recipients;
  if (exposure > MAX_SAFE_STROOPS) throw new RewardError('EXPOSURE_EXCEEDS_MAXIMUM');
  return exposure;
}
```

### 7.2 Database Integer Handling

better-sqlite3 stores INTEGER as 64-bit signed. Values up to
`Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991) are returned as `number`.
Values beyond are returned as `BigInt` if `safeIntegers(true)` is enabled.

**Policy:** Do NOT enable `safeIntegers(true)` globally (breaks existing
queries). Instead:
- Enforce `MAX_SAFE_STROOPS` ceiling on all stroop values.
- Use BigInt only for arithmetic (multiplication, exposure calculation).
- Store and retrieve as `number` (safe within ceiling).
- Document that the system supports up to ~900,719 XLM per account.

### 7.3 Documented Limits

| Limit | Value | XLM Equivalent |
|-------|-------|----------------|
| Max individual reward | 1,000,000,000,000 stroops | 100,000 XLM |
| Max recipients per reward | 10,000 | — |
| Max total exposure | 9,007,199,254,740,991 stroops | ~900,719 XLM |
| Max account balance | 9,007,199,254,740,991 stroops | ~900,719 XLM |

## 8. Refund and Dispute Integration

### 8.1 Reward Refund via Dispute Workflow

Reward refunds use the existing Phase F dispute workflow. A dedicated
`POST /rewards/:id/allocations/:allocId/dispute` endpoint creates a dispute
record linked to the allocation and delegates to the dispute resolution flow.

### 8.2 Refund Rules

- Single-allocation reward: `released → refunded`.
- Group reward, some refunds: `released → partially_refunded`.
- Group reward, all released allocations refunded: `partially_refunded → refunded`.
- **Blocked refunds (insufficient recipient balance):**
  - HTTP 409 Conflict returned.
  - Reward and allocation states remain **unchanged**.
  - All balances remain **unchanged**.
  - **No** `reward_transactions` row is created (no funds moved = no ledger entry).
  - A `reward_refund_attempts` audit record is created (see §8.4).
  - Admin notification triggered via `notificationService.createNotification()`
    to all `reward.refund` holders. Notification includes reward ID and
    allocation ID only — no student balance or PII.
  - The attempt remains available for later resolution (admin can retry
    after the student's recipient balance is replenished).
- Blocked refunds are NEVER reported as successful.

### 8.3 Refund Permissions

`reward.refund` is required. Only `role_admin2` and `role_super_admin` have
this permission, matching the Phase F `billing.refund` pattern.

### 8.4 reward_refund_attempts Table

Blocked refunds are recorded in a separate audit table, NOT in
`reward_transactions` (which is reserved for actual fund movements).

```sql
CREATE TABLE IF NOT EXISTS reward_refund_attempts (
  id                  TEXT PRIMARY KEY,
  reward_id           TEXT NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
  allocation_id       TEXT NOT NULL REFERENCES reward_allocations(id) ON DELETE RESTRICT,
  attempted_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  attempted_amount_stroops INTEGER NOT NULL CHECK (attempted_amount_stroops > 0),
  currency_code       TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
  recipient_available_stroops INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'blocked' CHECK (status IN (
    'blocked', 'resolved'
  )),
  resolution          TEXT CHECK (resolution IN (
    'retried_success', 'waived', 'escalated'
  )),
  resolved_at         TEXT,
  resolved_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refund_attempts_reward ON reward_refund_attempts(reward_id);
CREATE INDEX IF NOT EXISTS idx_refund_attempts_status ON reward_refund_attempts(status);
```

**Semantics:**
- `blocked`: Refund attempted but recipient had insufficient balance.
- `resolved` + `retried_success`: Admin retried and refund succeeded (a real
  `reward_transactions` row now exists).
- `resolved` + `waived`: Admin decided not to pursue the refund.
- `resolved` + `escalated`: Forwarded to external dispute resolution.

## 9. Privacy Rules

- **Student received-reward views** (`/rewards/received`): Show only reward
  description, amount, status, dates. Never expose creator billing details,
  other recipients' data, or funder balance information.
- **Creator reward views** (`/sponsor/rewards`, etc.): Show reward details,
  allocation status (anonymized student names unless the creator has
  `student.view_assigned`). Never expose student wallet addresses or
  recipient account balances.
- **Admin reward views** (`/admin/rewards`): Full visibility with no
  privacy filtering.
- **Reconciliation endpoint**: Admin-only. Shows balance totals and ledger
  sums. No individual student data.

## 10. Transaction Boundaries

Every financial mutation executes as a single SQLite transaction:

```typescript
const txn = db.transaction(() => {
  // 1. Validate scope (rewardScopeService)
  // 2. Validate state transition (rewardStateMachine)
  // 3. Check idempotency (rewardIdempotencyService)
  // 4. Validate balance (rewardBalanceService)
  // 5. Mutate balance (debit source, credit destination)
  // 6. Write ledger entry (rewardLedger) — immutable
  // 7. Update reward/allocation status
  // All or nothing.
});
txn();
```

No external network calls inside the transaction. If external verification
is needed (Paystack, Stellar), verify BEFORE entering the transaction.

## 11. Reconciliation

A reconciliation query compares materialized balance snapshots against
ledger totals:

```sql
-- For each funder account:
-- available = SUM(credits to funder.available) - SUM(debits from funder.available)
-- reserved = SUM(credits to funder.reserved) - SUM(debits from funder.reserved)
-- These must match reward_accounts.available_stroops and reserved_stroops.
```

Admin endpoint: `GET /admin/rewards/reconciliation` (requires `reward.manage`).

## 12. TDD Test Matrix (Foundation)

### Schema Tests
- R-SCHEMA-1: rewards table created with 13-state CHECK constraint
- R-SCHEMA-2: reward_accounts created with funder/recipient/platform types
- R-SCHEMA-3: reward_transactions created with all CHECK constraints
- R-SCHEMA-4: reward_allocations created with UNIQUE(reward_id, student_user_id)
- R-SCHEMA-5: reward_eligibility_events created with composite unique
- R-SCHEMA-6: reward_audience_snapshots created
- R-SCHEMA-7: Invalid enum values rejected by CHECK constraints
- R-SCHEMA-8: ON DELETE RESTRICT prevents cascade deletion of financial records
- R-SCHEMA-9: XLM-only currency enforced
- R-SCHEMA-10: reward_event_outbox created with composite unique
- R-SCHEMA-11: reward_refund_attempts created with RESTRICT FKs

### Currency/BigInt Tests
- R-CURR-1: 1.50 XLM converts exactly to 15,000,000 stroops
- R-CURR-2: Precision beyond 7 decimal places rejected
- R-CURR-3: ZAR currency rejected
- R-CURR-4: USD currency rejected
- R-CURR-5: Amount exceeding MAX_SAFE_STROOPS rejected
- R-CURR-6: BigInt exposure calculation correct for max values
- R-CURR-7: Negative amounts rejected
- R-CURR-8: Zero amounts rejected
- R-CURR-9: String-based stroop parsing works correctly
- R-CURR-10: Floating-point input rejected at API boundary

### Balance/Ledger Tests
- R-BAL-1: Fund creates funder available credit
- R-BAL-2: Reserve moves funder available → reserved atomically
- R-BAL-3: Release moves funder reserved → recipient available
- R-BAL-4: Cancel moves funder reserved → funder available
- R-BAL-5: Expire moves funder reserved → funder available (system actor)
- R-BAL-6: Refund moves recipient available → funder available
- R-BAL-7: Release cannot debit funder available directly
- R-BAL-8: Cancel cannot credit recipient account
- R-BAL-9: Refund cannot debit funder reserved
- R-BAL-10: Available + reserved reconcile after every transition
- R-BAL-11: Concurrent reservations cannot overspend
- R-BAL-12: Negative balance prevented by CHECK constraint
- R-BAL-13: Refund blocked when recipient has insufficient balance (409)
- R-BAL-14: Blocked refund creates reward_refund_attempts record (NOT ledger entry)
- R-BAL-15: Blocked refund leaves all balances unchanged
- R-BAL-16: Blocked refund leaves reward/allocation state unchanged

### Idempotency Tests
- R-IDEM-1: Duplicate fund request returns original result
- R-IDEM-2: Duplicate reserve is idempotent
- R-IDEM-3: Duplicate release does not transfer twice
- R-IDEM-4: Duplicate eligibility event returns already_processed
- R-IDEM-5: Duplicate cancel does not return funds twice
- R-IDEM-6: Duplicate refund does not credit twice

### State Machine Tests
- R-SM-1: All 13 states are valid in CHECK constraint
- R-SM-2: Each allowed transition succeeds
- R-SM-3: Each blocked transition rejected with error
- R-SM-4: approved is persistent state (can be read from DB)
- R-SM-5: partially_released correctly determined from allocation statuses
- R-SM-6: released correctly determined when all allocations terminal
- R-SM-7: partially_refunded from first allocation refund
- R-SM-8: refunded when all released allocations refunded
- R-SM-9: expired returns funds and cancels pending allocations

### Permission Tests
- R-PERM-1: reward.give removed from all role assignments
- R-PERM-2: New permissions seeded correctly
- R-PERM-3: Each role has exactly the documented permissions
- R-PERM-4: Custom-user has no reward permissions by default
- R-PERM-5: Creator cannot self-authorize platform_credit

### Deletion Safety Tests
- R-DEL-1: Deleting user with funder account fails (RESTRICT)
- R-DEL-2: Deleting user with recipient account fails (RESTRICT)
- R-DEL-3: Deleting reward with allocations fails (RESTRICT)
- R-DEL-4: Deleting reward with transactions fails (RESTRICT)

## 13. Verification Commands

```bash
# Focused foundation tests
cd LMS-Server && npx vitest run src/__tests__/reward-foundation.test.ts

# All reward tests
cd LMS-Server && npx vitest run --grep "R-"

# Full backend suite
cd LMS-Server && npx vitest run

# Full frontend suite
cd LMS-Frontend && npx vitest run

# Reconciliation (after deployment)
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://lms.smwebsystems.com/api/v1/admin/rewards/reconciliation
```

## 14. Evidence Paths (Existing Implementation)

| Component | Path | Status |
|-----------|------|--------|
| rewards table (stub) | LMS-Server/src/config/database.ts:1590-1623 | REPLACE |
| users.reward_balance | LMS-Server/src/config/database.ts:1507-1516 | MIGRATE |
| RBAC reward perms | LMS-Server/src/config/database.ts:1193-1218 | UPDATE |
| Role assignments | LMS-Server/src/config/database.ts:1242-1440 | UPDATE |
| Parent wallet read | LMS-Server/src/routes/parent.ts:130-142 | UPDATE (use reward_accounts) |
| Invariant tests | LMS-Server/src/__tests__/rbac-wallet-invariant.test.ts | UPDATE |
| Dispute workflow | LMS-Server/src/routes/disputes.ts | EXTEND (reward disputes) |
| reward_event_outbox | NEW (in database.ts) | CREATE |
| reward_refund_attempts | NEW (in database.ts) | CREATE |
| tenant_settings | LMS-Server/src/config/database.ts | ADD reward_high_value_threshold column |
| Sponsor cohorts | database/schema.sql:422-446 | EXISTING (scope source) |
| User links | LMS-Server/src/config/database.ts:1518-1533 | EXISTING (scope source) |
| User groups | LMS-Server/src/config/database.ts:1535-1554 | EXISTING (scope source) |

## 15. Known Non-Goals (Deferred)

- Total-budget allocation mode.
- Multi-currency support.
- Implicit FX conversion (Paystack ZAR → XLM rewards).
- Blockchain-backed escrow.
- Student-wallet reward payout integration.
- Dynamic audience membership after activation.
- Reward templates or presets.
- Batch reward creation API.
- Reward analytics dashboard.
