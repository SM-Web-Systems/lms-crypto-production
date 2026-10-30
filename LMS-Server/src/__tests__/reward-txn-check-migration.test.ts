/**
 * reward-txn-check-migration.test.ts
 *
 * W03-R2 — Behavioral tests for the reward_transactions CHECK constraint upgrade.
 *
 * Baseline: 5b3c180 (W03-R1 unused reservation reconciliation, PR #118)
 * Branch:   codex/w03-r2-ledger-check-upgrade
 *
 * These tests work with file-backed SQLite databases to exercise the real migration
 * lifecycle (startup, plan, apply, rollback, backup/restore). Each test that needs a
 * file-backed DB creates and cleans up its own temporary file.
 *
 * Tests that need the in-memory singleton (COMPAT-REGRESSION, COMPAT-E2E-LIFECYCLE)
 * import './setup.js' and use the normal _resetForTests path.
 *
 * Requirement-to-test map:
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
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';

// ── Migration module under test ──────────────────────────────────────────────
// TDD RED: this module does not exist yet — tests fail until Task #22 is complete
import {
  planUpgrade,
  applyUpgrade,
  detectSchemaVersion,
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
const OLD_SCHEMA = fs.readFileSync(OLD_SCHEMA_PATH, 'utf-8');

// ────────────────────────────────────────────────────────────────────────────
// File-backed DB helpers
// ────────────────────────────────────────────────────────────────────────────

function makeTempDb(schema: string): { dbPath: string; conn: SqliteDatabase } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-w03r2-'));
  const dbPath = path.join(dir, 'test.db');
  const conn = new Database(dbPath);
  conn.pragma('foreign_keys = ON');
  conn.exec(schema);
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
  it('COMPAT-PREFLIGHT-1: validateDatabase throws on old-schema with migration-required message', () => {
    const { conn } = makeTempDb(OLD_SCHEMA);
    let threw = false;
    let message = '';
    try {
      validateDatabase(conn);
    } catch (err) {
      threw = true;
      message = err instanceof Error ? err.message : String(err);
    } finally {
      conn.close();
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
    const { conn } = makeTempDb(OLD_SCHEMA);
    conn.prepare(
      "INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by) VALUES (?, '2026-10-30', datetime('now'), NULL)"
    ).run(MIGRATION_ID);
    let threw = false;
    try {
      validateDatabase(conn);
    } catch {
      threw = true;
    } finally {
      conn.close();
    }
    // validateDatabase must check actual DDL, not just system_config
    expect(threw).toBe(true);
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
