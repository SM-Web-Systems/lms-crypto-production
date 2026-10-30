/**
 * migrateRewardTxnCheck.ts
 *
 * W03-R2 — Offline migration: upgrade reward_transactions CHECK constraints to
 * include 'release_unused' transaction type.
 * W03-R3 — Corrected migration: F1 comment-bypass, F2 object inventory, F3 commit boundary.
 * W03-R4 — Authoritative schema validation: replace substring fingerprints with exact
 *   canonical DDL body comparison; add index-definition verification; explicit column mapping.
 *
 * Version: 002-reward-transactions-check-upgrade
 * Supported source: reward_transactions DDL exactly matching schema-v117-fixture.sql
 * Supported target: reward_transactions DDL exactly matching current schema.sql / targetCreateTable()
 *
 * Usage:
 *   npm run db:migrate-reward-txn-check -- --plan  DATABASE_PATH
 *   npm run db:migrate-reward-txn-check -- --apply DATABASE_PATH
 *
 * Safety:
 *   --plan  Opens read-only. Inventories objects. Reports proposed changes. No mutation.
 *   --apply Pre-validates FK/integrity/dependencies, reconstructs table in a single
 *           transaction with all checks inside the transaction before COMMIT.
 *           All-or-nothing: if any check fails, reward_transactions is unchanged and
 *           no migration receipt is written.
 */

import Database, { type Database as SqliteDatabase } from 'better-sqlite3';
import fs from 'node:fs';

// ── Public constants ─────────────────────────────────────────────────────────

export const MIGRATION_ID = 'migration_002_reward_txn_check';

// ── Types ────────────────────────────────────────────────────────────────────

export type SchemaVersion = 'source' | 'target' | 'absent' | 'unknown';

export interface PlanResult {
  schemaVersion: SchemaVersion;
  rowCount: number;
  wouldApply: boolean;
  alreadyAtTarget: boolean;
  indexNames: string[];
}

export interface ApplyResult {
  success: boolean;
  rowsCopied: number;
  alreadyAtTarget: boolean;
}

// ── Target DDL (W03-R2+) ─────────────────────────────────────────────────────
// Verbatim from database/schema.sql. Table name is a parameter to allow the
// rename-to-temp pattern during reconstruction.

function targetCreateTable(tableName: string): string {
  return `CREATE TABLE ${tableName} (
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
  transaction_type         TEXT NOT NULL CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire', 'release_unused')),
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
  CHECK ((transaction_type IN ('reserve', 'cancel', 'expire', 'release_unused') AND source_user_id IS NOT NULL) OR (transaction_type NOT IN ('reserve', 'cancel', 'expire', 'release_unused'))),
  CHECK ((transaction_type = 'fund' AND destination_user_id IS NOT NULL AND destination_account_type = 'funder') OR (transaction_type != 'fund'))
)`;
}

// ── Source DDL (pre-W03-R2, schema-v117) ────────────────────────────────────
// Verbatim from database/schema-v117-fixture.sql. This is the only supported
// source schema; any other form is classified 'unknown' and refused.

function sourceCreateTable(tableName: string): string {
  return `CREATE TABLE ${tableName} (
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
)`;
}

// ── Safe DDL canonicalization (W03-R4) ───────────────────────────────────────

/**
 * Token-aware DDL canonicalization:
 *   - Strips block comments (slash-star ... star-slash) and line comments (-- ...) safely.
 *     Content inside single-quoted string literals and double-quoted identifiers
 *     is preserved verbatim — '--' or slash-star inside a literal is NOT a comment.
 *   - Collapses all whitespace sequences to a single space, trims.
 *   - Strips "IF NOT EXISTS " (defensive; SQLite already strips it from stored DDL).
 *
 * W03-R4: replaces the previous regex-based normalizeDdl that incorrectly stripped
 * '--' inside string literals (e.g. DEFAULT '--placeholder' was partially truncated).
 *
 * Exported for use by databaseBootstrap.ts.
 */
