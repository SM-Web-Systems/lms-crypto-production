# AUTH-14 Assessment Findings

**Candidate:** `d5191b9a778ea489eb9200936bd0e8fa0e7876dd`  
**Reviewed against:** `e2c71e292c2be2683a4ee87008817ed34cc16023` (main HEAD, W09-R7)  
**Assessment date:** 2026-11-01 (updated 2026-11-02)  
**Assessor:** Claude Code (isolated rehearsal on disposable copies, no production changes)

---

## 1. Code and Image Identities

### Running production (AUTH-13)

| Component | Value |
|---|---|
| API image SHA256 | `b92d9447d14e97b9b6d41beb486e0dc295d23b36f9612c0125e1a0b10e573b02` |
| API revision label | `dfb988ec4a553f61b110c0e483c1b176312f7906` |
| Web image SHA256 | `5f7d4d1ee6495fc0d94a2e15b32e9e6c55b42a8f` (first 10: `5f7d4d1ee6`) |
| Web revision label | `dfb988ec4a553f61b110c0e483c1b176312f7906` |
| Compose file | `/home/webadmin/lms-crypto-production/docker-compose.yml` |
| Overlay file | `/home/webadmin/backups/lms-ammawallet-db/release-state/deploy-f48ce68548cf4a0a8c3ae8d92fa60a52.json` |
| DB volume | `lms-ammawallet_lms-data` |
| DB host path | `/var/lib/docker/volumes/lms-ammawallet_lms-data/_data` |
| Health | Both containers running/healthy at assessment time |

### Candidate (AUTH-14)

| Component | Value |
|---|---|
| Commit | `d5191b9a778ea489eb9200936bd0e8fa0e7876dd` |
| Message | `fix(release): preserve reviewed FK baseline and guard recovery` |
| Branch | `codex/auth14-release-prep` |
| Base | `e2c71e2` (1 commit ahead) |
| Rehearsal image | `lms-ammawallet-api:auth14-rehearsal` (AUTH-13 base + AUTH-14 dist layer) |
| Rehearsal image SHA256 | `847d93409e03291ed6417aaac761da57ae8e442f38eb59760e497f9bbed97ea8` |
| Build note | Network-isolated rehearsal build; npm packages identical to AUTH-13 (package-lock.json unchanged) |
| **Clean candidate API image** | `lms-api:auth14-candidate-d5191b9` (fresh `docker build` + `npm ci` from lockfile) |
| **Clean API image SHA256** | `f9e76c2e88f219053435dcfd7c247f1d35ed1c726b25c5a9f8567b90a236f50f` |
| **Clean candidate web image** | `lms-web:auth14-candidate-d5191b9` (fresh `docker build` + `npm ci` from lockfile) |
| **Clean web image SHA256** | `a216a4b59a7681a60586f9cc8cefeb9083039edc57005cbc238fee62550f9d45` |
| **Clean build note** | 2026-11-02; base images cached locally; npm registry used for deps; no ports, no secrets, no publishing. Web image built without VITE_CLERK_PUBLISHABLE_KEY — not a production web candidate. |

---

## 2. Production Database State

### Live snapshot (WAL-consistent, taken 2026-11-01 via `sqlite3.backup()` from read-only source)

| Field | Value |
|---|---|
| Snapshot SHA256 | `4fcb8b95d820d6e5a49fd54350a83fcc7ce1ecadfb19a698e44326ce27cc0897` |
| Size | 19,202,048 bytes |
| Schema version | `source` (pre-W03-R2, `release_unused` absent) |
| FK violation count | 1 |
| FK violations SHA256 | `feb85f1d118b2bfcf24da4f94f7ac7f7d0597f8b6593521cea0aeb7432fea59e` |
| Violation | `students[rowid=8] → users (fkid=0)` |
| Student id | `a4fb562d-2d86-41cc-bc22-a1ec30f2ffea` |
| Student user_id | `c63ba3a0-9ff1-48c5-95cb-f14dd269f853` |
| Student name | `Smoke Test` |
| reward_transactions rows | 0 |
| system_config rows | 0 (no migration receipts yet) |

FK algorithm matches Python `release_preflight.database_metadata()` exactly:
`sha256(json.dumps(sorted_tuples, separators=(',',':')))` where tuples `[table, rowid, parent, fkid]` are sorted by `json.dumps(row)` with default separators.

