# W01-R3C / PR #109 — strict final-constraint validation

Date: 2026-10-28. **Original upgrade and opaque-identity corrections verified. CHANGES_REQUIRED for final constraint validation and acceptance coverage.** This is a narrow R3 closure correction, not a repeat of the earlier W01 implementation. Do not start W02 or deploy from this packet.

Historical candidate assessment: [PR #110 final verification and W02 prompt](CLAUDE-SERVER-W02-PROMPT.md) accepts W01 security containment at `1a5326ac` after exact-merge startup and funding-service rechecks. Read that newer packet for current disposition.

Repository: `SM-Web-Systems/lms-crypto-production` (`https://github.com/SM-Web-Systems/lms-crypto-production.git`). This document is on branch `codex/platform-wiring-audit`. Authoritative stage ledgers are on `codex/staged-rollout-plan` (PR #103).

## Verified receipt and resolved findings

- [PR #109](https://github.com/SM-Web-Systems/lms-crypto-production/pull/109) merged at `a929836334d39246ef8def2c38497319e6ea98fb`, head `0144357fdcf66c8956531d899f639452859564a0`, base `7a23f8829684bc031b0f9a9641bf9b881e170395`.
- [PR CI 40728271331](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40728271331) and [main CI 40729467144](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40729467144): all four jobs SUCCESS. Main backend job `122961532953`: **183 files passed; 1,887 tests passed, one skipped (1,888 total)**; 21 R3 tests passed.
- Planning PR #103 reviewed at `806b264402ba6e16797de119e0ee264bfe9907fd`.
- The original pre-R3 file upgrade now succeeds. A real duplicate-reference legacy file is refused with `W01-R3 migration blocked`; the main database file's SHA256 remains unchanged after refusal. Both cases used actual application startup, not copied migration SQL.
- The new reference function preserves every nonempty opaque string exactly, including spaces/case. That aligns new storage with the documented historical raw identity and resolves the earlier new-write trimming discrepancy. Do not reintroduce trimming of nonempty values as part of this correction.

## R3C-F1 — Compatibility exemption disables strict final validation (P2)

[`databaseBootstrap.ts:47`](https://github.com/SM-Web-Systems/lms-crypto-production/blob/a929836334d39246ef8def2c38497319e6ea98fb/LMS-Server/src/config/databaseBootstrap.ts#L47) applies `legacyUniqueExemptions` unconditionally inside `validateKeys()`. That function runs both before and after migrations. The expected funding-reference UNIQUE signature is therefore skipped in both phases.

`required-schema.json` adds the index **name** to its required-index list, but its `keys.reward_transactions.unique` still contains only `idempotency_key` and `id`. The final required-index loop checks existence by name, not UNIQUE status/columns/predicate. `ensureRewardTables()` likewise skips index creation when that name exists.

**Confirmed result:** a same-named ordinary non-UNIQUE index passes `validateDatabase(db, true)` and a subsequent real application restart. A direct ledger writer with valid reward/user foreign keys can then insert two fund rows with the same exact reference.

This is a conditional schema-integrity validation defect. Normally initialized or upgraded databases receive the correct UNIQUE index. No actual production drift, public API exploit or normal-path double funding is claimed. The synthetic fixture deliberately replaces the index to test whether unsupported schema drift is refused, as the strict final schema contract requires.

**Smallest correction:** limit the missing-constraint allowance to pre-migration validation. Enforce the full canonical UNIQUE flag, column and predicate signature after migrations. A malformed same-name index must be refused or safely repaired under the reviewed schema policy, never accepted solely by name. Preserve every unrelated preflight/key/integrity check and transactional startup rollback; do not turn this into a general permissive-validation mode.

## R3C-F2 — Remaining acceptance tests do not exercise production boundaries (P2)

- T04 still attempts an already-funded reward with a new reference, which fails before financial writes. It does not inject a failure after funding/reservation begins.
- T11/T12 call a test-local `runR3Migration()` containing copied SQL. These can pass while the actual startup/migration entry point is broken.
- T15 verifies preflight; T16 checks JSON membership. Neither tests final rejection of a non-UNIQUE or wrong-definition same-name index.
- The test file still contains no `fundRewardAsync()` competing-call regression.

Add actual file-backed startup/final-validation regressions, genuine concurrently started async calls, and an injected post-fund write failure with state/accounts/ledger rollback. Reuse the existing real startup harness where possible; do not add another test-local migration implementation. Keep same-operation retry/idempotency distinct from a new operation reusing a rolled-back reference. Correct evidence labels to match what commands actually prove.

## Isolated verification record

Source was extracted from exact merge `a929836`, with Git blob checks for the corrected bootstrap/verifier and an unchanged dependency lock. Node `v22.18.0`, installed tsx loader, synthetic credentials, `NODE_ENV=test`, `VITEST=true` and explicit unique temporary SQLite filenames were used. All child processes ran against isolated source extractions and synthetic file databases, not live data.

The [startup harness](../audits/2026-10-28-w01-r3-startup.probe.ts.txt), [shape harness](../audits/2026-10-28-w01-r3c-shape.probe.ts.txt) and [alternate-writer harness](../audits/2026-10-28-w01-r3c-writer.probe.ts.txt) produced these results:

1. Initialize/reopen a file with actual pre-R3 source `17d93f0`, then open it with corrected source `a929836`: **PASS**, actual migration installs a UNIQUE index and final validation succeeds.
2. Create another prior-schema file and seed two exact duplicate references using valid parent IDs; open it with corrected source: **controlled refusal**, `W01-R3 migration blocked`, main-file hash unchanged.
3. Copy the closed valid upgraded database to a new synthetic file. Replace the funding index with the same columns/predicate/name but without UNIQUE. `validateDatabase(db, true)` accepts it; a fresh application startup also accepts it: **defect confirmed**.
4. On that accepted malformed fixture, independently authorize one grant via the real service, then use a controlled direct ledger insertion for another valid reward with the same reference: **two fund rows**, confirming the promised database uniqueness is absent. This is not a duplicate through the public API.

The shape harness's `--weaken` mode and writer harness deliberately construct unsupported test state; they are not repair procedures. Set explicit synthetic database paths before imports. Use `--initialize-new` only on nonexistent synthetic files. Do not run these fixture mutations against an existing application database. No application source, real payment, production database, live migration or deployment was changed by this review.

Independent source review agreed this is a P2 blocking final-schema acceptance issue, confirmed the earlier identity fix, and found the listed test coverage gaps. Normal-path improvements remain intact.

Independent review of this packet and bounded finalization prompt: **PASS, no actionable revision needed**. Relative links, Markdown fences and diff whitespace are validated before commit. This approves the handover's accuracy and scope, not W01 closure.

## Next bounded Claude prompt — strict R3 finalization only

```text
Repository: SM-Web-Systems/lms-crypto-production
https://github.com/SM-Web-Systems/lms-crypto-production.git

Read docs/release/SERVER-HANDOVER-W01-R3C-PR109-REVIEW.md on documentation
branch codex/platform-wiring-audit. This is a branch, not another repository.
Read the document without merging its unrelated RBAC base stack.

Revalidate current main, reviewed at a929836334d39246ef8def2c38497319e6ea98fb,
and planning PR #103, reviewed at 806b264. Preserve PR #109's verified upgrade
and opaque-reference fixes. No repeat of R1/R2 or blind revert is required.

Complete only R3C-F1/F2 above. The legacy UNIQUE exemption currently applies
after migration too, and required-schema checks only the index name. Make
that exception pre-migration-only, enforce the full final UNIQUE signature,
and refuse malformed same-name index shapes rather than trusting the name.
Preserve strict unrelated schema checks and rollback of failed upgrades.

Use the established Superpowers skills, Ponytail, Caveman and Ripwire with
truthful availability records. AI handles approvals; Claude handles merges.
Update a focused correction spec/checklist and startup-phase Mermaid diagram;
obtain independent design review. Do not create another broad platform audit.

Use an isolated codex/ worktree/branch from verified main. Write RED tests
that call actual post-migration validation/application startup on same-name
non-UNIQUE and wrong-definition index fixtures, then make the smallest fix.
Prove legitimate old-file upgrade still succeeds and actual duplicate legacy
data is refused without partial changes. Replace copied migration SQL tests
with real startup entry points. Add actual async competing funding calls and
an injected post-fund rollback/retry regression; distinguish same-operation
idempotency from a new operation reusing a rolled-back reference.

Preserve R1 authorization/beneficiary checks, R2 denial and exact opaque
reference identity. Do not enable Paystack/Stellar or expand into W02-W04.
Run focused RED/GREEN, affected bootstrap/reward tests, build and required
fresh CI. Obtain independent spec/database/security review, resolve findings
and verify exact head/base before Claude merges. Verify post-merge CI rather
than predicting it. Pending gates require a truthful CHECKPOINTED result.

Update authoritative ledgers on codex/staged-rollout-plan: retain historical
merge receipts, supersede the premature W01/R3 closure, record this narrow
correction and its actual acceptance evidence. W02 stays pending until R3's
supported-schema guarantees and original W01 security criteria pass. Keep
operational Paystack/Stellar capability gaps separate and visible.

Use only a bounded finalization loop. Checkpoint before long work or credit/
context exhaustion, preserving SHAs, task status and exact resume instructions.
Commit/push reviewed changes and ledgers on their correct branches. Return
UNIT_COMPLETE only after verified gates, otherwise CHECKPOINTED. STOP before
W02. No deployment, live migration, real funding or unrelated merge, and no
routine human approval question.
```
