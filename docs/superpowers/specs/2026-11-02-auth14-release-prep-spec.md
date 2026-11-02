# AUTH-14 Release Preparation — Developer Spec

> Version: 1.0  
> Date: 2026-11-02  
> Candidate: `d5191b9a778ea489eb9200936bd0e8fa0e7876dd` on `codex/auth14-release-prep`  
> Base: `e2c71e292c2be2683a4ee87008817ed34cc16023` (main, W09-R7)  
> Status: UNDER REVIEW — not yet authorized for deployment

---

## 1. Trigger and Motivation

The W03-R2 migration (`migration_002_reward_txn_check`) adds `release_unused` to the `reward_transactions.transaction_type` CHECK constraint. This migration was previously blocked by a pre-existing FK violation in production: `students[rowid=8]` references a missing `users` row. The prior migration guard refused any database with FK violations, which was correct fail-closed behaviour — but it also made the production migration permanently blocked until either the violation is resolved or the guard is extended to accept a reviewed, operator-supplied baseline.

AUTH-14 extends the guard to accept an explicit FK baseline: the operator provides a reviewed count and SHA-256 digest of the FK violation tuples, and the migration records and re-verifies this baseline throughout its transaction phases. The FK violation is preserved — the migration never deletes or repairs orphan rows.

Additionally, AUTH-14 repairs partial-stop handling in `release_recovery.py` (recovery proceeds even when the container was not fully healthy before stopping) and adds five new Python recovery tests covering gap/partial-stop scenarios.

---

## 2. Scope

**In scope (AUTH-14, d5191b9):**
- `LMS-Server/src/scripts/migrateRewardTxnCheck.ts` — FK baseline guard extension
- `LMS-Server/src/__tests__/reward-txn-check-migration.test.ts` — 7 new baseline guard tests
- `scripts/release_recovery.py` — partial-stop recovery improvement
- `scripts/tests/test_release_recovery.py` — 5 new recovery tests
- `docs/release/AUTH-14-fk-baseline-and-recovery.md` — operator documentation

**Explicitly out of scope:**
- The FK violation itself (operator decision: Options A, B, or C from maintenance procedure)
- Any change to `release_preflight.py`, `database.ts`, or `databaseBootstrap.ts`
- Frontend, mobile, or non-release-path code
- Monitoring, CI pipeline configuration, or deployment scripts

---

## 3. FK Baseline Guard

### 3.1 Invariants

1. **Without baseline**: any FK violation → migration refused with exit code 1.
2. **With baseline**: migration proceeds only if `current.count == baseline.count && current.sha256 == baseline.sha256`.
3. **Format validation**: baseline count must be a safe non-negative integer; hash must be 64 lowercase hex digits. Malformed arguments are a CLI error, not a state mismatch.
4. **No modification of orphan data**: the migration never deletes, repairs, or touches rows identified by FK violations.
5. **Receipt recording**: a successful baseline migration writes `migration_002_reward_txn_check_fk_baseline` (JSON `{fk_violation_count, fk_violations_sha256}`) to `system_config`, alongside the normal receipt.
6. **Re-verification**: FK baseline is checked at three points inside `applyUpgrade`: before the write lock, inside the transaction before reconstruction, and after reconstruction (before commit). A change between any two checks aborts the migration.

### 3.2 `fkEvidence(conn)` — fingerprint algorithm

Matches `release_preflight.database_metadata()` exactly:

```
rows = PRAGMA foreign_key_check  →  [ [table, rowid, parent, fkid], ... ]
sort by: json.dumps(row, separators=(', ', ': ')) ascending  (Python default repr)
digest = sha256( compact_json(sorted_rows) + '\n' )
```

Where `compact_json` uses `separators=(',', ':')` (no spaces) and `ensure_ascii=True`, with BMP code points above U+007E escaped as `\uXXXX`.

**Scope note:** The digest covers the violation tuples `[table, rowid, parent, fkid]` only — not every orphan-row column value or the missing parent key. Operators must separately examine the underlying private evidence.

### 3.3 `requireFkBaseline` error contract

| Condition | Error thrown |
|-----------|-------------|
| No baseline supplied, count > 0 | `Pre-existing FK violations detected (N violation(s)). Refusing before reconstruction` |
| Baseline supplied, count not a safe non-negative integer OR hash not 64 lowercase hex | `Invalid FK baseline format: count must be a non-negative integer and sha256 must be 64 hex digits` |
| Baseline supplied, current count ≠ baseline count OR current hash ≠ baseline hash | `Foreign key evidence differs from reviewed baseline; refusing migration` |
| No baseline, count == 0 | _(no error, proceeds)_ |
| Baseline supplied, current exactly matches | _(no error, proceeds)_ |

