# W03 — Allocation caps and funding consistency: server execution prompt

Date: 2026-10-30
Scope: W03 only. W01/W02 accepted within verified scope; W04 and deployment excluded.
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: e306cf9b54ecf5acf0d4ed0825abcea57a1d724b (#116)
Last fetched planning head: 01825aa (short SHA)

## Read and execute

Execute this bounded unit, rather than only summarizing or proposing it. Revalidate current refs, applicable instructions and checks before implementation; preserve newer fixes. Read this document without merging its unrelated documentation/RBAC base stack into implementation.

Read the staged INDEX/TASKS/EVIDENCE, platform audit W03, existing W03 specification at docs/superpowers/specs/2026-10-27-W03-allocation-cap.md, current reward services/ledger/audience/state machine/routes and tests. Treat historical line numbers as pointers, not current evidence.

W02 closure context: #115 repaired caller authorization; #116 mapped RewardError correctly and documented global attempt visibility for reward.refund_review separately from mutation authority. Independent laptop verification passed 139 tests across seven suites, including exact-role fixtures, actual service-generated blocked attempts, revoked-token denial and duplicate-refund prevention. This is scoped local evidence, not production certification or a claim that the laptop reran all backend/CI checks. Preserve these accepted behaviors.

The planning INDEX baseline table at 01825aa still names #115/5cc386f despite recording #116 elsewhere. Correct it to the newly verified main SHA with an accurate note; preserve historical receipts. Never infer deployed state from main.

## W03 problem and required contract

Activation currently resolves the full audience and creates an allocation for each member without enforcing max_recipients. Funding calculates exposure using amount_stroops * (max_recipients ?? 1). A cap of one with a larger audience can therefore allocate more than was reserved.

The existing W03 specification also says null means unlimited activation. That contradicts funding's one-recipient fallback. Do not implement that acceptance criterion unchanged, and do not treat a missing cap as permission to create unfunded obligations.

Before coding, trace creation and validation, sync/async funding, reservation provenance, activation, audience snapshots, replay, release/refund/expiry and aggregate-state consumers. Establish the actual current null/omitted/zero/invalid-value behavior with tests. Separate API-reachable cases from deliberately constructed legacy fixtures.

Preferred bounded policy: reject an oversized audience with a controlled AUDIENCE_EXCEEDS_CAP error (HTTP 400), rather than silently selecting/truncating recipients. Preserve the funded reward and reservation so the user can correct the audience or follow an existing supported recovery path. Do not invent an update/top-up feature or silently rewrite an already funded cap.

For null/omitted caps, choose and document the smallest safe behavior consistent with existing funded exposure. A conservative fallback is an effective cap of one, matching current funding, with excess audience rejected. If approved repository contracts require a different behavior, justify a fully funded, bounded design through independent review before implementation. Never enable unlimited allocations against one reserved unit or silently mint/top-up internal funding. Do not broaden this into provider work or a funding redesign.

Enforce:
- Allocation count does not exceed the documented effective recipient capacity.
- New aggregate monetary obligations do not exceed verified reward-specific funded/reserved backing; another reward's pooled funder balance is not evidence of this reward's backing.
- Use precise integer money arithmetic; validate invalid counts and unsafe numeric conversions at the relevant existing boundary.
- Count distinct eligible audience identities consistently with actual allocations and snapshots; preserve scope/privacy rules.
- Reject before snapshot/allocation/status writes, or roll the complete operation back atomically. A failed activation leaves existing reservation, accounts, ledger, audience snapshots, allocations and reward status unchanged.
- Resolve current audience and recheck relevant reward/funding state at the transaction boundary. Membership growth between funding and activation cannot bypass the cap.
- Repeat activation cannot add duplicate allocations, grow the original snapshot, reserve/release twice or bypass current authorization. Preserve W02 access-before-replay behavior.
- Characterize below-cap activation and later completion/expiry behavior: unused capacity must not create phantom obligations or strand funds due to aggregate-status assumptions. Repair directly demonstrated W03 coupling only; keep unrelated lifecycle redesign out of scope.

Do not silently repair existing overallocated rewards or rewrite historical financial data. Record any legacy incompatibility and the need for separately authorized operator assessment; no production inventory or migration is authorized here.

## Development and independent review

Use an isolated codex/ branch/worktree from verified current main and synthetic SQLite only. Preserve unrelated local work. Discover relevant installed skills honestly; optional missing skills are not blockers. Do not install unreviewed hooks/proxies/scripts or claim absent tools ran.

Commit a focused developer specification, iterative checkbox plan and requirement-to-test matrix before implementation. Reconcile the existing W03 specification with the funded-capacity contract. Include Mermaid funding-to-activation and transaction/replay diagrams. Use independent agents for design and code/security review, resolve valid findings and continue with routine decisions autonomously.

Use behavioral TDD: reproduce the actual defect with real services, write intended-denial RED tests, apply minimum fixes, run focused GREEN and regressions. Import/runner failures are not behavioral RED. Use exact-role fixtures with effective permissions asserted. Exercise actual authenticated HTTP routes as well as service boundaries, with controlled domain error/status assertions.

Required coverage:
1. Cap one, larger audience: controlled 400; exact full-state preservation.
2. Audience equal to cap and below cap: correct snapshot, allocation count, amounts and backing.
3. Null and omitted caps: tested funded-capacity semantics; one-recipient fallback cannot finance multiple allocations.
4. Zero, negative, fractional, nonnumeric and excessive/unsafe counts: explicit API/service outcomes according to the validated contract; do not weaken schema validation to construct normal cases.
5. Empty and duplicate audience inputs; membership grows after funding and changes after successful activation; no cap bypass or snapshot expansion.
6. Repeated activation and concurrent/interleaved attempts where meaningful: no duplicates, partial snapshots or excess obligations. Tests must exercise actual transactional behavior rather than source matching.
7. Authorization and replay: owners, unrelated role-only users, current revoked access and intended administrative behavior remain consistent with accepted W02 policy.
8. Monetary backing: isolate two rewards sharing a funder so pooled funds cannot mask over-allocation. Assert reward-specific exposure and exact balances/ledger effects.
9. Below-cap release/aggregate/expiry characterization where affected; no phantom recipients, duplicate movement or unaccounted residual reservation. Keep completion eligibility producers and W04 changes excluded.
10. Failed activation followed by a supported valid retry: no stale partial state, extra funding or duplicate allocation.

Run focused RED/GREEN, all affected reward/funding/ledger/audience/RBAC/worker suites, backend TypeScript build and the required candidate CI. Broaden testing when a demonstrated coupling warrants it. Independent review must assess null semantics, money bounds, transactional atomicity, pooled backing, below-cap behavior, replay and actual HTTP error handling. Fix valid findings and re-review. Do not infer success from test names or existing green CI alone.

## Release evidence and stop condition

Prepare a focused PR with concrete before/after behavior, selected null-cap contract, compatibility limitations and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and its CI. No production deployment or live provider calls.

Update and commit/push the authoritative INDEX/TASKS/EVIDENCE and W03 spec/plan with exact source/candidate/review/merge SHAs, RED/GREEN results, counts/skips, independent review decisions, candidate and main CI receipts, residual risks and actual status. Preserve W01/W02 history. Do not mark W03 FIXED while indispensable evidence or checks remain pending.

Use a loop only if its availability and syntax are verified, scoped to this unit. Save spec/tasks/evidence/SHAs and an exact resume action before context or credit exhaustion; cancel stale monitors at the boundary. Missing indispensable evidence means CHECKPOINTED, not guessed approval.

STOP after W03. Return UNIT_COMPLETE or CHECKPOINTED with the W03 acceptance verdict, evidence, limitations and next handover. Do not begin W04, enable providers/credit features, merge unrelated branches, deploy, run live migrations or modify real financial state.
