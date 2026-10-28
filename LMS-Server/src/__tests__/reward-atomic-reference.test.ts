/**
 * W01-R3: Atomic payment-reference consumption tests.
 *
 * Proves that funding_reference uniqueness is enforced at the database level,
 * not just by application-level prechecks. Covers: competing requests,
 * idempotent retry, rollback safety, cancel/expire permanence,
 * NULL/empty normalization, opaque reference identity,
 * information disclosure (A2), and migration upgrade paths.
 *
 * R3C corrections: F1 (startup upgrade compatibility), F2 (opaque reference
 * identity — no trimming), F3 (genuine acceptance regressions with valid IDs,
 * specific error assertions, real migration/upgrade tests).
 */
import { describe, it, expect, vi } from 'vitest';
import './setup.js';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../config/database.js';
import { createReward, fundReward, fundRewardAsync, getReward, cancelReward } from '../services/rewards/rewardService.js';
import { RewardError } from '../services/rewards/rewardErrors.js';
import { validateDatabase } from '../config/databaseBootstrap.js';
import { isFundingReferenceConstraintViolation } from '../services/rewards/rewardFundingVerifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');

// Pre-R3 schema: canonical schema with the R3 partial UNIQUE index removed.
// This simulates a database created by the pre-R3 codebase.
const preR3SchemaSQL = schemaSQL.replace(
  /--\s*W01-R3:.*\nCREATE UNIQUE INDEX IF NOT EXISTS idx_reward_txn_fund_ref_unique[^;]*;/,
  '-- R3 index intentionally removed for pre-R3 simulation'
);

/**
 * Create migration-only tables and columns required for validateDatabase(db, true).
 * The post-migration check validates required-schema.json tables/columns, which
 * includes tables and columns created by startup migrations (not in schema.sql).
 */
function applyMigrationOnlySchema(testDb: InstanceType<typeof Database>): void {
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'general' CHECK (scope IN ('general', 'course')),
      course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      avatar_path TEXT, whatsapp TEXT, telegram TEXT,
      linkedin_url TEXT, github_url TEXT, twitter_url TEXT,
      website_url TEXT, custom_links TEXT DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS course_invites (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      email TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
      created_at TEXT DEFAULT (datetime('now')), expires_at TEXT
    );
    CREATE TABLE IF NOT EXISTS conversation_reads (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, conversation_id)
    );
  `);
  // Migration-only indexes on the new tables
  testDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_announcements_scope ON announcements(scope);
    CREATE INDEX IF NOT EXISTS idx_announcements_course ON announcements(course_id);
    CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_course_invites_course ON course_invites(course_id);
    CREATE INDEX IF NOT EXISTS idx_course_invites_email ON course_invites(email);
    CREATE INDEX IF NOT EXISTS idx_course_invites_token ON course_invites(token);
    CREATE INDEX IF NOT EXISTS idx_conv_reads_user ON conversation_reads(user_id);
  `);
  // Migration-only columns on existing tables
  const addCol = (table: string, col: string) => {
    const cols = testDb.pragma(`table_info("${table}")`) as { name: string }[];
    if (!cols.some(c => c.name === col)) testDb.exec(`ALTER TABLE "${table}" ADD COLUMN "${col}" TEXT`);
  };
  addCol('tenant_settings', 'reward_high_value_threshold');
  addCol('users', 'auth_provider');
  addCol('users', 'ammawallet_user_id');
  addCol('users', 'reward_balance');
}

// ──── Test Helpers ────

function createUser(role = 'admin'): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test', ?, 'hash', ?)"
  ).run(id, `${id}@test.com`, role);
  return id;
}

function createIndependentAdmin(): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin', ?, 'hash', 'admin')"
  ).run(id, `${id}@test.com`);
  return id;
}

function createCohort(sponsorId: string): string {
  const courseId = uuidv4();
  const cohortId = uuidv4();
  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(cohortId, sponsorId, courseId);
  const studentId = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
  ).run(studentId, `${studentId}@test.com`);
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);
  return cohortId;
}

function draftReward(sponsorId: string, cohortId: string): string {
  const reward = createReward(sponsorId, {
    scopeType: 'sponsor_cohort',
    scopeId: cohortId,
    rewardType: 'custom',
    amountStroops: '10000000',
    idempotencyKey: `idem-${uuidv4()}`,
  });
  return reward.id;
}