### 3.4 CLI interface

```
--plan  DATABASE_PATH
  Opens read-only. Reports schema version, row count, FK count and hash. No mutation.

--apply DATABASE_PATH
  No FK baseline: refuses if any violation present.

--apply DATABASE_PATH --fk-count COUNT --fk-sha256 HASH
  Requires exact match to reviewed baseline.
  COUNT: non-negative integer (no leading zeros except "0")
  HASH: 64 lowercase hex digits
```

### 3.5 Transaction protocol (Phase 2 — Reconstruction)

```
PRAGMA legacy_alter_table = ON
PRAGMA foreign_keys = OFF
BEGIN IMMEDIATE
  requireFkBaseline(conn, baseline)       ← inside transaction
  detectSchemaVersion == source check
  inventoryDependencies == [] check
  CREATE TABLE reward_transactions_new (target DDL)
  INSERT INTO reward_transactions_new SELECT ... FROM reward_transactions
  DROP TABLE reward_transactions
  ALTER TABLE reward_transactions_new RENAME TO reward_transactions
  CREATE INDEX × 4
  requireFkBaseline(conn, baseline)       ← after reconstruction, before commit
  integrity_check == 'ok'
  INSERT OR REPLACE INTO system_config (receipt)
  INSERT OR REPLACE INTO system_config (fk_baseline, if provided)
  requireFkBaseline(conn, baseline)       ← after receipt writes (trigger guard)
COMMIT
PRAGMA legacy_alter_table = OFF
PRAGMA foreign_keys = ON
detectSchemaVersion == 'target'           ← post-commit verification
```

---

## 4. Release Recovery — Partial-Stop Handling

### 4.1 Changed behaviour

`controlled_stop` in `release_recovery.py` previously called `current_containers` with default parameters, which require containers to be running and healthy (`require_running=True`). If an unhealthy candidate had been partially deployed, recovery would fail before it could stop the containers.

AUTH-14 changes `controlled_stop` to pass `require_running=False` and `validate_database_configuration=False`:

```python
known = current_containers(target, runner, require_running=False,
                           validate_database_configuration=False,
                           allowed_configs=allowed_configs)
```

All other identity gates (project, service name, checkout, overlay, mount) remain enforced. The DB environment validation is skipped only because the candidate may have been started with a bad environment before the failure. The stop still verifies container IDs before issuing `docker stop`.

### 4.2 Invariants

1. Container identity (project, service, checkout, overlay, mount) is verified before any stop command.
2. Container IDs are captured before `docker stop`; post-stop state is verified against those same IDs.
3. `validate_database_configuration=False` is limited to the stop path only; all recovery verification paths still validate DB configuration.
4. Partial stop is reported as `ROLLBACK_FAILED_SERVICES_STOPPED` (not `CONTAINMENT_UNVERIFIED`) when it succeeds.

### 4.3 New recovery test coverage (5 tests)

| Test | Scenario covered |
|------|-----------------|
| `test_stopped_snapshot_error_attempts_recovery` | Snapshot read fails after stop → recovery attempted |
| `test_overlay_write_error_attempts_recovery` | Overlay write fails → recovery attempted |
| `test_candidate_metadata_failure_attempts_recovery` | Candidate metadata failure → recovery attempted |
| `test_partial_stop_attempts_recovery` | Container unhealthy before stop → stop still proceeds |
| `test_stop_failure_reports_unverified_containment` | Stop itself fails → `CONTAINMENT_UNVERIFIED` reported |

---

## 5. Data Flow

### 5.1 FK evidence fingerprint flow

```
PRAGMA foreign_key_check
  → rows: [{table, rowid, parent, fkid}]
  → map to arrays: [[table, rowid, parent, fkid], ...]
  → sort by pythonJson(row, compact=false)   // Python default-repr order
  → compact JSON: [[...], [...], ...]
  → sha256(compact_json)
  → { fk_violation_count: N, fk_violations_sha256: hex }
```

### 5.2 CLI FK baseline argument flow

```
CLI args: --fk-count COUNT --fk-sha256 HASH
  → format validation (regex, isSafeInteger)
  → {fk_violation_count: Number(COUNT), fk_violations_sha256: HASH}
  → passed to applyUpgrade({ fkBaseline })
  → requireFkBaseline called 3× inside applyUpgrade
```

### 5.3 verify_policy data flow

```
validate_target(config, runner)
  → target['services']['api']['image_id']   ← running source image
  → target['services']['web']['image_id']   ← running source image

verify_policy(target, backup, policy):
  policy.images.api  ==  target['services']['api']['image_id']  (running AUTH-13)
  policy.images.web  ==  target['services']['web']['image_id']  (running AUTH-13)
  
  NOTE: These are NOT the new candidate image IDs.
  Candidate images are deployment evidence produced by CI/docker build.
  They become the running images only AFTER a successful deployment.
```

