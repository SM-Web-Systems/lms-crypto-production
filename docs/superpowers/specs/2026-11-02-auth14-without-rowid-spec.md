# AUTH-14-WR: WITHOUT ROWID orphan preservation — Developer Spec

> Version: 1.0  
> Date: 2026-11-02  
> Branch: `codex/auth14-without-rowid-20261102`  
> Base: `69c2f1da5bb4c622d9a8a2ee7a6285a560c8ba9e` (main, AUTH-14 merge)  
> Status: IMPLEMENTED — awaiting CI and independent review

---

## 1. Problem Statement

The AUTH-14 migration (`migrateRewardTxnCheck.ts`) added an orphan-row snapshot guard to detect receipt trigger mutations. The guard snapshots every FK-violating row before writing migration receipts and compares the snapshot after. This addressed the "silent mutation" attack via an `AFTER INSERT` trigger on `system_config`.

However, the snapshot loop contained two distinct gaps:

### Gap 1 — WITHOUT ROWID tables

SQLite's `PRAGMA foreign_key_check` returns `rowid = NULL` for FK violations in `WITHOUT ROWID` tables (these tables have no implicit integer rowid). The merged loop contained:

```typescript
for (const v of preReceiptViolations) {
  if (v.rowid !== null) {    // ← silently skips WITHOUT ROWID violations
    ...snapshot...
  }
}
```

A `WITHOUT ROWID` child table with a pre-existing FK violation was simply not snapshotted. A receipt trigger that mutated a non-FK column in that orphan row went completely undetected. The migration reported success, `requireFkBaseline` passed (FK violation tuple unchanged), but the orphan had changed.

### Gap 2 — Rowid-alias shadowing

SQLite has three rowid aliases: `rowid`, `_rowid_`, `oid`. If a table declares a user-defined column with one of these names (and that column is not `INTEGER PRIMARY KEY`), that alias is shadowed — `WHERE rowid = ?` addresses the user-defined column, not the physical rowid.

`PRAGMA foreign_key_check` always returns the **physical** integer rowid. But the snapshot lookup:

```typescript
const row = conn.prepare(`SELECT * FROM "${quotedTable}" WHERE rowid = ?`).get(v.rowid);
```

With a `rowid TEXT PRIMARY KEY` column, `WHERE rowid = integer` compares TEXT to INTEGER and finds no row. The original code stored `''` on `undefined` for both pre- and post-receipt snapshots, making any trigger mutation invisible:

```typescript
orphanSnapshots.set(key, row === undefined ? '' : JSON.stringify(row));  // ← bug
```

Pre-receipt: `''`. Trigger fires, changes orphan. Post-receipt: `''`. `'' === ''` → no error.

---

## 2. Scope

**In scope:**
- `LMS-Server/src/scripts/migrateRewardTxnCheck.ts` — orphan snapshot loop only (minimal change)
- `LMS-Server/src/__tests__/reward-txn-check-migration.test.ts` — 10 new regression tests (WR-1 to WR-10)
- `docs/superpowers/specs/`, `docs/superpowers/todos/`, `docs/superpowers/diagrams/` — this spec and supporting artifacts

**Not in scope:**
- `fkEvidence()` / `requireFkBaseline()` — unchanged
- `detectSchemaVersion()` / `inventoryDependencies()` — unchanged
- Python release recovery scripts — unchanged
- Any production schema change, migration application, or deployment

---

## 3. Chosen Fix: Fail Closed

The simplest safe option: fail closed before the receipt write whenever a pre-existing FK violation cannot be identified by rowid.

### Condition 1 — Null rowid (WITHOUT ROWID table)

If `v.rowid === null`, throw immediately:

```
FK violation in table "X" (parent "P", fkid N) reports a null rowid —
this table is likely WITHOUT ROWID. The migration cannot identify and preserve
this row by rowid; resolve the FK violation before applying this migration.
```

### Condition 2 — Rowid lookup returns undefined (alias shadowing)

If `v.rowid !== null` but `SELECT * FROM "X" WHERE rowid = v.rowid` returns `undefined`, throw:

