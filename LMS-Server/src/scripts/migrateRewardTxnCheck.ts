/**
 * migrateRewardTxnCheck.ts
 *
 * W03-R2 — Offline migration: upgrade reward_transactions CHECK constraints to
 * include 'release_unused' transaction type.
 * W03-R3 — Corrected migration: F1 comment-bypass, F2 object inventory, F3 commit boundary.
 *
 * Version: 002-reward-transactions-check-upgrade
 * Source fingerprint: reward_transactions DDL lacks 'release_unused' in both the
 *   transaction_type CHECK and the compound source_user_id CHECK.
 * Target fingerprint: reward_transactions DDL has 'release_unused' in BOTH the
 *   transaction_type CHECK AND the compound source_user_id CHECK (after comment-strip).
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

// ── Target DDL ───────────────────────────────────────────────────────────────
// Verbatim from database/schema.sql (W03-R2 target), table name is a parameter.

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

// ── Supported explicit indexes (F2: these are the only non-autoindex indexes
//    this migration supports; any others cause a pre-mutation refusal) ────────

const SUPPORTED_INDEX_NAMES = new Set([
  'idx_reward_txn_reward',
  'idx_reward_txn_allocation',
  'idx_reward_txn_idem',
  'idx_reward_txn_fund_ref_unique',
]);

// ── DDL normalization helpers (F1 fix) ────────────────────────────────────────

/**
 * Strip SQL comments (both block /* ... * / and line -- ...) from a DDL string,
 * then collapse all whitespace sequences to a single space.
 * Used for pattern-based schema version detection that is immune to comment injection.
 */
function normalizeDdl(ddl: string): string {
  // Strip block comments (non-greedy, handles nested lines)
  let s = ddl.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Strip line comments
  s = s.replace(/--[^\n]*/g, ' ');
  // Collapse all whitespace (spaces, tabs, newlines) to single space
  return s.replace(/\s+/g, ' ').trim();
}

// Normalized fingerprint substrings for authoritative schema classification.
// Source and target patterns are mutually exclusive after normalization:
//   - source txn_type ends with 'expire') — target continues with , 'release_unused')
//   - source compound ends with 'expire') AND — target continues with , 'release_unused') AND

const SOURCE_TXN_TYPE_PATTERN =
  "transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire')";
const SOURCE_COMPOUND_PATTERN =
  "transaction_type IN ('reserve', 'cancel', 'expire') AND source_user_id IS NOT NULL";

const TARGET_TXN_TYPE_PATTERN =
  "transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire', 'release_unused')";
const TARGET_COMPOUND_IN_PATTERN =
  "transaction_type IN ('reserve', 'cancel', 'expire', 'release_unused') AND source_user_id IS NOT NULL";
const TARGET_COMPOUND_NOT_IN_PATTERN =
  "transaction_type NOT IN ('reserve', 'cancel', 'expire', 'release_unused')";

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * Inspect the given open connection and return the schema version of
 * reward_transactions.
 *
 * 'source'  — pre-W03-R2: 6-type transaction_type and 3-type compound check (no release_unused)
 * 'target'  — W03-R2+: 7-type transaction_type AND 4-type compound check (both include release_unused)
 * 'absent'  — reward_transactions table does not exist
 * 'unknown' — table exists but DDL matches neither source nor target fingerprint
 *
 * W03-R3 F1 fix: uses comment-stripped, whitespace-normalized DDL and requires BOTH
 * structural patterns (transaction_type CHECK and compound source_user_id CHECK) to
 * match for classification. SQL comments containing token strings do not certify compatibility.
 */
