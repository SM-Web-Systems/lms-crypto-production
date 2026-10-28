# W01-R1 closure verification and bounded W01-R2 prompt

Date: 2026-10-28. **R1 runtime and C1 regression closure verified. Proceed to W01-R2 after correcting task identity in the planning preflight.** No additional R1 repair unit is required.

Independent review of this packet and bounded prompt: **PASS, no actionable issues**. Relative links, Markdown fences, required workflow terms and diff whitespace checked. This validates the instructions, not completion of R2 implementation or any deployment.

## Verified closure

- [PR #106](https://github.com/SM-Web-Systems/lms-crypto-production/pull/106) merged at `fa187b875644c8ec81bce8d75de977a9006cdcc2`, from head `51928fdd17fbc77a58947791e7e0b2bdeb34996c`, base `8096b9b904a4f765858bf0146d34cf503e3dfa08`.
- Only the internal-funding test file changed. Both new tests start the async operation while authorized, mutate permission/creator before awaiting, and assert the specific denial and zero ledger writes. Existing comments now distinguish pre-call tests from interleaving tests. Service source and dependency lock are unchanged from the previously verified R1 merge.
- [PR CI 40644680249](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40644680249) and [main CI 40645163963](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40645163963): all four jobs SUCCESS. Main backend job `122672174580`: **181 files passed; 1,854 tests passed, one skipped (1,855 total); 25 R1 tests passed**.
- Planning [PR #103](https://github.com/SM-Web-Systems/lms-crypto-production/pull/103) advanced to `b62e923517ed7942881d891cc39a76c18e2ed6f2`. It now records W01 as PARTIALLY_FIXED and R1 merged. Its R3 identity and remaining scope require the correction below; do not reopen R1 runtime implementation over this documentation issue.
- Earlier independent RED/GREEN evidence is recorded in the [R1 merge verification packet](SERVER-HANDOVER-W01-R1-MERGE-VERIFICATION.md). This review inspected the actual C1 test diff and hosted CI; it did not rerun the unchanged R1 application source locally.

## Correct the changed task identity before implementation

The [original W01 repair handover](SERVER-HANDOVER-W01-REVIEW-AND-REPAIR.md) defines:

| Unit | Required scope |
| --- | --- |
| W01-R1 | Internal authorization, correct grant funder ownership, platform-credit backing/denial and write-time authorization |
| W01-R2 | Paystack payment binding: status, reference, amount/currency, ownership and intended funding obligation |
| W01-R3 | Atomic payment-reference consumption: one verified payment cannot fund competing rewards concurrently; retries/rollback remain correct |

Planning `b62e923` instead labels R3 as a Stellar Horizon client and puts reference uniqueness under R2. This is scope drift. **Restore R3 as atomic payment-reference consumption, preserving the original concurrency acceptance criteria.** Any R2 design that touches related code must still leave a separately visible R3 gate until the complete atomic-consumption invariant is verified. Do not quietly drop that requirement or claim a sequential duplicate check solves the race.

Stellar currently fails closed without a verifier. A Horizon client is a separate deferred integration capability, not a replacement for the open atomic-consumption security repair. Keep Stellar denied in this R2 unit. The top-level `W02 next` wording must also become `W01-R2 next; W02 pending W01 closure`.

Refresh planning receipts after #106's merge: main is now `fa187b8`, the C1 merge is complete, and hosted counts distinguish passed from skipped tests. Verify/correct CI IDs against the actual heads (corrected #105 PR run `40641432181`, #105 main run `40641989352`; #106 runs above), and mark historical completion statements superseded where they conflict with current status. Preserve historical evidence instead of rewriting it as if later checks had already occurred.

## Paste into Claude — W01-R2 only

```text
Continue with S2/W01-R2 only: Paystack payment binding.

Repository: SM-Web-Systems/lms-crypto-production
https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit (a branch, not a repository)
Read docs/release/CLAUDE-SERVER-W01-R2-PROMPT.md from that branch without
merging its unrelated RBAC stack. Authoritative planning branch:
codex/staged-rollout-plan, PR #103.

Verified starting main: fa187b875644c8ec81bce8d75de977a9006cdcc2, including
#104 funding gate, #105 corrected R1 and #106 genuine interleaving regressions.
Revalidate current main/head/CI and preserve later work before branching.
R1 is verified; do not repeat its implementation or launch another general audit.

FIRST: correct the planning preflight from the handover. At b62e923, R3 was
incorrectly changed to Stellar Horizon client. Restore W01-R3 = atomic
payment-reference consumption, including concurrent competing requests,
same-operation retries, rollback and provider-appropriate reference identity.
W01-R2 = Paystack binding. Keep uniqueness/consumption under the explicit R3
acceptance gate; do not discard it or substitute sequential checks. Record
Stellar integration separately as deferred and keep Stellar denied here.
Refresh #106/main receipts and change W02-next text to W01-R2 next, with W02
pending W01 closure. Preserve historical receipts and correct stale CI IDs.

AI handles approvals; Claude handles merges. Use using-superpowers,
find-skills, brainstorming, writing-plans, executing-plans and/or
subagent-driven-development, test-driven-development, systematic-debugging,
verification-before-completion, using-git-worktrees, requesting-code-review
and receiving-code-review. Use Ponytail, Caveman and Ripwire. Verify installed
skills/tools and document missing capabilities honestly; no unreviewed
production hooks/proxies/scripts. Reuse the established staged controller.

ASSESS AND SPECIFY R2 BEFORE CODING

Trace the real fund routes, sync/async service paths, Paystack verification,
payment initialization/webhooks/local payment records and existing currency
or settlement policy. Identify authoritative expected amount, currency,
payment owner/beneficiary and reward funding obligation. Treat request fields
and client metadata as untrusted. Avoid changing unrelated purchase/payment
flows when hardening reward funding.

Write a focused developer spec and bite-sized TDD plan under
docs/superpowers/specs/ and docs/superpowers/plans/. Maintain checkbox tasks
with exact files/interfaces, dependencies, commands, expected results and
requirement-to-test links. Include Mermaid sequence/decision diagrams showing
trusted obligation lookup, provider verification, binding/denials, financial
commit and the still-pending R3 atomic-consumption gate. Obtain independent
AI design/spec review, resolve valid findings, then continue without routine
human approval questions.

Define amount units precisely. Do not compare fiat minor units directly with
XLM stroops, invent an exchange rate or create a new financial subsystem.
Use an existing trusted settlement/quote policy if one exists. Where required
evidence or a supported settlement path is absent, fail closed and record the
capability gap. Do not claim unsupported Paystack integration is operational
or silently waive a missing acceptance criterion.

IMPLEMENT WITH TDD

Use an isolated development worktree and a codex/ branch from verified main.
First prove RED: a successful Paystack result with the wrong amount/currency,
wrong owner or unrelated obligation cannot fund the reward. Include returned
reference mismatch, missing/unconfirmed local evidence where required by the
established contract, failed/pending/invalid provider responses, and the
legitimate fully matching case if a supported binding mechanism exists.
Test shared service behavior and reachable HTTP callers with synthetic data
and mocked providers. Test denial leaves reward state, accounts and ledger
unchanged. Require specific errors; runner failures are not RED evidence.

Implement the smallest complete shared-path binding. Supply trusted expected
context from authoritative state, not caller assertions. Ensure a changed
funding obligation cannot use stale evidence to credit a different amount at
commit. Keep external network awaits outside SQLite transactions. Preserve
R1 independent grant authorization, beneficiary ownership, transaction-time
rechecks and platform-credit denial, including all 25 R1 regressions.

R3 remains separately pending until atomic payment consumption is implemented
and concurrency-tested. Document that limit; R2 completion cannot declare
all W01 fixed. Do not implement a Horizon client or W02-W04 in this unit.

VERIFY, REVIEW, CHECKPOINT AND STOP

Run focused RED/GREEN tests, affected funding/lifecycle/payment suites, builds
and required fresh candidate CI. Request independent spec/financial/security
review and use receiving-code-review to resolve findings against evidence.
AI records APPROVED, CHANGES_REQUIRED or BLOCKED at exact head/base SHAs.
Claude may merge only an independently complete R2 candidate after required
checks pass; then verify/record actual merge and post-merge checks. Pending
checks require a truthful checkpoint, not an expected-pass completion claim.

Use /loop only if supported with documented syntax and restricted to this
unit's design/test/review/CI work. Inspect/cancel stale or broader monitors;
never replay an already completed action based on a late notification.
Stop the unit's loop at completion, blocker or credit/context checkpoint.
Preserve task/spec state, SHAs, RED/GREEN evidence and exact resume action
before long operations or budget exhaustion. Avoid unnecessary review fan-out
or rerunning unchanged suites; retain all required fresh verification.

Commit/push implementation and authoritative ledgers to their own branches.
Report UNIT_COMPLETE or CHECKPOINTED with actual checks/review/merge receipt,
capability limits and next action. W01 stays PARTIALLY_FIXED for R3 and any
other unmet criteria; W02 stays pending. STOP after R2. No deployment, live
migration, real payment/funding, unrelated merge or automatic next unit.
```