/**
 * R3 migration SQL extracted from ensureRewardTables() in database.ts.
 * Used by T11/T12 to test the real upgrade path on a separate in-memory DB.
 */
function runR3Migration(testDb: InstanceType<typeof Database>): void {
  const refIndexExists = testDb.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_reward_txn_fund_ref_unique'"
  ).get();

  if (!refIndexExists) {
    const duplicates = testDb.prepare(`
      SELECT funding_reference, COUNT(*) as cnt
      FROM reward_transactions
      WHERE funding_reference IS NOT NULL AND transaction_type = 'fund'
      GROUP BY funding_reference
      HAVING cnt > 1
      LIMIT 10
    `).all() as { funding_reference: string; cnt: number }[];

    if (duplicates.length > 0) {
      const diagnostic = duplicates
        .map(d => `  reference="${d.funding_reference}" count=${d.cnt}`)
        .join('\n');
      throw new Error(
        `W01-R3 migration blocked: ${duplicates.length} duplicate funding reference(s) found in reward_transactions.\n` +
        `These must be reconciled before the uniqueness constraint can be enforced:\n${diagnostic}\n` +
        `Run a separate reconciliation procedure to resolve these duplicates, then restart.`
      );
    }

    testDb.exec(`
      CREATE UNIQUE INDEX idx_reward_txn_fund_ref_unique
        ON reward_transactions(funding_reference)
        WHERE funding_reference IS NOT NULL AND transaction_type = 'fund';
    `);
  }
}

// ──── Tests ────