export function detectSchemaVersion(conn: SqliteDatabase): SchemaVersion {
  const row = conn.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='reward_transactions'"
  ).get() as { sql: string } | undefined;

  if (!row) return 'absent';

  const normalized = normalizeDdl(row.sql);

  // Target: BOTH the 7-type transaction_type CHECK and the 4-type compound CHECK must be present.
  // A schema with only one of the two is structurally incomplete — return 'unknown'.
  if (
    normalized.includes(TARGET_TXN_TYPE_PATTERN) &&
    normalized.includes(TARGET_COMPOUND_IN_PATTERN) &&
    normalized.includes(TARGET_COMPOUND_NOT_IN_PATTERN)
  ) {
    return 'target';
  }

  // Source: BOTH the 6-type transaction_type CHECK and the 3-type compound CHECK must be present,
  // AND 'release_unused' must not appear anywhere in the normalized DDL (rules out permissive OR
  // branches such as `OR transaction_type = 'release_unused'`). After comment stripping, a pure
  // source schema has zero occurrences of the token.
  if (
    normalized.includes(SOURCE_TXN_TYPE_PATTERN) &&
    normalized.includes(SOURCE_COMPOUND_PATTERN) &&
    !normalized.includes("'release_unused'")
  ) {
    return 'source';
  }

  return 'unknown';
}

/**
 * Query sqlite_master for unexpected explicitly-created indexes, triggers, and
 * views on reward_transactions. Returns an array of diagnostic messages;
 * empty means the schema object set is known-supported.
 *
 * W03-R3 F2 fix: both planUpgrade and applyUpgrade call this before any mutation.
 * SQLite autoindexes (names starting with sqlite_autoindex_) are excluded.
 */
function inventoryDependencies(conn: SqliteDatabase): string[] {
  const issues: string[] = [];

  // Explicit indexes (non-autoindex)
  const indexes = (conn.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='reward_transactions' ORDER BY name"
  ).all() as { name: string }[]).filter(r => !r.name.startsWith('sqlite_autoindex_'));

  for (const idx of indexes) {
    if (!SUPPORTED_INDEX_NAMES.has(idx.name)) {
      issues.push(`unexpected index: ${idx.name}`);
    }
  }

  // Triggers on or referencing reward_transactions
  const triggers = conn.prepare(
    "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='reward_transactions'"
  ).all() as { name: string }[];
  for (const trg of triggers) {
    issues.push(`unexpected trigger: ${trg.name}`);
  }

  // Views referencing reward_transactions (by name scan of view SQL)
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
 *
 * Throws if:
 *   - the database file is not found
 *   - reward_transactions_new already exists (partial-swap artifact)
 *   - reward_transactions has an unknown/unsupported schema
 *   - unexpected indexes, triggers, or views are found on reward_transactions
 */