```
FK-violating row in table "X" with rowid N could not be located —
the "rowid" alias may be shadowed by a user-defined column.
The migration cannot safely snapshot this row; resolve the FK violation before applying.
```

### Why fail closed and not identify by PK?

A more capable alternative would query `PRAGMA table_info(table)` to find PRIMARY KEY columns for WITHOUT ROWID tables and compose an alternative lookup. This was evaluated and rejected for this iteration:

1. **PRIMARY KEY composition is complex**: composite PKs, quoting, type affinity, NULL handling.
2. **Scope is narrow**: the production FK violation is in an ordinary rowid table. The WITHOUT ROWID path does not apply to the known production case.
3. **Fail closed is safe and auditable**: the operator must resolve the violation before applying. The migration never silently accepts an unverifiable state.

The fail-closed approach satisfies the invariant: "an absent lookup must never silently count as preservation."

---

## 4. SQLite WITHOUT ROWID Semantics

- `WITHOUT ROWID` is declared explicitly in DDL: `CREATE TABLE t (...) WITHOUT ROWID`.
- Such tables have no implicit integer rowid; all rows are identified by the declared PRIMARY KEY.
- `detectSchemaVersion()` already classifies `WITHOUT ROWID reward_transactions` as `'unknown'` (W03-R5 fix): the migration would refuse before even reaching the orphan loop for the migration's own target table.
- The gap applies to **other tables** in the schema that happen to be `WITHOUT ROWID` and have FK violations, e.g. a `WITHOUT ROWID` child table referencing `users`.

---

## 5. Source/Target/Absent Contracts — Unchanged

This fix does not alter the source/target/absent migration state machine:

| State | Behavior |
|-------|----------|
| `source` | Migration proceeds; orphan snapshot loop now fails closed on null/undefined rowid |
| `target` | Early return (alreadyAtTarget); FK baseline validated if supplied (unchanged) |
| `absent` | Early return (alreadyAtTarget); FK baseline validated if supplied (unchanged) |
| `unknown` | Migration refused before any mutation (unchanged) |

---

## 6. FK Count/Hash Limitations

`fkEvidence()` fingerprints `[table, rowid, parent, fkid]` tuples only. It does **not** cover:
- Orphan row column values
- Missing parent key values
- `WITHOUT ROWID` row identity (rowid is null in the tuple)

For WITHOUT ROWID tables, the FK violation tuple includes `rowid = null`. Two different orphan rows in the same WITHOUT ROWID table would produce identical tuples `[table, null, parent, fkid]` (only differentiated by count). The fingerprint cannot distinguish them individually.

This is an additional reason to fail closed: `requireFkBaseline` alone cannot verify which specific row changed in a WITHOUT ROWID table.

---

## 7. Receipt-Trigger Side Effects

The orphan snapshot guard protects against `AFTER INSERT` triggers on `system_config`. The trigger fires when the migration receipt key (`migration_002_reward_txn_check`) is inserted. The guard:

1. Snapshots all FK-violating rows **before** the receipt INSERT.
2. Writes both receipts (`MIGRATION_ID` and `MIGRATION_ID + '_fk_baseline'`).
3. Compares snapshots **after** the receipts.
4. Rolls back (throws) if any snapshot changed.

With the fix, this loop now also throws before step 1 for any null-rowid or unlocatable row, meaning the trigger never even fires for these cases.

---

## 8. Identifier Quoting

Table names with embedded double-quotes are handled by `v.table.replace(/"/g, '""')` (escaping for double-quoted identifiers in SQL). This was added in the merge remediation and remains unchanged in this fix.

---

## 9. Data Fidelity: Large Integers and BLOBs

### Large integers
`better-sqlite3` returns integer column values as JavaScript `number` by default. JavaScript float64 cannot exactly represent integers outside `[−2^53+1, 2^53−1]`. `JSON.stringify` of two values that differ only beyond `Number.MAX_SAFE_INTEGER` may produce identical output.

The existing `pythonJson()` function throws on unsafe integers (used for FK fingerprinting). The orphan snapshot uses `JSON.stringify` directly and does not have this protection.