export function canonicalizeDdl(ddl: string): string {
  let result = '';
  let pendingSpace = false; // true when whitespace/comment was seen but not yet flushed
  let i = 0;
  const n = ddl.length;

  while (i < n) {
    if (ddl[i] === "'") {
      // Single-quoted string literal — '' is the escape for a literal quote
      let j = i + 1;
      while (j < n) {
        if (ddl[j] === "'" && j + 1 < n && ddl[j + 1] === "'") { j += 2; }
        else if (ddl[j] === "'") { j++; break; }
        else { j++; }
      }
      if (pendingSpace && result.length > 0) { result += ' '; pendingSpace = false; }
      result += ddl.slice(i, j);
      i = j;
    } else if (ddl[i] === '"') {
      // Double-quoted identifier — "" is the escape
      let j = i + 1;
      while (j < n) {
        if (ddl[j] === '"' && j + 1 < n && ddl[j + 1] === '"') { j += 2; }
        else if (ddl[j] === '"') { j++; break; }
        else { j++; }
      }
      if (pendingSpace && result.length > 0) { result += ' '; pendingSpace = false; }
      result += ddl.slice(i, j);
      i = j;
    } else if (ddl[i] === '/' && i + 1 < n && ddl[i + 1] === '*') {
      // Block comment — treat as whitespace (pending space, suppress before ')')
      let j = i + 2;
      while (j + 1 < n && !(ddl[j] === '*' && ddl[j + 1] === '/')) { j++; }
      pendingSpace = true;
      i = j + 2;
    } else if (ddl[i] === '-' && i + 1 < n && ddl[i + 1] === '-') {
      // Line comment — treat as whitespace
      let j = i + 2;
      while (j < n && ddl[j] !== '\n') { j++; }
      pendingSpace = true;
      i = j;
    } else if (ddl[i] === ' ' || ddl[i] === '\t' || ddl[i] === '\n' || ddl[i] === '\r') {
      // Whitespace — defer to pendingSpace
      pendingSpace = true;
      i++;
    } else if (ddl[i] === ')') {
      // Suppress any pending space immediately before ')'
      pendingSpace = false;
      result += ')';
      i++;
    } else {
      // Any other character — flush pending space first
      if (pendingSpace && result.length > 0) { result += ' '; pendingSpace = false; }
      result += ddl[i];
      i++;
    }
  }

  result = result.replace(/\bIF\s+NOT\s+EXISTS\s+/gi, '');
  return result;
}

/**
 * Extract the column/constraint body from a CREATE TABLE DDL string.
 * Returns everything between the first '(' and last ')', trimmed.
 *
 * This makes detectSchemaVersion independent of whether the table name is quoted
 * ('CREATE TABLE reward_transactions (...)') or double-quoted
 * ('CREATE TABLE "reward_transactions" (...)' — the form SQLite stores after
 * ALTER TABLE RENAME). Both have identical bodies.
 *
 * Applied after canonicalizeDdl.
 */
function extractTableBody(ddl: string): string {
  const first = ddl.indexOf('(');
  const last = ddl.lastIndexOf(')');
  if (first === -1 || last === -1 || first >= last) return ddl;
  return ddl.slice(first + 1, last).trim();
}

// Pre-computed canonical bodies (computed once at module load).
const CANONICAL_SOURCE_BODY = extractTableBody(canonicalizeDdl(sourceCreateTable('reward_transactions')));
const CANONICAL_TARGET_BODY = extractTableBody(canonicalizeDdl(targetCreateTable('reward_transactions')));

// ── Supported index definitions (W03-R4: name + DDL) ─────────────────────────

const SUPPORTED_INDEX_CANONICAL = new Map<string, string>([
  ['idx_reward_txn_reward',
    canonicalizeDdl('CREATE INDEX idx_reward_txn_reward ON reward_transactions(reward_id)')],
  ['idx_reward_txn_allocation',
    canonicalizeDdl('CREATE INDEX idx_reward_txn_allocation ON reward_transactions(allocation_id)')],
  ['idx_reward_txn_idem',
    canonicalizeDdl('CREATE INDEX idx_reward_txn_idem ON reward_transactions(idempotency_key)')],
  ['idx_reward_txn_fund_ref_unique',
    canonicalizeDdl(
      `CREATE UNIQUE INDEX idx_reward_txn_fund_ref_unique ON reward_transactions(funding_reference)` +
      ` WHERE funding_reference IS NOT NULL AND transaction_type = 'fund'`
    )],
]);

// ── Explicit column list for INSERT SELECT (W03-R4) ──────────────────────────

