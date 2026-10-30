/**
 * migrateRewardTxnCheck.ts
 *
 * W03-R2 — Offline migration: upgrade reward_transactions CHECK constraints to
 * include 'release_unused' transaction type.
 *
 * Version: 002-reward-transactions-check-upgrade
 * Source fingerprint: reward_transactions DDL does NOT contain 'release_unused'
 * Target fingerprint: reward_transactions DDL contains 'release_unused' in both
 *   the transaction_type CHECK AND the source_user_id compound CHECK
 *
 * Usage:
 *   npm run db:migrate-reward-txn-check -- --plan  DATABASE_PATH
 *   npm run db:migrate-reward-txn-check -- --apply DATABASE_PATH
 *
 * Safety:
 *   --plan  Opens read-only. Reports proposed changes. No mutation.
 *   --apply Validates source fingerprint, reconstructs table in a single
 *           transaction, validates target fingerprint, runs FK + integrity checks.
 *           All-or-nothing: if it fails, reward_transactions is unchanged.
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

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * Inspect the given open connection and return the schema version of
 * reward_transactions.
 *
 * 'source'  — pre-W03-R2: no 'release_unused' in CHECK constraints
 * 'target'  — W03-R2+: 'release_unused' present in CHECK constraints
 * 'absent'  — reward_transactions table does not exist
 * 'unknown' — table exists but DDL matches neither source nor target fingerprint
 */
export function detectSchemaVersion(conn: SqliteDatabase): SchemaVersion {
  const row = conn.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='reward_transactions'"
  ).get() as { sql: string } | undefined;

  if (!row) return 'absent';

  const sql = row.sql;
  if (sql.includes("'release_unused'")) return 'target';
  // Source schema has exactly these six transaction types
  if (sql.includes("'fund', 'reserve', 'release', 'cancel', 'refund', 'expire'")) return 'source';
  return 'unknown';
}

/**
 * Open the database read-only and return a plan report without any mutation.
 *
 * Throws if:
 *   - the database file is not found
 *   - reward_transactions has an unknown/unsupported schema
 */
export function planUpgrade(dbPath: string): PlanResult {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  const conn = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const schemaVersion = detectSchemaVersion(conn);

    if (schemaVersion === 'unknown') {
      throw new Error(
        `Unsupported schema: reward_transactions DDL matches neither source nor target fingerprint. ` +
        `Manual recovery required.`
      );
    }

    const alreadyAtTarget = schemaVersion === 'target' || schemaVersion === 'absent';
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
 * Reconstruction protocol (all-or-nothing transaction):
 *   1. PRAGMA legacy_alter_table = ON  (outside transaction)
 *   2. PRAGMA foreign_keys = OFF       (outside transaction)
 *   3. BEGIN
 *   4. CREATE reward_transactions_new with target schema
 *   5. INSERT INTO _new SELECT * FROM reward_transactions
 *   6. DROP TABLE reward_transactions
 *   7. RENAME reward_transactions_new → reward_transactions
 *   8. CREATE INDEX × 4
 *   9. INSERT system_config migration key
 *  10. COMMIT
 *  11. PRAGMA foreign_keys = ON
 *  12. PRAGMA foreign_key_check
 *  13. PRAGMA integrity_check
 *  14. Validate target fingerprint
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

    // Source schema confirmed — proceed
    const rowCount = (conn.prepare('SELECT COUNT(*) as c FROM reward_transactions').get() as { c: number }).c;
    console.log(`[W03-R2] ${MIGRATION_ID}: source schema confirmed, ${rowCount} rows`);
    console.log(`[W03-R2] IMPORTANT: Ensure a consistent WAL backup exists before applying.`);
    console.log(`[W03-R2]   sqlite3 "$DB" "PRAGMA wal_checkpoint(TRUNCATE);" && cp "$DB" "$DB.bak-pre-w03r2"`);

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

      // updated_by is NULL: the script is not a user; NULL avoids a FK violation
      // on system_config.updated_by REFERENCES users(id)
      conn.prepare(
        `INSERT OR REPLACE INTO system_config (key, value, updated_at, updated_by)
         VALUES (?, datetime('now'), datetime('now'), NULL)`
      ).run(MIGRATION_ID);
    });

    migrate();

    // Post-commit: restore FK enforcement and verify
    conn.exec('PRAGMA foreign_keys = ON');
    foreignKeysRestored = true;

    const fkViolations = conn.pragma('foreign_key_check') as unknown[];
    if (fkViolations.length > 0) {
      throw new Error(
        `foreign_key_check failed after migration: ${fkViolations.length} violation(s). ` +
        `Restore from pre-apply backup.`
      );
    }

    const integrityResult = conn.pragma('integrity_check', { simple: true });
    if (integrityResult !== 'ok') {
      throw new Error(
        `integrity_check failed after migration: ${String(integrityResult)}. ` +
        `Restore from pre-apply backup.`
      );
    }

    const finalVersion = detectSchemaVersion(conn);
    if (finalVersion !== 'target') {
      throw new Error(
        `Post-migration fingerprint check failed: expected 'target', got '${finalVersion}'.`
      );
    }

    console.log(`[W03-R2] Migration complete: ${rowsCopied} rows preserved, target schema confirmed.`);
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
      console.log('[W03-R2] Plan report:');
      console.log(`  Schema version : ${report.schemaVersion}`);
      console.log(`  Row count      : ${report.rowCount}`);
      console.log(`  Would apply    : ${report.wouldApply}`);
      console.log(`  Already target : ${report.alreadyAtTarget}`);
      console.log(`  Indexes        : ${report.indexNames.join(', ') || '(none)'}`);
      if (report.wouldApply) {
        console.log('[W03-R2] To apply: npm run db:migrate-reward-txn-check -- --apply DATABASE_PATH');
        console.log('[W03-R2] Rollback note: if release_unused rows exist after migration,');
        console.log('[W03-R2]   do NOT downgrade the schema. Forward-fix only.');
      } else {
        console.log('[W03-R2] Database is already at target schema — no migration needed.');
      }
    } else {
      const result = applyUpgrade(dbPath);
      if (result.alreadyAtTarget) {
        console.log('[W03-R2] Already at target schema — nothing to do.');
      } else {
        console.log(`[W03-R2] Applied: ${result.rowsCopied} rows preserved.`);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error('[W03-R2] Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
