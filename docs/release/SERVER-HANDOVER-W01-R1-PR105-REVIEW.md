# S2/W01-R1 — PR #105 review and correction handover

Review date: 2026-10-27. Decision: **CHANGES_REQUIRED**. R1 is not accepted for merge at the reviewed head.

Repository: `SM-Web-Systems/lms-crypto-production` (`https://github.com/SM-Web-Systems/lms-crypto-production.git`). Implementation branch: `codex/w01r1-internal-funding-authorization`. This packet is on the documentation branch `codex/platform-wiring-audit`; neither branch name is a separate GitHub repository.

## Candidate and evidence

- [PR #105](https://github.com/SM-Web-Systems/lms-crypto-production/pull/105): open, not merged when reviewed. Head `385e5126da6e1c8958fc88bbbfba2993a040e0c6`; base `115d8c4f836a059aff733bb4cdeaabc9750963f2`.
- Planning branch reviewed at `52d64b52ca56e50324c5dfa431929ecc6950df2d` ([PR #103](https://github.com/SM-Web-Systems/lms-crypto-production/pull/103)).
- [CI run 40579439663](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40579439663): all four jobs passed (backend `122454541026`, frontend `122454540556`, restore `122454540990`, E2E `122456537015`). Backend reports **181 files passed; 1,840 tests passed, one skipped (1,841 total)**. The new internal-funding file's 11 tests passed. These results do not cover the two defects below.
- Independent source/spec review agrees both implementation findings require correction. The prior APPROVED (10/10) record does not supersede demonstrated unmet requirements.

Independent review of this packet and its correction prompt: **PASS, no actionable issues**. Relative links, code fences and diff whitespace checks passed. This validates the handover; it does not approve PR #105's current implementation.

The ordinary self-grant denial and unsupported platform-credit denial work in the reviewed source. Those improvements should be retained.

## Findings

### R1-F1 — Authorizer becomes the grant's funder/beneficiary (P1)

The foundation [funding policy](../superpowers/specs/2026-08-13-reward-foundation-spec.md), section 5.3, requires the funding authorizer to differ from the funder, with the reward creator identifying that funder in the established flow.

Both funding implementations still credit and reserve `actorId` as the funder. The new independent-admin scope override now allows admin A to authorize creator B's reward, but A becomes both `actor_user_id` and `destination_user_id` on its funding entry. The new `getRewardFunderId()` then routes cancellation/expiry/refund back to A. This changes ownership of the grant; checking A differs from B does not establish independence from the actual funded account.

Source: [`rewardService.ts:250–263`](https://github.com/SM-Web-Systems/lms-crypto-production/blob/385e5126da6e1c8958fc88bbbfba2993a040e0c6/LMS-Server/src/services/rewards/rewardService.ts#L250), sync equivalent around lines 140–153, and [`getRewardFunderId():774`](https://github.com/SM-Web-Systems/lms-crypto-production/blob/385e5126da6e1c8958fc88bbbfba2993a040e0c6/LMS-Server/src/services/rewards/rewardService.ts#L774). The revised lifecycle tests assert the independent admin's balances, so their green result embeds the policy drift.

**Confirmed service reproduction:** sponsor B creates reward; independent admin A grants it; B cancels it. The funding entry has `actor_user_id == destination_user_id == A`. A receives `10,000,000` available stroops on cancellation; B has no funder account.

**Required correction:** preserve separate authorizer and intended funder identities. Derive the internal grant beneficiary from authoritative reward/policy data, normally its creator, without trusting a caller-supplied user ID. Audit the admin as actor, and credit/reserve the intended funder. Verify release, cancellation, expiry and refund destinations. Preserve legitimate historical ledger ownership; do not rewrite immutable history or infer all old funding belongs to the creator merely to repair new grants. Update tests/spec to assert the established ownership rule.

### R1-F2 — Internal authorization is not rechecked at commit (P2, blocking acceptance)

[`fundRewardAsync():210–214`](https://github.com/SM-Web-Systems/lms-crypto-production/blob/385e5126da6e1c8958fc88bbbfba2993a040e0c6/LMS-Server/src/services/rewards/rewardService.ts#L210) checks internal authorization before yielding to the verifier promise. The later transaction, [`lines 235–240`](https://github.com/SM-Web-Systems/lms-crypto-production/blob/385e5126da6e1c8958fc88bbbfba2993a040e0c6/LMS-Server/src/services/rewards/rewardService.ts#L235), permits either `reward.manage` **or ordinary scope ownership**. It never reasserts the mandatory internal-source permission or independent-authorizer condition against the current reward.

**Confirmed direct-service reproduction:** a reward retains creator B after its cohort is transferred to A. A has `reward.manage` when `fundRewardAsync(... admin_grant ...)` starts. Remove that permission before awaiting the returned promise, while A retains cohort ownership. The call returns `funded` and writes a funding ledger entry despite A no longer having the required permission.

This is a deterministic direct-call interleaving. The internal verifier has no network await: a second HTTP callback in the same Node event-loop turn is not asserted as an exploit. Another database writer/process or direct caller can change authorization between these checks. Production topology and exposure have not been inspected. This concerns R1's permission for creating new internal funds, separate from W02's resource/no-op access checks.

**Required correction:** enforce current internal permission and independent-authorizer policy inside the write transaction immediately before financial mutation, using the current authoritative reward and funder context. Scope ownership must not substitute for internal-source permission. Keep external provider network calls outside SQLite transactions. Regressions must cover revocation after initial verification, unchanged balances/ledger/state on denial, and legitimate independent grants in sync and async paths.

### R1-F3 — Authoritative ledgers still say W01 fixed / W02 next (P2)

At planning `52d64b5`, the index still says `W01 merged, W02 next` and labels W01 **Fixed**. The evidence ledger retains **Fixed** and a unit-complete/W02-next direction. A1/A3 remain described as non-blocking advisories; R2/R3 are not separately recorded as blocking units. The R1 task/evidence still says PR pending creation rather than #105.

Preserve historical #104 receipts, but label superseded conclusions explicitly. Current W01 status must be **PARTIALLY_FIXED / CHANGES_REQUIRED**, with R1 **CHANGES_REQUIRED**, R2 Paystack payment binding and R3 atomic reference consumption still blocking W01 closure. Keep W02 pending. Distinguish historical receipts from current state, correct the hosted skipped-test counts, and record exact current PR/head/base/checks. Also correct #105's body: W01-R2 is Paystack binding, not cross-owner reads (which are W02).

## Local verification and limits

The [inert standalone review harness](../audits/2026-10-27-w01-r1-pr105-review.probe.ts.txt) was run against source extracted from the exact PR head, with the existing dependency tree resolved through an ancestor directory. The server lockfile matches the installed candidate. Git blob comparisons verified that the extracted verifier/service match PR head. No application source was modified; this review did not reuse the laptop's failing Vitest loader.

Environment: Node `v22.18.0`, `DATABASE_PATH=:memory:`, `VITEST=true`, `NODE_ENV=test`, synthetic configuration values. The harness uses Node assertions and the installed tsx loader. It does not contact payment providers or call live APIs. Command from the existing server directory after isolated extraction:

```powershell
node --import ./node_modules/tsx/dist/loader.mjs ./tmp/r1-review-385e512/LMS-Server/review-probes.ts
```

The environment above must be set before running; do not copy this into a production process. It invokes `_resetForTests()` only on its in-memory test database.

Observed output, process exit 0:

```text
CONTROL_PASS: ordinary self-grant and unsupported credit denied; no ledger writes
DEFECT_CONFIRMED: authorizing admin is ledger funder and receives cancellation credit; creator has no funder account
DEFECT_CONFIRMED: grant commits after manage revocation when actor retains scope ownership
REVIEW_RESULT: 1 control and 2 defect characterizations passed
```

Passing characterization assertions demonstrate defects, not security acceptance. These are direct-service probes; they do not establish HTTP exploitability, physical-device acceptance, deployed exposure or full-suite results. The hosted CI evidence above is separate. No laptop merge, production deployment, live migration, real funding or provider transaction occurred.

## Next bounded Claude unit — finalize R1, not R2

```text
Continue S2/W01-R1 only in repository SM-Web-Systems/lms-crypto-production
(https://github.com/SM-Web-Systems/lms-crypto-production.git).
Read docs/release/SERVER-HANDOVER-W01-R1-PR105-REVIEW.md from documentation
branch codex/platform-wiring-audit. That is a branch, not another repository.
Fetch/read this document without merging its unrelated RBAC base stack.

Revise existing PR #105, branch codex/w01r1-internal-funding-authorization,
reviewed at 385e5126da6e1c8958fc88bbbfba2993a040e0c6. Revalidate current heads,
main and planning state before editing. Do not discard prior work, accept its
UNIT_COMPLETE label without evidence, or merge until the findings are resolved.

AI owns approvals; Claude executes merges. Use the required Superpowers skills,
Ponytail, Caveman and Ripwire, with truthful availability records. Follow the
full W01-R1 resume workflow for reviewed specs, detailed plan/checklists,
Mermaid authorization/accounting diagrams, TDD and independent code review.

Address R1-F1 and R1-F2 from this handover. First add RED acceptance tests:
authorizer differs from intended grant funder; cancellation/expiry/refund
credit the correct funder; and permission revoked after initial verification
cannot authorize a new internal grant despite retained resource ownership.
Implement the smallest shared sync/async repair. Recheck internal-source
authorization within the financial transaction using current reward/context.
Do not put external network awaits in SQLite transactions. Keep platform
credit disabled, preserve external funding behavior and immutable history,
and remove fixtures/assertions that encode the approving admin as beneficiary.
Do not add a new credit provisioning system or implement R2/R3/W02 here.

Correct R1-F3 in all authoritative stage ledgers, spec/diagrams and #105's
description. Preserve historical merge receipts while clearly superseding
their completion labels. W01 remains partial; R2 means Paystack binding and
R3 means atomic payment-reference consumption. Keep W02 pending.

Run the corrected regressions, affected funding/lifecycle/refund suites,
build and required candidate CI. Independently review spec compliance and
financial/security correctness, fix valid findings and re-review. Record
APPROVED, CHANGES_REQUIRED or BLOCKED against exact head/base and fresh results.
Claude may merge only an independently accepted R1 candidate after required
checks finish; then verify/record the merge receipt and resulting main checks.
Green CI alone does not close the demonstrated requirements.

Use a bounded design/test/review loop for R1 only. No broader /loop, unrelated
merges or deployment. Checkpoint before long operations or credit/context
exhaustion, preserving SHAs, RED/GREEN evidence, pending CI and exact resume.
Commit/push the revised PR and authoritative ledger updates on their own
branches. Stop after R1's verified boundary, or return CHECKPOINTED with any
pending gate; do not claim merge readiness while checks are pending. No routine
human approval question is needed. R2 is a separate subsequent work unit.
```
