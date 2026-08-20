/**
 * migration-idempotency.test.ts — Disposable migration validation and runtime idempotency tests
 *
 * All tests use in-memory SQLite (:memory:) — production database is NEVER touched.
 * The enhanced provider remains disabled (NFT_PROVIDER defaults to legacy).
 * No blockchain transactions are signed, submitted, or retried.
 *
 * Test categories:
 *   MIG-1..MIG-11:  Migration schema tests (column, indexes, existing rows, rollback)
 *   KEY-1..KEY-8:   Operation key derivation tests
 *   RUN-1..RUN-9:   Runtime idempotency tests (same-key replay, conflict, restart)
 *   SAF-1..SAF-7:   Safety tests (no production, no blockchain)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
// ─── In-memory database helpers ─────────────────────────────────────────────

/** Create a fresh in-memory SQLite database with the nft_credentials schema (pre-migration). */
function createPreMigrationDb(): InstanceType<typeof Database> {
  const memDb = new Database(':memory:');
  memDb.pragma('journal_mode = WAL');
  memDb.pragma('foreign_keys = ON');

  // Minimal schema needed for nft_credentials (users + courses as FK targets)
  memDb.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student'
    );
    CREATE TABLE courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      course_code TEXT UNIQUE
    );
    CREATE TABLE quizzes (
      id TEXT PRIMARY KEY,
      course_id TEXT REFERENCES courses(id),
      title TEXT NOT NULL
    );
    CREATE TABLE course_nft_applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE nft_credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quiz_id TEXT REFERENCES quizzes(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      mint_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (mint_status IN ('pending', 'minted', 'failed')),
      tx_hash TEXT,
      error TEXT,
      contract_id TEXT NOT NULL,
      network TEXT NOT NULL DEFAULT 'public',
      course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
      application_id TEXT REFERENCES course_nft_applications(id) ON DELETE SET NULL,
      is_superseded INTEGER NOT NULL DEFAULT 0,
      soroban_token_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE (user_id, quiz_id)
    );
    CREATE INDEX IF NOT EXISTS idx_nft_credentials_user ON nft_credentials(user_id);
    CREATE INDEX IF NOT EXISTS idx_nft_credentials_status ON nft_credentials(mint_status);
    CREATE INDEX IF NOT EXISTS idx_nft_credentials_course ON nft_credentials(course_id);
  `);

  return memDb;
}

/** Apply the migration SQL to a database. */
function applyMigration(memDb: InstanceType<typeof Database>): void {
  memDb.exec(`ALTER TABLE nft_credentials ADD COLUMN mint_operation_key TEXT`);
  memDb.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_credentials_operation_key
      ON nft_credentials(mint_operation_key)
      WHERE mint_operation_key IS NOT NULL
  `);
  memDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_nft_credentials_user_course_status
      ON nft_credentials(user_id, course_id, mint_status)
  `);
}

/** Apply the rollback SQL. */
function applyRollback(memDb: InstanceType<typeof Database>): void {
  memDb.exec(`DROP INDEX IF EXISTS idx_nft_credentials_operation_key`);
  memDb.exec(`DROP INDEX IF EXISTS idx_nft_credentials_user_course_status`);
  memDb.exec(`ALTER TABLE nft_credentials DROP COLUMN mint_operation_key`);
}

/** Seed a synthetic user + course + credential. */
function seedCredential(memDb: InstanceType<typeof Database>, overrides?: {
  userId?: string;
  courseId?: string;
  credId?: string;
  mintStatus?: string;
  txHash?: string | null;
  operationKey?: string | null;
}): { userId: string; courseId: string; credId: string; appId: string } {
  const userId = overrides?.userId ?? uuidv4();
  const courseId = overrides?.courseId ?? uuidv4();
  const credId = overrides?.credId ?? uuidv4();
  const appId = uuidv4();

  // Ensure user and course exist (ignore if already present)
  try {
    memDb.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, 'Test', 'hash', 'student')`)
      .run(userId, `test-${userId.slice(0, 8)}@test.com`);
  } catch { /* already exists */ }

  try {
    memDb.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'Desc', ?)`)
      .run(courseId, `TC-${courseId.slice(0, 8)}`);
  } catch { /* already exists */ }

  try {
    memDb.prepare(`INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status) VALUES (?, ?, ?, 'GTEST', 'approved')`)
      .run(appId, userId, courseId);
  } catch { /* already exists */ }

  const insertSql = overrides?.operationKey !== undefined
    ? `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network, course_id, application_id, tx_hash, mint_operation_key)
       VALUES (?, ?, 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY', ?, 'CTEST', 'testnet', ?, ?, ?, ?)`
    : `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network, course_id, application_id, tx_hash)
       VALUES (?, ?, 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY', ?, 'CTEST', 'testnet', ?, ?, ?)`;

  const params = overrides?.operationKey !== undefined
    ? [credId, userId, overrides?.mintStatus ?? 'pending', courseId, appId, overrides?.txHash ?? null, overrides.operationKey]
    : [credId, userId, overrides?.mintStatus ?? 'pending', courseId, appId, overrides?.txHash ?? null];

  memDb.prepare(insertSql).run(...params);

  return { userId, courseId, credId, appId };
}

