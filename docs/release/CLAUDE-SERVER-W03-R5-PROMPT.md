# W03-R5 — Preserve table options and literal semantics in schema comparison

Date: 2026-10-30
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: 2f1c951500944705ad22433d127e60e406a46e41 (#121)
Last fetched planning: 4026cd8e8e6f2d9f29c205b3f2dd6327aaa49e25
Scope: two residual complete-DDL compatibility defects. W04 and production actions excluded.

## Read and execute

Read the entire file and execute the bounded work rather than only summarizing it. Revalidate refs, current source, checks and applicable repository instructions; preserve newer fixes. Retrieve documentation without merging the unrelated documentation/RBAC base stack into implementation.

Read the previous W03 prompts, current schema detector/migration/bootstrap, specs/plans and staged INDEX/TASKS/EVIDENCE. Preserve #117 cap semantics, #118 reconciliation, and the working #119–#121 schema/dependency/atomicity safeguards. Maintain W03 as PARTIALLY_FIXED / CHANGES_REQUIRED while these reproduced compatibility gaps are open; preserve historical repair and test receipts.

Keep implementation in a server worktree with independent review and CI. The laptop authored this prompt and ran synthetic verification; no application patch or production operation was performed there.

## Independent verification

Against #121 changes, local verification ran 87 tests: 85 passed, 2 failed. All 80 submitted migration tests and five previous independent probes passed. The failures below concern unsupported schema handling, not a demonstrated failure of the canonical known-schema upgrade or an API route allowing schema modification.

The laptop used disposable file-backed SQLite, Node 22.18.0 and existing Vitest 4.1.12 dependencies in an isolated source copy with a local-only Node builtin resolution adjustment. Windows fixture line endings initially prevented collection of the submitted suite; repository-style LF fixture copies resolved that runner issue. The completed 85/2 result is the behavioral run. Full backend regression and hosted CI were not independently rerun by the laptop.

F1 — Unsupported table option silently removed
1. Create a disposable database from database/schema-v117-fixture.sql, adding STRICT immediately after the closing parenthesis of reward_transactions, before its semicolon. Leave the columns/checks unchanged.
2. Verify PRAGMA table_list('reward_transactions') reports strict=1.
3. detectSchemaVersion returns source because extractTableBody discards the suffix.
4. applyUpgrade succeeds and rebuilds the table without STRICT.
5. PRAGMA table_list now reports strict=0. The original enforcement option was silently removed instead of being refused or explicitly preserved.

F2 — Literal semantics changed by final normalization
1. Create a disposable target-schema database from current database/schema.sql.
2. Change the currency_code declaration from DEFAULT 'XLM' CHECK (currency_code IN ('XLM')) to DEFAULT 'IF NOT EXISTS XLM' CHECK (currency_code IN ('IF NOT EXISTS XLM')). Preserve all other structure. This fixture changes actual accepted currency semantics.
3. detectSchemaVersion returns target; planUpgrade reports alreadyAtTarget=true/wouldApply=false.
4. Although the character scanner preserves quoted text, canonicalizeDdl ends with a global IF NOT EXISTS regex replacement, which rewrites these string literal contents back to the canonical-looking values.

Reproduce both with actual detector/plan/apply and actual preflight, then preserve intended-refusal/preservation assertions as regressions. Do not treat runner/import failures as behavioral RED. No production data, provider, live migration or deployment is authorized.

## Required correction

Compare the complete supported CREATE TABLE contract, not just text between the first and last parentheses. Retain/check table suffix options and statement boundaries. Unsupported STRICT, WITHOUT ROWID or combinations must be refused before mutation unless an explicit reviewed support path preserves their semantics. Conservative refusal is sufficient for this unit; do not broaden migration support unnecessarily. Include table-option PRAGMA checks where useful, and do not drop prefix/suffix information merely to tolerate table-name quoting.

Normalize only the syntactic header/table identity parts that are explicitly allowed. Any IF NOT EXISTS handling must operate on header tokens outside literals/quoted identifiers/comments, not as a global replacement over already scanned text. Preserve every string literal's exact value through every normalization stage. A table rename accommodation must not normalize column names, defaults or constraints into different semantics.

Use a bounded lexer/token-aware supported-statement representation, exact approved definitions or another justified fail-closed design. Avoid both a universal SQL parser and a new sequence of per-probe exclusions. Establish an explicit allowlist of accepted syntax equivalents. Unsupported equivalent formatting may refuse with a clear diagnostic; unknown semantics must never certify compatibility.

Ensure handling of parentheses and keywords inside strings, quoted names, comments and identifier quoting does not confuse structural boundaries. If a quoting form is not supported, refuse it rather than partially interpreting it. Do not erase semantically meaningful punctuation or options, use first/last-parenthesis slicing as proof of a full statement, or strip header phrases from literal contents.

Plan/apply/preflight must share or consistently enforce the same complete-schema contract, including no-op target handling. Migration receipts never override observed schema. Read-only inspection paths must remain read-only. Behavioral constraint probes belong in disposable fixtures/copies, not writes against an operator database during planning.

Preserve full body, keys/defaults/FKs/checks and supported dependency definitions; keep #121 explicit-column copy and index validation. Revalidate input at the proper transaction/lock boundary and perform indispensable target/dependency/data/integrity validation before commit. Existing rollback and unknown-object refusal guarantees remain requirements; do not regress them while changing the detector.

No startup table rebuilds, writable_schema, unrestricted schema push, deleted sidecars, weakened checks, arbitrary balance edits or automatic reconciliation of historical money. Historical already-released reservations remain a separate operator task.

## Development and independent review

Use an isolated codex/ branch/worktree from verified main and disposable SQLite files. Preserve unrelated work. Discover relevant installed skills honestly; optional missing tools are not blockers. Do not install unreviewed hooks/proxies/scripts.

Before implementation, commit a focused specification, iterative checkbox plan and requirement-to-test matrix. Define precisely which header/name variations, comments/whitespace, quoting forms and table options are supported or refused. Include Mermaid full-statement classification and transactional upgrade/refusal diagrams. Use independent agents for design and database/security review, resolve valid findings and continue routine decisions autonomously.

Required tests:
1. F1 actual prior STRICT table: intended refusal with exact DDL/options/data unchanged, or explicitly justified semantics-preserving support. Plan/apply/preflight agree. Assert PRAGMA options before and after, not only schema labels.
2. Target STRICT and source/target WITHOUT ROWID/table-option combinations: no suffix-blind compatibility approval. Distinguish real SQLite-supported syntax from invalid fixture SQL.
3. F2 changed currency literal: detector/plan/apply/preflight refuse; demonstrate the fixture's changed constraint/default behavior with actual SQLite operations before repair. Inspection leaves schema/data unchanged.
4. IF NOT EXISTS inside string literals, quoted identifiers, defaults and CHECK operands remains exact. Genuine header IF NOT EXISTS handling cannot alter body literals. Exercise case/spacing and escaped quotes without silently changing values.
5. Parentheses/comment delimiters/header-like words inside quoted text: correct boundaries or documented safe refusal. Supported table-name quoting and SQLite post-rename DDL still pass; unsupported syntax cannot be partially certified.
6. Earlier OR 1=1, additional source CHECK, comment/literal bypass, column/default/nullability/FK drift, changed index definition and fake receipt probes remain passing.
7. Extra objects/partial-swap artifacts/pre-existing FK violations still refuse before mutation. No unsupported constraint or schema object disappears and no failed apply leaves a committed receipt.
8. Authoritative source revalidation and complete target checks are inside the appropriate commit boundary; meaningful injected failures preserve schema/data/dependencies and allow safe rerun.
9. Actual repository prior schema upgrades; target fresh initialization and repeat/no-op apply work; source-free compiled bootstrap and migration CLI paths run with correct diagnostics.
10. File-backed WAL-aware backup/restore, exact retained ledger values and unrelated data preservation remain verified. No live database.
11. Real cap=5/audience=3 lifecycle remains 500 reserved, 300 distributed and 200 returned once; preserve shared-funder isolation, replay, refunds/cancel/expiry and actor/history semantics.
12. Run existing cap/reconciliation/migration regressions, all 80 submitted #121 migration tests and previous independent probes. Update obsolete expectations only with documented stronger behavior; do not reduce coverage to claim green.

Run focused behavioral RED/GREEN, migration/bootstrap/schema/compiled-runtime/restore and affected reward/ledger suites, TypeScript build and fresh required candidate CI. Establish unrelated failures independently before classifying them; do not suppress tests merely to produce green checks.

Independent reviewers must inspect the full normalization pipeline and full statement representation, not only the scanner or named new probes. Ask them to test structurally distinct suffix/header/literal cases. Fix valid findings and re-review before merge.

## Merge, evidence and stop

Prepare a focused PR explaining both failures, full-statement/literal guarantees, supported syntax limits and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W03 specs/plans with exact source/candidate/review/merge SHAs, RED/GREEN, counts/skips, supported schema/syntax/dependency matrix, review decisions and candidate/main CI receipts. Preserve #117–#121 receipts and acknowledge body-only comparison/global-regex gaps honestly.

Distinguish code-level closure from operational readiness. Production backup/protected-copy rehearsal/operator approval/live migration/deployment and historical financial reconciliation remain separate gates. Do not recommend production migration until this correction is independently verified.

Use loops only with verified syntax and bounded scope. Save spec/tasks/evidence/SHAs and exact resume action before exhaustion; cancel stale monitors at the boundary. Missing indispensable evidence means CHECKPOINTED.

STOP after W03-R5. Return UNIT_COMPLETE or CHECKPOINTED and a qualified W03 closure verdict. Do not begin W04, deploy, apply live migrations, enable providers/credit features, merge unrelated work or modify real financial state.