const REWARD_TXN_COLUMNS = [
  'id', 'reward_id', 'allocation_id', 'source_account_type', 'source_bucket', 'source_user_id',
  'destination_account_type', 'destination_bucket', 'destination_user_id', 'actor_type', 'actor_user_id',
  'transaction_type', 'amount_stroops', 'currency_code', 'previous_state', 'new_state',
  'funding_source_type', 'funding_reference', 'source_event_id', 'idempotency_key', 'reason', 'metadata',
  'created_at',
] as const;

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * Inspect the given open connection and return the schema version of
 * reward_transactions.
 *
 * 'source'  — pre-W03-R2: exact match to schema-v117-fixture.sql canonical body
 * 'target'  — W03-R2+: exact match to current schema.sql / targetCreateTable() body
 * 'absent'  — reward_transactions table does not exist
 * 'unknown' — table exists but body matches neither supported canonical form
 *
 * W03-R4 fix:
 *   F1 (OR 1=1 appended to a CHECK): extra expression changes body → 'unknown'
 *   F2 (extra table-level CHECK): extra clause changes body → 'unknown'
 *   Missing checks, changed nullability, added columns, reordered: all → 'unknown'
 *   '--' inside a string literal: preserved (not stripped as comment)
 */
export function detectSchemaVersion(conn: SqliteDatabase): SchemaVersion {
  const row = conn.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='reward_transactions'"
  ).get() as { sql: string } | undefined;

  if (!row) return 'absent';

  const body = extractTableBody(canonicalizeDdl(row.sql));

  if (body === CANONICAL_TARGET_BODY) return 'target';
  if (body === CANONICAL_SOURCE_BODY) return 'source';
  return 'unknown';
}

/**
 * Query sqlite_master for unexpected or drifted indexes, triggers, and views on
 * reward_transactions. Returns diagnostic messages; empty = fully known-supported.
 *
 * W03-R3: unexpected index names refused.
 * W03-R4: additionally verifies DDL definition of each present supported-named index.
 */
function inventoryDependencies(conn: SqliteDatabase): string[] {
  const issues: string[] = [];

  const indexes = (conn.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='reward_transactions' ORDER BY name"
  ).all() as { name: string; sql: string | null }[]).filter(r => !r.name.startsWith('sqlite_autoindex_'));

  for (const idx of indexes) {
    const expectedCanonical = SUPPORTED_INDEX_CANONICAL.get(idx.name);
    if (expectedCanonical === undefined) {
      issues.push(`unexpected index: ${idx.name}`);
    } else {
      const actualCanonical = canonicalizeDdl(idx.sql ?? '');
      if (actualCanonical !== expectedCanonical) {
        issues.push(`drifted index definition: ${idx.name} (actual definition does not match expected)`);
      }
    }
  }

  const triggers = conn.prepare(
    "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='reward_transactions'"
  ).all() as { name: string }[];
  for (const trg of triggers) {
    issues.push(`unexpected trigger: ${trg.name}`);
  }

  const views = conn.prepare(
    "SELECT name FROM sqlite_master WHERE type='view' AND sql LIKE '%reward_transactions%'"
  ).all() as { name: string }[];
  for (const v of views) {
    issues.push(`unexpected view: ${v.name}`);
  }

  return issues;
}

/**
 * Open the database read-only and return a plan report without any mutation.
 */
export function planUpgrade(dbPath: string): PlanResult {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  const conn = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const newTableExists = conn.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='reward_transactions_new'"
    ).get();
    if (newTableExists) {
      throw new Error(
        `Partial-swap artifact detected: reward_transactions_new exists. ` +
        `An interrupted prior migration may have left the database in an inconsistent state. ` +
        `Inspect and remove reward_transactions_new manually or restore from pre-apply backup.`
      );
    }

    const schemaVersion = detectSchemaVersion(conn);

    if (schemaVersion === 'unknown') {
      throw new Error(
        `Unsupported schema: reward_transactions DDL matches neither the supported source nor target form. ` +
        `Manual recovery required. Do not apply this migration to an unsupported schema.`
      );
    }

    const alreadyAtTarget = schemaVersion === 'target' || schemaVersion === 'absent';

    if (!alreadyAtTarget) {
      const issues = inventoryDependencies(conn);
      if (issues.length > 0) {
        throw new Error(
          `Unsupported schema objects on reward_transactions detected; refusing before mutation. ` +
          `Issues: ${issues.join(', ')}. ` +
          `Investigate and remove or add explicit support before running this migration.`
        );
      }
    }

    const rowCount = schemaVersion === 'source'
      ? (conn.prepare('SELECT COUNT(*) as c FROM reward_transactions').get() as { c: number }).c
      : 0;

    const indexNames = schemaVersion === 'source'
      ? (conn.prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='reward_transactions' ORDER BY name"
        ).all() as { name: string }[]).map(r => r.name)
      : [];

    return { schemaVersion, rowCount, wouldApply: !alreadyAtTarget, alreadyAtTarget, indexNames };
  } finally {
    conn.close();
  }
}