The snapshot belongs to the running production service and its orphan identity is **unchanged** from the pre-AUTH-13 backup (`pre-deploy-93bb3b827a5d40c4a99f0998327086c7.sqlite3`, SHA256 `8bc9106af3ba2f96b58944da77760e55b6ba57449f7bfe99968e7cdfd6d9fd62`).

The orphan row and complete missing-parent evidence were privately captured. The FK digest covers violation tuples only — not every orphan column value or missing parent key. No reward or balance rows reference the orphan student.

**The snapshot at `student_ms_snapshot.db` is kept immutable. Only disposable copies were modified.**

---

## 3. Test Results

### TypeScript (Vitest) — d5191b9, Linux, Node 20.20.0

#### Run 1: stale install (worktree node_modules — proxy-addr 2.0.7, express 4.22.2)

```
Test Files:  193 passed | 1 failed (194 total)
Tests:       2287 passed | 1 failed (2288 total)
Duration:    464s
```

The single failure is in `dependency-security.test.ts:15`:
```
expect(trust('203.0.113.10')).toBe(false)  // got: true
```
**Cause:** installed `proxy-addr` 2.0.7 (stale — differs from lockfile). The lockfile (`lockfileVersion: 3`) specifies `proxy-addr` 2.0.8 at `node_modules/proxy-addr`. The worktree node_modules were carried over from the AUTH-13 checkout and were never updated with `npm ci` on the candidate lockfile.

#### Run 2: clean isolated install — 2026-11-02 (`npm ci` from candidate lockfile)

**Environment:** `/home/webadmin/auth14-clean-ci/LMS-Server` (git archive of d5191b9, no node_modules)  
**npm ci:** installed proxy-addr **2.0.8**, express **4.22.3** (both per lockfile)

```
Test Files:  194 passed (194)
Tests:       2288 passed (2288)
Duration:    470s
```

**dependency-security.test.ts: 3/3 PASS** — CVE confirmed absent from clean locked install.

The prior failure was entirely due to stale installation, not a flaw in the candidate source or lockfile.

#### Migration tests (reward-txn-check-migration.test.ts): 105/105 passed

All 7 new FK baseline tests pass:
- `matches Python ensure_ascii compact fingerprint for Unicode evidence` (hash `3bf5c631...`)
- `matches Python ordering, nulls, control characters and astral Unicode` (hash `f41b46da...`)
- `preserves the orphan with the reviewed baseline and refuses by default`
- `rolls back when a receipt trigger introduces a new violation`
- `refuses added evidence between checks`
- `refuses removed evidence between checks`
- `refuses changed evidence between checks`

### Python (pytest) — d5191b9

```
50 passed, 32 subtests passed (0 failed)
```

All 5 new gap/partial-stop tests pass:
- `test_stopped_snapshot_error_attempts_recovery`
- `test_overlay_write_error_attempts_recovery`
- `test_candidate_metadata_failure_attempts_recovery`
- `test_partial_stop_attempts_recovery`
- `test_stop_failure_reports_unverified_containment` (→ `CONTAINMENT_UNVERIFIED`)

### TypeScript build (tsc --noEmit)

Clean. 0 errors.

---

## 4. Migration Rehearsal (Disposable Copy)

Commands run against `/home/webadmin/auth14-rehearsal/snapshot/migration_rehearsal_copy.db` (copy of immutable snapshot, **not** the original):

```
$ node_modules/.bin/tsx src/scripts/migrateRewardTxnCheck.ts \
    --plan migration_rehearsal_copy.db

[W03-R4] Plan report:
  Schema version : source
  Row count      : 0
  Would apply    : true
  Already target : false
  FK count       : 1
  FK SHA256      : feb85f1d118b2bfcf24da4f94f7ac7f7d0597f8b6593521cea0aeb7432fea59e
```

FK hash independently confirmed against Python algorithm: **match**.

```
$ node_modules/.bin/tsx src/scripts/migrateRewardTxnCheck.ts \
    --apply migration_rehearsal_copy.db \
    --fk-count 1 \
    --fk-sha256 feb85f1d118b2bfcf24da4f94f7ac7f7d0597f8b6593521cea0aeb7432fea59e

[W03-R4] migration_002_reward_txn_check: source schema confirmed, 0 rows
[W03-R4] Migration complete: 0 rows preserved, target schema confirmed.
[W03-R4] Applied: 0 rows preserved.
```