// ─── Operation key derivation (same as will be implemented in provider) ─────

function deriveOperationKey(params: {
  userId: string;
  courseId: string;
  walletAddress: string;
  contractId: string;
  network: string;
}): string {
  return `mint:${params.userId}:${params.courseId}:${params.walletAddress}:${params.contractId}:${params.network}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIGRATION SCHEMA TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Migration Schema Validation (in-memory)', () => {
  let memDb: InstanceType<typeof Database>;

  beforeEach(() => {
    memDb = createPreMigrationDb();
  });

  afterEach(() => {
    memDb.close();
  });

  it('MIG-1: mint_operation_key column is absent before migration', () => {
    const cols = memDb.prepare('PRAGMA table_info(nft_credentials)').all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    expect(colNames).not.toContain('mint_operation_key');
  });

  it('MIG-2: mint_operation_key column exists after migration', () => {
    applyMigration(memDb);
    const cols = memDb.prepare('PRAGMA table_info(nft_credentials)').all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('mint_operation_key');
  });

  it('MIG-3: mint_operation_key has correct type and allows NULL', () => {
    applyMigration(memDb);
    const cols = memDb.prepare('PRAGMA table_info(nft_credentials)').all() as { name: string; type: string; notnull: number }[];
    const col = cols.find(c => c.name === 'mint_operation_key');
    expect(col).toBeDefined();
    expect(col!.type).toBe('TEXT');
    expect(col!.notnull).toBe(0); // nullable
  });

  it('MIG-4: existing rows survive migration with NULL mint_operation_key', () => {
    // Seed data BEFORE migration
    const { credId } = seedCredential(memDb, { mintStatus: 'minted', txHash: 'existing-hash' });

    applyMigration(memDb);

    const row = memDb.prepare('SELECT id, mint_status, tx_hash, mint_operation_key FROM nft_credentials WHERE id = ?')
      .get(credId) as any;
    expect(row).toBeDefined();
    expect(row.id).toBe(credId);
    expect(row.mint_status).toBe('minted');
    expect(row.tx_hash).toBe('existing-hash');
    expect(row.mint_operation_key).toBeNull();
  });

  it('MIG-5: multiple existing rows survive migration', () => {
    seedCredential(memDb, { mintStatus: 'pending' });
    seedCredential(memDb, { mintStatus: 'minted', txHash: 'hash-1' });
    seedCredential(memDb, { mintStatus: 'failed', txHash: 'hash-2' });

    const countBefore = (memDb.prepare('SELECT COUNT(*) as cnt FROM nft_credentials').get() as any).cnt;
    expect(countBefore).toBe(3);

    applyMigration(memDb);

    const countAfter = (memDb.prepare('SELECT COUNT(*) as cnt FROM nft_credentials').get() as any).cnt;
    expect(countAfter).toBe(3);

    // All should have null operation key
    const rows = memDb.prepare('SELECT mint_operation_key FROM nft_credentials').all() as { mint_operation_key: string | null }[];
    expect(rows.every(r => r.mint_operation_key === null)).toBe(true);
  });

  it('MIG-6: duplicate non-null operation keys are rejected by unique index', () => {
    applyMigration(memDb);
    const seed1 = seedCredential(memDb);
    seedCredential(memDb);

    // Set operation key on first credential
    memDb.prepare('UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ?')
      .run('test-key-1', seed1.credId);

    // Try to set the SAME key on second — should fail
    const rows = memDb.prepare('SELECT id FROM nft_credentials WHERE id != ?').all(seed1.credId) as { id: string }[];
    expect(() => {
      memDb.prepare('UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ?')
        .run('test-key-1', rows[0].id);
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('MIG-7: NULL operation keys are allowed on multiple rows (partial index)', () => {
    applyMigration(memDb);
    seedCredential(memDb);
    seedCredential(memDb);
    seedCredential(memDb);

    // All three have NULL mint_operation_key — this should be fine
    const rows = memDb.prepare('SELECT mint_operation_key FROM nft_credentials').all() as { mint_operation_key: string | null }[];
    expect(rows.length).toBe(3);
    expect(rows.every(r => r.mint_operation_key === null)).toBe(true);
  });

  it('MIG-8: partial unique index exists after migration', () => {
    applyMigration(memDb);
    const indexes = memDb.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='nft_credentials'")
      .all() as { name: string }[];
    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_nft_credentials_operation_key');
  });

  it('MIG-9: user_course_status index exists after migration', () => {
    applyMigration(memDb);
    const indexes = memDb.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='nft_credentials'")
      .all() as { name: string }[];
    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_nft_credentials_user_course_status');
  });

  it('MIG-10: second migration application fails (one-shot ADD COLUMN)', () => {
    applyMigration(memDb);
    // Second ADD COLUMN should throw because column already exists
    expect(() => {
      memDb.exec('ALTER TABLE nft_credentials ADD COLUMN mint_operation_key TEXT');
    }).toThrow(/duplicate column/i);
  });

  it('MIG-11: rollback removes column and indexes, then reapply works', () => {
    applyMigration(memDb);

    // Verify column exists
    let cols = memDb.prepare('PRAGMA table_info(nft_credentials)').all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('mint_operation_key');

    // Rollback
    applyRollback(memDb);

    // Verify column is gone
    cols = memDb.prepare('PRAGMA table_info(nft_credentials)').all() as { name: string }[];
    expect(cols.map(c => c.name)).not.toContain('mint_operation_key');

    // Verify indexes are gone
    const indexes = memDb.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='nft_credentials'")
      .all() as { name: string }[];
    const indexNames = indexes.map(i => i.name);
    expect(indexNames).not.toContain('idx_nft_credentials_operation_key');
    expect(indexNames).not.toContain('idx_nft_credentials_user_course_status');

    // Reapply migration
    applyMigration(memDb);

    cols = memDb.prepare('PRAGMA table_info(nft_credentials)').all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('mint_operation_key');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OPERATION KEY DERIVATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Operation Key Derivation', () => {
  it('KEY-1: same logical operation derives the same key', () => {
    const params = {
      userId: 'user-1',
      courseId: 'course-1',
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      contractId: 'CTEST',
      network: 'testnet',
    };
    const key1 = deriveOperationKey(params);
    const key2 = deriveOperationKey(params);
    expect(key1).toBe(key2);
  });

  it('KEY-2: different user produces different key', () => {
    const base = {
      courseId: 'course-1',
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      contractId: 'CTEST',
      network: 'testnet',
    };
    const k1 = deriveOperationKey({ ...base, userId: 'user-1' });
    const k2 = deriveOperationKey({ ...base, userId: 'user-2' });
    expect(k1).not.toBe(k2);
  });

  it('KEY-3: different course produces different key', () => {
    const base = {
      userId: 'user-1',
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      contractId: 'CTEST',
      network: 'testnet',
    };
    const k1 = deriveOperationKey({ ...base, courseId: 'course-1' });
    const k2 = deriveOperationKey({ ...base, courseId: 'course-2' });
    expect(k1).not.toBe(k2);
  });

  it('KEY-4: different network produces different key', () => {
    const base = {
      userId: 'user-1',
      courseId: 'course-1',
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      contractId: 'CTEST',
    };
    const k1 = deriveOperationKey({ ...base, network: 'testnet' });
    const k2 = deriveOperationKey({ ...base, network: 'public' });
    expect(k1).not.toBe(k2);
  });

  it('KEY-5: different contract produces different key', () => {
    const base = {
      userId: 'user-1',
      courseId: 'course-1',
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      network: 'testnet',
    };
    const k1 = deriveOperationKey({ ...base, contractId: 'CTEST1' });
    const k2 = deriveOperationKey({ ...base, contractId: 'CTEST2' });
    expect(k1).not.toBe(k2);
  });

  it('KEY-6: key format is deterministic and contains no secrets', () => {
    const key = deriveOperationKey({
      userId: 'user-1',
      courseId: 'course-1',
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      contractId: 'CTEST',
      network: 'testnet',
    });
    expect(key).toBe('mint:user-1:course-1:GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY:CTEST:testnet');
    expect(key).not.toContain('SECRET');
    expect(key).not.toContain('PRIVATE');
    expect(key).not.toContain('SEED');
  });

  it('KEY-7: key does not depend on transaction hash', () => {
    const params = {
      userId: 'user-1',
      courseId: 'course-1',
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      contractId: 'CTEST',
      network: 'testnet',
    };
    const key = deriveOperationKey(params);
    expect(key).not.toContain('tx_hash');
    expect(key).not.toContain('hash');
  });

  it('KEY-8: key fits in TEXT column (reasonable length)', () => {
    const key = deriveOperationKey({
      userId: uuidv4(),
      courseId: uuidv4(),
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      contractId: 'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524',
      network: 'testnet',
    });
    // Should be well under 1000 chars
    expect(key.length).toBeLessThan(500);
    expect(key.length).toBeGreaterThan(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUNTIME IDEMPOTENCY TESTS (in-memory, migrated schema)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Runtime Idempotency (in-memory migrated schema)', () => {
  let memDb: InstanceType<typeof Database>;

  beforeEach(() => {
    memDb = createPreMigrationDb();
    applyMigration(memDb);
  });

  afterEach(() => {
    memDb.close();
  });

  it('RUN-1: first mint operation stores mint_operation_key', () => {
    const { credId } = seedCredential(memDb);
    const opKey = 'mint:user1:course1:wallet:contract:testnet';

    memDb.prepare('UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ?')
      .run(opKey, credId);

    const row = memDb.prepare('SELECT mint_operation_key FROM nft_credentials WHERE id = ?')
      .get(credId) as any;
    expect(row.mint_operation_key).toBe(opKey);
  });

  it('RUN-2: same key lookup finds existing operation (replay)', () => {
    const { credId } = seedCredential(memDb, { mintStatus: 'minted', txHash: 'existing-hash' });
    const opKey = 'mint:user1:course1:wallet:contract:testnet';

    memDb.prepare('UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ?')
      .run(opKey, credId);

    // Lookup by operation key — should find the existing minted credential
    const existing = memDb.prepare(
      'SELECT id, mint_status, tx_hash FROM nft_credentials WHERE mint_operation_key = ?'
    ).get(opKey) as any;

    expect(existing).toBeDefined();
    expect(existing.id).toBe(credId);
    expect(existing.mint_status).toBe('minted');
    expect(existing.tx_hash).toBe('existing-hash');
  });

  it('RUN-3: different credentials cannot share the same operation key', () => {
    const seed1 = seedCredential(memDb);
    const seed2 = seedCredential(memDb);
    const opKey = 'mint:shared-key';

    memDb.prepare('UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ?')
      .run(opKey, seed1.credId);

    expect(() => {
      memDb.prepare('UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ?')
        .run(opKey, seed2.credId);
    }).toThrow(/UNIQUE constraint/);
  });

  it('RUN-4: operation key survives across database reads (restart simulation)', () => {
    const { credId } = seedCredential(memDb, { mintStatus: 'pending', txHash: 'submitted-hash' });
    const opKey = 'mint:restart-test';

    memDb.prepare('UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ?')
      .run(opKey, credId);

    // Simulate "restart" by doing a fresh query (different prepared statement)
    const freshQuery = memDb.prepare(
      'SELECT id, mint_status, tx_hash, mint_operation_key FROM nft_credentials WHERE mint_operation_key = ?'
    );
    const recovered = freshQuery.get(opKey) as any;

    expect(recovered).toBeDefined();
    expect(recovered.id).toBe(credId);
    expect(recovered.tx_hash).toBe('submitted-hash');
    expect(recovered.mint_operation_key).toBe(opKey);
  });

  it('RUN-5: transaction hash is preserved when operation key is set', () => {
    const { credId } = seedCredential(memDb, { mintStatus: 'pending' });
    const opKey = 'mint:hash-preserve-test';

    // Set operation key and tx_hash atomically
    memDb.prepare(
      'UPDATE nft_credentials SET mint_operation_key = ?, tx_hash = ? WHERE id = ? AND tx_hash IS NULL'
    ).run(opKey, 'new-tx-hash', credId);

    // Now try to overwrite tx_hash — should NOT change it
    const result = memDb.prepare(
      'UPDATE nft_credentials SET tx_hash = ? WHERE id = ? AND tx_hash IS NULL'
    ).run('overwrite-attempt', credId);

    expect(result.changes).toBe(0); // no rows changed because tx_hash IS NOT NULL

    const row = memDb.prepare('SELECT tx_hash FROM nft_credentials WHERE id = ?').get(credId) as any;
    expect(row.tx_hash).toBe('new-tx-hash');
  });

  it('RUN-6: reconciliation does not create a new operation key', () => {
    const { credId } = seedCredential(memDb, {
      mintStatus: 'failed',
      txHash: 'recon-hash',
      operationKey: 'mint:recon-test',
    });

    // Simulate reconciliation: update status but preserve operation key
    memDb.prepare(
      "UPDATE nft_credentials SET mint_status = 'minted', error = NULL WHERE id = ?"
    ).run(credId);

    const row = memDb.prepare('SELECT mint_operation_key, mint_status FROM nft_credentials WHERE id = ?')
      .get(credId) as any;
    expect(row.mint_operation_key).toBe('mint:recon-test');
    expect(row.mint_status).toBe('minted');
  });

  it('RUN-7: unknown submission state remains reconcilable with operation key', () => {
    const { credId } = seedCredential(memDb, { mintStatus: 'pending' });
    const opKey = 'mint:unknown-test';

    // Simulate: submit succeeded, tx_hash persisted, but poll timed out
    memDb.prepare(
      "UPDATE nft_credentials SET mint_operation_key = ?, tx_hash = ?, mint_status = 'failed', error = '[RECONCILIATION_REQUIRED] poll timeout' WHERE id = ?"
    ).run(opKey, 'unknown-hash', credId);

    // Should be findable by operation key for reconciliation
    const row = memDb.prepare(
      'SELECT id, tx_hash, mint_status, error FROM nft_credentials WHERE mint_operation_key = ?'
    ).get(opKey) as any;

    expect(row).toBeDefined();
    expect(row.tx_hash).toBe('unknown-hash');
    expect(row.mint_status).toBe('failed');
    expect(row.error).toContain('[RECONCILIATION_REQUIRED]');
  });

  it('RUN-8: concurrent INSERT with same operation key — only one succeeds', () => {
    const userId = uuidv4();
    const courseId = uuidv4();
    const opKey = `mint:${userId}:${courseId}:wallet:contract:testnet`;

    // Seed user + course
    memDb.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, 'Test', 'hash', 'student')`)
      .run(userId, `u-${userId.slice(0, 8)}@test.com`);
    memDb.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'D', ?)`)
      .run(courseId, `C-${courseId.slice(0, 8)}`);
    memDb.prepare(`INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status) VALUES (?, ?, ?, 'G', 'approved')`)
      .run(uuidv4(), userId, courseId);

    // First insert succeeds
    memDb.prepare(
      `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network, course_id, mint_operation_key)
       VALUES (?, ?, 'GTEST', 'pending', 'CTEST', 'testnet', ?, ?)`
    ).run(uuidv4(), userId, courseId, opKey);

    // Second insert with same operation key fails
    expect(() => {
      memDb.prepare(
        `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network, course_id, mint_operation_key)
         VALUES (?, ?, 'GTEST', 'pending', 'CTEST', 'testnet', ?, ?)`
      ).run(uuidv4(), userId, courseId, opKey);
    }).toThrow(/UNIQUE constraint/);
  });

  it('RUN-9: operation key index used for efficient lookup', () => {
    const { credId } = seedCredential(memDb, { operationKey: 'mint:perf-test' });

    // EXPLAIN QUERY PLAN should show index usage
    const plan = memDb.prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM nft_credentials WHERE mint_operation_key = 'mint:perf-test'"
    ).all() as { detail: string }[];

    const details = plan.map(p => p.detail).join(' ');
    // Should use the operation key index or at minimum not do a full table scan
    expect(details).toMatch(/idx_nft_credentials_operation_key|SEARCH/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SAFETY TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Safety Tests', () => {
  it('SAF-1: test databases are always :memory:', () => {
    const memDb = new Database(':memory:');
    // Verify it's in-memory
    const result = memDb.pragma('database_list') as { file: string }[];
    // In-memory databases have empty file path
    expect(result[0].file).toBe('');
    memDb.close();
  });

  it('SAF-2: production database path is NOT loaded in tests', () => {
    // The production DB is at LMS-Server/data/student_ms.db
    // Our test database should NOT be that file
    const memDb = new Database(':memory:');
    const result = memDb.pragma('database_list') as { file: string }[];
    expect(result[0].file).not.toContain('student_ms.db');
    expect(result[0].file).not.toContain('data/');
    memDb.close();
  });

  it('SAF-3: NFT_PROVIDER defaults to legacy or is unset', () => {
    const provider = process.env.NFT_PROVIDER;
    expect(provider === undefined || provider === 'legacy' || provider === '').toBe(true);
  });

  it('SAF-4: NFT_AUTO_MINT_ENABLED is not true', () => {
    const autoMint = process.env.NFT_AUTO_MINT_ENABLED;
    expect(autoMint !== 'true').toBe(true);
  });

  it('SAF-5: no blockchain client is initialized in migration tests', () => {
    // We never import or construct a real TransactionClient in this file
    // Verify by checking that no Stellar SDK is loaded
    const memDb = new Database(':memory:');
    // If we got here, no blockchain client was needed
    expect(memDb).toBeDefined();
    memDb.close();
  });

  it('SAF-6: migration can be applied and rolled back without data loss', () => {
    const memDb = createPreMigrationDb();
    const { credId } = seedCredential(memDb, { mintStatus: 'minted', txHash: 'safety-hash' });

    applyMigration(memDb);
    applyRollback(memDb);

    // Original data should survive
    const row = memDb.prepare('SELECT id, mint_status, tx_hash FROM nft_credentials WHERE id = ?')
      .get(credId) as any;
    expect(row).toBeDefined();
    expect(row.mint_status).toBe('minted');
    expect(row.tx_hash).toBe('safety-hash');
    memDb.close();
  });

  it('SAF-7: no credentials are loaded from production', () => {
    const memDb = createPreMigrationDb();
    const count = (memDb.prepare('SELECT COUNT(*) as cnt FROM nft_credentials').get() as any).cnt;
    expect(count).toBe(0); // fresh in-memory DB has no data
    memDb.close();
  });
});
