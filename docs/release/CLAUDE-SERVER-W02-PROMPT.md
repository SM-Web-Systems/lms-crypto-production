# W01 security closure verification and bounded W02 prompt

Date: 2026-10-28. **W01 security containment accepted at `1a5326ac`; proceed to W02 only.** This accepts verified funding safeguards, not operational Paystack/Stellar integration, production deployment or the rest of the platform audit.

Independent review of this closure record and bounded W02 prompt: **PASS, no actionable revision needed**. Relative links, Markdown fences, requested workflow terms and diff whitespace are validated before commit. This does not claim W02 has been implemented.

Repository: `SM-Web-Systems/lms-crypto-production` (`https://github.com/SM-Web-Systems/lms-crypto-production.git`). Document branch: `codex/platform-wiring-audit`. Authoritative planning branch: `codex/staged-rollout-plan` (PR #103). These are branches inside the repository, not separate repositories.

## Verified W01 closure evidence

- [PR #110](https://github.com/SM-Web-Systems/lms-crypto-production/pull/110) merged at `1a5326ac1ed2608f11e23d330d4a763ad977798b`, head `e13c70239a1baaec8cc3884c0cebbd98156bba77`, base `a929836334d39246ef8def2c38497319e6ea98fb`.
- [PR CI 40736862787](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40736862787) and [main CI 40738034939](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40738034939): all four jobs SUCCESS. Main backend job `122991774503`: **183 files passed; 1,891 tests passed, one skipped (1,892 total)**. All 25 R3 tests passed.
- The missing-constraint exemption is now restricted to pre-migration validation. Both post-migration validation paths enforce the full partial UNIQUE signature, also present in `required-schema.json`.
- Independent source review found no new blocking runtime issue and accepted the correction conditional on exact-merge dynamic checks. Those checks now pass as described below.
- Planning PR #103 reviewed at `1639379a4bb5164393708b67e67ebdc182674cc0`. Preserve its receipt chain and record this verification without reopening completed W01 work.

### Exact-merge local acceptance

The [strict-shape harness](../audits/2026-10-28-w01-final-shape.probe.ts.txt) and [funding-service controls](../audits/2026-10-28-w01-final-service.probe.ts.txt) ran against an isolated extraction of exact merge `1a5326ac`. Git blob checks matched bootstrap, verifier, funding service and required-schema to that merge; the dependency lock matches the installed candidate. Node `v22.18.0`, tsx, synthetic credentials, explicit temporary SQLite filenames, `NODE_ENV=test` and `VITEST=true` were used.

Verified results:

1. Concurrent async grants: one winner, one `DUPLICATE_REFERENCE` 409, one funding credit/reservation.
2. Injected failure in the actual funding service at reserve-entry insertion: reward/accounts/ledger/reference roll back; a new legitimate operation can consume the rolled-back reference. This does not by itself prove same-operation retry/idempotency, which is a distinct test requirement.
3. Direct writer with valid parent IDs: the real database funding-reference UNIQUE constraint rejects the duplicate.
4. A file created/reopened using actual pre-R3 source `17d93f0` upgrades with actual merged startup, passes strict final validation and reopens successfully.
5. Same-name non-UNIQUE, wrong-column and wrong-predicate fixtures are rejected by direct final validation and actual application startup. Their main SQLite file hashes remain unchanged after refusal.
6. Actual prior-schema duplicate-reference data is refused by merged startup with `W01-R3 migration blocked`; the main SQLite file hash remains unchanged.

All focused checks completed successfully. The fixture mutations occurred only in synthetic databases. No production data, real payment/provider, live migration or deployment was used. Prior [startup](../audits/2026-10-28-w01-r3-startup.probe.ts.txt) and [legacy-writer](../audits/2026-10-28-w01-r3c-writer.probe.ts.txt) harnesses supplied the old-file fixtures.

### Scope and remaining quality/capability notes

W01 is closed for the reviewed security containment and supported-schema safeguards. W02 resource access, W03 allocation limits and W04 eligibility remain separate findings. Paystack reward funding remains unavailable without trusted settlement/payment-obligation binding and its enablement gates. Stellar verification and platform-credit provisioning remain unavailable. Do not describe disabled paths as working integrations or treat this as production release acceptance.

Retain a non-blocking test-quality follow-up: T11/T12 still use copied migration SQL and T20 directly inserts SQL inside a transaction rather than faulting the funding service. The exact-merge startup/service probes above provide the current acceptance evidence; converting those probes into durable CI tests remains useful. Do not claim T20 alone proves production-service rollback. This note does not identify a remaining runtime defect or require another W01 repair unit before W02.

## Paste into Claude — W02 only

```text
Continue S2/W02 only: cross-owner reward scope checks.

Repository: SM-Web-Systems/lms-crypto-production
https://github.com/SM-Web-Systems/lms-crypto-production.git
Read docs/release/CLAUDE-SERVER-W02-PROMPT.md from documentation branch
codex/platform-wiring-audit. This is a branch, not a separate repository.
Read documents without merging their unrelated RBAC/documentation base stack.
Authoritative planning branch: codex/staged-rollout-plan (PR #103).

W01 security containment is accepted at verified main
1a5326ac1ed2608f11e23d330d4a763ad977798b. Revalidate current main, planning
head and CI; preserve newer work and avoid duplicating any existing W02 fix.
Do not reopen W01 absent a reproduced regression. Preserve the complete
merge/review/CI chain and the operational funding limitations in the handover.

Read the original W02 audit, the latest staged ledgers and
docs/superpowers/specs/2026-10-27-W02-cross-owner-scope.md from the planning
branch. Refresh its outdated line numbers and assumptions against actual
main. Plan and implement W02; do not begin W03/W04 or portal/mobile work.

SKILLS, DESIGN AND REVIEW

Use using-superpowers, find-skills, brainstorming, writing-plans,
executing-plans and/or subagent-driven-development, test-driven-development,
systematic-debugging, verification-before-completion, using-git-worktrees,
requesting-code-review and receiving-code-review. Use Ponytail, Caveman and
Ripwire with verified availability records. Do not claim missing tools ran
or install unreviewed production hooks/proxies/scripts.

AI owns approvals; Claude executes merges after independent review and fresh
checks. Use session/repository evidence to resolve routine decisions without
repeated human sign-off. Missing indispensable facts remain explicit gaps.

Build a bounded caller/resource map before coding: all reward routes and
reads, lists, allocations, transactions/financial summaries, lifecycle actions,
create/idempotency paths, already-in-state fast returns, services and workers.
Trace allocation -> actual parent reward -> authoritative scope. A route
prefix, supplied scope ID, creator ID or successful DB lookup alone does not
establish access. Bind nested resource IDs to the actual authorized parent.

Update the focused developer spec and a bite-sized TDD plan. Include exact
files/interfaces, current RBAC authority, scope rules, admin/recipient/system
exceptions, API errors/DTO privacy, retry semantics, compatibility and a
requirement-to-test matrix. Keep an iterative checkbox task/evidence list.
Create Mermaid authorization/resource diagrams, a retry/fast-return sequence
and the W01 -> W02 -> remaining S2 dependency view. Get independent AI design
review before implementation; resolve findings, then continue autonomously.

POLICY AND IMPLEMENTATION BOUNDARY

Enforce authoritative resource access in shared service paths and all
untrusted API reads/actions, before any cache, idempotency or state-based
early return. Validate lists against the actual authorized scope; a caller
must not select another owner's data by supplying their ID. Apply the same
rules to allocations, ledger/transaction views and nested action endpoints.

Use current RBAC assignments/capabilities and current resource relationships.
Do not authorize from legacy users.role, a stale token label or a permissive
test fixture. Document/test intended administrative access using the existing
effective policy; do not invent a permission name or blanket role bypass.
Retain established tenant/assignment boundaries where present, without
creating a new tenancy subsystem in W02. Preserve legitimate multi-role
journeys and explicitly allowed recipient-only views with their safe DTOs.

For a caller otherwise allowed to use an endpoint, unavailable and foreign
resource IDs should follow the agreed 404 contract without confirming
existence. Preserve unauthenticated and missing-endpoint-permission errors.
Specify list behavior consistently; don't silently convert all failures into
empty success. Do not leak private fields, another owner's balances or state
through retries, response envelopes, aggregates or exception messages.

Authorize the requested resource before lifecycle/idempotency fast returns.
Bind an existing idempotency result to the intended operation/resource and
authorized context; a key from another reward/user must not return their
data or disguise another operation. Preserve genuine authorized retries and
financial idempotency. Recheck current access at relevant transactional write
boundaries instead of relying only on an earlier route lookup.

Distinguish trusted internal worker reads/actions from user-facing access.
Do not break system expiry/notifications by requiring a fictitious actor.
Do not add caller-controlled skipAuth or optional-context bypasses. Trace
every caller so unscoped internal helpers cannot become public read paths.

TDD AND VERIFICATION

Use an isolated codex/ worktree/branch from verified main and a synthetic DB.
First reproduce RED for foreign reward reads, nested reads and lifecycle
already-active/already-approved/idempotent paths. Test route and service
layers; runner/import errors are not meaningful RED evidence.

Use a role-only actor/resource matrix: sponsor, employer, parent, teacher,
ordinary student/recipient and intended administrators. Include each scope
type actually supported (cohorts, teams, families/children, classes), owners
versus unrelated users and legitimate multi-role users. Do not grant admin
permissions merely to make creator fixtures work; use independently
authorized internal grants where a funded reward is necessary.

Cover list scope tampering, allocations/transactions, mismatched nested IDs,
cross-prefix foreign IDs, new and replayed keys, status fast returns, revoked
permissions/ownership/links, legitimate authorized retries and missing versus
foreign resources. Denied writes must leave state/accounts/ledger unchanged.
Test authorized positives too, including intended admin access and preserved
system/recipient journeys. Maintain R1/R2/R3 funding and startup safeguards.

Implement the smallest complete shared policy/route repair. Run focused
RED/GREEN tests, affected reward/RBAC/route suites, worker tests and builds,
plus required fresh candidate CI. Review scope/privacy, all early-return
paths and compatibility independently; fix valid findings and re-review.
Do not refactor unrelated financial allocation or eligibility logic.

CHECKPOINT, MERGE AND STOP

AI records APPROVED, CHANGES_REQUIRED or BLOCKED against exact head/base.
Claude may merge an independently complete W02 candidate only after required
checks pass; then verify/record merge and resulting main CI. Never predict
success in lieu of evidence. Pending checks require CHECKPOINTED with an
exact resume action, not an unqualified completion claim.

Use /loop only when available with documented syntax, restricted to W02's
design/test/review/CI work. Inspect/cancel stale or broader monitors; never
replay completed operations from late notifications. Stop/cancel at the unit
boundary, a genuine blocker or credit/context checkpoint. Save task/spec
state, SHAs, RED/GREEN evidence and resume instructions before long work or
budget exhaustion. Avoid unnecessary review fan-out or repeated unchanged
suites without dropping required fresh verification.

Commit/push implementation and authoritative staged ledgers on their own
branches. Report UNIT_COMPLETE or CHECKPOINTED with actual tests, review,
merge receipt and limitations. Keep later acceptance and disabled funding
capabilities visible. Recommend W03 only after W02's criteria pass, but STOP
before W03. No deployment, live migration, real funding, unrelated merge or
automatic progression to another unit.
```
