/**
 * reward-txn-check-migration.test.ts
 *
 * W03-R2 — Behavioral tests for the reward_transactions CHECK constraint upgrade.
 * W03-R3 — Regression tests for migration correction (F1/F2/F3).
 *
 * Baseline: 5b3c180 (W03-R1 unused reservation reconciliation, PR #118)
 * W03-R3 base: bc3e0df (W03-R2 merged, PR #119)
 * Branch:   codex/w03-r3-migration-corrections
 *
 * These tests work with file-backed SQLite databases to exercise the real migration
 * lifecycle (startup, plan, apply, rollback, backup/restore). Each test that needs a
 * file-backed DB creates and cleans up its own temporary file.
 *
 * Tests that need the in-memory singleton (COMPAT-REGRESSION, COMPAT-E2E-LIFECYCLE)
 * import './setup.js' and use the normal _resetForTests path.
 *
 * W03-R2 requirement-to-test map:
 *  COMPAT-REPRO          — Req 1: #117-schema + services → CHECK failure
 *  COMPAT-PLAN           — Req 2: plan mode is read-only; refusal behaviours
 *  COMPAT-APPLY-PRESERVE — Req 3: apply preserves all rows and unrelated records
 *  COMPAT-CONSTRAINTS    — Req 4: target constraints work; malformed entries rejected
 *  COMPAT-IDEMPOTENT     — Req 5: repeat apply recognised; current-schema recognised
 *  COMPAT-UNKNOWN-SCHEMA — Req 6: unknown schema refuses before mutation
 *  COMPAT-ROLLBACK       — Req 7: injected failure → rollback, original preserved
 *  COMPAT-BACKUP-RESTORE — Req 8: WAL backup/restore + integrity/FK checks pass
 *  COMPAT-E2E-LIFECYCLE  — Req 9: post-upgrade cap=5/audience=3 full lifecycle
 *  COMPAT-REGRESSION     — Req 10: existing 26+19 tests still pass (in-memory)
 *  COMPAT-PREFLIGHT      — Req 11: databaseBootstrap rejects old; accepts target
 *  COMPAT-RESTORE-PATH   — Req 12: restore path rehearsed; no financial row deletion
 *
 * W03-R3 requirement-to-test map:
 *  COMPAT-F1             — F1: comment-bypass classification; fake receipts; preflight
 *  COMPAT-F2             — F2: extra index/trigger/view → refusal before mutation
 *  COMPAT-F3             — F3: pre-existing FK violation refused before commit
 *  COMPAT-PARTIAL-SWAP-EXT — Partial-swap extended: both tables / stale artifact
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureSqlForDatabase, mutateSqlFixture, normalizeSqlFixture, readSqlFixture } from './helpers/sqlFixture.js';
import { v4 as uuidv4 } from 'uuid';

// ── Migration module under test ──────────────────────────────────────────────
// TDD RED: this module does not exist yet — tests fail until Task #22 is complete
import {
  planUpgrade,
  fkEvidence,
  applyUpgrade,
  detectSchemaVersion,
  canonicalizeDdl,
  MIGRATION_ID,
} from '../scripts/migrateRewardTxnCheck.js';

// ── Preflight under test ─────────────────────────────────────────────────────
import { validateDatabase } from '../config/databaseBootstrap.js';

// ── In-memory suite helpers ──────────────────────────────────────────────────
import './setup.js';
import { db } from '../config/database.js';
import {
  createReward,
  fundReward,
  activateReward,
  releaseAllocation,
  cancelReward,
  refundAllocation,
} from '../services/rewards/rewardService.js';
import { expireReward } from '../services/rewards/rewardService.js';
import { getAccount } from '../services/rewards/rewardBalanceService.js';
import { getRewardTransactions } from '../services/rewards/rewardService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OLD_SCHEMA_PATH = path.resolve(__dirname, '../../database/schema-v117-fixture.sql');
const OLD_SCHEMA = readSqlFixture(OLD_SCHEMA_PATH);

// ────────────────────────────────────────────────────────────────────────────
// File-backed DB helpers
// ────────────────────────────────────────────────────────────────────────────

function makeTempDb(schema: string): { dbPath: string; conn: SqliteDatabase } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-w03r2-'));
  const dbPath = path.join(dir, 'test.db');
  const conn = new Database(dbPath);
  conn.pragma('foreign_keys = ON');
  // Commit historical fixture DDL once instead of fsyncing every table/index.
  // The real migration still runs later against the committed file, with its
  // original durability, foreign-key checks and standard test deadline.
  conn.transaction(() => conn.exec(fixtureSqlForDatabase(schema)))();
  return { dbPath, conn };
}

function cleanupTempDb(dbPath: string): void {
  try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  try { fs.unlinkSync(dbPath + '-wal'); } catch { /* ignore */ }
  try { fs.unlinkSync(dbPath + '-shm'); } catch { /* ignore */ }
  try { fs.rmdirSync(path.dirname(dbPath)); } catch { /* ignore */ }
}

/** Minimal RBAC seed so FK constraints are satisfied */
function seedMinimalFixtures(conn: SqliteDatabase): {
  adminId: string;
  sponsorId: string;
  studentIds: string[];
  cohortId: string;
} {
  // Seed roles required by the trg_auto_assign_user_role trigger
  for (const [id, name, label] of [
    ['role_admin', 'admin', 'Administrator'],
    ['role_student', 'student', 'Student'],
  ]) {
    conn.prepare(
      "INSERT OR IGNORE INTO roles (id, name, label, description, is_system) VALUES (?, ?, ?, '', 1)"
    ).run(id, name, label);
  }

  const adminId = uuidv4();
  const sponsorId = uuidv4();
  conn.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin', ?, 'h', 'admin')"
  ).run(adminId, `${adminId}@t.com`);
  conn.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Sponsor', ?, 'h', 'admin')"
  ).run(sponsorId, `${sponsorId}@t.com`);

  const courseId = uuidv4();
  conn.prepare(
    "INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)"
  ).run(courseId, `C-${courseId.slice(0, 8)}`);

  const cohortId = uuidv4();
  conn.prepare(
    "INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Cohort')"
  ).run(cohortId, sponsorId, courseId);

  const studentIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const sid = uuidv4();
    conn.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'h', 'student')"
    ).run(sid, `${sid}@t.com`);
    conn.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, sid);
    studentIds.push(sid);
  }
  return { adminId, sponsorId, studentIds, cohortId };
}

/** Confirm reward_transactions DDL contains 'release_unused' */
function hasPatchedSchema(conn: SqliteDatabase): boolean {
  const row = conn.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='reward_transactions'"
  ).get() as { sql: string } | undefined;
  return !!row?.sql.includes("'release_unused'");
}

/** Extract idempotency_key from reward_transactions rows for a reward */
function txnKeysForReward(conn: SqliteDatabase, rewardId: string): string[] {
  return (conn.prepare(
    'SELECT idempotency_key FROM reward_transactions WHERE reward_id = ? ORDER BY created_at'
  ).all(rewardId) as { idempotency_key: string }[]).map(r => r.idempotency_key);
}

// ────────────────────────────────────────────────────────────────────────────
// In-memory fixture helpers (for Req 9, 10)
// ────────────────────────────────────────────────────────────────────────────

function makeSponsor(): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Sponsor', ?, 'hash', 'admin')"
  ).run(id, `${id}@test.com`);
  return id;
}

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