**Post-migration verification:**
- Schema: `release_unused` present in `reward_transactions` CHECK ✓
- Orphan: `students[rowid=8]` unchanged (id `a4fb562d`, user_id `c63ba3a0`, name `Smoke Test`) ✓
- FK baseline: count=1, sha256=`feb85f1d...` (unchanged from pre-migration) ✓
- Receipts: `migration_002_reward_txn_check` (timestamp) and `migration_002_reward_txn_check_fk_baseline` (count+sha256 JSON) ✓
- Plan on migrated copy: `Already target: true` ✓

**Fail-closed confirmed:** Without `--fk-count`/`--fk-sha256`, migration refuses:
```
[W03-R4] Error: Pre-existing FK violations detected (1 violation(s)). Refusing before reconstruction
exit_code=1
```

---

## 5. Image Rehearsal

**Build method:** AUTH-13 base + AUTH-14 compiled `dist/` layer (network-isolated; packages identical to AUTH-13, package-lock.json unchanged at that time). Rehearsal image does NOT substitute for a clean CI build from source.

#### Clean candidate images — 2026-11-02

Built from `git archive d5191b9` in `/home/webadmin/auth14-clean-ci/` using `docker build --no-cache`. Base images were cached locally (`node:22-bookworm-slim`, `node:22-alpine`). npm registry used for `npm ci` dependency resolution. No ports exposed, no production secrets used, images not published.

| Image | SHA256 | OCI revision |
|---|---|---|
| `lms-api:auth14-candidate-d5191b9` | `f9e76c2e88f219053435dcfd7c247f1d35ed1c726b25c5a9f8567b90a236f50f` | `d5191b9a778ea489eb9200936bd0e8fa0e7876dd` |
| `lms-web:auth14-candidate-d5191b9` | `a216a4b59a7681a60586f9cc8cefeb9083039edc57005cbc238fee62550f9d45` | `d5191b9a778ea489eb9200936bd0e8fa0e7876dd` |

**Web image caveat:** built without `VITE_CLERK_PUBLISHABLE_KEY`. Static assets will not have a Clerk key embedded. Not a production web candidate. A production web build requires the actual key at build time.

| Scenario | Image | DB | Result |
|---|---|---|---|
| Candidate + unmigrated | `auth14-rehearsal` (d5191b9) | source schema | **REFUSED**: "pre-W03-R2 (missing release_unused)" ✓ |
| Candidate + migrated | `auth14-rehearsal` (d5191b9) | target schema | **Bootstrap accepted**, FK violation noted, fails on missing `JWT_SECRET` ✓ |
| AUTH-13 + migrated | `lms-ammawallet-api:latest` | target schema | **Bootstrap accepted**, FK violation noted, fails on missing `JWT_SECRET` ✓ |
| CVE runtime test | `lms-api:auth14-candidate-d5191b9` (clean build) | N/A | proxy-addr 2.0.8 confirmed; `trust('203.0.113.10')` = **false** ✓ |

Key observations:
- The candidate correctly refuses the source schema with an actionable error message
- The candidate accepts the migrated schema; the orphan is reported informally but not blocking
- AUTH-13 (current production) also accepts the migrated schema → **image-level rollback is compatible** with the migrated database
- Rollback safety after `release_unused` writes: AUTH-13 image accepts the target schema but would silently permit transactions it cannot write (it predates the `release_unused` type). With 0 `reward_transactions` rows currently, no `release_unused` rows will exist immediately after migration. The risk is theoretical at this moment.
- **Database bootstrap alone does not establish general rollback safety** after financial writes or application state changes.

---

## 6. Review Findings

### LOW: combined error message in `requireFkBaseline`

`requireFkBaseline` throws a single error for both format/range violations (bad count, malformed hash) and state mismatches (count or hash differs). The message says "evidence differs from reviewed baseline" for what may actually be a bad CLI argument. Not blocking: the CLI's own validation catches malformed args before the function is reached. But adding a format check before the state check would improve operator diagnostics.

### LOW: `ensure_ascii` scope in `pythonJson`

