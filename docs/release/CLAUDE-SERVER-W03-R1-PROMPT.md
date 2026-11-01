# W03-R1 — Reconcile unused reservation after below-cap completion

Date: 2026-10-30
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: 655e11c40dd65ca7bf9e37fbf9af306c734ffda2 (#117)
Last fetched planning head: 753e007 (short SHA)
Scope: W03 reservation reconciliation only. W04 and deployment excluded.

## Execute this bounded follow-up

Read this entire file, then execute its instructions rather than only summarizing them. Revalidate refs, current code and applicable repository instructions. Preserve newer fixes. Retrieve documentation without merging the unrelated documentation/RBAC base stack into the implementation branch.

Read the original docs/release/CLAUDE-SERVER-W03-PROMPT.md, current W03 specification/plan and authoritative staged INDEX/TASKS/EVIDENCE. Preserve #117's accepted cap enforcement, recipient-count validation, null-cap effective capacity of one and allocation-count aggregate semantics. Do not restore the old denominator merely to conceal the accounting problem.

Reconcile W03 status to PARTIALLY_FIXED / CHANGES_REQUIRED while this reproduced residual is open. Preserve #117 receipts and working behavior. Main/CI success does not establish financial lifecycle completion or deployed state.

## Independent reproduction and evidence limits

On #117 merged service changes, all 26 submitted W03 tests passed. One additional synthetic monetary lifecycle test failed:

1. Create a sponsor-cohort reward with amount_stroops=100, max_recipients=5 and three actual audience members.
2. Fund using the actual fundReward service with a separate authorized funding administrator: fund=500 and reserve=500.
3. Activate through activateReward: three allocations are created.
4. Prepare the synthetic fixture for legitimate release by setting reward status to approved and allocations to eligible. This bypasses completion-event production intentionally; it does not certify W04 eligibility.
5. Release each of the three allocations through actual releaseAllocation calls, passing the real owner, unique keys and requested parent reward ID.
6. The reward becomes released, total release ledger amount is 300, but funder reserved balance remains 200.
7. With an expires_at in the past, processExpiredRewards returns {processed:0, failed:0}; released rewards are excluded by its query. The unused 200 is not reconciled.

Observed ledger: fund 500; reserve 500; release 100; release 100; release 100. No reservation-return entry. This demonstrates an unreconciled remainder in this completed below-cap path; it does not claim production inspection or rule out every conceivable operator recovery method.

The laptop ran Node 22.18.0, existing Vitest 4.1.12 dependencies and in-memory SQLite in an isolated source copy with a local-only Node builtin resolution adjustment. The local test copied the 26 W03 cases and appended this lifecycle case: 26 passed, 1 failed. The full suite and hosted CI were not independently rerun by the laptop for #117.

Reproduce with actual services. Replace direct status setup with established approval/eligibility APIs where feasible; document any synthetic setup necessary to isolate W03 from W04. Runner/import errors do not count as behavioral RED. Existing status-only aggregate tests and snapshot-count-only expiry tests do not establish financial correctness.

## Required design and invariants

Trace funding/reservation provenance, audience finalization, partial/final release, cancellation, expiry, refund, ledger replay and aggregate-state transitions before selecting the repair point. Identify whether releasing unused capacity at activation or on finalization best fits existing contracts. Make one reviewed, consistent policy; do not invent arbitrary balance writes or a broad new financial subsystem.

The repair must ensure:
- Unallocated capacity does not leave an unexplained reserved remainder once it is no longer needed under the documented lifecycle contract.
- Reservation reconciliation moves value through the existing auditable ledger mechanisms, preserving total money and currency. No silent SQL balance edits, minting, top-ups or fabricated provider funding.
- Compute this reward's outstanding reservation from authoritative reward-specific history. Do not use another reward's balance in a shared funder account as evidence of backing, and do not return funds twice after a prior reconciliation.
- Keep pending real allocations backed; never return capacity still owed to an unreleased allocation. Release/refund/expiry/cancel sequencing must remain coherent with whichever reconciliation timing is chosen.
- Reconciliation and its triggering transition are atomic and replay-safe. Repeated actions, workers and different request keys cannot duplicate the reservation return or partially finalize state.
- A refund of an already released allocation must not be mistaken for a release of unused reserved capacity. Preserve actual funder ownership, currency, initiating/system actor attribution and historical records.
- Preserve cap enforcement, null effective cap=1, valid recipient-count limits, snapshot finality, W01 funding containment and all W02 authorization/parent/replay guards.
- Unknown or inconsistent historical states fail safely with controlled errors and no financial changes. Do not automatically repair production records or introduce live migration/backfill behavior.

If a new internal ledger operation or metadata convention is necessary, justify it against existing transaction/schema contracts and backwards/rollback compatibility. Do not repurpose externally visible transaction semantics without review. Keep schema changes out unless unavoidable for this bounded invariant and independently justified.

## Development and tests

Use an isolated codex/ branch/worktree from verified current main and synthetic SQLite. Preserve unrelated local work. Discover relevant installed skills honestly; missing optional skills are not blockers. Do not install unreviewed hooks/proxies/scripts or claim unavailable tools ran.

Commit a focused developer specification, iterative checkbox plan and requirement-to-test matrix before coding. Include Mermaid diagrams showing money buckets, reward-specific ledger movements, lifecycle trigger and transaction/replay ordering. Obtain independent design review through review agents, resolve valid findings and continue routine decisions autonomously.

Behavioral TDD requirements:
1. Reproduce cap=5/audience=3/amount=100 with actual fund/reserve/release transactions. After the chosen lifecycle boundary, verify the 200 remainder returns exactly once to the correct funder's available bucket, with correct ledger/state and preserved recipient balances.
2. Verify partial release retains precisely the backing required by remaining allocations under the chosen timing; final release and below-cap aggregate completion do not strand funds.
3. Equal-cap and null-cap one-recipient flows remain correct with no unnecessary or duplicate returns.
4. Repeated final release, same/new keys, activation replay and worker replay cannot duplicate either recipient payment or unused-capacity return.
5. Two rewards sharing the same funder and currency remain isolated. Snapshot all relevant accounts, reward-specific ledger, allocations, snapshots and statuses; reconciling A cannot consume or release B's backing.
6. Exercise cancellation/expiry before any release and after partial release where supported. If unused capacity was already returned at activation, subsequent calculations must subtract that return rather than returning it again.
7. Exercise actual refunds after below-cap completion, including repeats and insufficient recipient balance. Preserve existing refund-attempt actor/history and administrative authorization semantics.
8. Test transactional rollback at a meaningful reconciliation write boundary using supported fault injection; no partial return, ledger duplication or status advancement.
9. Test actual authenticated route error/replay behavior for affected entry points, plus current authorization revocation and intended owner/admin policy. Use exact-role fixtures with effective assignments/permissions asserted.
10. Test expiry-worker selection and actual monetary effects rather than asserting only snapshot counts. Any deliberately unsupported historical case must be explicit, fail safely and remain separately visible.

Use precise integer monetary arithmetic and existing validation. Do not weaken FKs, bootstrap validation, permission checks or ledger safeguards to make tests pass. Tests must call real code, not merely inspect source strings or imitate guards.

Run focused RED/GREEN, affected reward/funding/ledger/expiry/refund/RBAC suites, TypeScript build and fresh required candidate CI. Address new failures and distinguish independently demonstrated unrelated failures; do not suppress tests to produce a green report. Independent code/security review must inspect the real lifecycle reproduction, pooled-account isolation, transaction atomicity, reconciliation replay and refund/cancel/expiry interaction. Fix valid findings and re-review.

## Merge, evidence and stop

Prepare a focused PR describing the reproduced financial remainder, selected reconciliation timing, compatibility and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI. No production deployment, live accounts, providers, migrations or real funding.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W03 spec/plan with exact SHAs, behavioral RED/GREEN, counts/skips, review decisions, candidate and main CI receipts, compatibility/rollback limits and remaining operational acceptance. Record the original 26-test gap honestly. Do not erase #117's accepted fixes or claim the old aggregate denominator fixes the monetary issue.

Any historical already-released rewards retaining reservations require a separately reviewed operator assessment/reconciliation task. Document that limitation without inspecting or modifying live data in this unit. Whether that limitation permits code-level closure must be explicit; do not claim production financial reconciliation occurred.

Use loops only with verified syntax and bounded scope. Save spec/tasks/evidence/SHAs and an exact resume action before context/credit exhaustion; cancel stale monitors at the boundary. Missing indispensable evidence means CHECKPOINTED.

STOP after W03-R1. Return UNIT_COMPLETE or CHECKPOINTED and an evidence-based W03 closure verdict. Do not begin W04, deploy, enable provider/credit features, merge unrelated work or modify real financial state.
