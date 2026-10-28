# W01-R3 / PR #108 — upgrade and reference identity correction

Date: 2026-10-28. Decision: **CHANGES_REQUIRED — keep R3 and W01 open; do not advance to W02.** The clean-database guard works, but the upgrade path and legacy reference identity need correction.

Repository: `SM-Web-Systems/lms-crypto-production` (`https://github.com/SM-Web-Systems/lms-crypto-production.git`). This packet is on documentation branch `codex/platform-wiring-audit`. Authoritative ledgers are on `codex/staged-rollout-plan` (PR #103). Neither branch is a separate repository.

## Verified receipt

- [PR #108](https://github.com/SM-Web-Systems/lms-crypto-production/pull/108) merged at `7a23f8829684bc031b0f9a9641bf9b881e170395`, head `b852d5c58e736d89837df646345948802694ce7e`, base `17d93f0490078c41f76785927b8cd265218434e3`.
- [PR CI 40716729026](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40716729026) and [main CI 40717848878](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40717848878): all four jobs SUCCESS. Main backend job `122920297013`: **183 files passed, 1,881 tests passed, one skipped (1,882 total)**; the 15 R3 tests passed.
- Planning PR #103 reviewed at `a9c75ec286a1a44a997f55b81461d325a67e5053`.
- Independent source review identified the two implementation concerns below and the missing acceptance coverage. Local isolated probes then confirmed the implementation issues and positive controls. A successful CI run does not establish tests covered these cases.

## R3-F1 — Existing database rejected before upgrade (P1)

The new partial UNIQUE index is added to canonical `schema.sql`. [`databaseBootstrap.ts:12`](https://github.com/SM-Web-Systems/lms-crypto-production/blob/7a23f8829684bc031b0f9a9641bf9b881e170395/LMS-Server/src/config/databaseBootstrap.ts#L12) derives expected key signatures from that schema. Its pre-migration validation calls `validateKeys()` unconditionally at [line 57](https://github.com/SM-Web-Systems/lms-crypto-production/blob/7a23f8829684bc031b0f9a9641bf9b881e170395/LMS-Server/src/config/databaseBootstrap.ts#L57), and existing databases undergo this read-only validation at [line 117](https://github.com/SM-Web-Systems/lms-crypto-production/blob/7a23f8829684bc031b0f9a9641bf9b881e170395/LMS-Server/src/config/databaseBootstrap.ts#L117).

A valid pre-R3 database lacks the new constraint. It is therefore refused before the writable connection and `ensureRewardTables()` migration can add the index. This is an upgrade blocker, not evidence of production data corruption.

**Confirmed reproduction:** use the actual pre-R3 source at `17d93f0` to initialize a new synthetic file database through its explicit initialization API, then reopen it successfully with that old source. Opening the same file with merged R3 source exits 1 with:

```text
Database startup refused: missing unique constraint (reward_transactions).
```

The main SQLite file's SHA256 remained unchanged after refusal. Fresh R3 database initialization succeeds, which explains why clean-schema tests do not detect the upgrade failure.

**Required correction:** allow only the explicitly supported additive R3 constraint to be absent in pre-migration validation, then enforce the complete constraint strictly after migration. Preserve read-only preflight and every unrelated schema/key/integrity guard. Do not introduce a blanket missing-unique exemption or silently continue without the guard. Test actual file-backed old-source startup/upgrade and rollback behavior.

## R3-F2 — New normalization and historical identity disagree (P2, blocking closure)

The implementation's `normalizeReference()` trims every nonblank reference before lookup/storage. Migration duplicate detection and the UNIQUE index compare historical raw values. The previous writer persisted the supplied reference verbatim.

Consequently, a historical `" ref "` and new `"ref"` can both remain fund entries even though the new normalizer maps both to `"ref"`. A raw UNIQUE index does not enforce that chosen canonical identity. The R3 spec itself is contradictory: its identity table says not to trim opaque references, while its example and implementation do trim them.

**Confirmed in-memory legacy fixture:** create a legitimate independently authorized grant, seed its synthetic historical reference metadata as `" legacy-<id> "` (representing the pre-R3 writer), and fund a second reward with `"legacy-<id>"` using the actual merged service. Both are funded; querying by the implemented trimmed identity finds two fund rows. The fixture changes only synthetic in-memory metadata. No production occurrence, real provider behavior or deployed exploit is asserted. Currently, F1 prevents the ordinary old-file upgrade; F2 must also be resolved when making that upgrade reachable.

**Required correction:** choose one explicit identity policy and apply it consistently to new input, old values, lookups, migration and database enforcement. Preserving exact nonblank opaque references, as the spec states, is one minimal option; approved canonicalization requires a compatible legacy strategy and identical database/application semantics. Do not trim only new rows, blindly lowercase provider IDs or rewrite/delete immutable history to install a constraint. Reject or flag ambiguous historical groups safely where reconciliation is necessary. Preserve the intended policy for optional-reference internal grants and denied external sources.

## R3-F3 — Acceptance tests overstate coverage (P2)

The current test file does not prove several reported guarantees:

| Test | Actual behavior | Needed regression |
| --- | --- | --- |
| T01 | Calls synchronous funding sequentially | Concurrently start two async calls before either commits; assert one winner, one 409 and one credit/reservation |
| T02 / T06 | Direct INSERT uses a nonexistent reward ID and generic `toThrow()` | Valid parent/reward IDs and the specific funding-reference UNIQUE error; no FK false positive |
| T04 | Successfully funds, retries an already funded reward and catches any error | Inject failure after the funding write but before commit; assert rollback of state/accounts/reference and successful legitimate retry |
| T11 | Finds an index on the already-created schema | Run the actual startup upgrade from a valid prior file schema, then reopen and validate enforcement |
| T12 | Inserts only one reference and asserts the duplicate query is empty | Create actual duplicate legacy groups and invoke real startup/migration; assert controlled refusal and preserved data |

Also cover the selected legacy identity policy, repeated upgrade, valid alternate writers and relevant reference permanence after lifecycle operations. Correct misleading names/comments and ledger assertions. Do not claim historical RED evidence for cases that were not executed.

## Local verification: positives and failures

The [service harness](../audits/2026-10-28-w01-r3-review.probe.ts.txt) ran on an isolated extraction of merge `7a23f88`, using Node `v22.18.0`, the installed tsx loader, the matching dependency lock, synthetic configuration and `DATABASE_PATH=:memory:`, `VITEST=true`, `NODE_ENV=test`. Exact Git blob checks matched the extracted service, verifier, bootstrap and database migration to the reviewed merge.

Observed, process exit 0:

```text
CONTROL_PASS: concurrent async grants produce one winner, one 409, one credit/reservation
CONTROL_PASS: injected post-fund reserve failure rolls back state/accounts/reference; retry succeeds
CONTROL_PASS: valid alternate-writer INSERT fails the funding-reference UNIQUE constraint
DEFECT_CONFIRMED: historical spaced reference and newly normalized reference both fund under the raw UNIQUE index
REVIEW_RESULT: 3 controls passed; 1 legacy-identity defect characterized
```

The rollback control funds reward B with a new key after reward A's forced failure. It proves the rolled-back reference remains available to a new legitimate operation, not same-operation retry/idempotency. Keep genuine same-operation retry as a separate acceptance requirement.

The [startup harness](../audits/2026-10-28-w01-r3-startup.probe.ts.txt) was placed unchanged beside `package.json` in separate old and merged source extractions. With unique synthetic database filenames and explicit test configuration, old-source initialization and old-source reopen succeeded, new-source reopen of that old file failed with the missing-unique error, its main-file hash stayed unchanged, and fresh R3 initialization succeeded. The harness calls the real bootstrap and migrations; it does not copy their SQL into a substitute migration.

For reproduction, set the isolated database path before each child process. Pass `--initialize-new` only for a separate nonexistent synthetic file; never use it to repair an existing database. Node's `--import` argument must use a file URL for an absolute Windows loader path, or a relative loader path from the project directory. Initial local launch attempts hit a Windows loader-path issue and sandbox compiler-spawn denial; the completed isolated run above succeeded after correcting the loader URL and using the approved subprocess execution.

The passing controls demonstrate that the merged clean-database guard is useful. They do not excuse the old-file failure or conflicting legacy identity. No application source edits, live database migration, real funding, provider call, deployment or production exposure assessment occurred in this laptop review.

Independent review of this packet found no blocking issues; its clarification distinguishing the rollback control from same-operation retry is incorporated above. Relative links, Markdown fences and diff whitespace are checked before commit. This approves the correction handover, not R3 or W01 closure.

## Next bounded Claude unit — R3 correction and acceptance

```text
Repository: SM-Web-Systems/lms-crypto-production
https://github.com/SM-Web-Systems/lms-crypto-production.git

Read docs/release/SERVER-HANDOVER-W01-R3-PR108-REVIEW.md on documentation
branch codex/platform-wiring-audit. Read it without merging the unrelated
documentation/RBAC base stack; this is a branch, not another repository.

R3 and W01 are CHANGES_REQUIRED at reviewed main
7a23f8829684bc031b0f9a9641bf9b881e170395. Preserve PR #108's merge/CI receipt
and useful guard. Do not blindly revert it, deploy it or start W02.

Revalidate current main, planning PR #103 and any newer repairs. Use the
established Superpowers skills, Ponytail, Caveman and Ripwire with honest
availability records. AI approves; Claude performs merges after fresh checks
and independent review. Keep one bounded R3 correction unit.

Address R3-F1/F2/F3 in this packet. Write a focused correction spec/plan,
checkbox task/evidence list and Mermaid startup/identity/concurrency diagrams.
Get independent design review before coding. F1 requires narrow staged
preflight compatibility for the new additive constraint plus strict final
validation. F2 requires one explicit opaque-reference identity policy shared
by new writes, legacy data, lookup and database enforcement. Do not relax all
schema/unique checks or rewrite financial history as a shortcut.

Use an isolated codex/ worktree/branch from verified current main. First write
genuine RED regressions for old-file startup and the reference identity
inconsistency under the selected policy. Then repair the smallest shared
bootstrap/verifier/migration paths. Add meaningful async-competition, valid
direct-writer, injected post-write rollback/retry and real duplicate-upgrade
tests; correct the existing misleading test names/assertions. The packet's
local harnesses demonstrate both genuine failures and useful positive controls.

Test actual old-source file initialization/reopen followed by the new-source
upgrade, repeated startup, clean bootstrap, legacy duplicate refusal and
selected whitespace/case/null semantics. Retain all unrelated bootstrap
integrity protections and verify failed upgrades preserve data. No production
database, real provider or live migration is permitted in this unit.

Preserve R1 independent authorization, beneficiary identity and transaction
rechecks, R2's fiat-to-XLM denial and reference permanence. Do not enable
Paystack/Stellar, add a settlement service or broaden into W02-W04.

Run focused RED/GREEN and affected reward/bootstrap/migration tests, build and
required fresh CI. Get independent spec/security/database review, repair valid
findings and re-review. Claude may merge only a fully accepted candidate after
required checks pass, then verify the resulting main CI rather than predicting
success. If pending, record CHECKPOINTED and exact resume state.

On codex/staged-rollout-plan, mark prior R3/W01 closure conclusions superseded
while retaining historical receipts. Record the correction PR/full SHAs,
commands, actual passed/skipped counts and real migration evidence. W02 stays
pending until original W01 security and supported-upgrade criteria are met.

Use only a bounded correction loop and stop/cancel it at this unit's boundary.
Checkpoint before long work or credit/context exhaustion. No unrelated merge,
branch disposal, deployment or automatic progression. Return UNIT_COMPLETE
only with verified correction evidence, otherwise CHECKPOINTED truthfully.
STOP before W02. No routine human approval question is required.
```