/**
 * Apply the migration to the database at dbPath.
 *
 * W03-R4 reconstruction protocol:
 *   Phase 1: Pre-mutation checks (partial-swap, unknown schema, FK/integrity, dependency inventory)
 *   Phase 2: Reconstruction (legacy_alter_table=ON, foreign_keys=OFF, BEGIN, CREATE new,
 *            INSERT explicit columns, DROP old, RENAME, CREATE INDEX×4, FK/integrity checks
 *            INSIDE transaction, receipt write INSIDE transaction, COMMIT)
 *   Phase 3: Post-commit (legacy_alter_table=OFF, foreign_keys=ON, detectSchemaVersion verify)
 */
export function applyUpgrade(
  dbPath: string,
  options?: { _injectFailureAfterRename?: boolean }
): ApplyResult {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  const conn = new Database(dbPath, { fileMustExist: true });
  let foreignKeysRestored = false;

  try {
    // ── Phase 1: Pre-mutation checks ─────────────────────────────────────────

    const newTableExists = conn.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='reward_transactions_new'"
    ).get();
    const origTableExists = conn.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='reward_transactions'"
    ).get();

    if (newTableExists && !origTableExists) {
      throw new Error(
        `Partial-swap detected: reward_transactions_new exists but reward_transactions does not. ` +
        `An interrupted prior migration left the database in an inconsistent state. ` +
        `Manual recovery required: restore from pre-apply backup.`
      );
    }
    if (newTableExists && origTableExists) {
      throw new Error(
        `Partial-swap artifact detected: reward_transactions_new exists alongside reward_transactions. ` +
        `An interrupted prior migration may have left both tables present. ` +
        `Remove reward_transactions_new manually or restore from pre-apply backup.`
      );
    }

    const schemaVersion = detectSchemaVersion(conn);

    if (schemaVersion === 'target' || schemaVersion === 'absent') {
      return { success: true, rowsCopied: 0, alreadyAtTarget: true };
    }

    if (schemaVersion === 'unknown') {
      throw new Error(
        `Unsupported schema: reward_transactions DDL matches neither the supported source nor target form. ` +
        `Manual recovery required before applying this migration.`
      );
    }

    // Source schema confirmed.
    const preFkViolations = conn.pragma('foreign_key_check') as unknown[];
    if (preFkViolations.length > 0) {
      throw new Error(
        `Pre-existing FK violations detected (${preFkViolations.length} violation(s)). ` +
        `Refusing before reconstruction — original schema and data are unchanged. ` +
        `Repair the FK violations before applying this migration.`
      );
    }

    const preIntegrity = conn.pragma('integrity_check', { simple: true });
    if (preIntegrity !== 'ok') {
      throw new Error(
        `Pre-existing integrity errors detected: ${String(preIntegrity)}. ` +
        `Refusing before reconstruction — original schema and data are unchanged.`
      );
    }

    const issues = inventoryDependencies(conn);
    if (issues.length > 0) {
      throw new Error(
        `Unsupported schema objects on reward_transactions detected; refusing before mutation. ` +
        `Issues: ${issues.join(', ')}. ` +
        `Investigate and remove or add explicit support before running this migration.`
      );
    }

    // ── Phase 2: Reconstruction ───────────────────────────────────────────────

    const rowCount = (conn.prepare('SELECT COUNT(*) as c FROM reward_transactions').get() as { c: number }).c;
    console.log(`[W03-R4] ${MIGRATION_ID}: source schema confirmed, ${rowCount} rows`);
    console.log(`[W03-R4] IMPORTANT: Ensure a consistent WAL backup exists before applying.`);
    console.log(`[W03-R4]   sqlite3 "$DB" "PRAGMA wal_checkpoint(TRUNCATE);" && cp "$DB" "$DB.bak-pre-w03r4"`);

    conn.exec('PRAGMA legacy_alter_table = ON');
    conn.exec('PRAGMA foreign_keys = OFF');

    let rowsCopied = 0;
    const colList = REWARD_TXN_COLUMNS.join(', ');

    const migrate = conn.transaction(() => {
      conn.exec(targetCreateTable('reward_transactions_new'));

      // W03-R4: explicit column mapping — no assumption about source column order
      const result = conn.prepare(
        `INSERT INTO reward_transactions_new (${colList}) SELECT ${colList} FROM reward_transactions`
      ).run();
      rowsCopied = Number(result.changes);

      conn.exec('DROP TABLE reward_transactions');
      conn.exec('ALTER TABLE reward_transactions_new RENAME TO reward_transactions');

      if (options?._injectFailureAfterRename) {
        throw new Error('injected failure for testing — transaction will rollback');
      }

      conn.exec('CREATE INDEX idx_reward_txn_reward ON reward_transactions(reward_id)');
      conn.exec('CREATE INDEX idx_reward_txn_allocation ON reward_transactions(allocation_id)');
      conn.exec('CREATE INDEX idx_reward_txn_idem ON reward_transactions(idempotency_key)');
      conn.exec(
        `CREATE UNIQUE INDEX idx_reward_txn_fund_ref_unique ON reward_transactions(funding_reference)` +
        ` WHERE funding_reference IS NOT NULL AND transaction_type = 'fund'`
      );

      // F3 (W03-R3): checks inside transaction — failure auto-rolls back, no receipt written
      const postFkViolations = conn.pragma('foreign_key_check') as unknown[];
      if (postFkViolations.length > 0) {
        throw new Error(
          `foreign_key_check failed after reconstruction: ${postFkViolations.length} violation(s). ` +
          `Transaction will rollback — original table and data preserved.`
        );
      }

      const postIntegrity = conn.pragma('integrity_check', { simple: true });
      if (postIntegrity !== 'ok') {
        throw new Error(
          `integrity_check failed after reconstruction: ${String(postIntegrity)}. ` +
          `Transaction will rollback — original table and data preserved.`
        );
      }

      // updated_by is NULL: avoids FK violation on system_config.updated_by REFERENCES users(id)
      conn.prepare(
        `INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by)
         VALUES (?, datetime('now'), datetime('now'), NULL)`
      ).run(MIGRATION_ID);
    });

    migrate();

    // ── Phase 3: Post-commit verification ────────────────────────────────────

    conn.exec('PRAGMA legacy_alter_table = OFF');
    conn.exec('PRAGMA foreign_keys = ON');
    foreignKeysRestored = true;

    const finalVersion = detectSchemaVersion(conn);
    if (finalVersion !== 'target') {
      throw new Error(
        `Post-migration fingerprint check failed: expected 'target', got '${finalVersion}'. ` +
        `Migration was committed — manual inspection required.`
      );
    }

    console.log(`[W03-R4] Migration complete: ${rowsCopied} rows preserved, target schema confirmed.`);
    return { success: true, rowsCopied, alreadyAtTarget: false };

  } finally {
    if (!foreignKeysRestored) {
      try { conn.exec('PRAGMA foreign_keys = ON'); } catch { /* best-effort restore */ }
    }
    conn.close();
  }
}