---

## 6. Transaction and Locking Behaviour

- `applyUpgrade` uses `conn.transaction()` with `.immediate()` (→ `BEGIN IMMEDIATE`), which acquires a write lock on BEGIN in SQLite WAL mode.
- Between the pre-transaction `requireFkBaseline` and the transaction's `BEGIN IMMEDIATE`, a brief window exists where an external writer could introduce a new FK violation. This window is expected to be empty in production because all application writers are stopped before migration runs.
- The in-transaction `requireFkBaseline` call (Phase 2, line 1) catches any such race.
- The receipt writes use `INSERT OR REPLACE` which could atomically overwrite an existing receipt key. The final `requireFkBaseline` call (Phase 2, line 3) guards against the hypothetical case where receipt-writing triggers introduce FK violations.
- `legacy_alter_table=ON` is required by SQLite for `DROP TABLE ... RENAME TO ...` sequences; it is restored to OFF after COMMIT (Phase 3).
- `foreign_keys=OFF` is required inside the transaction to allow the reconstruction (which temporarily violates FK constraints during the rename). It is restored to ON after COMMIT (Phase 3) and in the `finally` block.

---

## 7. Error Handling and Recovery Paths

### 7.1 Migration error paths

| Stage | Error | Effect |
|-------|-------|--------|
| Pre-transaction check | partial-swap detected | No mutation; error reported |
| Pre-transaction check | unknown schema | No mutation; error reported |
| Pre-transaction check | FK baseline mismatch | No mutation; error reported |
| Pre-transaction check | integrity_check fails | No mutation; error reported |
| Pre-transaction check | unexpected dependencies | No mutation; error reported |
| Inside transaction | any error (including injected failure) | ROLLBACK automatic; original table preserved |
| Post-commit check | schema not 'target' | Migration committed — **manual inspection required** |

The post-commit schema check failure is the only path where the migration may have committed but left the system in a potentially unexpected state. This is designed to be extremely rare (requires the table rename and index creation to succeed but the DDL to not match the canonical target form).

### 7.2 Recovery error paths (release_recovery.py)

| Stage | Error | Result |
|-------|-------|--------|
| `controlled_stop` fails | Container stop fails | `CONTAINMENT_UNVERIFIED` |
| `stopped_database_metadata` fails | DB read fails | `ROLLBACK_FAILED_SERVICES_STOPPED` |
| `verify_database_contract` fails after stop | Schema/financial drift | `ROLLBACK_FAILED_SERVICES_STOPPED` |
| `rollback` succeeds | Old image running, verified | `ROLLBACK_VERIFIED` |
| `deploy` fails, rollback succeeds | Old image restored | `DEPLOYMENT_FAILED_RECOVERY_VERIFIED` |
| `deploy` fails, rollback fails, stop succeeds | Services stopped | `DEPLOYMENT_FAILED_RECOVERY_REFUSED_SERVICES_STOPPED` |
| `deploy` fails, rollback fails, stop fails | Containment unverified | `DEPLOYMENT_FAILED_RECOVERY_REFUSED_CONTAINMENT_UNVERIFIED` |

---

## 8. Security and Privacy

- **FK baseline hash**: SHA-256 of the violation tuples. Operators must supply the hash independently from a reviewed, private copy of the database. The hash itself does not expose orphan row data.
- **No orphan data in receipts**: The `system_config` entry records only count and hash — not row values.
- **No FK deletion**: The migration never deletes or modifies rows referenced by FK violations.
- **Recovery policy gates**: `verify_policy` requires an independent review reference string (not generated automatically) and checks running source image IDs, schema hash, financial state hash, and FK evidence against independently captured values.
- **Private evidence files**: Recovery capture files are written to a 0700-permission directory with 0600 files. Symlink attacks are explicitly checked.
- **No credential exposure**: The migration script and recovery script do not accept or handle credentials. JWT_SECRET and other runtime secrets are environment variables consumed by the server binary, not this tool.

---

## 9. Backward Compatibility and Rollback

- AUTH-13 (running production image, OCI `dfb988ec`) accepts the post-migration target schema. Rolling back to AUTH-13 after migration is safe **provided no `release_unused` transaction rows exist**. Currently 0 `reward_transactions` rows exist, making the rollback window safe immediately after migration.
- After any `release_unused` rows are written, rolling back to AUTH-13 would silently fail to enforce the `release_unused` type — a forward-fix is required at that point.
- The migration is idempotent: calling `applyUpgrade` on an already-migrated database is a no-op (`alreadyAtTarget: true`).