export function planUpgrade(dbPath: string): PlanResult {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  const conn = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    // Partial-swap artifact detection (read-only check of sqlite_master)
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
        `Unsupported schema: reward_transactions DDL matches neither source nor target fingerprint. ` +
        `Manual recovery required.`
      );
    }

    const alreadyAtTarget = schemaVersion === 'target' || schemaVersion === 'absent';

    // Dependency inventory (F2): refuse if unexpected objects found
    if (!alreadyAtTarget) {
      const issues = inventoryDependencies(conn);
      if (issues.length > 0) {
        throw new Error(
          `Unsupported schema objects on reward_transactions detected; refusing before mutation. ` +
          `Unexpected objects: ${issues.join(', ')}. ` +
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
 * W03-R3 corrected reconstruction protocol:
 *
 * Phase 1 — Pre-migration read-only checks (FK enforcement ON):
 *   1. Partial-swap detection (extended: refuse if _new exists in any configuration)
 *   2. detectSchemaVersion — refuse if unknown; short-circuit if target/absent
 *   3. PRAGMA foreign_key_check — refuse if pre-existing violations
 *   4. PRAGMA integrity_check — refuse if not 'ok'
 *   5. inventoryDependencies — refuse if unexpected indexes/triggers/views
 *
 * Phase 2 — Reconstruction (all-or-nothing transaction):
 *   6. PRAGMA legacy_alter_table = ON  (outside transaction)
 *   7. PRAGMA foreign_keys = OFF       (outside transaction)
 *   8. BEGIN
 *   9. CREATE reward_transactions_new with target schema
 *  10. INSERT INTO _new SELECT * FROM reward_transactions
 *  11. DROP TABLE reward_transactions
 *  12. RENAME reward_transactions_new → reward_transactions
 *  13. CREATE INDEX × 4
 *  14. PRAGMA foreign_key_check  (inside transaction — throws → auto-ROLLBACK)
 *  15. PRAGMA integrity_check    (inside transaction — throws → auto-ROLLBACK)
 *  16. INSERT system_config migration receipt (inside transaction)
 *  17. COMMIT
 *
 * Phase 3 — Post-commit verification:
 *  18. PRAGMA foreign_keys = ON (in finally block)
 *  19. detectSchemaVersion — verify 'target'
 *
 * Options:
 *   _injectFailureAfterRename — for testing only: throws inside the transaction
 *     after the rename step to verify rollback behaviour.
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

    // Partial-swap detection (W03-R3 extended): refuse whenever _new exists,
    // regardless of whether the original table is also present.
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
        `Unsupported schema: reward_transactions DDL matches neither source nor target fingerprint. ` +
        `Manual recovery required before applying this migration.`
      );
    }

    // Source schema confirmed.

    // F3 fix: run FK and integrity checks BEFORE any mutation.
    // FK enforcement is ON at this point (connection default).
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

    // F2 fix: refuse if unexpected schema objects found
    const issues = inventoryDependencies(conn);
    if (issues.length > 0) {
      throw new Error(
        `Unsupported schema objects on reward_transactions detected; refusing before mutation. ` +
        `Unexpected objects: ${issues.join(', ')}. ` +
        `Investigate and remove or add explicit support before running this migration.`
      );
    }

    // ── Phase 2: Reconstruction ───────────────────────────────────────────────

    const rowCount = (conn.prepare('SELECT COUNT(*) as c FROM reward_transactions').get() as { c: number }).c;
    console.log(`[W03-R3] ${MIGRATION_ID}: source schema confirmed, ${rowCount} rows`);
    console.log(`[W03-R3] IMPORTANT: Ensure a consistent WAL backup exists before applying.`);
    console.log(`[W03-R3]   sqlite3 "$DB" "PRAGMA wal_checkpoint(TRUNCATE);" && cp "$DB" "$DB.bak-pre-w03r3"`);

    // PRAGMAs must be set outside the transaction
    conn.exec('PRAGMA legacy_alter_table = ON');
    conn.exec('PRAGMA foreign_keys = OFF');

    let rowsCopied = 0;

    const migrate = conn.transaction(() => {
      conn.exec(targetCreateTable('reward_transactions_new'));

      const result = conn.prepare(
        'INSERT INTO reward_transactions_new SELECT * FROM reward_transactions'
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

      // F3 fix: FK and integrity checks are now INSIDE the transaction.
      // If they fail, better-sqlite3 auto-rolls back and no receipt is written.
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

      // updated_by is NULL: the script is not a user; NULL avoids a FK violation
      // on system_config.updated_by REFERENCES users(id)
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

    console.log(`[W03-R3] Migration complete: ${rowsCopied} rows preserved, target schema confirmed.`);
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
      console.log('[W03-R3] Plan report:');
      console.log(`  Schema version : ${report.schemaVersion}`);
      console.log(`  Row count      : ${report.rowCount}`);
      console.log(`  Would apply    : ${report.wouldApply}`);
      console.log(`  Already target : ${report.alreadyAtTarget}`);
      console.log(`  Indexes        : ${report.indexNames.join(', ') || '(none)'}`);
      if (report.wouldApply) {
        console.log('[W03-R3] To apply: npm run db:migrate-reward-txn-check -- --apply DATABASE_PATH');
        console.log('[W03-R3] Rollback note: if release_unused rows exist after migration,');
        console.log('[W03-R3]   do NOT downgrade the schema. Forward-fix only.');
      } else {
        console.log('[W03-R3] Database is already at target schema — no migration needed.');
      }
    } else {
      const result = applyUpgrade(dbPath);
      if (result.alreadyAtTarget) {
        console.log('[W03-R3] Already at target schema — nothing to do.');
      } else {
        console.log(`[W03-R3] Applied: ${result.rowsCopied} rows preserved.`);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error('[W03-R3] Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