// ── CLI entry point ──────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith('migrateRewardTxnCheck.ts') ||
    process.argv[1]?.endsWith('migrateRewardTxnCheck.js')) {
  const [,, mode, dbPath] = process.argv;

  if (!mode || !dbPath || (mode !== '--plan' && mode !== '--apply')) {
    console.error('Usage: npm run db:migrate-reward-txn-check -- --plan|--apply DATABASE_PATH');
    process.exit(1);
  }

  try {
    if (mode === '--plan') {
      const report = planUpgrade(dbPath);
      console.log('[W03-R4] Plan report:');
      console.log(`  Schema version : ${report.schemaVersion}`);
      console.log(`  Row count      : ${report.rowCount}`);
      console.log(`  Would apply    : ${report.wouldApply}`);
      console.log(`  Already target : ${report.alreadyAtTarget}`);
      console.log(`  Indexes        : ${report.indexNames.join(', ') || '(none)'}`);
      if (report.wouldApply) {
        console.log('[W03-R4] To apply: npm run db:migrate-reward-txn-check -- --apply DATABASE_PATH');
        console.log('[W03-R4] Rollback note: if release_unused rows exist after migration,');
        console.log('[W03-R4]   do NOT downgrade the schema. Forward-fix only.');
      } else {
        console.log('[W03-R4] Database is already at target schema — no migration needed.');
      }
    } else {
      const result = applyUpgrade(dbPath);
      if (result.alreadyAtTarget) {
        console.log('[W03-R4] Already at target schema — nothing to do.');
      } else {
        console.log(`[W03-R4] Applied: ${result.rowsCopied} rows preserved.`);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error('[W03-R4] Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