The `replace(/[\u007f-\uffff]/g, ...)` handles Basic Multilingual Plane code points. Lone surrogates (`\uD800–\uDFFF`) would produce incorrect escape sequences and mismatch the Python digest. SQLite table names from PRAGMA are constrained to valid SQLite identifiers; lone surrogates in table names are pathological. Not a current production risk, but worth noting for future robustness.

### RESOLVED: `proxy-addr 2.0.7` IPv4-mapped IPv6 subnet trust expansion (2026-11-02)

The candidate lockfile already pins `proxy-addr` to **2.0.8**. With a clean `npm ci` run, 2.0.8 is installed and the test **passes** (3/3). The prior failure was caused by stale installation (proxy-addr 2.0.7 from an uncleaned node_modules from the AUTH-13 state). The lockfile is correct; no dependency change is needed. The CVE is patched in the candidate's clean-install state.

Confirmed inside `lms-api:auth14-candidate-d5191b9` (clean Docker build):
```
proxy-addr version in image: 2.0.8
trust(203.0.113.10) via ::ffff:10.0.0.0/8: false
CVE test: PASS
```

---

## 7. Untracked Files Preservation Procedure

### `LMS-Frontend/src/__tests__/loading-states-w09r4.test.tsx`

Working tree is an earlier draft vs the complete candidate version:

| | Working tree | Candidate (e2c71e2) |
|---|---|---|
| SHA256 | `7d1dd2af...` | `8ff92ff3...` |
| Extra `act` in import | Yes | No |
| Test R3-7 (`handleApplyCertificate invocation guarded`) | Missing | Present |

The working tree version is an earlier draft. The candidate version is complete.

**Preservation procedure** (before any merge, stash, or worktree operations on the active checkout):
```bash
mkdir -p ~/auth14-rehearsal/untracked-backup/LMS-Frontend/src/__tests__/
cp LMS-Frontend/src/__tests__/loading-states-w09r4.test.tsx \
   ~/auth14-rehearsal/untracked-backup/LMS-Frontend/src/__tests__/loading-states-w09r4.test.tsx
sha256sum ~/auth14-rehearsal/untracked-backup/LMS-Frontend/src/__tests__/loading-states-w09r4.test.tsx
# Expected: 7d1dd2af4d3d05d41f2d2c446aabd31c19e01c3e67d72393327268516d1c4de5
```

After preservation, a reviewer must decide: keep the working-tree draft (missing R3-7) or adopt the candidate's complete version. The candidate version is recommended — R3-7 tests the certificate guard path that was part of W09-R3.

### `docs/superpowers/plans/2026-10-30-w02-closure-follow-up.md`

Local-only; not in any remote commit. Safe to keep as-is. No action needed before AUTH-14 release.

### `docs/superpowers/plans/2026-11-01-lms-auth14-release-prep.md`

Created this session. Local plan file, not part of the candidate. No action needed before release.

---

## 8. Maintenance Window and Writer Analysis

### Pre-stop gates (must run against LIVE, running DB)

1. `scripts/release_preflight.py` captures: schema_sha256, financial_state_sha256, FK state, image identities
2. The capture is a snapshot in time. The release lock prevents parallel release operations but does **not** freeze application writers.
3. Active writers during a running deployment:
   - Reward expiry worker: writes to `reward_transactions`, `reward_accounts`
   - Event outbox worker: writes to `reward_event_outbox`
   - Email retry worker: writes to `email_outbox`
   - Deletion finalization: writes to `deleted_user_identities`, `deletion_requests`, `students`
   - Incoming payment callbacks (Paystack, Stellar XRP): write to `payments`, `reward_transactions`
   - Session writes: `active_sessions`
   - Health check pings: `health_check_pings`

4. **Critical ordering**: Run preflight, then stop services immediately after. Stopping the API before preflight invalidates the preflight gates (schema, financial state may differ from what was captured).

5. `verify_database_contract()` re-checks schema_sha256, financial_state_sha256, and FK state against the backup after stop. Any financial write between preflight and stop causes a mismatch → deployment refused. This is the intended fail-safe.

6. The W03 migration must run on the STOPPED database (no active writers) using the exact FK baseline from the stopped DB snapshot, not this rehearsal snapshot.

### Migration window ordering

