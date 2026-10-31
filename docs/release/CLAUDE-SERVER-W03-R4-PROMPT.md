# W03-R4 — Authoritative complete-schema compatibility

Date: 2026-10-30
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: fc59ec2e267f58ef792371edfa0f46b59c180ce4 (#120)
Last fetched planning: cbb04257818f91c233f21075e1d59f32776d3806
Scope: two residual schema-classification/preservation defects only. W04 and production actions excluded.

## Read and execute

Read this whole prompt and execute the bounded work rather than merely summarizing it. Revalidate current refs, required checks and applicable repository instructions; preserve newer fixes. Retrieve this documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read the previous W03 prompts, #120 detector/migration/bootstrap/tests, current specs/plans and staged INDEX/TASKS/EVIDENCE. Preserve #117 cap behavior, #118 unused-reservation accounting and the working #119/#120 upgrade, dependency refusal and validation-before-commit corrections.

W03 remains PARTIALLY_FIXED / CHANGES_REQUIRED while these two reproduced defects remain. Keep accurate historical receipts; do not claim earlier repairs failed wholesale or that migration/deployment occurred on production.

## Independent evidence and exact reproduction

Local verification against #120 merged changes: 59 tests executed, 57 passed and 2 failed. The three earlier independent probes now pass. The new failures are:

F1 — Permissive target CHECK accepted
- Start from current database/schema.sql in a disposable file-backed SQLite database.
- Replace exactly:
  CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire', 'release_unused'))
  with:
  CHECK (transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire', 'release_unused') OR 1=1)
- Keep all other table definitions and constraints intact.
- detectSchemaVersion returns target and planUpgrade reports alreadyAtTarget=true, wouldApply=false.
- Prove the altered constraint is actually permissive by inserting a synthetic reward_transactions row with transaction_type='NOT_A_REAL_KIND', a unique id/key, source_account_type='external', destination_account_type='funder', destination_bucket='available', actor_type='system', actor_user_id=NULL, amount_stroops=1, previous_state='draft' and new_state='funded'. Other nullable fields can remain null. SQLite accepts it.
- The current substring detector recognizes a fragment inside a weaker expression rather than the enforced contract. Verify apply no-op and real bootstrap/preflight behavior too, without claiming they were already exercised by this exact laptop probe.

F2 — Additional source CHECK silently removed
- Start from database/schema-v117-fixture.sql in a disposable file-backed SQLite database.
- Add CHECK (amount_stroops < 1000) to the transaction_type column declaration after its existing six-type CHECK. This is a valid SQLite constraint referencing the amount column; leave the rest of the prior table intact.
- applyUpgrade succeeds and reconstructs the canonical target table, removing the extra constraint. Source classification accepts the expected substrings without noticing unsupported table semantics.
- Required behavior: refuse unsupported source DDL before mutation, or explicitly support and preserve its additional semantics. Do not silently delete it.

These are schema-drift/compatibility failures, not claims that an unprivileged API caller can edit SQLite DDL. All probes used synthetic disposable databases. No production data, provider, live migration or deployment was accessed. Full backend regression and hosted CI were not independently rerun by the laptop.

## Required design correction

Stop extending selected-substring fingerprints with individual exclusions. Establish a complete, fail-closed compatibility contract for the reward_transactions table, shared by or consistently used across migration plan/apply and bootstrap/preflight.

Prefer the smallest reviewed design: an explicit allowlist of complete supported source/target table definitions, compared through a bounded, SQL-aware canonical representation, combined with authoritative PRAGMA/index/dependency validation. A strict unsupported-format refusal is acceptable if documented and actionable. Do not build a universal SQL parser or accept arbitrary SQLite syntax merely for convenience.

If canonicalizing DDL, tokenize strings/quoted identifiers/comments safely and compare the complete supported statement, not merely token occurrences or selected CHECK fragments. Preserve literal content and expression semantics. Comments inside string literals are not comments; stripping them with a global regex is not authoritative normalization. Any accepted whitespace/case/quoting equivalence must be explicit and tested; do not erase meaningful syntax, weaken expressions, reorder arbitrary predicates or truncate trailing constraints.

Supported source/target classification must account for all columns, order where relevant to copying, types/affinities, nullability, defaults, keys, FKs and actions, complete CHECK expressions and table options. Target acceptance must prove the transaction-type and source-user constraints, plus retained financial/actor/reference constraints. Unknown extra checks, permissive OR branches, missing checks/defaults/keys, unexpected columns and changed semantics must refuse rather than being certified or silently normalized away.

Use explicit column mapping when appropriate for copy safety; do not let INSERT SELECT * hide an assumption about an unsupported source shape. Preserve exact financial rows and unrelated data. Existing index/trigger/view refusal from #120 remains required; inventory must not trust index names alone when definitions/uniqueness/predicates have drifted. Inspect incoming FKs and supported dependencies rather than silently weakening their behavior.

No-op target classification is a safety decision too: a target-like malformed database must not bypass validation because apply would perform no writes. Forged migration receipts cannot override observed schema. Read-only --plan and preflight must remain read-only; behavioral constraint probes belong in disposable copies/fixtures, not writes to an operator database during inspection.

Authoritatively revalidate supported input under the migration transaction/appropriate lock before destructive operations. Confirm the complete target contract, dependency definitions, data preservation, integrity/FKs and receipt consistency before commit. Preserve #120 rollback/refusal guarantees; do not move essential validation back after commit. If drift occurs between initial inspection and lock acquisition, refuse or serialize safely.

Do not loosen supported constraints, drop unknown semantics, use writable_schema, perform startup financial-table rebuilds, run unrestricted schema push, delete sidecars or automatically repair unsupported production schemas. Historical stranded reservations remain a separate operator task; this unit does not move historical money.

## Development and review

Use an isolated codex/ branch/worktree from verified current main and synthetic SQLite files only. Preserve unrelated local changes. Discover relevant installed skills honestly; missing optional packages are not blockers. Do not install unreviewed hooks/proxies/scripts.

Before implementation, commit a focused spec, checkbox plan and requirement-to-test matrix defining the exact supported schema identities and allowed syntactic equivalences. Include Mermaid inspection/classification and lock/revalidate/reconstruct/validate/commit/refusal diagrams. Use independent agents for design and database/security review; resolve valid findings and routine decisions autonomously.

Behavioral TDD and acceptance:
1. Reproduce F1 as intended refusal RED; assert SQLite accepts the invalid kind on the weakened fixture before repair. After repair, detect/plan/apply/preflight reject it consistently, without schema/data/receipt changes.
2. Reproduce F2 as intended refusal/preservation RED. After repair, extra CHECK semantics are preserved only if explicitly supported; otherwise refuse before mutation and prove exact original DDL/data remain.
3. Test other complete-schema mutations: missing/altered actor checks, missing source-user check, extra OR alternatives, unrelated literals containing expected text, omitted CHECKs, changed nullability/defaults/FK action, added column and changed column order. Unknown shapes must not pass through expected-fragment matches.
4. Test comment/string/identifier tokenization, legitimate documented formatting variants and unsupported syntax. Accept supported equivalences or refuse clearly; never change literal/expression meaning.
5. Index drift under supported names: changed columns, nonunique replacement of a unique index and altered funding-reference predicate must not be mistaken for the supported contract.
6. Valid actual prior schemas upgrade; actual target fresh schemas pass/no-op; repeated apply works. Use original repository schema versions rather than only schemas produced by the same normalizer under test.
7. Plan/apply/preflight agree on supported/unknown states, fake receipts and partial-swap artifacts. Read-only paths leave exact schema/data unchanged.
8. Existing extra-index/trigger/view and pre-existing-FK-violation probes remain passing. Unknown dependencies refuse before mutation; no object loss or post-failure committed receipt.
9. Faults at meaningful reconstruction and target-validation/receipt boundaries roll back complete schema/data/dependencies. Safe rerun, source revalidation under lock and restored enforcement settings remain verified.
10. File-backed WAL-aware backup/restore, source-free compiled bootstrap and operator dry-run/apply paths pass on disposable databases. No live files.
11. Real post-upgrade cap=5/audience=3 lifecycle still reserves 500, distributes 300 and returns 200 exactly once. Preserve pooled-funder isolation, replay, refunds, cancellation/expiry and actor/history invariants.
12. Run the existing cap/reconciliation/migration regressions. Where a previously permissive test expectation must change, replace it with stronger intended-behavior coverage and record why; do not hide failures or reduce the claimed test set without explanation.

Use actual functions and authenticated routes where affected, precise error assertions and exact-role fixtures. Runner/import errors are not behavioral RED. Counts and test names do not prove that complete schema semantics are validated.

Run focused RED/GREEN, migration/bootstrap/schema/compiled-runtime/restore and affected reward/ledger suites, TypeScript build and fresh required candidate CI. Independently establish unrelated failures before classifying them; do not suppress tests merely to produce green checks.

Independent review must try complete-statement counterexamples beyond the two named probes, inspect fail-closed no-op behavior and the input/target checks inside the commit boundary. Fix valid findings and re-review before merge.

## Merge, evidence and stop

Prepare a focused PR explaining both failures, the selected complete-schema contract, supported equivalences and compatibility limits, plus executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W03 specs/plans with exact source/candidate/review/merge SHAs, RED/GREEN results, counts/skips, supported schema/dependency matrix, review decisions and candidate/main CI receipts. Preserve #117–#120 history and acknowledge the remaining pattern-based coverage gap honestly.

Keep code-level closure separate from operational readiness: production backup/protected-copy rehearsal/operator approval/live migration/deployment and historical reservation reconciliation have not occurred in this unit. Document those remaining gates. Do not recommend current migration deployment until this correction is independently verified.

Use loops only with verified syntax and bounded scope. Save spec/tasks/evidence/SHAs and exact resume action before exhaustion; cancel stale monitors at the boundary. Missing indispensable evidence means CHECKPOINTED, not guessed approval.

STOP after W03-R4. Return UNIT_COMPLETE or CHECKPOINTED and a qualified W03 closure verdict. Do not begin W04, deploy, apply live migrations, enable providers/credit features, merge unrelated work or modify real financial state.