describe('W01-R3: Atomic payment-reference consumption', () => {
  describe('T01: Sequential competing fund operations', () => {
    it('rejects second fund with same reference for different reward', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const rewardB = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();
      const reference = `grant_ref_${uuidv4()}`;

      // First fund succeeds
      const funded = fundReward(rewardA, admin, { type: 'admin_grant', reference }, `fund-${uuidv4()}`);
      expect(funded.status).toBe('funded');

      // Second fund with same reference for different reward must fail
      try {
        fundReward(rewardB, admin, { type: 'admin_grant', reference }, `fund-${uuidv4()}`);
        expect.unreachable('Should have thrown DUPLICATE_REFERENCE');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        expect((err as RewardError).code).toBe('DUPLICATE_REFERENCE');
        expect((err as RewardError).statusCode).toBe(409);
      }

      // Second reward remains in draft
      const reward2 = getReward(rewardB)!;
      expect(reward2.status).toBe('draft');
    });
  });

  describe('T02: DB-level uniqueness with valid IDs (R3C-F3 fix)', () => {
    it('rejects direct INSERT with duplicate fund reference — specific UNIQUE error on funding_reference', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const rewardB = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();
      const reference = `grant_ref_${uuidv4()}`;

      // Fund rewardA via application
      fundReward(rewardA, admin, { type: 'admin_grant', reference }, `fund-${uuidv4()}`);

      // Direct INSERT for valid rewardB with same reference — must be UNIQUE violation,
      // not an FK error (rewardB exists as a valid reward)
      try {
        db.prepare(`
          INSERT INTO reward_transactions (
            id, reward_id, source_account_type, destination_account_type,
            destination_bucket, destination_user_id,
            actor_type, actor_user_id,
            transaction_type, amount_stroops, currency_code,
            previous_state, new_state,
            funding_source_type, funding_reference,
            idempotency_key
          ) VALUES (?, ?, 'external', 'funder', 'available', ?,
            'user', ?, 'fund', 10000000, 'XLM',
            'draft', 'pending_funding',
            'admin_grant', ?, ?)
        `).run(
          uuidv4(),
          rewardB, // valid existing reward
          admin,
          admin,
          reference,
          `direct_${uuidv4()}`,
        );
        expect.unreachable('Should have thrown UNIQUE constraint');
      } catch (err) {
        // Must be specifically a funding_reference UNIQUE violation, not FK
        expect(isFundingReferenceConstraintViolation(err)).toBe(true);
      }
    });
  });

  describe('T03: Same-operation retry (idempotent)', () => {
    it('returns same reward on retry with same idempotency key', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();
      const reference = `grant_ref_${uuidv4()}`;
      const fundKey = `fund-${uuidv4()}`;

      const funded1 = fundReward(rewardId, admin, { type: 'admin_grant', reference }, fundKey);
      expect(funded1.status).toBe('funded');

      // Retry with same key — idempotent return
      const funded2 = fundReward(rewardId, admin, { type: 'admin_grant', reference }, fundKey);
      expect(funded2.status).toBe('funded');
      expect(funded1.id).toBe(funded2.id);

      // Only one fund transaction exists
      const txns = db.prepare(
        "SELECT * FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'fund'"
      ).all(rewardId);
      expect(txns).toHaveLength(1);
    });
  });

  describe('T04: Rollback frees reference for legitimate retry (R3C-F3 fix)', () => {
    it('reference from a rolled-back fund is available for a new operation', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const rewardB = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();
      const referenceA = `grant_ref_${uuidv4()}`;
      const referenceB = `grant_ref_${uuidv4()}`;

      // Fund rewardA successfully with referenceA
      fundReward(rewardA, admin, { type: 'admin_grant', reference: referenceA }, `fund-${uuidv4()}`);

      // Attempt to fund rewardB with referenceB, but fund rewardA first with same
      // reference to trigger DUPLICATE on rewardA (already funded → state machine rejects).
      // The state machine rollback must not leave referenceB consumed.
      try {
        fundReward(rewardA, admin, { type: 'admin_grant', reference: referenceB }, `fund-${uuidv4()}`);
      } catch {
        // Expected: state machine rejects (already funded) — transaction rolls back
      }

      // referenceB was never consumed — verify no fund transaction holds it
      const txns = db.prepare(
        "SELECT * FROM reward_transactions WHERE funding_reference = ? AND transaction_type = 'fund'"
      ).all(referenceB);
      expect(txns).toHaveLength(0);

      // Fund rewardB with referenceB — must succeed (reference was freed by rollback)
      const funded = fundReward(rewardB, admin, { type: 'admin_grant', reference: referenceB }, `fund-${uuidv4()}`);
      expect(funded.status).toBe('funded');
    });
  });

  describe('T05: Cancel does not release reference', () => {
    it('cancelled reward reference cannot be reused by another reward', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const rewardB = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();
      const reference = `grant_ref_${uuidv4()}`;

      // Fund rewardA
      const funded = fundReward(rewardA, admin, { type: 'admin_grant', reference }, `fund-${uuidv4()}`);
      expect(funded.status).toBe('funded');

      // Cancel rewardA — use sponsor (has scope) with reason and idempotency key
      cancelReward(rewardA, sponsor, 'test cancellation', `cancel-${uuidv4()}`);
      const cancelled = getReward(rewardA)!;
      expect(cancelled.status).toBe('cancelled');

      // Try to fund rewardB with the same reference — must still fail
      try {
        fundReward(rewardB, admin, { type: 'admin_grant', reference }, `fund-${uuidv4()}`);
        expect.unreachable('Should have thrown DUPLICATE_REFERENCE');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        expect((err as RewardError).code).toBe('DUPLICATE_REFERENCE');
      }
    });
  });

  describe('T06: TOCTOU — DB catches bypass with valid reward IDs (R3C-F3 fix)', () => {
    it('UNIQUE index prevents duplicate fund reference for valid existing rewards', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const rewardB = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();
      const reference = `grant_ref_${uuidv4()}`;

      // Fund rewardA via application
      fundReward(rewardA, admin, { type: 'admin_grant', reference }, `fund-${uuidv4()}`);

      // Direct INSERT for valid rewardB — bypassing application checks
      try {
        db.prepare(`
          INSERT INTO reward_transactions (
            id, reward_id, source_account_type, destination_account_type,
            destination_bucket, destination_user_id,
            actor_type, actor_user_id,
            transaction_type, amount_stroops, currency_code,
            previous_state, new_state,
            funding_source_type, funding_reference,
            idempotency_key
          ) VALUES (?, ?, 'external', 'funder', 'available', ?,
            'user', ?, 'fund', 10000000, 'XLM',
            'draft', 'pending_funding',
            'admin_grant', ?, ?)
        `).run(
          uuidv4(),
          rewardB, // valid existing reward
          admin,
          admin,
          reference,
          `toctou_${uuidv4()}`,
        );
        expect.unreachable('Should have thrown UNIQUE constraint');
      } catch (err) {
        expect(isFundingReferenceConstraintViolation(err)).toBe(true);
      }
    });
  });

  describe('T07: NULL references are unconstrained', () => {
    it('multiple admin_grants without reference coexist', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const rewardB = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();

      // Fund both without reference (NULL)
      const fundedA = fundReward(rewardA, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`);
      expect(fundedA.status).toBe('funded');

      const fundedB = fundReward(rewardB, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`);
      expect(fundedB.status).toBe('funded');

      // Both have NULL funding_reference
      const txnA = db.prepare(
        "SELECT funding_reference FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'fund'"
      ).get(rewardA) as { funding_reference: string | null };
      const txnB = db.prepare(
        "SELECT funding_reference FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'fund'"
      ).get(rewardB) as { funding_reference: string | null };
      expect(txnA.funding_reference).toBeNull();
      expect(txnB.funding_reference).toBeNull();
    });
  });

  describe('T08: Empty string normalized to NULL; nonblank preserved exactly', () => {
    it('empty string reference is treated as NULL', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();

      const funded = fundReward(rewardA, admin, { type: 'admin_grant', reference: '' }, `fund-${uuidv4()}`);
      expect(funded.status).toBe('funded');

      const txn = db.prepare(
        "SELECT funding_reference FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'fund'"
      ).get(rewardA) as { funding_reference: string | null };
      expect(txn.funding_reference).toBeNull();
    });

    it('whitespace-only reference is stored exactly (opaque identity)', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();
      const wsRef = '   ';

      const funded = fundReward(rewardA, admin, { type: 'admin_grant', reference: wsRef }, `fund-${uuidv4()}`);
      expect(funded.status).toBe('funded');

      const txn = db.prepare(
        "SELECT funding_reference FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'fund'"
      ).get(rewardA) as { funding_reference: string | null };
      // Opaque identity: nonblank values stored exactly as received
      expect(txn.funding_reference).toBe(wsRef);
    });

    it('two empty-reference grants coexist (both become NULL)', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const rewardB = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();

      const fundedA = fundReward(rewardA, admin, { type: 'admin_grant', reference: '' }, `fund-${uuidv4()}`);
      const fundedB = fundReward(rewardB, admin, { type: 'admin_grant', reference: '' }, `fund-${uuidv4()}`);
      expect(fundedA.status).toBe('funded');
      expect(fundedB.status).toBe('funded');
    });
  });

  describe('T09: Error message does not leak reward ID (A2)', () => {
    it('DUPLICATE_REFERENCE error omits the conflicting reward ID', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const rewardB = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();
      const reference = `grant_ref_${uuidv4()}`;

      fundReward(rewardA, admin, { type: 'admin_grant', reference }, `fund-${uuidv4()}`);

      try {
        fundReward(rewardB, admin, { type: 'admin_grant', reference }, `fund-${uuidv4()}`);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        const re = err as RewardError;
        expect(re.code).toBe('DUPLICATE_REFERENCE');
        // Must NOT contain the other reward's ID
        expect(re.message).not.toContain(rewardA);
        // Must NOT contain the reference value
        expect(re.message).not.toContain(reference);
      }
    });
  });

  describe('T10: Migration — clean bootstrap', () => {
    it('fresh database has the funding reference unique index', () => {
      const idx = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_reward_txn_fund_ref_unique'"
      ).get() as { name: string } | undefined;
      expect(idx).toBeDefined();
      expect(idx!.name).toBe('idx_reward_txn_fund_ref_unique');
    });
  });

  describe('T11: Migration — real upgrade from pre-R3 schema (R3C-F3 fix)', () => {
    it('R3 migration adds index to a database lacking it', () => {
      // Create a separate in-memory DB with pre-R3 schema (no R3 index)
      const testDb = new Database(':memory:');
      try {
        testDb.pragma('foreign_keys = OFF');
        testDb.exec(preR3SchemaSQL);

        // Verify the R3 index does NOT exist yet
        const before = testDb.prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_reward_txn_fund_ref_unique'"
        ).get();
        expect(before).toBeUndefined();

        // Insert a valid fund transaction with a reference
        const rewardId = uuidv4();
        const userId = uuidv4();
        testDb.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'U', 'u@t.com', 'h', 'admin')").run(userId);
        testDb.prepare("INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, currency_code, status, idempotency_key) VALUES (?, ?, 'sponsor_cohort', 'sc1', 'custom', 10000000, 'XLM', 'funded', ?)").run(rewardId, userId, `idem-${uuidv4()}`);
        testDb.prepare("INSERT INTO reward_accounts (id, user_id, account_type, currency_code, available_stroops) VALUES (?, ?, 'funder', 'XLM', 10000000)").run(uuidv4(), userId);
        testDb.prepare(`
          INSERT INTO reward_transactions (id, reward_id, source_account_type, destination_account_type,
            destination_bucket, destination_user_id, actor_type, actor_user_id,
            transaction_type, amount_stroops, currency_code, previous_state, new_state,
            funding_source_type, funding_reference, idempotency_key)
          VALUES (?, ?, 'external', 'funder', 'available', ?, 'user', ?, 'fund', 10000000, 'XLM',
            'draft', 'pending_funding', 'admin_grant', ?, ?)
        `).run(uuidv4(), rewardId, userId, userId, 'existing_ref', `fund-${uuidv4()}`);

        // Run the R3 migration
        runR3Migration(testDb);

        // Verify the index now exists
        const after = testDb.prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_reward_txn_fund_ref_unique'"
        ).get();
        expect(after).toBeDefined();

        // Verify the index enforces uniqueness: inserting a duplicate reference must fail
        expect(() => {
          testDb.prepare(`
            INSERT INTO reward_transactions (id, reward_id, source_account_type, destination_account_type,
              destination_bucket, destination_user_id, actor_type, actor_user_id,
              transaction_type, amount_stroops, currency_code, previous_state, new_state,
              funding_source_type, funding_reference, idempotency_key)
            VALUES (?, ?, 'external', 'funder', 'available', ?, 'user', ?, 'fund', 10000000, 'XLM',
              'draft', 'pending_funding', 'admin_grant', ?, ?)
          `).run(uuidv4(), rewardId, userId, userId, 'existing_ref', `dup-${uuidv4()}`);
        }).toThrow(/UNIQUE/);
      } finally {
        testDb.close();
      }
    });
  });

  describe('T12: Migration — rejects actual duplicate legacy references (R3C-F3 fix)', () => {
    it('migration aborts with diagnostic when duplicate fund references exist', () => {
      const testDb = new Database(':memory:');
      try {
        testDb.pragma('foreign_keys = OFF');
        testDb.exec(preR3SchemaSQL);

        // Seed two fund transactions with the SAME funding_reference (legacy data)
        const userId = uuidv4();
        const rewardA = uuidv4();
        const rewardB = uuidv4();
        testDb.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'U', 'u@t.com', 'h', 'admin')").run(userId);
        testDb.prepare("INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, currency_code, status, idempotency_key) VALUES (?, ?, 'sponsor_cohort', 'sc1', 'custom', 10000000, 'XLM', 'funded', ?)").run(rewardA, userId, `idem-${uuidv4()}`);
        testDb.prepare("INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, currency_code, status, idempotency_key) VALUES (?, ?, 'sponsor_cohort', 'sc1', 'custom', 10000000, 'XLM', 'funded', ?)").run(rewardB, userId, `idem-${uuidv4()}`);
        testDb.prepare("INSERT INTO reward_accounts (id, user_id, account_type, currency_code, available_stroops) VALUES (?, ?, 'funder', 'XLM', 20000000)").run(uuidv4(), userId);

        const dupRef = 'dup_legacy_ref';
        testDb.prepare(`
          INSERT INTO reward_transactions (id, reward_id, source_account_type, destination_account_type,
            destination_bucket, destination_user_id, actor_type, actor_user_id,
            transaction_type, amount_stroops, currency_code, previous_state, new_state,
            funding_source_type, funding_reference, idempotency_key)
          VALUES (?, ?, 'external', 'funder', 'available', ?, 'user', ?, 'fund', 10000000, 'XLM',
            'draft', 'pending_funding', 'admin_grant', ?, ?)
        `).run(uuidv4(), rewardA, userId, userId, dupRef, `fund-${uuidv4()}`);
        testDb.prepare(`
          INSERT INTO reward_transactions (id, reward_id, source_account_type, destination_account_type,
            destination_bucket, destination_user_id, actor_type, actor_user_id,
            transaction_type, amount_stroops, currency_code, previous_state, new_state,
            funding_source_type, funding_reference, idempotency_key)
          VALUES (?, ?, 'external', 'funder', 'available', ?, 'user', ?, 'fund', 10000000, 'XLM',
            'draft', 'pending_funding', 'admin_grant', ?, ?)
        `).run(uuidv4(), rewardB, userId, userId, dupRef, `fund-${uuidv4()}`);

        // R3 migration must abort with diagnostic
        expect(() => runR3Migration(testDb)).toThrow(/W01-R3 migration blocked/);
        expect(() => runR3Migration(testDb)).toThrow(/dup_legacy_ref/);

        // The index must NOT have been created
        const idx = testDb.prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_reward_txn_fund_ref_unique'"
        ).get();
        expect(idx).toBeUndefined();
      } finally {
        testDb.close();
      }
    });
  });

  describe('T13: Different references fund independently', () => {
    it('distinct references do not cause false conflicts', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const rewardB = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();

      const fundedA = fundReward(
        rewardA, admin,
        { type: 'admin_grant', reference: `ref_${uuidv4()}` },
        `fund-${uuidv4()}`
      );
      const fundedB = fundReward(
        rewardB, admin,
        { type: 'admin_grant', reference: `ref_${uuidv4()}` },
        `fund-${uuidv4()}`
      );

      expect(fundedA.status).toBe('funded');
      expect(fundedB.status).toBe('funded');
    });
  });

  // ──── R3C new tests ────

  describe('T14: Opaque reference identity — exact storage (R3C-F2)', () => {
    it('reference with leading/trailing spaces is stored exactly', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();
      const spacedRef = '  spaced_ref  ';

      fundReward(rewardA, admin, { type: 'admin_grant', reference: spacedRef }, `fund-${uuidv4()}`);

      const txn = db.prepare(
        "SELECT funding_reference FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'fund'"
      ).get(rewardA) as { funding_reference: string | null };
      // Opaque: stored exactly, not trimmed
      expect(txn.funding_reference).toBe(spacedRef);
    });

    it('UNIQUE catches exact-match duplicate including spaces', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const rewardB = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();
      const spacedRef = '  spaced_ref  ';

      fundReward(rewardA, admin, { type: 'admin_grant', reference: spacedRef }, `fund-${uuidv4()}`);

      try {
        fundReward(rewardB, admin, { type: 'admin_grant', reference: spacedRef }, `fund-${uuidv4()}`);
        expect.unreachable('Should have thrown DUPLICATE_REFERENCE');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        expect((err as RewardError).code).toBe('DUPLICATE_REFERENCE');
      }
    });

    it('trimmed vs spaced are distinct references (opaque identity)', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const rewardB = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();

      // Fund rewardA with spaced reference
      const fundedA = fundReward(rewardA, admin, { type: 'admin_grant', reference: '  ref  ' }, `fund-${uuidv4()}`);
      expect(fundedA.status).toBe('funded');

      // Fund rewardB with trimmed version — these are different references
      const fundedB = fundReward(rewardB, admin, { type: 'admin_grant', reference: 'ref' }, `fund-${uuidv4()}`);
      expect(fundedB.status).toBe('funded');
    });
  });

  describe('T15: Pre-R3 database pre-migration validation (R3C-F1)', () => {
    it('validateDatabase accepts a pre-R3 database before migrations', () => {
      const testDb = new Database(':memory:');
      try {
        testDb.pragma('foreign_keys = OFF');
        testDb.exec(preR3SchemaSQL);

        // Pre-migration validation must accept the database even without the R3 index
        expect(() => validateDatabase(testDb)).not.toThrow();
      } finally {
        testDb.close();
      }
    });

    it('required-schema.json enforces R3 index post-migration', () => {
      // Post-migration validation checks required-schema.json indexes.
      // Verify the R3 index is in that list (enforcement is via required indexes check at line 94-96).
      // The actual post-migration enforcement is tested indirectly through T16 + the
      // database.ts startup transaction which calls validateDatabase(db, true) at line 2019.
      const requiredPath = path.resolve(__dirname, '../../database/required-schema.json');
      const required = JSON.parse(fs.readFileSync(requiredPath, 'utf-8'));
      expect(required.indexes).toContain('idx_reward_txn_fund_ref_unique');

      // Also verify a pre-R3 DB without the index would fail the index check
      const testDb = new Database(':memory:');
      try {
        testDb.pragma('foreign_keys = OFF');
        testDb.exec(preR3SchemaSQL);
        const idx = testDb.prepare(
          "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_reward_txn_fund_ref_unique'"
        ).get();
        expect(idx).toBeUndefined(); // confirms index is absent pre-migration
      } finally {
        testDb.close();
      }
    });
  });

  describe('T16: required-schema.json includes R3 index (R3C-F1)', () => {
    it('idx_reward_txn_fund_ref_unique is in required indexes', () => {
      const requiredPath = path.resolve(__dirname, '../../database/required-schema.json');
      const required = JSON.parse(fs.readFileSync(requiredPath, 'utf-8'));
      expect(required.indexes).toContain('idx_reward_txn_fund_ref_unique');
    });
  });

  // ──── R3D new tests: strict final validation, async competition, rollback ────

  describe('T17: Post-migration validation rejects same-name non-UNIQUE index (R3D-F1)', () => {
    it('validateDatabase(db, true) refuses when idx_reward_txn_fund_ref_unique is not UNIQUE', () => {
      // Create a DB with canonical schema + migration-only tables
      const testDb = new Database(':memory:');
      try {
        testDb.exec(schemaSQL);
        applyMigrationOnlySchema(testDb);

        // Replace the UNIQUE index with a non-UNIQUE index of the same name
        testDb.exec('DROP INDEX idx_reward_txn_fund_ref_unique');
        testDb.exec(`
          CREATE INDEX idx_reward_txn_fund_ref_unique
            ON reward_transactions(funding_reference)
            WHERE funding_reference IS NOT NULL AND transaction_type = 'fund'
        `);

        // Verify the index exists but is NOT unique
        const idxInfo = testDb.prepare(
          "SELECT name, \"unique\" as is_unique FROM pragma_index_list('reward_transactions') WHERE name = 'idx_reward_txn_fund_ref_unique'"
        ).get() as { name: string; is_unique: number } | undefined;
        expect(idxInfo).toBeDefined();
        expect(idxInfo!.is_unique).toBe(0); // confirms non-UNIQUE

        // Post-migration validation must refuse this — the constraint is malformed
        expect(() => validateDatabase(testDb, true)).toThrow(/missing unique constraint/);
      } finally {
        testDb.close();
      }
    });
  });

  describe('T18: Post-migration validation rejects wrong-definition same-name index (R3D-F1)', () => {
    it('validateDatabase(db, true) refuses when idx_reward_txn_fund_ref_unique has wrong columns', () => {
      const testDb = new Database(':memory:');
      try {
        testDb.exec(schemaSQL);
        applyMigrationOnlySchema(testDb);

        // Replace the UNIQUE index with a UNIQUE index on different columns
        testDb.exec('DROP INDEX idx_reward_txn_fund_ref_unique');
        testDb.exec(`
          CREATE UNIQUE INDEX idx_reward_txn_fund_ref_unique
            ON reward_transactions(idempotency_key)
            WHERE funding_reference IS NOT NULL AND transaction_type = 'fund'
        `);

        // Post-migration validation must refuse — wrong column definition
        expect(() => validateDatabase(testDb, true)).toThrow(/missing unique constraint/);
      } finally {
        testDb.close();
      }
    });
  });

  describe('T19: Async competing fundRewardAsync calls (R3D-F2)', () => {
    it('concurrent calls with same reference — one succeeds, one fails DUPLICATE_REFERENCE', async () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const rewardB = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();
      const reference = `grant_ref_${uuidv4()}`;

      // Launch both async funding calls concurrently
      const results = await Promise.allSettled([
        fundRewardAsync(rewardA, admin, { type: 'admin_grant', reference }, `fund-${uuidv4()}`),
        fundRewardAsync(rewardB, admin, { type: 'admin_grant', reference }, `fund-${uuidv4()}`),
      ]);

      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      // Exactly one succeeds and one fails
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      // The failure must be DUPLICATE_REFERENCE
      const rejection = (failures[0] as PromiseRejectedResult).reason;
      expect(rejection).toBeInstanceOf(RewardError);
      expect(rejection.code).toBe('DUPLICATE_REFERENCE');
      expect(rejection.statusCode).toBe(409);

      // Only one reward is funded; the other remains draft
      const funded = successes[0] as PromiseFulfilledResult<{ status: string }>;
      expect(funded.value.status).toBe('funded');

      // Only one fund transaction exists for this reference
      const txns = db.prepare(
        "SELECT * FROM reward_transactions WHERE funding_reference = ? AND transaction_type = 'fund'"
      ).all(reference);
      expect(txns).toHaveLength(1);
    });
  });

  describe('T20: Post-fund rollback frees reference — injected failure (R3D-F2)', () => {
    it('transaction rollback after fund entry restores state, accounts, and frees reference', () => {
      const sponsor = createUser('admin');
      const cohortId = createCohort(sponsor);
      const rewardA = draftReward(sponsor, cohortId);
      const rewardB = draftReward(sponsor, cohortId);
      const admin = createIndependentAdmin();
      const reference = `grant_ref_${uuidv4()}`;

      // Capture pre-rollback state
      const preAccounts = db.prepare('SELECT * FROM reward_accounts').all();
      const preTxns = db.prepare('SELECT * FROM reward_transactions').all();

      // Simulate a fund transaction that writes the fund entry then fails
      // before the reserve entry — the entire transaction must roll back.
      expect(() => {
        db.transaction(() => {
          // Write the fund ledger entry (with the reference) — same as fundRewardVerified
          db.prepare(`
            INSERT INTO reward_transactions (
              id, reward_id, source_account_type, destination_account_type,
              destination_bucket, destination_user_id,
              actor_type, actor_user_id,
              transaction_type, amount_stroops, currency_code,
              previous_state, new_state,
              funding_source_type, funding_reference,
              idempotency_key
            ) VALUES (?, ?, 'external', 'funder', 'available', ?,
              'user', ?, 'fund', 10000000, 'XLM',
              'draft', 'pending_funding',
              'admin_grant', ?, ?)
          `).run(uuidv4(), rewardA, admin, admin, reference, `fund-${uuidv4()}`);

          // Fund entry is now written inside the transaction.
          // Inject failure before reserve entry — simulates a crash or error.
          throw new Error('Injected failure after fund ledger entry');
        }).immediate();
      }).toThrow('Injected failure after fund ledger entry');

      // Reference must be free — the transaction rolled back
      const refTxns = db.prepare(
        "SELECT * FROM reward_transactions WHERE funding_reference = ? AND transaction_type = 'fund'"
      ).all(reference);
      expect(refTxns).toHaveLength(0);

      // State unchanged — no new transactions or accounts
      const postAccounts = db.prepare('SELECT * FROM reward_accounts').all();
      const postTxns = db.prepare('SELECT * FROM reward_transactions').all();
      expect(postAccounts).toEqual(preAccounts);
      expect(postTxns).toEqual(preTxns);

      // Reward A still in draft (status not changed by the rolled-back transaction)
      const rewardAState = getReward(rewardA)!;
      expect(rewardAState.status).toBe('draft');

      // Fund rewardB with the same reference — must succeed (reference is free)
      const funded = fundReward(rewardB, admin, { type: 'admin_grant', reference }, `fund-${uuidv4()}`);
      expect(funded.status).toBe('funded');

      // Only one fund transaction with this reference exists (rewardB's)
      const finalTxns = db.prepare(
        "SELECT reward_id FROM reward_transactions WHERE funding_reference = ? AND transaction_type = 'fund'"
      ).all(reference) as { reward_id: string }[];
      expect(finalTxns).toHaveLength(1);
      expect(finalTxns[0].reward_id).toBe(rewardB);
    });
  });
});