```
1. Preflight: capture baseline against LIVE db
2. Maintenance notice / drain period (user-facing requests complete)
3. Stop services
4. Verify stopped DB matches preflight baseline
5. Take fresh WAL-consistent backup of stopped db
6. Run: --plan <stopped_db_path>  (verify FK hash matches)
7. Run: --apply <stopped_db_path> --fk-count 1 --fk-sha256 <verified_hash>
8. Verify post-migration schema and FK baseline (plan shows target)
9. Start candidate image
10. Verify startup and health
11. If startup fails: rollback to AUTH-13 image (schema stays migrated; AUTH-13 accepts it)
```

**Rollback note**: After step 7, the schema cannot be safely rolled back if any `release_unused` transactions are written. Currently 0 `reward_transactions` rows exist, so the risk window is very narrow. A failed start (step 9→10) can roll back to AUTH-13 image safely.

**No guaranteed rollback duration.** The maintenance window should be as short as possible.

---

## 9. Remaining Gates Before Production Decision

| Gate | Status | Notes |
|---|---|---|
| Candidate review | **DONE** — LOW findings only | See §6 |
| Test suite (migration 105/105) | **DONE** | |
| Test suite (recovery 50/50) | **DONE** | |
| Full TypeScript suite | **DONE** — 1 pre-existing failure | proxy-addr CVE, separate ticket |
| TypeScript build clean | **DONE** | |
| Production orphan verified | **DONE** | Snapshot + today's backup confirm count=1, hash=`feb85f1d...` |
| Snapshot WAL-consistent | **DONE** | Via `sqlite3.backup()` from read-only source |
| Migration rehearsal on snapshot copy | **DONE** | Pass, orphan preserved |
| Fail-closed without baseline | **DONE** | Confirmed |
| Image rehearsal: candidate refuses source schema | **DONE** | |
| Image rehearsal: candidate accepts migrated schema | **DONE** | |
| Image rehearsal: AUTH-13 accepts migrated schema (rollback compat) | **DONE** | |
| **proxy-addr CVE resolved** | **DONE** | Lockfile already pins 2.0.8; clean `npm ci` installs 2.0.8; `dependency-security.test.ts` 3/3 PASS; CVE patched in image |
| **Candidate images built from clean source** | **DONE** | `lms-api:auth14-candidate-d5191b9` and `lms-web:auth14-candidate-d5191b9` built 2026-11-02; API image verified. Web image missing Clerk key — production web build still needs key at build time |
| **CI pipeline run** | **OPEN** | Branch `codex/auth14-release-prep` not yet submitted to CI; no check-runs on d5191b9 or branch tip 1af91e7 |
| **Policy file reviewed** | **OPEN** | `images.api`/`images.web` must identify running candidate images; currently identify AUTH-13 |
| **Final FK baseline recaptured from quiesced prod DB** | **OPEN** | Rehearsal hash is not deployment approval |
| **Backup/restore drilled on final snapshot** | **OPEN** | Restore drill on quiesce-time backup |
| **Writer admission sequence approved** | **OPEN** | Confirm scheduler, callbacks, and email workers are quiesced or tolerate brief outage |

---

## 10. Next Concrete Actions

**Owner/operator decision required:**

1. ~~**proxy-addr CVE**~~ — **RESOLVED** (2026-11-02). Lockfile is correct; clean install installs 2.0.8; test passes. No action needed.

2. **CI** — submit PR from `codex/auth14-release-prep` against main. CI must run the full test suite including the migration and recovery tests. The proxy-addr failure will **not** appear with a clean CI `npm ci` run (confirmed locally). Branch has zero CI runs today.

3. ~~**Clean image build**~~ — **DONE** (2026-11-02). `lms-api:auth14-candidate-d5191b9` (`f9e76c2e...`) and `lms-web:auth14-candidate-d5191b9` (`a216a4b5...`) built from clean source. Production web image still needs `VITE_CLERK_PUBLISHABLE_KEY` at build time.

4. **Maintenance window schedule** — decide the quiesce window, finalize the writer admission procedure, and capture the final FK baseline from the stopped production DB immediately before migration.

**Next single action:** Submit a PR from `codex/auth14-release-prep` → main to trigger CI. All tests should pass 2288/2288 with the clean install. The proxy-addr and image blockers are resolved.

---

*This document is an assessment only. The live production database was not modified. All migration and image rehearsals used disposable copies. The hashes in §4 are rehearsal-time values and must be recaptured from the actual quiesced production database before any production migration.*
