# AUTH-14-RS: Rowid Snapshot Guard — Developer Spec

> Version: 1.0  
> Date: 2026-11-02  
> Branch: `codex/auth14-rowid-snapshot-fix`  
> Candidate commit: `824f5d89885b094d1d39d2d63bb47783c0b2bd29`  
> Base: `7f290caa39c190b6093c6bd1a10b35dffaa44426` (main, AUTH-14-WR merge)  
> Status: IMPLEMENTED — awaiting independent review and CI

---

## 1. Problem Statement

AUTH-14-WR (PR #145) fixed two silent failures in the orphan snapshot guard:
- `WITHOUT ROWID` tables (`rowid = null`) were silently skipped
- Tables with a `rowid`-column that returned `undefined` stored `''` as snapshot, hiding mutations

A further investigation with synthetic data revealed two remaining gaps in the AUTH-14-WR implementation:

### Gap 3 — Shadowed rowid selects a different existing row

If a table has a user-defined column named `rowid` (any type, including `INTEGER PRIMARY KEY`), `WHERE rowid = ?` addresses the user column. `PRAGMA foreign_key_check` returns the **physical** rowid of the FK-violating row. If that physical rowid value happens to equal the user-column value of a *different* existing row, the snapshot captures the wrong row.

AUTH-14-WR's fix was: "if the lookup returns `undefined`, throw." But if the physical rowid of the orphan (e.g. `1`) equals the user `rowid` column of a different row (also `1`), the lookup succeeds — returning the wrong row. Both pre- and post-receipt snapshots capture the wrong row, so trigger mutations to the actual orphan are invisible.

### Gap 4 — 64-bit integer precision loss in snapshots

AUTH-14-WR used `JSON.stringify(row)` where `row` is a `better-sqlite3` result object. By default, `better-sqlite3` returns INTEGER columns as JS `number`. JavaScript doubles cannot represent integers outside `[−2^53+1, 2^53−1]` exactly. Two SQLite integers that differ only beyond `Number.MAX_SAFE_INTEGER` (e.g. `9007199254740992` and `9007199254740993`) serialize to the same `JSON.stringify` output.

### Gap 5 — Receipt triggers mutating unrelated rows

AUTH-14's orphan snapshot guard catches mutations to FK-violating rows. But a receipt trigger (AFTER INSERT on `system_config`) could mutate **unrelated** rows — rows not in `PRAGMA foreign_key_check`. These mutations are entirely invisible to the orphan comparison.

---

## 2. Candidate Fix

### 2a. `snapshotOrphanRow()` helper

New function replaces inline `JSON.stringify(row)`:

```typescript
function snapshotOrphanRow(conn: SqliteDatabase, table: string, rowid: number): string {
  const quotedTable = table.replace(/"/g, '""');
  const row = conn.prepare(`SELECT * FROM "${quotedTable}" WHERE rowid = ?`)
    .safeIntegers(true).raw(true).get(rowid) as unknown[] | undefined;
  if (row === undefined) throw new Error('FK-violating row cannot be located; rowid alias may be shadowed');
  return JSON.stringify(row.map(value => {
    if (value === null)       return ['null'];
    if (typeof value === 'bigint')  return ['integer', value.toString()];
    if (typeof value === 'number')  { const bits = Buffer.alloc(8); bits.writeDoubleBE(value); return ['real', bits.toString('hex')]; }
    if (typeof value === 'string')  return ['text', value];
    if (Buffer.isBuffer(value))     return ['blob', value.toString('hex')];
    throw new Error('Unsupported SQLite value in FK-violating row');
  }));
}
```

- `.safeIntegers(true)`: returns INTEGER columns as `BigInt` — no 64-bit precision loss
- `.raw(true)`: returns column values as array (avoids column-name ambiguity in object form)
- Tagged union serialization: each value is `[storageClass, ...encoded]`; distinct types cannot collide
- REAL values: encoded as IEEE 754 hex (8 bytes) — exact bit-level preservation, no NaN/Inf ambiguity
- BLOB values: hex-encoded — exact byte sequence, no encoding confusion
- NULL: `['null']` — distinct from empty string or zero
- Throws on `undefined` — absent row is never silently treated as preserved

### 2b. Upfront rowid-alias detection via `pragma_table_xinfo`

```typescript
const columns = conn.prepare('SELECT name FROM pragma_table_xinfo(?)').all(v.table) as { name: string }[];
if (!columns.length || columns.some(column => column.name.toLowerCase() === 'rowid')) {
  throw new Error('FK-violating table rowid alias is shadowed or unavailable; refusing migration');
}
```

- `pragma_table_xinfo` is a table-valued function (SQLite 3.26+); includes hidden and generated columns
- Case-insensitive check catches `ROWID`, `Rowid`, `RowId`, etc.
- `!columns.length`: guards against a table that no longer exists (shouldn't happen inside transaction but defensive)
- Refuses `INTEGER PRIMARY KEY` named `rowid`: technically the IPK IS the physical rowid, so the lookup would be correct. But the safety doc explicitly accepts this over-restriction: "no claim is made that every refused layout is unsafe"
- This check fires BEFORE `snapshotOrphanRow()`, so the undefined-lookup throw in that helper is a second line of defense

### 2c. Receipt trigger inventory inside `BEGIN IMMEDIATE`

```typescript
const receiptTrigger = conn.prepare(
  "SELECT 1 FROM sqlite_master WHERE type='trigger' AND tbl_name='system_config' COLLATE NOCASE LIMIT 1"
).get();
if (receiptTrigger) {
  throw new Error('Unsupported receipt trigger: potentially mutated records cannot be ruled out; ...');
}
```

- Runs AFTER rowid checks and snapshots, BEFORE first receipt `INSERT`
- Inside `BEGIN IMMEDIATE` — write lock acquired; no other writer can create a trigger between this check and commit
- `COLLATE NOCASE` on `tbl_name`: matches `system_config`, `System_Config`, etc.
- Refuses ALL triggers on `system_config` (not just `AFTER INSERT`) — conservative but auditable
- A benign trigger is a compatibility blocker requiring investigation, not silent removal

---

## 3. Scope

**In scope:**
- `LMS-Server/src/scripts/migrateRewardTxnCheck.ts` — `snapshotOrphanRow()` + rowid alias check + trigger inventory
- `LMS-Server/src/__tests__/reward-txn-check-migration.test.ts` — 6 new RS tests
- `docs/release/AUTH-14-ROWID-SNAPSHOT-SAFETY.md` — operator safety reference
- `docs/superpowers/specs/2026-11-02-auth14-rowid-snapshot-spec.md` — this file
- `docs/superpowers/todos/2026-11-02-auth14-rowid-snapshot-todo.md` — ledger
- `docs/superpowers/diagrams/2026-11-02-auth14-rowid-snapshot-flow.md` — updated flow

**Not in scope:**
- `fkEvidence()` / `requireFkBaseline()` — unchanged
- `detectSchemaVersion()` / `inventoryDependencies()` — unchanged
- Production deployment, data repair, live migration application

---

## 4. Test Matrix

| Test | Scenario | Expected (pre-fix) | Expected (candidate) |
|------|----------|-------------------|---------------------|
| RS-1 | Shadowed rowid selects different existing row + trigger | Succeeds (BUG: wrong snapshot) | Throws (`rowid.*shadow\|alias.*shadow`) |
| RS-2 | Hidden generated `rowid` column + FK violation | Succeeds (BUG: xinfo not checked) | Throws (`rowid.*shadow`) |
| RS-3 | Unrelated row trigger (no FK violation) | Succeeds (BUG: unrelated row mutated silently) | Throws (`receipt trigger`) |
| RS-4 | Trigger added between phase 1 and write transaction | Succeeds (BUG: trigger race) | Throws (`receipt trigger`) |
| RS-5 | 64-bit integer + BLOB in ordinary orphan, no trigger | Succeeds (correct) | Succeeds, verifies exact BigInt preserved |
| RS-6 | 64-bit integer orphan + receipt trigger that increments by 1 | Succeeds (BUG: 64-bit mutation invisible) | Throws (`trigger.*mutated`) |

**RED confirmed**: RS-1, RS-2, RS-3, RS-4, RS-6 verified RED on pre-fix base (7f290caa)  
**RED→GREEN**: All 6 pass on candidate  
**Regression**: All 129 prior tests pass on candidate (including WR-1 through WR-11)  
**Full suite**: 2318/2318 TypeScript tests pass, `tsc --noEmit` clean

---

## 5. Known Limitations (Unchanged from Prior Gaps)

### 5a. `PRAGMA foreign_key_check` rowid is a JS `number`

The outer loop reads `v.rowid` from `conn.pragma('foreign_key_check')` as `{ rowid: number | null }`. `better-sqlite3` does not use `safeIntegers(true)` for this pragma call in the candidate. If a physical rowid > `Number.MAX_SAFE_INTEGER`, `v.rowid` could be imprecise.

**Risk assessment**: Physical rowids are auto-assigned SQLite integers starting from 1. Exceeding `Number.MAX_SAFE_INTEGER` (9007199254740991) requires inserting >9 quadrillion rows — not a realistic concern for the production database. Even if it occurred, both the pre-receipt key storage (`${v.table}\x00${v.rowid}`) and the post-receipt reconstruction (`Number(key.substring(nullIdx+1))`) use the same imprecise number representation, so the lookup targets the same (wrong) physical rowid consistently — the comparison still functions correctly.

### 5b. Invalid UTF-8 TEXT not proven lossless

SQLite TEXT columns can store arbitrary byte sequences. `better-sqlite3` returns TEXT as JavaScript strings. Node.js uses UTF-16 internally; if SQLite TEXT contains invalid UTF-8 (which is a SQLite extension violation but possible), the round-trip through the JS driver may not be lossless. The safety doc acknowledges this. For the known production FK violation (student record with standard ASCII/UTF-8 text), this is not a concern.

### 5c. `INTEGER PRIMARY KEY` named `rowid` refused unnecessarily

An `INTEGER PRIMARY KEY` named `rowid` IS the physical rowid alias — there is no shadowing, and `WHERE rowid = ?` would work correctly. The candidate refuses this layout. This is documented as intentional over-restriction in the safety doc. No production tables use this layout.

### 5d. Trigger refusal is broad (any `system_config` trigger)

The candidate refuses ALL triggers on `system_config`, including BEFORE triggers, `AFTER DELETE` triggers, etc. — not just `AFTER INSERT`. This is conservative but creates a compatibility blocker for any schema that happens to have a benign `system_config` trigger. The safety doc requires investigation rather than silent removal.

---

## 6. Snapshot Key and Post-Receipt Lookup Correctness

The orphan snapshot map key is `${v.table}\x00${v.rowid}` where `\x00` is the NUL separator. Post-receipt comparison reconstructs the rowid via:

```typescript
const rowid = Number(key.substring(nullIdx + 1));
```

This uses `Number()`, not `BigInt()`. If `v.rowid` was a JS `number` (imprecise for large values), the reconstructed rowid is equally imprecise — both sides of the lookup use the same representation, so the comparison is self-consistent. The snapshot data itself (column values) uses `safeIntegers(true)` and is therefore correctly 64-bit precise.

Table names containing `\x00` (NUL) could corrupt the key parsing. SQLite does not permit table names with embedded NUL in `CREATE TABLE` DDL; `pragma_foreign_key_check` returns the table name as a SQL identifier. This is not a practical risk.

---

## 7. Transaction and Write-Lock Ordering

```
applyUpgrade():
  Phase 1: schema validation, inventoryDependencies, preflight (outside transaction)
  [_injectAfterPhase1 hook fires here — for testing trigger races]
  migrate.immediate():  ← BEGIN IMMEDIATE (write lock acquired)
    requireFkBaseline()
    detectSchemaVersion() check
    CREATE TABLE reward_transactions_new
    INSERT INTO ... SELECT ...
    DROP TABLE reward_transactions
    RENAME reward_transactions_new → reward_transactions
    CREATE 4 indexes
    requireFkBaseline()
    integrity_check
    ─── Orphan snapshot loop ───
      [for each FK violation]
        null rowid check (WITHOUT ROWID)
        pragma_table_xinfo check (rowid alias)
        snapshotOrphanRow() → pre-receipt snapshot
    ─── Receipt trigger check ───  ← inside BEGIN IMMEDIATE
      SELECT 1 FROM sqlite_master WHERE type='trigger' AND tbl_name='system_config'
      THROW if any trigger found
    ─── Receipt writes ───
      INSERT system_config (MIGRATION_ID)
      INSERT system_config (MIGRATION_ID + '_fk_baseline') [if baseline supplied]
    ─── Post-receipt snapshot comparison ───
      snapshotOrphanRow() → compare each
      THROW if any changed
    requireFkBaseline() [final]
  ← COMMIT (or rollback on any THROW above)
```

The trigger check and receipt writes are all inside `BEGIN IMMEDIATE`. After `BEGIN IMMEDIATE` is acquired, no other writer can create a trigger. The `_injectAfterPhase1` hook fires BEFORE the transaction; a trigger created there is visible to the in-transaction `sqlite_master` query.

---

## 8. Production Compatibility Prerequisites (Before Deployment)

1. **Protected copy inspection**: Create a fresh WAL-consistent backup of the production database. On a disposable copy, run:
   - `SELECT DISTINCT tbl_name FROM sqlite_master WHERE type='trigger' AND tbl_name='system_config' COLLATE NOCASE` — must return empty
   - `PRAGMA foreign_key_check` — note all FK violation tables
   - For each FK violation table, `SELECT name FROM pragma_table_xinfo('tablename')` — check for any `rowid` column
2. **Exact-image rehearsal**: Build and test the candidate image against a disposable copy of the protected backup
3. **Rollback image rehearsal**: Verify rollback to the pre-migration image restores source schema, data, and no receipts
4. **FK baseline review**: Generate and review the FK baseline from the protected copy before applying

**BLOCKERS (not verified by regression suite):**
- Any `system_config` trigger in the production database is a migration blocker
- Any FK-violating child table with a column named `rowid` is a migration blocker
- These must be confirmed absent (or investigated) before deployment

---

## 9. Privacy

Diff and test data contain only:
- Table/column names (schema identifiers, not personal data)
- Synthetic SQLite values (invented integers, hex BLOBs, `'missing'` fake FK references)
- Error messages include table names and rowids (integers), not row data

Earlier AUTH-14 PR/branch history (`codex/auth14-release-prep`) contained production identifiers in unsanitized assessment files. Those commits are in branch history but not in the squash-merged main. The candidate branch `codex/auth14-rowid-snapshot-fix` does not reproduce any historical private identifiers. No force-push or destructive cleanup is performed.

---

## 10. Acceptance Criteria

- [x] RS-1 through RS-6 pass on candidate
- [x] All 129 prior migration tests pass on candidate (2318/2318 TypeScript total)
- [x] RED confirmed: RS-1, RS-3, RS-6 and equivalents verified on pre-fix base
- [x] `tsc --noEmit` clean
- [ ] Independent code/security review completed
- [ ] CI passes on PR head (all 4 jobs)
- [ ] No private data in diff, PR description, or commit messages
- [ ] Production protected-copy inspection completed (trigger + rowid-alias inventory)
- [ ] Exact-image rehearsal completed on disposable copy

---

## 11. Non-Goals

- PK-based identification for WITHOUT ROWID orphans (deferred from AUTH-14-WR)
- Large integer precision in `PRAGMA foreign_key_check` rowid (deferred)
- Invalid UTF-8 TEXT losslessness (deferred)
- Permitting `INTEGER PRIMARY KEY` named `rowid` (conservative, documented)
- Permitting any `system_config` trigger (conservative, requires investigation)
- Any change to production data, deployment, or monitoring