---

## 10. Performance and Operational Effects

- Migration is offline (requires container stop). It runs on the host, not inside the container.
- Migration time: proportional to `reward_transactions` row count (currently 0). With 0 rows, migration is near-instantaneous.
- The migration acquires an exclusive write lock via `BEGIN IMMEDIATE`. No other SQLite writers can proceed during migration.
- `stopped_database_metadata` uses `immutable=1` mode only when WAL/SHM sidecars are absent (i.e., clean stop verified). This avoids creating sidecars that would interfere with subsequent operations.

---

## 11. Acceptance Criteria

### Automated (must pass in CI)

| Suite | Target | Evidence |
|-------|--------|---------|
| Full TypeScript backend (vitest run) | 2288/2288 | Clean install on `d5191b9`, Node v20.20.0 |
| `dependency-security.test.ts` | 3/3 | proxy-addr 2.0.8 via `npm ci` |
| `reward-txn-check-migration.test.ts` | 105/105 | Includes 7 new FK baseline guard tests |
| Python recovery tests | 50/50 | 32 subtests; includes 5 new partial-stop tests |
| TypeScript build (tsc --noEmit) | 0 errors | Node 22 base image |

### Manual / operational (not automated)

| Gate | Acceptance criterion |
|------|---------------------|
| Independent code review | Reviewer approves with no Critical/Important unresolved findings |
| FK violation governance | Operator selects A/B/C and applies to production DB before migration |
| Final FK baseline capture | Operator runs `--plan STOPPED_DB` on quiesced production DB, reviews output |
| Backup/restore drill | Restore from quiescence-time backup to isolated copy; verify integrity |
| Writer admission | All scheduled writers quiesced before migration window |
| Recovery policy review | Policy file filled with deployment-time values; `verify_policy` passes dry run |

---

## 12. Non-Goals

- Resolving the FK violation itself (orphan `students[rowid=8]` → missing `users` row)
- Automating the operator approval step
- Making the migration online (zero-downtime)
- Supporting additional migration source schemas beyond the documented `source` form
- Supporting multiple simultaneous FK violation baseline sets
- Modifying `release_preflight.py`, `databaseBootstrap.ts`, or any non-release-path code

---

## 13. Test Matrix

| # | Scenario | How tested | Result |
|---|----------|-----------|--------|
| 1 | No baseline, 0 violations → proceeds | COMPAT-F3, unit test | ✅ |
| 2 | No baseline, 1 violation → refused | COMPAT-F3 | ✅ |
| 3 | Correct baseline, 1 violation → proceeds | 7 new tests | ✅ |
| 4 | Baseline count mismatch → refused | new test | ✅ |
| 5 | Baseline hash mismatch → refused | new test | ✅ |
| 6 | Violation added between pre-TX and TX → refused in-TX | new test | ✅ |
| 7 | Violation added by receipt trigger → refused | new test (trigger guard) | ✅ |
| 8 | Bad count format (float) → CLI error | CLI validation | ✅ |
| 9 | Bad hash format (not 64 hex) → format error | new test + CLI | ✅ |
| 10 | Injected failure after rename → rollback, original preserved | COMPAT-ROLLBACK | ✅ |
| 11 | Partial-stop: unhealthy container → stop proceeds | `test_partial_stop_attempts_recovery` | ✅ |
| 12 | Stop fails → CONTAINMENT_UNVERIFIED | `test_stop_failure_reports_unverified_containment` | ✅ |
| 13 | Full deploy + verify + rollback cycle | deploy/rollback tests | ✅ |
| 14 | proxy-addr 2.0.8 trust boundary | `dependency-security.test.ts` 3/3 | ✅ |

---

## 14. Open Questions / Known Limitations

1. **Lone surrogate scope in `pythonJson`**: Characters U+D800–U+DFFF would produce malformed `\uXXXX` escapes, causing a hash mismatch vs. the Python digest. SQLite identifiers cannot contain lone surrogates in practice. Tracked as LOW-2 in the TODO ledger.

2. **`requireFkBaseline` format vs. state error distinction**: Pre-d5191b9 code uses a single error message for both format errors and state mismatches. Fixed in this candidate (see Phase 2, T6–T8 in TODO ledger).

3. **60-second rollback window**: The maintenance procedure notes "60 seconds bounds the outage" — this is not guaranteed. `verify_running` uses a 60-second deadline but the actual time depends on container startup, health check interval, and network conditions.

4. **Automatic rollback is not guaranteed**: The Python recovery script attempts rollback on deploy failure but cannot guarantee success if the host, Docker daemon, or network is also disrupted.