For the known production FK violation, all column values are within safe integer range (the orphan is a student record with standard TEXT/INTEGER columns). This is a known limitation, documented here.

**Mitigation path (future):** Use `better-sqlite3`'s `.safeIntegers(true)` to return BigInt for large values, then serialize with a BigInt-aware serializer. This would be a separate, scoped change.

### BLOBs
`better-sqlite3` returns BLOB columns as Node.js `Buffer` objects. `JSON.stringify(Buffer.from([1,2,3]))` produces `{"type":"Buffer","data":[1,2,3]}`. Two distinct BLOB values produce distinct JSON strings. BLOB mutations are correctly detected. Test WR-10 verifies this.

---

## 10. Transaction and Concurrent-Change Handling

All orphan snapshotting and receipt writes occur inside `migrate.immediate()` (a `BEGIN IMMEDIATE` transaction). Once the write lock is acquired, no other writers can modify orphan rows between the pre-receipt snapshot and the post-receipt comparison. The fail-closed check for null rowid also happens inside the transaction.

---

## 11. Rollback

The entire migration runs inside a single `better-sqlite3` transaction function. If any step throws (including the new null-rowid and undefined-lookup checks), the transaction rolls back atomically:

- `reward_transactions` stays at `source` schema
- No migration receipts are written to `system_config`
- Orphan row values are unchanged
- Indexes are not created

Tests WR-3 verifies this for the WITHOUT ROWID case. The existing COMPAT-ROLLBACK tests verify the ordinary rollback path.

---

## 12. Privacy

The fix does not touch or log orphan row values. Error messages include table name and physical rowid (or fkid for the null-rowid case). These are schema identifiers, not personal data.

The production FK violation (a student record) is not affected by this fix: the production violation is in an ordinary rowid table (users), not a WITHOUT ROWID table. The fail-closed check on null rowid does not apply to the known production case.

---

## 13. Test Matrix

| Test | Type | Scenario | Expected (before fix) | Expected (after fix) |
|------|------|----------|----------------------|----------------------|
| WR-1 | RED→GREEN | WITHOUT ROWID + trigger mutation | Succeeds (bug) | Throws (null rowid) |
| WR-2 | RED→GREEN | WITHOUT ROWID, no trigger | Succeeds (incomplete) | Throws (null rowid) |
| WR-3 | RED→GREEN | WITHOUT ROWID refusal rollback | Schema: target (bug) | Schema: source, no receipt |
| WR-4 | RED→GREEN | rowid-alias-shadowed + trigger mutation | Succeeds (bug) | Throws (undefined lookup) |
| WR-5 | RED→GREEN | rowid-alias-shadowed, no trigger | Succeeds (incomplete) | Throws (undefined lookup) |
| WR-6 | GREEN | `_rowid_`-shadowed + trigger mutation | Trigger detected (correct) | Trigger detected (no regression) |
| WR-7 | GREEN | `oid`-shadowed + trigger mutation | Trigger detected (correct) | Trigger detected (no regression) |
| WR-8 | RED→GREEN | Mixed null + non-null rowid violations | Succeeds (bug) | Throws (null rowid) |
| WR-9 | GREEN | Ordinary rowid orphan + baseline | Migrates (correct) | Migrates (no regression) |
| WR-10 | GREEN | BLOB mutation in ordinary orphan | Detected (correct) | Detected (no regression) |

---

## 14. Acceptance Criteria

- [x] WR-1 through WR-10 pass
- [x] All 2301 prior TypeScript tests pass (total 2311 with new tests)
- [x] `tsc --noEmit` clean
- [ ] CI passes on PR head
- [ ] Independent code/security review completed
- [ ] No private data in diff, PR description, or commit messages

---

## 15. Non-Goals

- Implementing PK-based identification for WITHOUT ROWID orphans (deferred, low production urgency)
- Protecting against large integer precision loss in orphan snapshots (deferred, separate concern)
- Any change to production data, deployment, or monitoring
- Resolving the production FK violation (operator decision, tracked separately)