function makeCohortWithMembers(
  sponsorId: string,
  memberCount: number
): { cohortId: string; studentIds: string[] } {
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

function makeAllocationsEligible(rewardId: string): void {
  db.prepare(`UPDATE reward_allocations SET status = 'eligible' WHERE reward_id = ? AND status = 'pending'`).run(rewardId);
  db.prepare(`UPDATE rewards SET status = 'approved' WHERE id = ?`).run(rewardId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPAT-REPRO: Req 1 — #117-schema + services → CHECK failure before repair
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-REPRO: old-schema CHECK failure is reproducible', () => {
  let dbPath: string;
  let conn: SqliteDatabase;

  beforeEach(() => {
    const tmp = makeTempDb(OLD_SCHEMA);
    dbPath = tmp.dbPath;
    conn = tmp.conn;
  });

  afterEach(() => {
    conn.close();
    cleanupTempDb(dbPath);
  });

  it('COMPAT-REPRO-1: reward_transactions on #117 schema does not accept release_unused', () => {
    // Seed minimal rows to satisfy FKs
    const { adminId, sponsorId, cohortId } = seedMinimalFixtures(conn);
    const rewardId = uuidv4();
    conn.prepare(
      `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
        amount_stroops, max_recipients, status, idempotency_key)
       VALUES (?, ?, 'sponsor_cohort', ?, 'individual', 100, 5, 'active', ?)`
    ).run(rewardId, sponsorId, cohortId, uuidv4());

    expect(() => {
      conn.prepare(`
        INSERT INTO reward_transactions (
          id, reward_id, source_account_type, source_bucket, source_user_id,
          destination_account_type, destination_bucket, destination_user_id,
          actor_type, transaction_type, amount_stroops, previous_state, new_state,
          idempotency_key
        ) VALUES (?, ?, 'funder', 'reserved', ?, 'funder', 'available', ?,
                  'system', 'release_unused', 200, 'approved', 'released', ?)
      `).run(uuidv4(), rewardId, adminId, adminId, uuidv4());
    }).toThrow(/CHECK constraint failed/);
  });

  it('COMPAT-REPRO-2: detectSchemaVersion returns "source" for #117 schema', () => {
    expect(detectSchemaVersion(conn)).toBe('source');
  });

  it('COMPAT-REPRO-3: old-schema does not have source_user_id compound CHECK for release_unused', () => {
    const { adminId, sponsorId, cohortId } = seedMinimalFixtures(conn);
    const rewardId = uuidv4();
    conn.prepare(
      `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
        amount_stroops, status, idempotency_key)
       VALUES (?, ?, 'sponsor_cohort', ?, 'individual', 100, 'active', ?)`
    ).run(rewardId, sponsorId, cohortId, uuidv4());

    // Even if we could insert release_unused (which we can't due to CHECK-1),
    // a NULL source_user_id would also fail the compound CHECK on target.
    // On old schema, CHECK-2 only covers 'reserve','cancel','expire' —
    // source_user_id=NULL would NOT be rejected by CHECK-2 for release_unused.
    // This documents the gap that migration closes.
    const ddl = conn.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='reward_transactions'"
    ).get() as { sql: string };
    expect(ddl.sql).not.toContain("'release_unused'");
    expect(ddl.sql).toContain("'reserve', 'cancel', 'expire'");
    expect(ddl.sql).not.toMatch(/'reserve', 'cancel', 'expire', 'release_unused'/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPAT-PLAN: Req 2 — plan mode is read-only
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-PLAN: plan/dry-run is strictly read-only', () => {
  let dbPath: string;
  let conn: SqliteDatabase;

  beforeEach(() => {
    const tmp = makeTempDb(OLD_SCHEMA);
    dbPath = tmp.dbPath;
    conn = tmp.conn;
    seedMinimalFixtures(conn);
    conn.close();
    // conn closed — migration uses its own connection
  });

  afterEach(() => {
    cleanupTempDb(dbPath);
  });

  it('COMPAT-PLAN-1: plan mode returns a plan report without modifying the DB', () => {
    const report = planUpgrade(dbPath);
    expect(report.schemaVersion).toBe('source');
    expect(report.rowCount).toBeGreaterThanOrEqual(0);
    expect(report.wouldApply).toBe(true);
    expect(report.indexNames).toContain('idx_reward_txn_idem');
    expect(report.indexNames).toContain('idx_reward_txn_fund_ref_unique');

    // Schema must be unchanged
    const verify = new Database(dbPath, { readonly: true });
    try {
      expect(detectSchemaVersion(verify)).toBe('source');
    } finally {
      verify.close();
    }
  });

  it('COMPAT-PLAN-2: plan on target-schema DB reports already-at-target', () => {
    // Apply first, then plan
    applyUpgrade(dbPath);
    const report = planUpgrade(dbPath);
    expect(report.schemaVersion).toBe('target');
    expect(report.wouldApply).toBe(false);
    expect(report.alreadyAtTarget).toBe(true);
  });

  it('COMPAT-PLAN-3: plan on missing DB throws with clear error', () => {
    expect(() => planUpgrade('/tmp/nonexistent-w03r2-test.db')).toThrow(/not found|no such file|ENOENT/i);
  });

  it('COMPAT-PLAN-4: plan on unknown schema throws without touching the DB', () => {
    // Create a DB with reward_transactions but with a completely different schema
    const tmp2 = makeTempDb('CREATE TABLE reward_transactions (id TEXT PRIMARY KEY, x TEXT);');
    try {
      expect(() => planUpgrade(tmp2.dbPath)).toThrow(/unsupported|unknown/i);
    } finally {
      tmp2.conn.close();
      cleanupTempDb(tmp2.dbPath);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPAT-APPLY-PRESERVE: Req 3 — apply preserves all rows and unrelated records
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-APPLY-PRESERVE: apply preserves ledger rows and unrelated data', () => {
  let dbPath: string;
  let conn: SqliteDatabase;
  let fixtures: ReturnType<typeof seedMinimalFixtures>;

  beforeEach(() => {
    const tmp = makeTempDb(OLD_SCHEMA);
    dbPath = tmp.dbPath;
    conn = tmp.conn;
    fixtures = seedMinimalFixtures(conn);
  });

  afterEach(() => {
    try { conn.close(); } catch { /* already closed */ }
    cleanupTempDb(dbPath);
  });

  it('COMPAT-APPLY-PRESERVE-1: all reward_transactions rows preserved with identical values', () => {
    const { adminId, sponsorId, cohortId } = fixtures;
    const rewardId = uuidv4();
    conn.prepare(
      `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
        amount_stroops, status, idempotency_key)
       VALUES (?, ?, 'sponsor_cohort', ?, 'individual', 100, 'funded', ?)`
    ).run(rewardId, sponsorId, cohortId, uuidv4());

    // Insert pre-existing transactions using OLD types (no release_unused).
    // Use 'reserve' (not 'fund') to avoid needing funding_source_type NOT NULL.
    const txn1 = {
      id: uuidv4(), rewardId, idem: uuidv4(),
      type: 'reserve', sourceType: 'funder', sourceBucket: 'available',
      sourceUser: adminId, destType: 'funder', destBucket: 'reserved',
      destUser: adminId, actorType: 'user', actorUser: adminId,
      amount: 500, prev: 'funded', next: 'active',
    };
    const txn2 = {
      id: uuidv4(), rewardId, idem: uuidv4(),
      type: 'reserve', sourceType: 'funder', sourceBucket: 'available',
      sourceUser: adminId, destType: 'funder', destBucket: 'reserved',
      destUser: adminId, actorType: 'user', actorUser: adminId,
      amount: 500, prev: 'funded', next: 'active',
    };

    for (const t of [txn1, txn2]) {
      conn.prepare(`
        INSERT INTO reward_transactions (
          id, reward_id, source_account_type, source_bucket, source_user_id,
          destination_account_type, destination_bucket, destination_user_id,
          actor_type, actor_user_id, transaction_type, amount_stroops,
          previous_state, new_state, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(t.id, t.rewardId, t.sourceType, t.sourceBucket, t.sourceUser,
             t.destType, t.destBucket, t.destUser,
             t.actorType, t.actorUser, t.type, t.amount, t.prev, t.next, t.idem);
    }

    // Also insert an unrelated user and announcement to verify cross-table preservation
    const unrelatId = uuidv4();
    conn.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'U', ?, 'h', 'student')"
    ).run(unrelatId, `${unrelatId}@t.com`);

    const rowsBefore = conn.prepare('SELECT * FROM reward_transactions ORDER BY created_at').all();
    const userCountBefore = conn.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };

    conn.close();

    applyUpgrade(dbPath);

    const verify = new Database(dbPath);
    try {
      const rowsAfter = verify.prepare('SELECT * FROM reward_transactions ORDER BY created_at').all();
      expect(rowsAfter).toHaveLength(rowsBefore.length);
      // Exact value comparison for each column
      for (let i = 0; i < rowsBefore.length; i++) {
        expect(rowsAfter[i]).toEqual(rowsBefore[i]);
      }
      // Unrelated table preserved
      const userCountAfter = verify.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
      expect(userCountAfter.c).toBe(userCountBefore.c);
    } finally {
      verify.close();
    }
  });

  it('COMPAT-APPLY-PRESERVE-2: migration metadata written to system_config', () => {
    conn.close();
    applyUpgrade(dbPath);
    const verify = new Database(dbPath);
    try {
      const row = verify.prepare(
        "SELECT value FROM system_config WHERE key = ?"
      ).get(MIGRATION_ID) as { value: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.value).toMatch(/^\d{4}-\d{2}-\d{2}/); // ISO date prefix
    } finally {
      verify.close();
    }
  });

  it('COMPAT-APPLY-PRESERVE-3: empty reward_transactions table migrates cleanly', () => {
    conn.close();
    const result = applyUpgrade(dbPath);
    expect(result.rowsCopied).toBe(0);
    expect(result.success).toBe(true);
    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('target');
    } finally {
      verify.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPAT-CONSTRAINTS: Req 4 — target constraints work correctly post-migration
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-CONSTRAINTS: target schema constraints enforced correctly', () => {
  let dbPath: string;
  let conn: SqliteDatabase;

  beforeEach(() => {
    const tmp = makeTempDb(OLD_SCHEMA);
    dbPath = tmp.dbPath;
    const { adminId, sponsorId, cohortId } = seedMinimalFixtures(tmp.conn);
    tmp.conn.close();
    applyUpgrade(dbPath);
    conn = new Database(dbPath);
    conn.pragma('foreign_keys = ON');
    // Store fixtures context on conn for use in tests
    (conn as unknown as Record<string, unknown>)._fixtures = { adminId, sponsorId, cohortId };
  });

  afterEach(() => {
    conn.close();
    cleanupTempDb(dbPath);
  });

  function getFixtures() {
    return (conn as unknown as Record<string, unknown>)._fixtures as ReturnType<typeof seedMinimalFixtures>;
  }

  function insertTxn(overrides: Record<string, unknown> = {}): void {
    const { adminId } = getFixtures();
    const rewardId = uuidv4();
    conn.prepare(
      `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
        amount_stroops, status, idempotency_key)
       VALUES (?, ?, 'sponsor_cohort', ?, 'individual', 100, 'active', ?)`
    ).run(rewardId, adminId, getFixtures().cohortId, uuidv4());

    const defaults = {
      id: uuidv4(),
      reward_id: rewardId,
      source_account_type: 'funder',
      source_bucket: 'reserved',
      source_user_id: adminId,
      destination_account_type: 'funder',
      destination_bucket: 'available',
      destination_user_id: adminId,
      actor_type: 'system',
      actor_user_id: null,
      transaction_type: 'release_unused',
      amount_stroops: 200,
      previous_state: 'approved',
      new_state: 'released',
      idempotency_key: uuidv4(),
    };
    const r = { ...defaults, ...overrides };
    conn.prepare(`
      INSERT INTO reward_transactions (
        id, reward_id, source_account_type, source_bucket, source_user_id,
        destination_account_type, destination_bucket, destination_user_id,
        actor_type, actor_user_id, transaction_type, amount_stroops,
        previous_state, new_state, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(r.id, r.reward_id, r.source_account_type, r.source_bucket, r.source_user_id,
           r.destination_account_type, r.destination_bucket, r.destination_user_id,
           r.actor_type, r.actor_user_id, r.transaction_type, r.amount_stroops,
           r.previous_state, r.new_state, r.idempotency_key);
  }

  it('COMPAT-CONSTRAINTS-1: release_unused accepted with valid source_user_id', () => {
    expect(() => insertTxn()).not.toThrow();
  });

  it('COMPAT-CONSTRAINTS-2: release_unused rejected when source_user_id is NULL', () => {
    expect(() => insertTxn({ source_user_id: null })).toThrow(/CHECK constraint failed/);
  });

  it('COMPAT-CONSTRAINTS-3: unknown transaction_type rejected', () => {
    expect(() => insertTxn({ transaction_type: 'void' })).toThrow(/CHECK constraint failed/);
  });

  it('COMPAT-CONSTRAINTS-4: original types (fund, reserve, release, cancel, refund, expire) still accepted', () => {
    const { adminId, cohortId } = getFixtures();
    const rewardId = uuidv4();
    conn.prepare(
      `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
        amount_stroops, status, idempotency_key)
       VALUES (?, ?, 'sponsor_cohort', ?, 'individual', 100, 'active', ?)`
    ).run(rewardId, adminId, cohortId, uuidv4());

    // 'cancel' with source_user_id (required by compound CHECK)
    expect(() => {
      conn.prepare(`
        INSERT INTO reward_transactions (
          id, reward_id, source_account_type, source_bucket, source_user_id,
          destination_account_type, destination_bucket, destination_user_id,
          actor_type, actor_user_id, transaction_type, amount_stroops,
          previous_state, new_state, idempotency_key
        ) VALUES (?, ?, 'funder', 'reserved', ?, 'funder', 'available', ?,
                  'user', ?, 'cancel', 100, 'active', 'cancelled', ?)
      `).run(uuidv4(), rewardId, adminId, adminId, adminId, uuidv4());
    }).not.toThrow();
  });

  it('COMPAT-CONSTRAINTS-5: idempotency_key UNIQUE still enforced', () => {
    const idem = uuidv4();
    insertTxn({ idempotency_key: idem });
    expect(() => insertTxn({ idempotency_key: idem })).toThrow(/UNIQUE constraint failed/);
  });

  it('COMPAT-CONSTRAINTS-6: idx_reward_txn_fund_ref_unique still enforced', () => {
    const { adminId, cohortId } = getFixtures();
    const rewardId = uuidv4();
    conn.prepare(
      `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
        amount_stroops, status, idempotency_key)
       VALUES (?, ?, 'sponsor_cohort', ?, 'individual', 100, 'draft', ?)`
    ).run(rewardId, adminId, cohortId, uuidv4());

    const ref = `stellar-${uuidv4()}`;
    conn.prepare(`
      INSERT INTO reward_transactions (
        id, reward_id, source_account_type, source_bucket,
        destination_account_type, destination_bucket, destination_user_id,
        actor_type, actor_user_id, transaction_type, amount_stroops,
        previous_state, new_state, funding_source_type, funding_reference, idempotency_key
      ) VALUES (?, ?, 'external', NULL, 'funder', 'available', ?, 'user', ?, 'fund', 100,
                'draft', 'funded', 'stellar', ?, ?)
    `).run(uuidv4(), rewardId, adminId, adminId, ref, uuidv4());

    expect(() => {
      conn.prepare(`
        INSERT INTO reward_transactions (
          id, reward_id, source_account_type, source_bucket,
          destination_account_type, destination_bucket, destination_user_id,
          actor_type, actor_user_id, transaction_type, amount_stroops,
          previous_state, new_state, funding_source_type, funding_reference, idempotency_key
        ) VALUES (?, ?, 'external', NULL, 'funder', 'available', ?, 'user', ?, 'fund', 100,
                  'draft', 'funded', 'stellar', ?, ?)
      `).run(uuidv4(), rewardId, adminId, adminId, ref, uuidv4());
    }).toThrow(/UNIQUE constraint failed/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPAT-IDEMPOTENT: Req 5 — repeat/already-applied recognized; fresh init works
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-IDEMPOTENT: migration repeat and already-at-target behaviors', () => {
  it('COMPAT-IDEMPOTENT-1: applying twice returns already-at-target on second call', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    seedMinimalFixtures(conn);
    conn.close();

    applyUpgrade(dbPath);
    const result2 = applyUpgrade(dbPath);
    expect(result2.alreadyAtTarget).toBe(true);
    expect(result2.success).toBe(true);
    cleanupTempDb(dbPath);
  });

  it('COMPAT-IDEMPOTENT-2: fresh-schema DB (no migration needed) recognized', () => {
    // Database initialized from current schema.sql — already has target schema
    const currentSchema = fs.readFileSync(
      path.resolve(__dirname, '../../database/schema.sql'), 'utf-8'
    );
    const { dbPath, conn } = makeTempDb(currentSchema);
    conn.close();
    const result = applyUpgrade(dbPath);
    expect(result.alreadyAtTarget).toBe(true);
    expect(result.success).toBe(true);
    cleanupTempDb(dbPath);
  });

  it('COMPAT-IDEMPOTENT-3: planUpgrade on already-migrated DB reports no-op', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.close();
    applyUpgrade(dbPath);
    const report = planUpgrade(dbPath);
    expect(report.wouldApply).toBe(false);
    expect(report.alreadyAtTarget).toBe(true);
    cleanupTempDb(dbPath);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPAT-UNKNOWN-SCHEMA: Req 6 — unknown schema refuses before mutation
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-UNKNOWN-SCHEMA: unknown schema refused before any mutation', () => {
  it('COMPAT-UNKNOWN-1: reward_transactions with neither source nor target fingerprint throws', () => {
    const { dbPath, conn } = makeTempDb(
      'CREATE TABLE reward_transactions (id TEXT PRIMARY KEY, transaction_type TEXT);'
    );
    conn.close();
    expect(() => applyUpgrade(dbPath)).toThrow(/unsupported|unknown/i);
    // Verify table untouched
    const verify = new Database(dbPath);
    try {
      const ddl = verify.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='reward_transactions'"
      ).get() as { sql: string };
      expect(ddl.sql).not.toContain("CHECK");
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-UNKNOWN-2: DB without reward_transactions table returns source-absent', () => {
    const { dbPath, conn } = makeTempDb('CREATE TABLE foo (id TEXT PRIMARY KEY);');
    conn.close();
    const fakeConn = new Database(dbPath, { readonly: true });
    try {
      expect(detectSchemaVersion(fakeConn)).toBe('absent');
    } finally {
      fakeConn.close();
      cleanupTempDb(dbPath);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPAT-ROLLBACK: Req 7 — injected failure → rollback, original preserved
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-ROLLBACK: failure injection and recovery', () => {
  it('COMPAT-ROLLBACK-1: applyUpgrade with injected post-rename failure leaves DB unchanged', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    const fixtures = seedMinimalFixtures(conn);
    const rewardId = uuidv4();
    conn.prepare(
      `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
        amount_stroops, status, idempotency_key)
       VALUES (?, ?, 'sponsor_cohort', ?, 'individual', 100, 'funded', ?)`
    ).run(rewardId, fixtures.sponsorId, fixtures.cohortId, uuidv4());
    conn.prepare(`
      INSERT INTO reward_transactions (
        id, reward_id, source_account_type, source_bucket, source_user_id,
        destination_account_type, destination_bucket, destination_user_id,
        actor_type, actor_user_id, transaction_type, amount_stroops,
        previous_state, new_state, idempotency_key
      ) VALUES (?, ?, 'funder', 'available', ?, 'funder', 'reserved', ?,
                'user', ?, 'reserve', 500, 'funded', 'active', ?)
    `).run(uuidv4(), rewardId, fixtures.adminId, fixtures.adminId, fixtures.adminId, uuidv4());
    const rowsBefore = conn.prepare('SELECT * FROM reward_transactions').all();
    conn.close();

    // applyUpgrade with injected failure
    expect(() => applyUpgrade(dbPath, { _injectFailureAfterRename: true })).toThrow(/injected failure|test/i);

    // Original must be fully preserved
    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('source');
      const rowsAfter = verify.prepare('SELECT * FROM reward_transactions').all();
      expect(rowsAfter).toHaveLength(rowsBefore.length);
      // system_config must NOT have the migration key
      const migEntry = verify.prepare(
        'SELECT 1 FROM system_config WHERE key = ?'
      ).get(MIGRATION_ID);
      expect(migEntry).toBeUndefined();
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-ROLLBACK-2: after failed apply, re-running apply succeeds', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    seedMinimalFixtures(conn);
    conn.close();

    expect(() => applyUpgrade(dbPath, { _injectFailureAfterRename: true })).toThrow();

    // Re-run without injection
    const result = applyUpgrade(dbPath);
    expect(result.success).toBe(true);
    expect(result.alreadyAtTarget).toBe(false);

    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('target');
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPAT-BACKUP-RESTORE: Req 8 — WAL backup/restore rehearsal
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-BACKUP-RESTORE: WAL backup/restore and integrity checks', () => {
  it('COMPAT-BACKUP-1: backup + migrate + restore produces original schema', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    const fixtures = seedMinimalFixtures(conn);
    // Write a transaction using old types
    const rewardId = uuidv4();
    conn.prepare(
      `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
        amount_stroops, status, idempotency_key)
       VALUES (?, ?, 'sponsor_cohort', ?, 'individual', 100, 'funded', ?)`
    ).run(rewardId, fixtures.sponsorId, fixtures.cohortId, uuidv4());
    conn.prepare(`
      INSERT INTO reward_transactions (
        id, reward_id, source_account_type, source_bucket, source_user_id,
        destination_account_type, destination_bucket, destination_user_id,
        actor_type, actor_user_id, transaction_type, amount_stroops,
        previous_state, new_state, idempotency_key
      ) VALUES (?, ?, 'funder', 'available', ?, 'funder', 'reserved', ?,
                'user', ?, 'reserve', 100, 'funded', 'active', ?)
    `).run(uuidv4(), rewardId, fixtures.adminId, fixtures.adminId, fixtures.adminId, uuidv4());

    // WAL checkpoint to ensure consistent backup
    conn.pragma('wal_checkpoint(TRUNCATE)');
    conn.close();

    // Backup
    const backupPath = dbPath + '.bak';
    fs.copyFileSync(dbPath, backupPath);

    // Apply migration
    applyUpgrade(dbPath);

    // Verify migrated DB
    const migConn = new Database(dbPath, { readonly: true });
    try {
      expect(detectSchemaVersion(migConn)).toBe('target');
      expect(migConn.pragma('integrity_check', { simple: true })).toBe('ok');
      const fkViolations = migConn.pragma('foreign_key_check') as unknown[];
      expect(fkViolations).toHaveLength(0);
    } finally {
      migConn.close();
    }

    // Restore from backup
    fs.copyFileSync(backupPath, dbPath);

    // Restored DB should be original source schema
    const restoredConn = new Database(dbPath, { readonly: true });
    try {
      expect(detectSchemaVersion(restoredConn)).toBe('source');
      expect(restoredConn.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      restoredConn.close();
      fs.unlinkSync(backupPath);
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-BACKUP-2: migrated DB passes integrity_check and foreign_key_check', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    seedMinimalFixtures(conn);
    conn.close();

    applyUpgrade(dbPath);

    const verify = new Database(dbPath);
    try {
      expect(verify.pragma('integrity_check', { simple: true })).toBe('ok');
      const fkViolations = verify.pragma('foreign_key_check') as unknown[];
      expect(fkViolations).toHaveLength(0);
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPAT-E2E-LIFECYCLE: Req 9 — post-upgrade cap=5/audience=3 full lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-E2E-LIFECYCLE: post-upgrade monetary lifecycle (in-memory via setup.js)', () => {
  it('COMPAT-E2E-1: cap=5/audience=3 → 500 reserved, 300 distributed, 200 returned exactly once', () => {
    const sponsorId = makeSponsor();
    const adminId = makeAdmin();
    const { cohortId } = makeCohortWithMembers(sponsorId, 3);

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'individual',
      amountStroops: '100',
      maxRecipients: 5,
      description: 'E2E test',
      idempotencyKey: uuidv4(),
    });
    const rewardId = reward.id;

    fundReward(rewardId, adminId, { type: 'admin_grant' }, uuidv4());

    // admin_grant credits the reward creator's (sponsorId) funder account
    const funderAcctAfterFund = getAccount(sponsorId, 'funder');
    // admin_grant: reserves amount * cap = 100 * 5 = 500
    expect(funderAcctAfterFund!.reserved_stroops).toBe(500);

    activateReward(rewardId, sponsorId, uuidv4());

    makeAllocationsEligible(rewardId);

    // Get actual allocations
    const allocations = db.prepare(
      'SELECT id, student_user_id FROM reward_allocations WHERE reward_id = ?'
    ).all(rewardId) as { id: string; student_user_id: string }[];
    expect(allocations).toHaveLength(3);

    // Release all 3 allocations (scope holder = sponsorId)
    for (const alloc of allocations) {
      releaseAllocation(alloc.id, sponsorId, uuidv4(), rewardId);
    }

    // Reward should now be 'released'
    const rewardRow = db.prepare('SELECT status FROM rewards WHERE id = ?').get(rewardId) as { status: string };
    expect(rewardRow.status).toBe('released');

    const funderAcctFinal = getAccount(sponsorId, 'funder');
    // 500 reserved - 300 released - 200 release_unused = 0 reserved
    expect(funderAcctFinal!.reserved_stroops).toBe(0);

    // Exactly one release_unused entry
    const unusedEntries = db.prepare(
      "SELECT * FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'release_unused'"
    ).all(rewardId) as { amount_stroops: number }[];
    expect(unusedEntries).toHaveLength(1);
    expect(unusedEntries[0].amount_stroops).toBe(200);

    // Students received correct amounts
    for (const alloc of allocations) {
      const recipAcct = getAccount(alloc.student_user_id, 'recipient');
      expect(recipAcct!.available_stroops).toBe(100);
    }

    // Ledger totals: 500 debited from funder.reserved (300 release + 200 release_unused)
    const txns = db.prepare(
      "SELECT transaction_type FROM reward_transactions WHERE reward_id = ? ORDER BY created_at"
    ).all(rewardId) as { transaction_type: string }[];
    const releaseCount = txns.filter(t => t.transaction_type === 'release').length;
    const unusedCount = txns.filter(t => t.transaction_type === 'release_unused').length;
    expect(releaseCount).toBe(3);
    expect(unusedCount).toBe(1);
  });

  it('COMPAT-E2E-2: exact-cap completion (cap=3, audience=3) → no release_unused entry', () => {
    const sponsorId = makeSponsor();
    const adminId = makeAdmin();
    const { cohortId } = makeCohortWithMembers(sponsorId, 3);

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'individual',
      amountStroops: '100',
      maxRecipients: 3,
      description: 'Exact cap test',
      idempotencyKey: uuidv4(),
    });
    const rewardId = reward.id;
    fundReward(rewardId, adminId, { type: 'admin_grant' }, uuidv4());
    activateReward(rewardId, sponsorId, uuidv4());
    makeAllocationsEligible(rewardId);

    const allocations = db.prepare(
      'SELECT id, student_user_id FROM reward_allocations WHERE reward_id = ?'
    ).all(rewardId) as { id: string; student_user_id: string }[];

    for (const alloc of allocations) {
      releaseAllocation(alloc.id, sponsorId, uuidv4(), rewardId);
    }

    const unusedEntries = db.prepare(
      "SELECT * FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'release_unused'"
    ).all(rewardId);
    expect(unusedEntries).toHaveLength(0);

    // admin_grant credits sponsorId's funder account
    const funderAcct = getAccount(sponsorId, 'funder');
    expect(funderAcct!.reserved_stroops).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPAT-REGRESSION: Req 10 — existing tests not broken (run via in-memory setup)
// This test is a lightweight sentinel — the full 26+19 suite runs separately.
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-REGRESSION: in-memory suite sentinel', () => {
  it('COMPAT-REGRESSION-1: current schema.sql already has target CHECK', () => {
    const currentSchema = fs.readFileSync(
      path.resolve(__dirname, '../../database/schema.sql'), 'utf-8'
    );
    expect(currentSchema).toContain("'release_unused'");
  });

  it('COMPAT-REGRESSION-2: in-memory _resetForTests uses target schema (no migration needed)', () => {
    // The setup.js beforeEach already ran _resetForTests(schemaSQL) — db is at target
    const row = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='reward_transactions'"
    ).get() as { sql: string };
    expect(row.sql).toContain("'release_unused'");
  });

  it('COMPAT-REGRESSION-3: cancel with source_user_id still works on in-memory DB', () => {
    const sponsorId = makeSponsor();
    const adminId = makeAdmin();
    const { cohortId } = makeCohortWithMembers(sponsorId, 1);

    const reward = createReward(sponsorId, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortId,
      rewardType: 'individual',
      amountStroops: '100',
      maxRecipients: 1,
      description: 'cancel test',
      idempotencyKey: uuidv4(),
    });
    const rewardId = reward.id;
    fundReward(rewardId, adminId, { type: 'admin_grant' }, uuidv4());

    // Only scope holder (sponsor) can cancel; reason comes before idempotencyKey
    cancelReward(rewardId, sponsorId, 'test cancel', uuidv4());

    const cancelTxns = db.prepare(
      "SELECT * FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'cancel'"
    ).all(rewardId);
    expect(cancelTxns.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPAT-PREFLIGHT: Req 11 — databaseBootstrap rejects old; accepts target
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-PREFLIGHT: databaseBootstrap.validateDatabase enforcement', () => {
  // Isolate the reward migration gate: the historical reward schema must already
  // satisfy the independent RBAC cutover gate. Read that gate from the canonical
  // schema rather than duplicating its DDL in this fixture.
  function installCurrentAuthorizationGate(conn: SqliteDatabase): void {
    const canonical = new Database(':memory:');
    try {
      canonical.exec(fixtureSqlForDatabase(readSqlFixture(
        path.resolve(__dirname, '../../database/schema.sql')
      )));
      for (const [type, name] of [
        ['table', 'authorization_migrations'],
        ['trigger', 'trg_auto_assign_user_role'],
      ]) {
        const definition = canonical.prepare(
          'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?'
        ).get(type, name) as { sql: string };
        conn.exec(`DROP ${type.toUpperCase()} IF EXISTS ${name}`);
        conn.exec(definition.sql);
      }
      conn.prepare('INSERT INTO authorization_migrations(id, review_reference) VALUES (?, ?)')
        .run('rbac-only-v1', 'reward-preflight-test');
    } finally {
      canonical.close();
    }
  }

  it('COMPAT-PREFLIGHT-1: validateDatabase throws on old-schema with migration-required message', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    let threw = false;
    let message = '';
    try {
      installCurrentAuthorizationGate(conn);
      validateDatabase(conn);
    } catch (err) {
      threw = true;
      message = err instanceof Error ? err.message : String(err);
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
    expect(threw).toBe(true);
    expect(message).toMatch(/migration|migrate|release_unused/i);
    expect(message).toMatch(/db:migrate-reward-txn-check|002/i);
  });

  it('COMPAT-PREFLIGHT-2: validateDatabase passes on target-schema DB', () => {
    const currentSchema = fs.readFileSync(
      path.resolve(__dirname, '../../database/schema.sql'), 'utf-8'
    );
    const { dbPath, conn } = makeTempDb(currentSchema);
    conn.close();
    applyUpgrade(dbPath); // ensure it's at target (it already is from fresh schema)
    const verify = new Database(dbPath);
    try {
      expect(() => validateDatabase(verify)).not.toThrow();
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-PREFLIGHT-3: false migration receipt does not bypass validation', () => {
    // Insert migration key in system_config but leave old schema
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    installCurrentAuthorizationGate(conn);
    conn.prepare(
      "INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by) VALUES (?, '2026-10-30', datetime('now'), NULL)"
    ).run(MIGRATION_ID);
    let message = '';
    try {
      validateDatabase(conn);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
    // validateDatabase must check actual DDL, not just system_config
    expect(message).toMatch(/db:migrate-reward-txn-check|002/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPAT-RESTORE-PATH: Req 12 — compatible rollback path
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-RESTORE-PATH: rollback path constraints', () => {
  it('COMPAT-RESTORE-1: applying migration then downgrading image has no release_unused rows → restore is compatible', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    seedMinimalFixtures(conn);
    conn.close();

    // Migrate
    applyUpgrade(dbPath);

    // Old-image simulation: insert only pre-W03-R2 transaction types (no release_unused)
    const postMigConn = new Database(dbPath);
    const verify = postMigConn;
    const unusedCount = verify.prepare(
      "SELECT COUNT(*) as c FROM reward_transactions WHERE transaction_type = 'release_unused'"
    ).get() as { c: number };
    verify.close();

    expect(unusedCount.c).toBe(0);
    // Without release_unused rows, the old CHECK schema can store all existing rows
    // → backup restore is safe (rollback is compatible)
    cleanupTempDb(dbPath);
  });

  it('COMPAT-RESTORE-2: applyUpgrade never deletes or modifies existing financial rows', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    const fixtures = seedMinimalFixtures(conn);
    const rewardId = uuidv4();
    conn.prepare(
      `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
        amount_stroops, status, idempotency_key)
       VALUES (?, ?, 'sponsor_cohort', ?, 'individual', 100, 'active', ?)`
    ).run(rewardId, fixtures.sponsorId, fixtures.cohortId, uuidv4());
    const txnId = uuidv4();
    conn.prepare(`
      INSERT INTO reward_transactions (
        id, reward_id, source_account_type, source_bucket, source_user_id,
        destination_account_type, destination_bucket, destination_user_id,
        actor_type, actor_user_id, transaction_type, amount_stroops,
        previous_state, new_state, idempotency_key
      ) VALUES (?, ?, 'funder', 'reserved', ?, 'funder', 'available', ?,
                'user', ?, 'cancel', 100, 'active', 'cancelled', ?)
    `).run(txnId, rewardId, fixtures.adminId, fixtures.adminId, fixtures.adminId, uuidv4());
    conn.close();

    applyUpgrade(dbPath);

    const verify = new Database(dbPath);
    try {
      const row = verify.prepare(
        'SELECT * FROM reward_transactions WHERE id = ?'
      ).get(txnId) as Record<string, unknown> | undefined;
      expect(row).toBeDefined();
      expect(row!['transaction_type']).toBe('cancel');
      expect(row!['amount_stroops']).toBe(100);
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// W03-R3: COMPAT-F1 — False target classification (comment bypass)
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-F1: comment-bypass classification correction', () => {
  // F1 attack: inject /* 'release_unused' */ as a SQL comment in the old schema's
  // transaction_type CHECK. The raw DDL contains the token but the constraint is
  // unchanged. SQLite preserves comments verbatim in sqlite_master.sql.
  const OLD_SCHEMA_WITH_COMMENT = mutateSqlFixture(OLD_SCHEMA,
    "CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire'))",
    "CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire') /* 'release_unused' */)"
  );

  it('COMPAT-F1-1: comment containing release_unused → detectSchemaVersion returns source (not target)', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA_WITH_COMMENT);
    try {
      const stored = conn.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='reward_transactions'"
      ).get() as { sql: string };
      // Confirm SQLite preserved the comment (F1 precondition)
      expect(stored.sql).toContain("'release_unused'");
      // F1 fix: must return 'source' not 'target'
      expect(detectSchemaVersion(conn)).toBe('source');
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F1-2: comment bypass → planUpgrade reports wouldApply:true (does not skip upgrade)', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA_WITH_COMMENT);
    conn.close();
    const report = planUpgrade(dbPath);
    expect(report.wouldApply).toBe(true);
    expect(report.alreadyAtTarget).toBe(false);
    expect(report.schemaVersion).toBe('source');
    cleanupTempDb(dbPath);
  });

  it('COMPAT-F1-3: comment bypass → applyUpgrade actually migrates (not a no-op)', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA_WITH_COMMENT);
    conn.close();
    const result = applyUpgrade(dbPath);
    expect(result.alreadyAtTarget).toBe(false);
    expect(result.success).toBe(true);
    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('target');
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F1-4: target txn_type CHECK but old compound check → unknown (not target or source)', () => {
    // DDL has release_unused in transaction_type CHECK but not in compound check
    const halfTargetSchema = mutateSqlFixture(OLD_SCHEMA,
      "CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire'))",
      "CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire', 'release_unused'))"
    );
    const { dbPath, conn } = makeTempDb(halfTargetSchema);
    expect(detectSchemaVersion(conn)).toBe('unknown');
    conn.close();

    expect(() => applyUpgrade(dbPath)).toThrow(/unsupported|unknown/i);

    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('unknown');
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F1-5: permissive OR branch in compound check → unknown (not certified as target)', () => {
    const permissiveSchema = mutateSqlFixture(OLD_SCHEMA,
      "CHECK ((transaction_type IN ('reserve', 'cancel', 'expire') AND source_user_id IS NOT NULL) OR (transaction_type NOT IN ('reserve', 'cancel', 'expire')))",
      "CHECK ((transaction_type IN ('reserve', 'cancel', 'expire') AND source_user_id IS NOT NULL) OR (transaction_type NOT IN ('reserve', 'cancel', 'expire')) OR transaction_type = 'release_unused')"
    );
    const { dbPath, conn } = makeTempDb(permissiveSchema);
    try {
      expect(detectSchemaVersion(conn)).toBe('unknown');
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F1-6: fake system_config migration receipt → planUpgrade still reports wouldApply:true', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.prepare(
      "INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by) VALUES (?, datetime('now'), datetime('now'), NULL)"
    ).run(MIGRATION_ID);
    conn.close();
    const report = planUpgrade(dbPath);
    expect(report.wouldApply).toBe(true);
    expect(report.schemaVersion).toBe('source');
    cleanupTempDb(dbPath);
  });

  it('COMPAT-F1-7: comment bypass → validateDatabase throws (preflight not fooled by comment)', () => {
    const { conn } = makeTempDb(OLD_SCHEMA_WITH_COMMENT);
    let threw = false;
    try {
      validateDatabase(conn);
    } catch {
      threw = true;
    } finally {
      conn.close();
    }
    expect(threw).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// W03-R3: COMPAT-F2 — Silent schema-object loss (dependency inventory)
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-F2: dependency inventory and refusal for unsupported objects', () => {
  it('COMPAT-F2-1: extra index on reward_transactions → planUpgrade throws with actionable message', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    seedMinimalFixtures(conn);
    conn.exec('CREATE INDEX idx_test_extra_amount ON reward_transactions(amount_stroops)');
    conn.close();
    expect(() => planUpgrade(dbPath)).toThrow(/unsupported|unexpected|idx_test_extra_amount/i);
    cleanupTempDb(dbPath);
  });

  it('COMPAT-F2-2: extra index → applyUpgrade throws; schema, extra index and data unchanged', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    const fixtures = seedMinimalFixtures(conn);
    const rewardId = uuidv4();
    conn.prepare(
      `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
        amount_stroops, status, idempotency_key)
       VALUES (?, ?, 'sponsor_cohort', ?, 'individual', 100, 'active', ?)`
    ).run(rewardId, fixtures.sponsorId, fixtures.cohortId, uuidv4());
    conn.exec('CREATE INDEX idx_test_extra_amount ON reward_transactions(amount_stroops)');
    conn.close();

    expect(() => applyUpgrade(dbPath)).toThrow(/unsupported|unexpected|idx_test_extra_amount/i);

    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('source');
      const idx = verify.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_test_extra_amount'"
      ).get();
      expect(idx).toBeDefined(); // extra index still present
      expect(verify.prepare('SELECT 1 FROM system_config WHERE key = ?').get(MIGRATION_ID)).toBeUndefined();
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F2-3: extra trigger → applyUpgrade throws; trigger and source schema unchanged', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    seedMinimalFixtures(conn);
    conn.exec(
      `CREATE TRIGGER trg_test_guard BEFORE DELETE ON reward_transactions BEGIN SELECT RAISE(ABORT, 'synthetic guard'); END`
    );
    conn.close();

    expect(() => applyUpgrade(dbPath)).toThrow(/unsupported|unexpected|trg_test_guard/i);

    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('source');
      expect(verify.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='trg_test_guard'"
      ).get()).toBeDefined();
      expect(verify.prepare('SELECT 1 FROM system_config WHERE key = ?').get(MIGRATION_ID)).toBeUndefined();
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F2-4: dependent view on reward_transactions → applyUpgrade throws before mutation', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    seedMinimalFixtures(conn);
    conn.exec(
      `CREATE VIEW reward_txn_summary AS SELECT reward_id, COUNT(*) as c FROM reward_transactions GROUP BY reward_id`
    );
    conn.close();

    expect(() => applyUpgrade(dbPath)).toThrow(/unsupported|unexpected|view|reward_txn_summary/i);

    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('source');
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F2-5: known-only objects (4 standard indexes, no triggers/views) → applyUpgrade succeeds', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    seedMinimalFixtures(conn);
    conn.close();
    const result = applyUpgrade(dbPath);
    expect(result.success).toBe(true);
    expect(result.alreadyAtTarget).toBe(false);
    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('target');
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F2-6: after successful apply, all 4 known indexes present and fund_ref UNIQUE enforced', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    seedMinimalFixtures(conn);
    conn.close();
    applyUpgrade(dbPath);

    const verify = new Database(dbPath);
    verify.pragma('foreign_keys = ON');
    try {
      for (const name of [
        'idx_reward_txn_reward',
        'idx_reward_txn_allocation',
        'idx_reward_txn_idem',
        'idx_reward_txn_fund_ref_unique',
      ]) {
        expect(verify.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(name)).toBeDefined();
      }
      // Behavioral proof: idx_reward_txn_fund_ref_unique still enforces uniqueness
      const adminId = (verify.prepare('SELECT id FROM users LIMIT 1').get() as { id: string }).id;
      const cohortId = (verify.prepare('SELECT id FROM sponsor_cohorts LIMIT 1').get() as { id: string }).id;
      const rewardId = uuidv4();
      verify.prepare(
        `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
          amount_stroops, status, idempotency_key) VALUES (?, ?, 'sponsor_cohort', ?, 'individual', 100, 'draft', ?)`
      ).run(rewardId, adminId, cohortId, uuidv4());

      const ref = `stellar-${uuidv4()}`;
      verify.prepare(`
        INSERT INTO reward_transactions (id, reward_id, source_account_type, source_bucket,
          destination_account_type, destination_bucket, destination_user_id,
          actor_type, actor_user_id, transaction_type, amount_stroops,
          previous_state, new_state, funding_source_type, funding_reference, idempotency_key)
        VALUES (?, ?, 'external', NULL, 'funder', 'available', ?, 'user', ?, 'fund', 100,
                'draft', 'funded', 'stellar', ?, ?)
      `).run(uuidv4(), rewardId, adminId, adminId, ref, uuidv4());

      expect(() => {
        verify.prepare(`
          INSERT INTO reward_transactions (id, reward_id, source_account_type, source_bucket,
            destination_account_type, destination_bucket, destination_user_id,
            actor_type, actor_user_id, transaction_type, amount_stroops,
            previous_state, new_state, funding_source_type, funding_reference, idempotency_key)
          VALUES (?, ?, 'external', NULL, 'funder', 'available', ?, 'user', ?, 'fund', 100,
                  'draft', 'funded', 'stellar', ?, ?)
        `).run(uuidv4(), rewardId, adminId, adminId, ref, uuidv4());
      }).toThrow(/UNIQUE constraint failed/);
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// W03-R3: COMPAT-F3 — Validation failure after irreversible commit
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-F3: pre-migration validation and commit boundary', () => {
  it('COMPAT-F3-1: pre-existing FK violation → applyUpgrade refuses before reconstruction; source schema and no receipt', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    seedMinimalFixtures(conn);
    conn.pragma('foreign_keys = OFF');
    conn.exec(`CREATE TABLE fk_orphan_holder (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE RESTRICT
    )`);
    conn.prepare('INSERT INTO fk_orphan_holder (id, user_id) VALUES (?, ?)').run('orphan-1', 'nonexistent-user-id');
    conn.pragma('foreign_keys = ON');
    conn.close();

    let threw = false;
    let threwMessage = '';
    try {
      applyUpgrade(dbPath);
    } catch (err) {
      threw = true;
      threwMessage = err instanceof Error ? err.message : String(err);
    }
    expect(threw).toBe(true);
    expect(threwMessage).toMatch(/pre.?exist|foreign.?key|fk|violation/i);

    const verify = new Database(dbPath);
    try {
      // Critical: reward_transactions must still be at SOURCE schema
      expect(detectSchemaVersion(verify)).toBe('source');
      expect(verify.prepare('SELECT 1 FROM system_config WHERE key = ?').get(MIGRATION_ID)).toBeUndefined();
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F3-2: clean source DB → pre-checks pass; applyUpgrade succeeds with clean post-migration', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    seedMinimalFixtures(conn);
    conn.close();

    const result = applyUpgrade(dbPath);
    expect(result.success).toBe(true);
    expect(result.alreadyAtTarget).toBe(false);

    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('target');
      expect(verify.pragma('integrity_check', { simple: true })).toBe('ok');
      expect((verify.pragma('foreign_key_check') as unknown[]).length).toBe(0);
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F3-3: after FK refusal, all original transaction rows preserved with exact values, no receipt', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    const fixtures = seedMinimalFixtures(conn);
    const rewardId = uuidv4();
    conn.prepare(
      `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
        amount_stroops, status, idempotency_key)
       VALUES (?, ?, 'sponsor_cohort', ?, 'individual', 100, 'active', ?)`
    ).run(rewardId, fixtures.sponsorId, fixtures.cohortId, uuidv4());
    conn.prepare(`
      INSERT INTO reward_transactions (
        id, reward_id, source_account_type, source_bucket, source_user_id,
        destination_account_type, destination_bucket, destination_user_id,
        actor_type, actor_user_id, transaction_type, amount_stroops,
        previous_state, new_state, idempotency_key
      ) VALUES (?, ?, 'funder', 'reserved', ?, 'funder', 'available', ?,
                'user', ?, 'cancel', 100, 'active', 'cancelled', ?)
    `).run(uuidv4(), rewardId, fixtures.adminId, fixtures.adminId, fixtures.adminId, uuidv4());

    const rowsBefore = conn.prepare('SELECT * FROM reward_transactions ORDER BY created_at').all();
    conn.pragma('foreign_keys = OFF');
    conn.exec(`CREATE TABLE fk_orphan_holder3 (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id))`);
    conn.prepare('INSERT INTO fk_orphan_holder3 VALUES (?, ?)').run('o1', 'ghost-user');
    conn.pragma('foreign_keys = ON');
    conn.close();

    expect(() => applyUpgrade(dbPath)).toThrow();

    const verify = new Database(dbPath);
    try {
      const rowsAfter = verify.prepare('SELECT * FROM reward_transactions ORDER BY created_at').all();
      expect(rowsAfter).toHaveLength(rowsBefore.length);
      for (let i = 0; i < rowsBefore.length; i++) {
        expect(rowsAfter[i]).toEqual(rowsBefore[i]);
      }
      expect(verify.prepare('SELECT 1 FROM system_config WHERE key = ?').get(MIGRATION_ID)).toBeUndefined();
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// W03-R3: COMPAT-PARTIAL-SWAP-EXT — Extended partial-swap artifact detection
// ═══════════════════════════════════════════════════════════════════════════════

describe('COMPAT-PARTIAL-SWAP-EXT: extended partial-swap artifact detection', () => {
  it('COMPAT-PARTIAL-SWAP-EXT-0: only _new exists (original missing) → refuses with partial-swap message', () => {
    // Simulate the most dangerous partial-swap: original table was already dropped
    // but rename to reward_transactions never completed.
    const { dbPath, conn } = makeTempDb('CREATE TABLE reward_transactions_new (id TEXT PRIMARY KEY, x TEXT)');
    conn.close();

    expect(() => applyUpgrade(dbPath)).toThrow(/partial.?swap|reward_transactions_new/i);

    const verify = new Database(dbPath);
    try {
      // _new table must still be present (not dropped by a cleanup side-effect)
      expect(verify.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='reward_transactions_new'"
      ).get()).toBeDefined();
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-PARTIAL-SWAP-EXT-1: both reward_transactions and _new exist → refuses; original unchanged', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    seedMinimalFixtures(conn);
    conn.exec(`CREATE TABLE reward_transactions_new (id TEXT PRIMARY KEY, x TEXT)`);
    conn.close();

    expect(() => applyUpgrade(dbPath)).toThrow(/partial.?swap|reward_transactions_new/i);

    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('source');
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-PARTIAL-SWAP-EXT-2: after stale _new manual cleanup, safe rerun succeeds', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    seedMinimalFixtures(conn);
    conn.exec(`CREATE TABLE reward_transactions_new (id TEXT PRIMARY KEY, x TEXT)`);
    conn.close();

    expect(() => applyUpgrade(dbPath)).toThrow();

    // Operator removes the stale artifact
    const fixConn = new Database(dbPath);
    fixConn.exec('DROP TABLE reward_transactions_new');
    fixConn.close();

    const result = applyUpgrade(dbPath);
    expect(result.success).toBe(true);
    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('target');
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// W03-R4 tests: Authoritative complete-schema compatibility
//
// F1: permissive target CHECK (OR 1=1) was falsely accepted
// F2: additional source CHECK was silently removed
//
// W03-R4 requirement-to-test map:
//  COMPAT-F4    — F1: permissive OR target detected; prove SQLite accepts bad rows on fixture
//  COMPAT-F4F2  — F2: extra source CHECK detected as unknown; apply refuses before mutation
//  COMPAT-F4-MUTATIONS — complete-schema mutations (missing/altered checks, nullability, FK, columns)
//  COMPAT-F4-TOKENS — comment/string literal tokenization
//  COMPAT-F4-INDEX  — index drift under supported names
//  COMPAT-F4-REPO   — actual repo fixture files produce correct classification
// ═══════════════════════════════════════════════════════════════════════════════

const TARGET_SCHEMA_PATH = path.resolve(__dirname, '../../database/schema.sql');
const TARGET_SCHEMA = readSqlFixture(TARGET_SCHEMA_PATH);

// Permissive target: OR 1=1 appended to the transaction_type CHECK
const PERMISSIVE_TARGET_SCHEMA = mutateSqlFixture(TARGET_SCHEMA,
  "CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire', 'release_unused'))",
  "CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire', 'release_unused') OR 1=1)"
);

// Extra CHECK on source: add a table-level CHECK after the last constraint
const EXTRA_CHECK_SOURCE_SCHEMA = mutateSqlFixture(OLD_SCHEMA,
  "  CHECK ((transaction_type = 'fund' AND destination_user_id IS NOT NULL AND destination_account_type = 'funder') OR (transaction_type != 'fund'))\n);",
  "  CHECK ((transaction_type = 'fund' AND destination_user_id IS NOT NULL AND destination_account_type = 'funder') OR (transaction_type != 'fund')),\n  CHECK (amount_stroops < 1000)\n);"
);

// ─────────────────────────────────────────────────────────────────────────────
// COMPAT-F4: F1 — permissive target CHECK is detected and refused
// ─────────────────────────────────────────────────────────────────────────────

describe('COMPAT-F4: F1 — permissive target CHECK (OR 1=1) detected and refused', () => {
  it('COMPAT-F4-0: SQLite itself accepts NOT_A_REAL_KIND on permissive fixture (proves bypass)', () => {
    const { dbPath, conn } = makeTempDb(PERMISSIVE_TARGET_SCHEMA);
    try {
      // Must not throw — the weakened constraint allows any transaction_type
      expect(() => {
        conn.exec(
          `INSERT INTO reward_transactions ` +
          `(id, source_account_type, destination_account_type, destination_bucket, actor_type, ` +
          ` actor_user_id, transaction_type, amount_stroops, currency_code, previous_state, new_state, idempotency_key) ` +
          `VALUES ('bad-1','external','funder','available','system',NULL,'NOT_A_REAL_KIND',1,'XLM','draft','funded','ik-f4-bad')`
        );
      }).not.toThrow();
      // Canonical target would reject this:
      const { dbPath: dbPath2, conn: conn2 } = makeTempDb(TARGET_SCHEMA);
      try {
        expect(() => {
          conn2.exec(
            `INSERT INTO reward_transactions ` +
            `(id, source_account_type, destination_account_type, destination_bucket, actor_type, ` +
            ` actor_user_id, transaction_type, amount_stroops, currency_code, previous_state, new_state, idempotency_key) ` +
            `VALUES ('bad-2','external','funder','available','system',NULL,'NOT_A_REAL_KIND',1,'XLM','draft','funded','ik-f4-bad2')`
          );
        }).toThrow(/CHECK constraint failed/i);
      } finally {
        conn2.close();
        cleanupTempDb(dbPath2);
      }
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F4-1: detectSchemaVersion returns unknown for permissive target DDL (not target)', () => {
    const { dbPath, conn } = makeTempDb(PERMISSIVE_TARGET_SCHEMA);
    try {
      expect(detectSchemaVersion(conn)).toBe('unknown');
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F4-2: planUpgrade throws for permissive target DDL (not alreadyAtTarget)', () => {
    const { dbPath, conn } = makeTempDb(PERMISSIVE_TARGET_SCHEMA);
    conn.close();
    try {
      expect(() => planUpgrade(dbPath)).toThrow(/unsupported|unknown/i);
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F4-3: applyUpgrade throws for permissive target DDL; original DDL and no receipt', () => {
    const { dbPath, conn } = makeTempDb(PERMISSIVE_TARGET_SCHEMA);
    seedMinimalFixtures(conn);
    conn.close();
    let threw = false;
    try { applyUpgrade(dbPath); } catch { threw = true; }
    expect(threw).toBe(true);
    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('unknown');
      expect(verify.prepare('SELECT 1 FROM system_config WHERE key = ?').get(MIGRATION_ID)).toBeUndefined();
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F4-4: validateDatabase (bootstrap preflight) refuses permissive target DDL', () => {
    const { dbPath, conn } = makeTempDb(PERMISSIVE_TARGET_SCHEMA);
    conn.close();
    const inspection = new Database(dbPath, { readonly: true });
    try {
      expect(() => validateDatabase(inspection)).toThrow(/unrecogni|unknown|unsupported/i);
    } finally {
      inspection.close();
      cleanupTempDb(dbPath);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPAT-F4F2: F2 — additional source CHECK is detected and refused
// ─────────────────────────────────────────────────────────────────────────────

describe('COMPAT-F4F2: F2 — additional source CHECK refuses before mutation', () => {
  it('COMPAT-F4F2-1: detectSchemaVersion returns unknown for source DDL with extra CHECK (not source)', () => {
    const { dbPath, conn } = makeTempDb(EXTRA_CHECK_SOURCE_SCHEMA);
    try {
      expect(detectSchemaVersion(conn)).toBe('unknown');
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F4F2-2: planUpgrade throws for source DDL with extra CHECK', () => {
    const { dbPath, conn } = makeTempDb(EXTRA_CHECK_SOURCE_SCHEMA);
    conn.close();
    try {
      expect(() => planUpgrade(dbPath)).toThrow(/unsupported|unknown/i);
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F4F2-3: applyUpgrade throws for extra CHECK; original DDL and data preserved, no receipt', () => {
    const { dbPath, conn } = makeTempDb(EXTRA_CHECK_SOURCE_SCHEMA);
    seedMinimalFixtures(conn);
    const rowsBefore = (conn.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
    // Read original DDL before close
    const origDdl = (conn.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='reward_transactions'").get() as { sql: string }).sql;
    conn.close();

    let threw = false;
    try { applyUpgrade(dbPath); } catch { threw = true; }
    expect(threw).toBe(true);

    const verify = new Database(dbPath);
    try {
      // Schema must be unchanged
      expect(detectSchemaVersion(verify)).toBe('unknown');
      const afterDdl = (verify.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='reward_transactions'").get() as { sql: string }).sql;
      expect(afterDdl).toBe(origDdl);
      // Data preserved
      expect((verify.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c).toBe(rowsBefore);
      // No receipt
      expect(verify.prepare('SELECT 1 FROM system_config WHERE key = ?').get(MIGRATION_ID)).toBeUndefined();
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPAT-F4-MUTATIONS: complete-schema structural mutations return 'unknown'
// ─────────────────────────────────────────────────────────────────────────────

describe('COMPAT-F4-MUTATIONS: structural schema mutations classified unknown', () => {
  function sourceMutated(find: string, replace: string): string {
    const result = mutateSqlFixture(OLD_SCHEMA,find, replace);
    if (result === OLD_SCHEMA) throw new Error(`Pattern not found: ${find}`);
    return result;
  }
  function targetMutated(find: string, replace: string): string {
    const result = mutateSqlFixture(TARGET_SCHEMA,find, replace);
    if (result === TARGET_SCHEMA) throw new Error(`Pattern not found: ${find}`);
    return result;
  }

  const cases: Array<{ name: string; schema: string }> = [
    {
      name: 'source missing actor check',
      schema: sourceMutated(
        "  CHECK ((actor_type = 'system' AND actor_user_id IS NULL) OR (actor_type = 'user' AND actor_user_id IS NOT NULL)),\n",
        ''
      ),
    },
    {
      name: 'source missing source-user compound check',
      schema: sourceMutated(
        "  CHECK ((transaction_type IN ('reserve', 'cancel', 'expire') AND source_user_id IS NOT NULL) OR (transaction_type NOT IN ('reserve', 'cancel', 'expire'))),\n",
        ''
      ),
    },
    {
      name: 'source extra OR alternative in fund check',
      schema: sourceMutated(
        "OR (transaction_type != 'fund'))\n);",
        "OR (transaction_type != 'fund') OR 1=1)\n);"
      ),
    },
    {
      name: 'source changed actor_type NOT NULL to nullable',
      schema: sourceMutated(
        "  actor_type               TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'system')),",
        "  actor_type               TEXT DEFAULT 'user' CHECK (actor_type IN ('user', 'system')),"
      ),
    },
    {
      name: 'source changed amount_stroops DEFAULT added',
      schema: sourceMutated(
        "  amount_stroops           INTEGER NOT NULL CHECK (amount_stroops > 0),",
        "  amount_stroops           INTEGER NOT NULL DEFAULT 0 CHECK (amount_stroops > 0),"
      ),
    },
    {
      name: 'source changed FK ON DELETE for reward_id',
      schema: sourceMutated(
        "  reward_id                TEXT REFERENCES rewards(id) ON DELETE RESTRICT,",
        "  reward_id                TEXT REFERENCES rewards(id) ON DELETE CASCADE,"
      ),
    },
    {
      name: 'source added extra column',
      schema: sourceMutated(
        "  created_at               TEXT NOT NULL DEFAULT (datetime('now')),",
        "  created_at               TEXT NOT NULL DEFAULT (datetime('now')),\n  extra_col                TEXT,"
      ),
    },
    {
      name: 'source column order changed (amount_stroops before transaction_type)',
      schema: sourceMutated(
        "  transaction_type         TEXT NOT NULL CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire')),\n  amount_stroops           INTEGER NOT NULL CHECK (amount_stroops > 0),",
        "  amount_stroops           INTEGER NOT NULL CHECK (amount_stroops > 0),\n  transaction_type         TEXT NOT NULL CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire')),"
      ),
    },
    {
      name: 'target transaction_type wrong IN list (missing release_unused from one check only)',
      schema: targetMutated(
        "  CHECK ((transaction_type IN ('reserve', 'cancel', 'expire', 'release_unused') AND source_user_id IS NOT NULL) OR (transaction_type NOT IN ('reserve', 'cancel', 'expire', 'release_unused'))),",
        "  CHECK ((transaction_type IN ('reserve', 'cancel', 'expire') AND source_user_id IS NOT NULL) OR (transaction_type NOT IN ('reserve', 'cancel', 'expire'))),"
      ),
    },
  ];

  for (const { name, schema } of cases) {
    it(`COMPAT-F4-MUTATIONS: '${name}' returns unknown`, () => {
      let dbPath = '';
      let conn: SqliteDatabase | null = null;
      try {
        const tmp = makeTempDb(schema);
        dbPath = tmp.dbPath;
        conn = tmp.conn;
        expect(detectSchemaVersion(conn)).toBe('unknown');
      } finally {
        conn?.close();
        if (dbPath) cleanupTempDb(dbPath);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPAT-F4-TOKENS: comment/string literal tokenization
// ─────────────────────────────────────────────────────────────────────────────

describe('COMPAT-F4-TOKENS: comment and string literal tokenization', () => {
  it('COMPAT-F4-TOKENS-1: block comment containing realistic text does not affect classification', () => {
    // Source DDL with a SQL comment containing target-like text — should still classify as source
    const WITH_COMMENT = mutateSqlFixture(OLD_SCHEMA,
      "  transaction_type         TEXT NOT NULL CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire')),",
      "  transaction_type         TEXT NOT NULL CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire')), /* was: IN ('fund',...,'release_unused') */"
    );
    const { dbPath, conn } = makeTempDb(WITH_COMMENT);
    try {
      expect(detectSchemaVersion(conn)).toBe('source');
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F4-TOKENS-2: string literal containing comment chars does not strip literal content', () => {
    // source_account_type CHECK contains string literals with no special chars, but
    // we test that a -- inside a string literal does not truncate the following content
    // Use a schema where a reason column DEFAULT contains '--' literally (edge case)
    const WITH_COMMENT_IN_STRING = mutateSqlFixture(OLD_SCHEMA,
      "  reason                   TEXT,",
      "  reason                   TEXT DEFAULT '--placeholder',"
    );
    const { dbPath, conn } = makeTempDb(WITH_COMMENT_IN_STRING);
    try {
      // The modification changes the schema — it should be 'unknown' (not source),
      // since it has a DEFAULT that is not in the canonical source DDL
      expect(detectSchemaVersion(conn)).toBe('unknown');
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPAT-F4-INDEX: index drift under supported names
// ─────────────────────────────────────────────────────────────────────────────

describe('COMPAT-F4-INDEX: index drift under supported names refused', () => {
  it('COMPAT-F4-INDEX-1: idx_reward_txn_reward on wrong column refused before mutation', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    // Replace the correct index with one on a different column
    conn.exec('DROP INDEX idx_reward_txn_reward');
    conn.exec('CREATE INDEX idx_reward_txn_reward ON reward_transactions(allocation_id)');
    conn.close();
    try {
      expect(() => applyUpgrade(dbPath)).toThrow(/drifted|unexpected|definition/i);
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F4-INDEX-2: idx_reward_txn_fund_ref_unique replaced with non-unique index refused', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.exec('DROP INDEX idx_reward_txn_fund_ref_unique');
    conn.exec("CREATE INDEX idx_reward_txn_fund_ref_unique ON reward_transactions(funding_reference) WHERE funding_reference IS NOT NULL AND transaction_type = 'fund'");
    conn.close();
    try {
      expect(() => applyUpgrade(dbPath)).toThrow(/drifted|unexpected|definition/i);
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F4-INDEX-3: idx_reward_txn_fund_ref_unique with altered predicate refused', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.exec('DROP INDEX idx_reward_txn_fund_ref_unique');
    conn.exec("CREATE UNIQUE INDEX idx_reward_txn_fund_ref_unique ON reward_transactions(funding_reference) WHERE funding_reference IS NOT NULL");
    conn.close();
    try {
      expect(() => applyUpgrade(dbPath)).toThrow(/drifted|unexpected|definition/i);
    } finally {
      cleanupTempDb(dbPath);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPAT-F4-REPO: actual repo fixture files produce correct classification
// ─────────────────────────────────────────────────────────────────────────────

describe('COMPAT-F4-REPO: actual repository schema files classified correctly', () => {
  it('COMPAT-F4-REPO-1: database from schema-v117-fixture.sql is classified source', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    try {
      expect(detectSchemaVersion(conn)).toBe('source');
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F4-REPO-2: database from current schema.sql is classified target', () => {
    const { dbPath, conn } = makeTempDb(TARGET_SCHEMA);
    try {
      expect(detectSchemaVersion(conn)).toBe('target');
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F4-REPO-3: after successful migration from v117 fixture, detectSchemaVersion returns target', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.close();
    const result = applyUpgrade(dbPath);
    expect(result.success).toBe(true);
    const verify = new Database(dbPath);
    try {
      expect(detectSchemaVersion(verify)).toBe('target');
    } finally {
      verify.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F4-REPO-4: planUpgrade on current schema.sql fixture reports alreadyAtTarget', () => {
    const { dbPath, conn } = makeTempDb(TARGET_SCHEMA);
    conn.close();
    try {
      const plan = planUpgrade(dbPath);
      expect(plan.alreadyAtTarget).toBe(true);
      expect(plan.wouldApply).toBe(false);
    } finally {
      cleanupTempDb(dbPath);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPAT-F5: W03-R5 — Full-statement validation: table options + literal semantics
//  COMPAT-F5-STRICT    — F1: STRICT/WITHOUT ROWID suffix → classified unknown; refuse plan/apply/preflight
//  COMPAT-F5-LITERAL   — F2: changed string literal → classified unknown; refuse plan/apply/preflight
//  COMPAT-F5-IFLITERAL — canonicalizeDdl: IF NOT EXISTS preserved inside literals; header-only stripping
// ═══════════════════════════════════════════════════════════════════════════════

// Helper: create a minimal file-backed DB with only the reward_transactions table.
// Used for STRICT/WITHOUT ROWID tests where the full schema is not needed.
function makeMinimalRewardTxnDb(ddl: string): { dbPath: string; conn: SqliteDatabase } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-w03r5-'));
  const dbPath = path.join(dir, 'test.db');
  const conn = new Database(dbPath);
  conn.exec(ddl);
  return { dbPath, conn };
}

// Minimal reward_transactions — source-like structure with STRICT table option.
const MINIMAL_STRICT_SOURCE_DDL = `CREATE TABLE reward_transactions (
  id TEXT PRIMARY KEY,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire')),
  amount_stroops INTEGER NOT NULL CHECK (amount_stroops > 0),
  currency_code TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((transaction_type = 'fund') OR (transaction_type != 'fund'))
) STRICT;`;

// Minimal reward_transactions — target-like structure with STRICT table option.
const MINIMAL_STRICT_TARGET_DDL = `CREATE TABLE reward_transactions (
  id TEXT PRIMARY KEY,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire', 'release_unused')),
  amount_stroops INTEGER NOT NULL CHECK (amount_stroops > 0),
  currency_code TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((transaction_type = 'fund') OR (transaction_type != 'fund'))
) STRICT;`;

// Minimal reward_transactions — source-like structure with WITHOUT ROWID table option.
const MINIMAL_WITHOUT_ROWID_SOURCE_DDL = `CREATE TABLE reward_transactions (
  id TEXT PRIMARY KEY,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire')),
  amount_stroops INTEGER NOT NULL CHECK (amount_stroops > 0),
  currency_code TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((transaction_type = 'fund') OR (transaction_type != 'fund'))
) WITHOUT ROWID;`;

// Changed-literal variant: currency_code DEFAULT and CHECK in the reward_transactions
// table use 'IF NOT EXISTS XLM' instead of 'XLM'. This triggers F2 before the fix
// (post-loop regex rewrites literal content, making the body appear to match source).
// Targets reward_transactions specifically because the same pattern appears in several
// earlier tables in the schema — String.replace() would replace the wrong one.
function makeChangedCurrencyLiteralSchema(base: string): string {
  base = normalizeSqlFixture(base);
  const tableStart = base.indexOf('CREATE TABLE IF NOT EXISTS reward_transactions');
  if (tableStart === -1) throw new Error('reward_transactions block not found in schema');
  const nextCreate = base.indexOf('\nCREATE ', tableStart + 1);
  const tableEnd = nextCreate === -1 ? base.length : nextCreate;
  const tableBlock = base.slice(tableStart, tableEnd).replace(
    "DEFAULT 'XLM' CHECK (currency_code IN ('XLM'))",
    "DEFAULT 'IF NOT EXISTS XLM' CHECK (currency_code IN ('IF NOT EXISTS XLM'))"
  );
  return base.slice(0, tableStart) + tableBlock + base.slice(tableEnd);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPAT-F5-STRICT: F1 — STRICT/WITHOUT ROWID suffix detected and refused
// ─────────────────────────────────────────────────────────────────────────────

describe('COMPAT-F5-STRICT: F1 — STRICT/WITHOUT ROWID suffix classified unknown and refused', () => {
  it('COMPAT-F5-STRICT-0: PRAGMA table_list strict=1 precondition — SQLite confirms STRICT table', () => {
    const { dbPath, conn } = makeMinimalRewardTxnDb(MINIMAL_STRICT_SOURCE_DDL);
    try {
      const rows = conn.prepare("PRAGMA table_list").all() as { name: string; strict: number }[];
      const txn = rows.find(r => r.name === 'reward_transactions');
      expect(txn).toBeDefined();
      expect(txn!.strict).toBe(1);
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F5-STRICT-1: detectSchemaVersion returns unknown for STRICT source variant', () => {
    const { dbPath, conn } = makeMinimalRewardTxnDb(MINIMAL_STRICT_SOURCE_DDL);
    try {
      expect(detectSchemaVersion(conn)).toBe('unknown');
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F5-STRICT-2: planUpgrade throws Unsupported schema for STRICT source DB', () => {
    const { dbPath, conn } = makeMinimalRewardTxnDb(MINIMAL_STRICT_SOURCE_DDL);
    conn.close();
    try {
      expect(() => planUpgrade(dbPath)).toThrow('Unsupported schema');
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F5-STRICT-3: applyUpgrade refuses STRICT source; STRICT preserved in sqlite_master', () => {
    const { dbPath, conn } = makeMinimalRewardTxnDb(MINIMAL_STRICT_SOURCE_DDL);
    conn.close();
    try {
      expect(() => applyUpgrade(dbPath)).toThrow('Unsupported schema');
      // Verify the DDL in sqlite_master still includes STRICT — not silently removed
      const verify = new Database(dbPath);
      try {
        const row = verify.prepare(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='reward_transactions'"
        ).get() as { sql: string } | undefined;
        expect(row).toBeDefined();
        expect(row!.sql.toUpperCase()).toContain('STRICT');
      } finally {
        verify.close();
      }
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F5-STRICT-4: validateDatabase refuses STRICT source DB with actionable diagnostic', () => {
    const { dbPath, conn } = makeMinimalRewardTxnDb(MINIMAL_STRICT_SOURCE_DDL);
    conn.close();
    let dbConn: SqliteDatabase | undefined;
    try {
      dbConn = new Database(dbPath);
      expect(() => validateDatabase(dbConn!)).toThrow();
    } finally {
      dbConn?.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F5-STRICT-5: detectSchemaVersion returns unknown for STRICT target variant', () => {
    const { dbPath, conn } = makeMinimalRewardTxnDb(MINIMAL_STRICT_TARGET_DDL);
    try {
      expect(detectSchemaVersion(conn)).toBe('unknown');
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F5-STRICT-6: detectSchemaVersion returns unknown for WITHOUT ROWID source variant', () => {
    const { dbPath, conn } = makeMinimalRewardTxnDb(MINIMAL_WITHOUT_ROWID_SOURCE_DDL);
    try {
      expect(detectSchemaVersion(conn)).toBe('unknown');
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F5-STRICT-7: detectSchemaVersion returns unknown for combined STRICT, WITHOUT ROWID suffix', () => {
    const combinedDdl = `CREATE TABLE reward_transactions (
  id TEXT PRIMARY KEY,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire')),
  amount_stroops INTEGER NOT NULL CHECK (amount_stroops > 0),
  currency_code TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('XLM')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((transaction_type = 'fund') OR (transaction_type != 'fund'))
) STRICT, WITHOUT ROWID;`;
    const { dbPath, conn } = makeMinimalRewardTxnDb(combinedDdl);
    try {
      expect(detectSchemaVersion(conn)).toBe('unknown');
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPAT-F5-LITERAL: F2 — changed string literal classified unknown and refused
// ─────────────────────────────────────────────────────────────────────────────

describe('COMPAT-F5-LITERAL: F2 — changed currency literal classified unknown and refused', () => {
  it('COMPAT-F5-LITERAL-0: SQLite proof — INSERT XLM rejected; INSERT IF NOT EXISTS XLM accepted', () => {
    // Minimal table with changed currency CHECK — proves the literal changes actual behavior
    const { dbPath, conn } = makeMinimalRewardTxnDb(`CREATE TABLE reward_transactions (
  id TEXT PRIMARY KEY,
  currency_code TEXT NOT NULL DEFAULT 'IF NOT EXISTS XLM' CHECK (currency_code IN ('IF NOT EXISTS XLM'))
);`);
    try {
      expect(() => conn.prepare(
        "INSERT INTO reward_transactions (id, currency_code) VALUES ('t1', 'XLM')"
      ).run()).toThrow();
      expect(() => conn.prepare(
        "INSERT INTO reward_transactions (id, currency_code) VALUES ('t2', 'IF NOT EXISTS XLM')"
      ).run()).not.toThrow();
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F5-LITERAL-1: detectSchemaVersion returns unknown for changed-literal source schema', () => {
    const changedSchema = makeChangedCurrencyLiteralSchema(OLD_SCHEMA);
    const { dbPath, conn } = makeTempDb(changedSchema);
    try {
      expect(detectSchemaVersion(conn)).toBe('unknown');
    } finally {
      conn.close();
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F5-LITERAL-2: planUpgrade throws Unsupported schema for changed-literal source DB', () => {
    const changedSchema = makeChangedCurrencyLiteralSchema(OLD_SCHEMA);
    const { dbPath, conn } = makeTempDb(changedSchema);
    conn.close();
    try {
      expect(() => planUpgrade(dbPath)).toThrow('Unsupported schema');
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F5-LITERAL-3: applyUpgrade refuses changed-literal source; DDL in sqlite_master unchanged', () => {
    const changedSchema = makeChangedCurrencyLiteralSchema(OLD_SCHEMA);
    const { dbPath, conn } = makeTempDb(changedSchema);
    conn.close();
    try {
      expect(() => applyUpgrade(dbPath)).toThrow('Unsupported schema');
      // DDL still has the original changed literal — migration did not rewrite it
      const verify = new Database(dbPath);
      try {
        const row = verify.prepare(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='reward_transactions'"
        ).get() as { sql: string } | undefined;
        expect(row).toBeDefined();
        expect(row!.sql).toContain("'IF NOT EXISTS XLM'");
      } finally {
        verify.close();
      }
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  it('COMPAT-F5-LITERAL-4: validateDatabase refuses changed-literal source DB', () => {
    const changedSchema = makeChangedCurrencyLiteralSchema(OLD_SCHEMA);
    const { dbPath, conn } = makeTempDb(changedSchema);
    conn.close();
    let dbConn: SqliteDatabase | undefined;
    try {
      dbConn = new Database(dbPath);
      expect(() => validateDatabase(dbConn!)).toThrow();
    } finally {
      dbConn?.close();
      cleanupTempDb(dbPath);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPAT-F5-IFLITERAL: canonicalizeDdl — IF NOT EXISTS preserved in literals; header-only stripping
// ─────────────────────────────────────────────────────────────────────────────

describe('COMPAT-F5-IFLITERAL: canonicalizeDdl preserves IF NOT EXISTS inside literals', () => {
  it('COMPAT-F5-IFLITERAL-0: IF NOT EXISTS inside single-quoted DEFAULT literal is preserved verbatim', () => {
    const ddl = `CREATE TABLE t (currency_code TEXT NOT NULL DEFAULT 'IF NOT EXISTS XLM' CHECK (currency_code IN ('XLM')))`;
    const result = canonicalizeDdl(ddl);
    expect(result).toContain("DEFAULT 'IF NOT EXISTS XLM'");
  });

  it('COMPAT-F5-IFLITERAL-1: IF NOT EXISTS inside CHECK expression string literal is preserved verbatim', () => {
    const ddl = `CREATE TABLE t (currency_code TEXT NOT NULL DEFAULT 'XLM' CHECK (currency_code IN ('IF NOT EXISTS XLM')))`;
    const result = canonicalizeDdl(ddl);
    expect(result).toContain("('IF NOT EXISTS XLM')");
  });

  it('COMPAT-F5-IFLITERAL-2: IF NOT EXISTS in CREATE TABLE header is stripped; body literals intact', () => {
    const ddl = `CREATE TABLE IF NOT EXISTS reward_transactions (
  currency_code TEXT NOT NULL DEFAULT 'IF NOT EXISTS XLM' CHECK (currency_code IN ('IF NOT EXISTS XLM'))
)`;
    const result = canonicalizeDdl(ddl);
    // Header stripped
    expect(result).not.toMatch(/\bIF\s+NOT\s+EXISTS\s+reward_transactions/i);
    // Body literals preserved
    expect(result).toContain("DEFAULT 'IF NOT EXISTS XLM'");
    expect(result).toContain("('IF NOT EXISTS XLM')");
  });

  it('COMPAT-F5-IFLITERAL-3: parentheses inside quoted string do not confuse body extraction', () => {
    const ddl = `CREATE TABLE t (note TEXT NOT NULL DEFAULT '(special)')`;
    const result = canonicalizeDdl(ddl);
    // The quoted string with parens is preserved verbatim; canonical form ends with )
    expect(result).toContain("DEFAULT '(special)'");
    expect(result.endsWith(')')).toBe(true);
  });

  it('COMPAT-F5-IFLITERAL-4: double-quoted table name in header is not stripped', () => {
    const ddl = `CREATE TABLE "IF NOT EXISTS" (id TEXT PRIMARY KEY)`;
    const result = canonicalizeDdl(ddl);
    // Double-quoted identifier — preserved as-is (it's a valid table name)
    expect(result).toContain('"IF NOT EXISTS"');
  });
});


describe('reviewed FK baseline', () => {
  function fixture() {
    const item = makeTempDb(OLD_SCHEMA);
    item.conn.pragma('foreign_keys = OFF');
    item.conn.exec('CREATE TABLE "échild" (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id))');
    item.conn.exec('INSERT INTO "échild" VALUES (7, 999)');
    item.conn.close();
    return item.dbPath;
  }
  it('matches Python ensure_ascii compact fingerprint for Unicode evidence', () => {
    const file = fixture();
    try {
      const conn = new Database(file);
      const evidence = fkEvidence(conn); conn.close();
      expect(evidence).toEqual({ fk_violation_count: 1, fk_violations_sha256: '3bf5c631fe55c2a75418823ed49ebe6ae5aea49cf034fc34bcd954cc3c6eb971' });
    } finally { cleanupTempDb(file); }
  });
  it('matches Python ordering, nulls, control characters and astral Unicode', () => {
    const rows = [
      { table:'z', rowid:null, parent:'p', fkid:0 },
      { table:'😀\n', rowid:-9, parent:'p', fkid:3 },
      { table:'échild', rowid:100, parent:'users', fkid:0 },
      { table:'échild', rowid:7, parent:'users', fkid:0 },
    ];
    const fake = { pragma: () => rows } as unknown as SqliteDatabase;
    expect(fkEvidence(fake)).toEqual({ fk_violation_count:4, fk_violations_sha256:'f41b46da4c49c942a89c76dd2c9d37c70f65ff918ca64b8822c06e5eee04e4b4' });
  });
  it('preserves the orphan with the reviewed baseline and refuses by default', () => {
    const file = fixture();
    try {
      expect(() => applyUpgrade(file)).toThrow(/Pre-existing FK/);
      const conn = new Database(file); const baseline = fkEvidence(conn); conn.close();
      expect(applyUpgrade(file, { fkBaseline: baseline }).success).toBe(true);
      const after = new Database(file);
      expect(fkEvidence(after)).toEqual(baseline);
      expect(after.prepare('SELECT user_id FROM "échild" WHERE id=7').get()).toEqual({user_id:999});
      expect(detectSchemaVersion(after)).toBe('target');
      expect(JSON.parse((after.prepare('SELECT value FROM system_config WHERE key=?').get(MIGRATION_ID + '_fk_baseline') as {value:string}).value)).toEqual(baseline); after.close();
    } finally { cleanupTempDb(file); }
  });
  it('rolls back when a receipt trigger introduces a new violation', () => {
    const file = fixture();
    try {
      const conn = new Database(file);
      conn.exec(`CREATE TRIGGER bad_receipt AFTER INSERT ON system_config
        WHEN NEW.key='migration_002_reward_txn_check'
        BEGIN INSERT INTO "échild" VALUES (8, 999); END`);
      const baseline = fkEvidence(conn); conn.close();
      expect(() => applyUpgrade(file, { fkBaseline: baseline })).toThrow(/baseline/);
      const after = new Database(file);
      expect(detectSchemaVersion(after)).toBe('source');
      expect(fkEvidence(after)).toEqual(baseline);
      expect(after.prepare('SELECT 1 FROM system_config WHERE key=?').get(MIGRATION_ID)).toBeUndefined();
      after.close();
    } finally { cleanupTempDb(file); }
  });
  it.each(['added', 'removed', 'changed'])('refuses %s evidence between checks', change => {
    const file = fixture();
    try {
      const conn = new Database(file); const baseline = fkEvidence(conn); conn.close();
      expect(() => applyUpgrade(file, { fkBaseline: baseline, _injectAfterPhase1: () => {
        const other = new Database(file); other.pragma('foreign_keys = OFF');
        if (change === 'added') other.exec('INSERT INTO "échild" VALUES (8, 999)');
        if (change === 'removed') other.exec('DELETE FROM "échild"');
        if (change === 'changed') other.exec('UPDATE "échild" SET id=8');
        other.close();
      }})).toThrow(/baseline/);
      const after = new Database(file); expect(detectSchemaVersion(after)).toBe('source');
      expect(after.prepare('SELECT 1 FROM system_config WHERE key=?').get(MIGRATION_ID)).toBeUndefined(); after.close();
    } finally { cleanupTempDb(file); }
  });

  it('throws a format error for a malformed FK baseline, not a state-mismatch error', () => {
    const file = fixture();
    try {
      // Negative count → format error, not state-mismatch
      expect(() => applyUpgrade(file, { fkBaseline: { fk_violation_count: -1, fk_violations_sha256: 'a'.repeat(64) } }))
        .toThrow(/Invalid FK baseline format/);
      // Non-hex-64 hash → format error, not state-mismatch
      expect(() => applyUpgrade(file, { fkBaseline: { fk_violation_count: 0, fk_violations_sha256: 'not-a-hash' } }))
        .toThrow(/Invalid FK baseline format/);
      // Float count → format error, not state-mismatch
      expect(() => applyUpgrade(file, { fkBaseline: { fk_violation_count: 1.5, fk_violations_sha256: 'a'.repeat(64) } }))
        .toThrow(/Invalid FK baseline format/);
      // Valid format, wrong count (0 vs actual 1) → state-mismatch error, not format error
      expect(() => applyUpgrade(file, { fkBaseline: { fk_violation_count: 0, fk_violations_sha256: 'a'.repeat(64) } }))
        .toThrow(/evidence differs/);
    } finally { cleanupTempDb(file); }
  });

  // ── Finding 3: idempotent retry must not bypass the supplied FK baseline ──

  it('target schema + no baseline → alreadyAtTarget without error (unchanged behavior)', () => {
    const file = fixture();
    try {
      const conn = new Database(file); const baseline = fkEvidence(conn); conn.close();
      applyUpgrade(file, { fkBaseline: baseline }); // migrate to target
      const result = applyUpgrade(file); // no baseline supplied
      expect(result.alreadyAtTarget).toBe(true);
      expect(result.success).toBe(true);
    } finally { cleanupTempDb(file); }
  });

  it('target schema + correct FK baseline → alreadyAtTarget without error', () => {
    const file = fixture();
    try {
      const conn = new Database(file); const baseline = fkEvidence(conn); conn.close();
      applyUpgrade(file, { fkBaseline: baseline }); // migrate to target
      // Re-apply with the same baseline: should succeed, alreadyAtTarget
      const result = applyUpgrade(file, { fkBaseline: baseline });
      expect(result.alreadyAtTarget).toBe(true);
      expect(result.success).toBe(true);
    } finally { cleanupTempDb(file); }
  });

  it('target schema + malformed FK baseline → throws format error, not silent success', () => {
    const file = fixture();
    try {
      const conn = new Database(file); const baseline = fkEvidence(conn); conn.close();
      applyUpgrade(file, { fkBaseline: baseline }); // migrate to target
      // Malformed baseline supplied on re-apply: must not return alreadyAtTarget silently
      expect(() => applyUpgrade(file, { fkBaseline: { fk_violation_count: -1, fk_violations_sha256: 'a'.repeat(64) } }))
        .toThrow(/Invalid FK baseline format/);
    } finally { cleanupTempDb(file); }
  });

  it('target schema + mismatched FK baseline → throws mismatch error, not silent success', () => {
    const file = fixture();
    try {
      const conn = new Database(file); const baseline = fkEvidence(conn); conn.close();
      applyUpgrade(file, { fkBaseline: baseline }); // migrate to target
      // Wrong baseline supplied on re-apply: must not return alreadyAtTarget silently
      expect(() => applyUpgrade(file, { fkBaseline: { fk_violation_count: 0, fk_violations_sha256: 'a'.repeat(64) } }))
        .toThrow(/evidence differs/);
    } finally { cleanupTempDb(file); }
  });

  it('absent schema + no baseline → alreadyAtTarget without error (unchanged behavior)', () => {
    // A DB without the reward_transactions table at all
    const { dbPath, conn } = makeTempDb('CREATE TABLE unrelated (id TEXT PRIMARY KEY);');
    conn.close();
    try {
      const result = applyUpgrade(dbPath);
      expect(result.alreadyAtTarget).toBe(true);
      expect(result.success).toBe(true);
    } finally { cleanupTempDb(dbPath); }
  });

  it('absent schema + correct FK baseline (zero violations) → alreadyAtTarget without error', () => {
    const { dbPath, conn } = makeTempDb('CREATE TABLE unrelated (id TEXT PRIMARY KEY);');
    conn.close();
    try {
      // No FK violations in this DB; correct baseline is count=0, sha256=sha256('[]')
      const zeroBaseline = { fk_violation_count: 0, fk_violations_sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945' };
      const result = applyUpgrade(dbPath, { fkBaseline: zeroBaseline });
      expect(result.alreadyAtTarget).toBe(true);
      expect(result.success).toBe(true);
    } finally { cleanupTempDb(dbPath); }
  });

  it('absent schema + malformed FK baseline → throws format error, not silent success', () => {
    const { dbPath, conn } = makeTempDb('CREATE TABLE unrelated (id TEXT PRIMARY KEY);');
    conn.close();
    try {
      expect(() => applyUpgrade(dbPath, { fkBaseline: { fk_violation_count: -1, fk_violations_sha256: 'a'.repeat(64) } }))
        .toThrow(/Invalid FK baseline format/);
    } finally { cleanupTempDb(dbPath); }
  });

  it('absent schema + mismatched FK baseline → throws mismatch error, not silent success', () => {
    const { dbPath, conn } = makeTempDb('CREATE TABLE unrelated (id TEXT PRIMARY KEY);');
    conn.close();
    try {
      // DB has 0 violations but we supply count=1 → must fail, not return alreadyAtTarget
      expect(() => applyUpgrade(dbPath, { fkBaseline: { fk_violation_count: 1, fk_violations_sha256: 'a'.repeat(64) } }))
        .toThrow(/evidence differs/);
    } finally { cleanupTempDb(dbPath); }
  });

  it('idempotent retry on target schema does not modify records or receipts', () => {
    const file = fixture();
    try {
      const conn = new Database(file); const baseline = fkEvidence(conn); conn.close();
      applyUpgrade(file, { fkBaseline: baseline }); // first apply
      const before = new Database(file);
      const rewardRows = before.prepare('SELECT * FROM reward_transactions ORDER BY id').all();
      const sysRows = before.prepare('SELECT key, value FROM system_config ORDER BY key').all();
      before.close();
      // Second apply (idempotent) with same baseline
      const result = applyUpgrade(file, { fkBaseline: baseline });
      expect(result.alreadyAtTarget).toBe(true);
      const after = new Database(file);
      expect(after.prepare('SELECT * FROM reward_transactions ORDER BY id').all()).toEqual(rewardRows);
      expect(after.prepare('SELECT key, value FROM system_config ORDER BY key').all()).toEqual(sysRows);
      after.close();
    } finally { cleanupTempDb(file); }
  });

  // ── Finding 2: receipt-trigger orphan mutation must be detected ──

  it('detects when a receipt trigger silently mutates an orphan row', () => {
    const file = fixture();
    try {
      const conn = new Database(file);
      // Trigger modifies orphan user_id from 999→998. Both are non-existent users,
      // so FK violation tuple [échild,7,users,0] is unchanged → requireFkBaseline would pass.
      // The mutation must be caught by orphan-row snapshot comparison.
      conn.exec(`CREATE TRIGGER silent_mutate AFTER INSERT ON system_config
        WHEN NEW.key='${MIGRATION_ID}'
        BEGIN UPDATE "échild" SET user_id = 998 WHERE id = 7; END`);
      const baseline = fkEvidence(conn); conn.close();
      // Before fix: succeeds (mutation invisible to FK hash). After fix: throws.
      expect(() => applyUpgrade(file, { fkBaseline: baseline }))
        .toThrow(/trigger.*mutated|mutated.*trigger|orphan.*trigger|trigger.*orphan|receipt.*trigger/i);
      // Transaction was rolled back: source schema intact, no receipt, orphan unchanged.
      const after = new Database(file);
      expect(detectSchemaVersion(after)).toBe('source');
      expect(after.prepare('SELECT 1 FROM system_config WHERE key=?').get(MIGRATION_ID)).toBeUndefined();
      expect(after.prepare('SELECT user_id FROM "échild" WHERE id=7').get()).toEqual({ user_id: 999 });
      after.close();
    } finally { cleanupTempDb(file); }
  });

  it('detects when a receipt trigger deletes an orphan row', () => {
    const file = fixture();
    try {
      const conn = new Database(file);
      conn.exec(`CREATE TRIGGER delete_orphan AFTER INSERT ON system_config
        WHEN NEW.key='${MIGRATION_ID}'
        BEGIN DELETE FROM "échild" WHERE id = 7; END`);
      const baseline = fkEvidence(conn); conn.close();
      // Deleted orphan: snapshot has row, after-snapshot is empty → must throw and rollback.
      expect(() => applyUpgrade(file, { fkBaseline: baseline }))
        .toThrow(/trigger.*mutated|mutated.*trigger|orphan.*trigger|trigger.*orphan|receipt.*trigger/i);
      const after = new Database(file);
      expect(detectSchemaVersion(after)).toBe('source');
      expect(after.prepare('SELECT 1 FROM system_config WHERE key=?').get(MIGRATION_ID)).toBeUndefined();
      expect(after.prepare('SELECT user_id FROM "échild" WHERE id=7').get()).toEqual({ user_id: 999 });
      after.close();
    } finally { cleanupTempDb(file); }
  });

  it('handles a table name with embedded double-quote in FK snapshot queries', () => {
    // Verifies the double-quote escaping (table.replace(/"/g, '""')) prevents SQL errors.
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.pragma('foreign_keys = OFF');
    // Create a table whose name contains a double-quote character.
    conn.exec('CREATE TABLE "bad""name" (id INTEGER PRIMARY KEY, ref INTEGER REFERENCES users(id))');
    conn.exec('INSERT INTO "bad""name" VALUES (1, 999)');
    conn.close();
    try {
      const db = new Database(dbPath); const baseline = fkEvidence(db); db.close();
      // Migration must not throw a SQL error due to unescaped table name.
      // It should succeed (schema migration completes, orphan row preserved).
      const result = applyUpgrade(dbPath, { fkBaseline: baseline });
      expect(result.success).toBe(true);
      const after = new Database(dbPath);
      expect(after.prepare('SELECT ref FROM "bad""name" WHERE id=1').get()).toEqual({ ref: 999 });
      after.close();
    } finally { cleanupTempDb(dbPath); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH-14-WR: WITHOUT ROWID and rowid-alias orphan preservation
//
// Gap: the merged orphan-snapshot loop skips FK violations whose rowid is null
// (WITHOUT ROWID tables) and stores '' for rows that cannot be located via the
// rowid alias (shadowed by a user-defined column named rowid/_rowid_/oid).
// In both cases a receipt AFTER INSERT trigger on system_config can silently
// mutate an orphan without detection, and requireFkBaseline also passes because
// the FK violation tuple is unchanged.
//
// Fix required: fail closed before the receipt write whenever a pre-existing FK
// violation has a null rowid (WITHOUT ROWID table) OR cannot be located by rowid
// lookup (alias shadowed by a user-defined column). A ''/undefined snapshot must
// never silently be treated as preservation.
//
// Requirement-to-test map:
//  AUTH-14-WR-1  — WITHOUT ROWID + trigger: mutation invisible to current code
//  AUTH-14-WR-2  — WITHOUT ROWID + no trigger: fail closed before receipt write
//  AUTH-14-WR-3  — rollback: source schema and data intact after WOR refusal
//  AUTH-14-WR-4  — rowid-alias (rowid col): mutation invisible to current code
//  AUTH-14-WR-5  — rowid-alias (rowid col): fail closed when lookup returns undefined
//  AUTH-14-WR-6  — rowid-alias (_rowid_ col): fail closed
//  AUTH-14-WR-7  — rowid-alias (oid col): fail closed
//  AUTH-14-WR-8  — mixed null + non-null rowid violations: fail closed
//  AUTH-14-WR-9  — ordinary rowid orphan with baseline still migrates (baseline preserved)
//  AUTH-14-WR-10 — BLOB column in orphan row: compared correctly (not silently equal)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUTH-14-WR: WITHOUT ROWID and rowid-alias orphan preservation', () => {
  // Helper: source-schema DB with a WITHOUT ROWID child table containing an
  // FK-violating row. No users exist, so user_ref always violates.
  function worFixture(): string {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.pragma('foreign_keys = OFF');
    conn.exec(
      `CREATE TABLE wor_child (pk TEXT PRIMARY KEY, user_ref TEXT REFERENCES users(id), extra TEXT) WITHOUT ROWID`
    );
    conn.prepare('INSERT INTO wor_child VALUES (?, ?, ?)').run('wor-1', 'ghost-user', 'original');
    conn.close();
    return dbPath;
  }

  // ── AUTH-14-WR-1 [REGRESSION] ────────────────────────────────────────────────
  // On the merged code the WITHOUT ROWID orphan is silently skipped (rowid=null
  // check). A receipt trigger changes extra='original' → 'mutated'. Because the
  // FK violation tuple is unchanged, requireFkBaseline passes. The migration
  // reports success while the orphan was mutated. After the fix it must throw.

  it('AUTH-14-WR-1 [REGRESSION]: receipt trigger mutating a WITHOUT ROWID orphan is detected and rejected', () => {
    const file = worFixture();
    try {
      const conn = new Database(file);
      // Trigger mutates a non-FK column. FK violation tuple (wor_child, null, users, 0)
      // is unchanged → requireFkBaseline would still pass. Only orphan snapshot can catch it.
      conn.exec(`CREATE TRIGGER wor_silent_mutate AFTER INSERT ON system_config
        WHEN NEW.key='${MIGRATION_ID}'
        BEGIN UPDATE wor_child SET extra='mutated' WHERE pk='wor-1'; END`);
      const baseline = fkEvidence(conn);
      conn.close();
      // Before fix: succeeds (WITHOUT ROWID row skipped entirely, mutation undetected).
      // After fix: throws — fail closed on null rowid before receipt write.
      expect(() => applyUpgrade(file, { fkBaseline: baseline }))
        .toThrow(/WITHOUT ROWID|without rowid|null rowid|rowid.*null|cannot be identified/i);
    } finally {
      cleanupTempDb(file);
    }
  });

  // ── AUTH-14-WR-2 ─────────────────────────────────────────────────────────────
  // Fail closed even without a trigger: if any FK violation has a null rowid the
  // migration must refuse before writing receipts.

  it('AUTH-14-WR-2: refuses before receipt write when a FK violation is in a WITHOUT ROWID table', () => {
    const file = worFixture();
    try {
      const conn = new Database(file);
      const baseline = fkEvidence(conn);
      conn.close();
      expect(() => applyUpgrade(file, { fkBaseline: baseline }))
        .toThrow(/WITHOUT ROWID|without rowid|null rowid|rowid.*null|cannot be identified/i);
    } finally {
      cleanupTempDb(file);
    }
  });

  // ── AUTH-14-WR-3 ─────────────────────────────────────────────────────────────
  // After WITHOUT ROWID refusal: source schema intact, orphan value unchanged,
  // no migration receipt written.

  it('AUTH-14-WR-3: source schema and orphan data intact after WITHOUT ROWID refusal', () => {
    const file = worFixture();
    try {
      const conn = new Database(file);
      const baseline = fkEvidence(conn);
      conn.close();
      try { applyUpgrade(file, { fkBaseline: baseline }); } catch { /* expected */ }
      const after = new Database(file);
      expect(detectSchemaVersion(after)).toBe('source');
      expect(after.prepare('SELECT 1 FROM system_config WHERE key=?').get(MIGRATION_ID)).toBeUndefined();
      expect(after.prepare('SELECT extra FROM wor_child WHERE pk=?').get('wor-1'))
        .toEqual({ extra: 'original' });
      after.close();
    } finally {
      cleanupTempDb(file);
    }
  });

  // ── AUTH-14-WR-4 [REGRESSION] ────────────────────────────────────────────────
  // Rowid-alias shadowing: a table with a user-defined TEXT column named "rowid"
  // (not INTEGER PRIMARY KEY) causes PRAGMA foreign_key_check to return the
  // physical integer rowid while WHERE rowid = ? addresses the TEXT column and
  // returns no row. The current code stores '' for both pre- and post-receipt
  // snapshots, so a trigger mutation is indistinguishable from no mutation.

  it('AUTH-14-WR-4 [REGRESSION]: receipt trigger mutating rowid-alias-shadowed orphan is detected', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.pragma('foreign_keys = OFF');
    // "rowid" is a TEXT column — shadows the rowid alias. Physical rowid is separate.
    conn.exec(
      `CREATE TABLE shadow_rowid (rowid TEXT PRIMARY KEY, ref_user TEXT REFERENCES users(id), note TEXT)`
    );
    conn.prepare('INSERT INTO shadow_rowid VALUES (?, ?, ?)').run('key-1', 'ghost-user', 'before');
    // Trigger mutates 'note'. FK tuple unchanged — only orphan snapshot can detect this.
    conn.exec(`CREATE TRIGGER rowid_shadow_mutate AFTER INSERT ON system_config
      WHEN NEW.key='${MIGRATION_ID}'
      BEGIN UPDATE shadow_rowid SET note='after' WHERE rowid='key-1'; END`);
    const baseline = fkEvidence(conn);
    conn.close();
    try {
      // Before fix: stores '' for both snapshots → mutation invisible → succeeds (bug).
      // After fix: throws — fail closed when row cannot be located via rowid lookup.
      expect(() => applyUpgrade(dbPath, { fkBaseline: baseline }))
        .toThrow(/rowid.*shadow|alias.*shadow|cannot be located|cannot be identified|rowid.*undefined|undefined.*rowid/i);
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  // ── AUTH-14-WR-5 ─────────────────────────────────────────────────────────────
  // Fail closed when WHERE rowid = ? returns no row for a non-null physical rowid.
  // No trigger needed: the absent lookup must never silently be treated as preservation.

  it('AUTH-14-WR-5: refuses when FK-violating row cannot be located via rowid lookup (alias shadowed)', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.pragma('foreign_keys = OFF');
    conn.exec(`CREATE TABLE shadow_rowid2 (rowid TEXT PRIMARY KEY, ref TEXT REFERENCES users(id))`);
    conn.prepare('INSERT INTO shadow_rowid2 VALUES (?, ?)').run('key-2', 'ghost');
    const baseline = fkEvidence(conn);
    conn.close();
    try {
      expect(() => applyUpgrade(dbPath, { fkBaseline: baseline }))
        .toThrow(/rowid.*shadow|alias.*shadow|cannot be located|cannot be identified/i);
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  // ── AUTH-14-WR-6 ─────────────────────────────────────────────────────────────
  // _rowid_ alias shadowed: when only _rowid_ is shadowed (not rowid or oid),
  // `WHERE rowid = ?` still reaches the physical rowid and correctly snapshots the
  // row. A trigger mutation must still be detected via the snapshot comparison.
  // This is a GREEN regression-guard test — it verifies the fix does not break
  // the _rowid_-shadowed case that already works correctly.

  it('AUTH-14-WR-6: trigger mutation detected in _rowid_-alias-shadowed table (rowid alias still reaches physical rowid)', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.pragma('foreign_keys = OFF');
    // _rowid_ as TEXT column shadows _rowid_ alias only. rowid and oid still reach physical rowid.
    conn.exec(`CREATE TABLE shadow_rowid_ (_rowid_ TEXT PRIMARY KEY, ref TEXT REFERENCES users(id), note TEXT)`);
    conn.prepare('INSERT INTO shadow_rowid_ VALUES (?, ?, ?)').run('kr-1', 'ghost', 'original');
    // Trigger mutates note. FK tuple unchanged — snapshot comparison must catch it.
    conn.exec(`CREATE TRIGGER rowid_alias_mutate AFTER INSERT ON system_config
      WHEN NEW.key='${MIGRATION_ID}'
      BEGIN UPDATE shadow_rowid_ SET note='mutated' WHERE _rowid_='kr-1'; END`);
    const baseline = fkEvidence(conn);
    conn.close();
    try {
      // WHERE rowid = ? finds the row (rowid alias not shadowed).
      // Trigger mutation is detected by snapshot comparison → must throw.
      expect(() => applyUpgrade(dbPath, { fkBaseline: baseline }))
        .toThrow(/trigger.*mutated|mutated.*trigger|orphan.*trigger|trigger.*orphan|receipt.*trigger/i);
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  // ── AUTH-14-WR-7 ─────────────────────────────────────────────────────────────
  // oid alias shadowed: same class as WR-6. rowid alias still reachable via
  // WHERE rowid = ?. Trigger mutation must be detected. GREEN regression-guard.

  it('AUTH-14-WR-7: trigger mutation detected in oid-alias-shadowed table (rowid alias still reaches physical rowid)', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.pragma('foreign_keys = OFF');
    conn.exec(`CREATE TABLE shadow_oid (oid TEXT PRIMARY KEY, ref TEXT REFERENCES users(id), note TEXT)`);
    conn.prepare('INSERT INTO shadow_oid VALUES (?, ?, ?)').run('oid-1', 'ghost', 'original');
    conn.exec(`CREATE TRIGGER oid_alias_mutate AFTER INSERT ON system_config
      WHEN NEW.key='${MIGRATION_ID}'
      BEGIN UPDATE shadow_oid SET note='mutated' WHERE oid='oid-1'; END`);
    const baseline = fkEvidence(conn);
    conn.close();
    try {
      expect(() => applyUpgrade(dbPath, { fkBaseline: baseline }))
        .toThrow(/trigger.*mutated|mutated.*trigger|orphan.*trigger|trigger.*orphan|receipt.*trigger/i);
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  // ── AUTH-14-WR-8 ─────────────────────────────────────────────────────────────
  // Mixed: one ordinary rowid violation + one WITHOUT ROWID violation. Must fail
  // closed because the WITHOUT ROWID violation cannot be safely snapshot-compared.

  it('AUTH-14-WR-8: fails closed when ordinary and WITHOUT ROWID violations coexist', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.pragma('foreign_keys = OFF');
    // Ordinary rowid table violation
    conn.exec(`CREATE TABLE ord_orphan (id INTEGER PRIMARY KEY, ref TEXT REFERENCES users(id))`);
    conn.prepare('INSERT INTO ord_orphan VALUES (?, ?)').run(1, 'ghost-1');
    // WITHOUT ROWID violation
    conn.exec(`CREATE TABLE wor_mixed (pk TEXT PRIMARY KEY, ref TEXT REFERENCES users(id)) WITHOUT ROWID`);
    conn.prepare('INSERT INTO wor_mixed VALUES (?, ?)').run('wm-1', 'ghost-2');
    const baseline = fkEvidence(conn);
    conn.close();
    try {
      expect(() => applyUpgrade(dbPath, { fkBaseline: baseline }))
        .toThrow(/WITHOUT ROWID|without rowid|null rowid|rowid.*null|cannot be identified/i);
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  // ── AUTH-14-WR-9 ─────────────────────────────────────────────────────────────
  // Ordinary rowid orphan still migrates when baseline is supplied. Ensures the
  // fix does not regress the supported baseline path.

  it('AUTH-14-WR-9: ordinary rowid orphan with reviewed baseline still migrates successfully', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.pragma('foreign_keys = OFF');
    conn.exec(`CREATE TABLE wor_baseline_check (id INTEGER PRIMARY KEY, ref TEXT REFERENCES users(id))`);
    conn.prepare('INSERT INTO wor_baseline_check VALUES (?, ?)').run(42, 'ghost-user');
    conn.close();
    try {
      const db = new Database(dbPath);
      const baseline = fkEvidence(db);
      db.close();
      const result = applyUpgrade(dbPath, { fkBaseline: baseline });
      expect(result.success).toBe(true);
      expect(result.alreadyAtTarget).toBe(false);
      const after = new Database(dbPath);
      expect(detectSchemaVersion(after)).toBe('target');
      expect(after.prepare('SELECT ref FROM wor_baseline_check WHERE id=42').get()).toEqual({ ref: 'ghost-user' });
      after.close();
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  // ── AUTH-14-WR-10 ────────────────────────────────────────────────────────────
  // BLOB column in orphan row: snapshot must preserve and compare the raw bytes,
  // not a coerced string. A trigger that changes a BLOB value must be detected.

  it('AUTH-14-WR-10: receipt trigger mutating a BLOB column in an ordinary rowid orphan is detected', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.pragma('foreign_keys = OFF');
    conn.exec(`CREATE TABLE blob_orphan (id INTEGER PRIMARY KEY, ref TEXT REFERENCES users(id), payload BLOB)`);
    // Insert a BLOB value
    const blobA = Buffer.from([0x01, 0x02, 0x03]);
    conn.prepare('INSERT INTO blob_orphan VALUES (?, ?, ?)').run(1, 'ghost', blobA);
    conn.exec(`CREATE TRIGGER blob_mutate AFTER INSERT ON system_config
      WHEN NEW.key='${MIGRATION_ID}'
      BEGIN UPDATE blob_orphan SET payload=x'010204' WHERE id=1; END`);
    const baseline = fkEvidence(conn);
    conn.close();
    try {
      // The BLOB change must be detected as a mutation.
      expect(() => applyUpgrade(dbPath, { fkBaseline: baseline }))
        .toThrow(/trigger.*mutated|mutated.*trigger|orphan.*trigger|trigger.*orphan|receipt.*trigger/i);
    } finally {
      cleanupTempDb(dbPath);
    }
  });

  // ── AUTH-14-WR-11 ────────────────────────────────────────────────────────────
  // Multiple FK violations in the SAME WITHOUT ROWID table: each row produces an
  // identical tuple [table, null, parent, fkid]. The code should fail closed on
  // the first null-rowid violation regardless of how many violations there are.
  // This also confirms the spec note: fkEvidence() can only distinguish by count,
  // not by individual row identity, for WITHOUT ROWID tables.

  it('AUTH-14-WR-11: fails closed with multiple FK violations in the same WITHOUT ROWID table', () => {
    const { dbPath, conn } = makeTempDb(OLD_SCHEMA);
    conn.pragma('foreign_keys = OFF');
    conn.exec(`CREATE TABLE wor_multi (pk TEXT PRIMARY KEY, ref TEXT REFERENCES users(id)) WITHOUT ROWID`);
    // Two distinct orphan rows — each produces rowid=null in foreign_key_check
    conn.prepare('INSERT INTO wor_multi VALUES (?, ?)').run('row-a', 'ghost-1');
    conn.prepare('INSERT INTO wor_multi VALUES (?, ?)').run('row-b', 'ghost-2');
    const baseline = fkEvidence(conn);
    conn.close();
    try {
      expect(baseline.fk_violation_count).toBe(2);
      expect(() => applyUpgrade(dbPath, { fkBaseline: baseline }))
        .toThrow(/WITHOUT ROWID|without rowid|null rowid|rowid.*null|cannot be identified/i);
    } finally {
      cleanupTempDb(dbPath);
    }
  });
});


describe('AUTH-14 physical row identity and lossless snapshots', () => {
  it('refuses a shadowed rowid that selects a different existing row', () => {
    const {dbPath, conn} = makeTempDb(OLD_SCHEMA);
    try {
      conn.pragma('foreign_keys = OFF');
      conn.exec(`CREATE TABLE shadow_collision (id INTEGER PRIMARY KEY, RoWiD INTEGER, ref TEXT REFERENCES users(id), note TEXT);
        INSERT INTO shadow_collision VALUES (1,99,'missing','before');
        INSERT INTO shadow_collision VALUES (2,1,NULL,'different');
        CREATE TRIGGER collision_receipt AFTER INSERT ON system_config WHEN NEW.key='migration_002_reward_txn_check'
        BEGIN UPDATE shadow_collision SET note='changed' WHERE id=1; END;`);
      const baseline = fkEvidence(conn); conn.close();
      expect(() => applyUpgrade(dbPath, {fkBaseline:baseline})).toThrow(/rowid.*shadow|alias.*shadow/i);
      const after = new Database(dbPath);
      expect(after.prepare('SELECT note FROM shadow_collision WHERE id=1').get()).toEqual({note:'before'});
      expect(detectSchemaVersion(after)).toBe('source');
      expect(after.prepare('SELECT 1 FROM system_config WHERE key=?').get(MIGRATION_ID)).toBeUndefined();
      after.close();
    } finally { try { conn.close(); } catch {} cleanupTempDb(dbPath); }
  });
  it('refuses a hidden generated column that shadows rowid', () => {
    const {dbPath,conn}=makeTempDb(OLD_SCHEMA);
    try {
      conn.pragma('foreign_keys = OFF');
      conn.exec(`CREATE TABLE hidden_orphan (id INTEGER PRIMARY KEY, ref TEXT REFERENCES users(id), rowid TEXT GENERATED ALWAYS AS (ref) VIRTUAL);
        INSERT INTO hidden_orphan(id,ref) VALUES (1,'missing');`);
      const baseline=fkEvidence(conn); conn.close();
      expect(() => applyUpgrade(dbPath,{fkBaseline:baseline})).toThrow(/rowid.*shadow/i);
      const after=new Database(dbPath); expect(detectSchemaVersion(after)).toBe('source');
      expect(after.prepare('SELECT 1 FROM system_config WHERE key=?').get(MIGRATION_ID)).toBeUndefined(); after.close();
    } finally { try { conn.close(); } catch {} cleanupTempDb(dbPath); }
  });
  it('refuses receipt triggers that can mutate unrelated valid rows', () => {
    const {dbPath, conn}=makeTempDb(OLD_SCHEMA);
    try {
      conn.pragma('foreign_keys = OFF');
      conn.exec(`CREATE TABLE unrelated (id INTEGER PRIMARY KEY, note TEXT);
        INSERT INTO unrelated VALUES (1,'before');
        CREATE TRIGGER unrelated_receipt AFTER INSERT ON system_config WHEN NEW.key='migration_002_reward_txn_check'
        BEGIN UPDATE unrelated SET note='changed' WHERE id=1; END;`);
      conn.close();
      expect(() => applyUpgrade(dbPath)).toThrow(/receipt trigger/i);
      const after=new Database(dbPath);
      expect(after.prepare('SELECT note FROM unrelated WHERE id=1').get()).toEqual({note:'before'});
      expect(detectSchemaVersion(after)).toBe('source');
      expect(after.prepare('SELECT 1 FROM system_config WHERE key=?').get(MIGRATION_ID)).toBeUndefined(); after.close();
    } finally { try { conn.close(); } catch {} cleanupTempDb(dbPath); }
  });
  it('refuses a receipt trigger created between inspection and the write transaction', () => {
    const {dbPath, conn}=makeTempDb(OLD_SCHEMA);
    try {
      conn.close();
      expect(() => applyUpgrade(dbPath,{_injectAfterPhase1:() => {
        const other=new Database(dbPath);
        other.exec(`CREATE TRIGGER receipt_race AFTER INSERT ON system_config BEGIN SELECT 1; END`);
        other.close();
      }})).toThrow(/receipt trigger/i);
      const after=new Database(dbPath);
      expect(detectSchemaVersion(after)).toBe('source');
      expect(after.prepare('SELECT 1 FROM system_config WHERE key=?').get(MIGRATION_ID)).toBeUndefined(); after.close();
    } finally { try { conn.close(); } catch {} cleanupTempDb(dbPath); }
  });
  it('preserves exact 64-bit integers and blobs in an ordinary orphan without triggers', () => {
    const {dbPath, conn}=makeTempDb(OLD_SCHEMA);
    try {
      conn.pragma('foreign_keys = OFF');
      conn.exec(`CREATE TABLE large_orphan (id INTEGER PRIMARY KEY, ref TEXT REFERENCES users(id), value INTEGER, payload BLOB);
        INSERT INTO large_orphan VALUES (1,'missing',9007199254740993,x'00ff');`);
      const baseline=fkEvidence(conn); conn.close();
      expect(applyUpgrade(dbPath,{fkBaseline:baseline}).success).toBe(true);
      const after=new Database(dbPath);
      const row=after.prepare('SELECT value,payload FROM large_orphan WHERE id=1').safeIntegers(true).get();
      expect(row).toEqual({value:9007199254740993n,payload:Buffer.from([0,255])}); after.close();
    } finally { try { conn.close(); } catch {} cleanupTempDb(dbPath); }
  });
  it('proactively refuses a system_config trigger; 64-bit orphan preserved without relying on bigint comparison', () => {
    const {dbPath, conn} = makeTempDb(OLD_SCHEMA);
    try {
      conn.pragma('foreign_keys = OFF');
      conn.exec(`CREATE TABLE bigint_orphan (id INTEGER PRIMARY KEY, ref TEXT REFERENCES users(id), value INTEGER, payload BLOB);
        INSERT INTO bigint_orphan VALUES (1,'missing',9007199254740992,x'00ff');
        CREATE TRIGGER bigint_receipt AFTER INSERT ON system_config WHEN NEW.key='migration_002_reward_txn_check'
        BEGIN UPDATE bigint_orphan SET value=9007199254740993 WHERE id=1; END;`);
      const baseline=fkEvidence(conn); conn.close();
      expect(() => applyUpgrade(dbPath,{fkBaseline:baseline})).toThrow(/trigger.*mutated/i);
      const after=new Database(dbPath);
      expect(after.prepare('SELECT value FROM bigint_orphan WHERE id=1').safeIntegers(true).get()).toEqual({value:9007199254740992n});
      expect(detectSchemaVersion(after)).toBe('source');
      expect(after.prepare('SELECT 1 FROM system_config WHERE key=?').get(MIGRATION_ID)).toBeUndefined(); after.close();
    } finally { try { conn.close(); } catch {} cleanupTempDb(dbPath); }
  });
});
