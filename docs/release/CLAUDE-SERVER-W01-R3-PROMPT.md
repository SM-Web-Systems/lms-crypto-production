# W01-R2 review receipt and bounded W01-R3 prompt

Date: 2026-10-28. **R2 accepted as fail-closed containment; R3 is next.** This does not certify operational Paystack reward funding or deploy anything.

Repository: `SM-Web-Systems/lms-crypto-production` (`https://github.com/SM-Web-Systems/lms-crypto-production.git`). Document branch: `codex/platform-wiring-audit`. Authoritative staged ledgers: `codex/staged-rollout-plan`, PR #103. These are branches inside the repository, not separate repositories.

## Verified R2 receipt and limits

- [PR #107](https://github.com/SM-Web-Systems/lms-crypto-production/pull/107) merged at `17d93f0490078c41f76785927b8cd265218434e3`, corrected head `0dce7166530cf1bc10b9fb295b03ca48ea5ee4d8`, base `fa187b875644c8ec81bce8d75de977a9006cdcc2`.
- Exact-head [PR CI 40705436715](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40705436715) and [main CI 40706452331](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40706452331): all four jobs SUCCESS. The handoff also cites earlier PR run 40705200669; use the exact-head run above for this reviewed candidate.
- Main backend job `122879778400`: **182 files passed; 1,866 tests passed, one skipped (1,867 total)**. All 12 Paystack-binding and 25 internal-funding tests passed.
- Planning PR #103 reviewed at `f0628296b7949124a807875745cde04932b5008d`. W01 is PARTIALLY_FIXED and R3 is correctly named atomic payment-reference consumption.
- Source and test review used immutable GitHub files. Independent review found no blocking active-path R2 gap for ordinary fiat Paystack responses and agreed to accepting unavailable funding as containment. Local shell commands did not complete; no fresh laptop execution or new dynamic reproduction is claimed.

Current rewards are XLM, while supported Paystack responses represent fiat payments. No trusted fiat-to-XLM settlement policy exists. The active reward funding path therefore rejects those fiat results before financial writes. Existing internal grants remain governed by R1; Stellar and unsupported platform credit remain denied.

**Operational capability remains unavailable.** The exported helper's hypothetical same-currency USD tests do not prove usable reward funding. Before enabling a new settlement path, require returned-reference matching, trusted confirmed payment/reward-obligation binding, correct minor-unit conversion/quote policy, ownership and post-await obligation revalidation. The current helper does not compare the returned reference, its `rewardId` context is unused, and the service does not revalidate a changed obligation after provider verification. Do not describe that framework as ready or enable it based only on helper tests. These are separate capability-enablement prerequisites while the active fiat-to-XLM path stays unavailable; do not build a fiat bridge in R3.

## Planning corrections in R3 preflight

At planning `f062829`, the evidence decision log still says “R3 or W02” and the R3 section says “pending R2 completion.” The task/evidence text also overstates future framework readiness.

Correct these in the actual planning branch:

- Next unit is **R3 only**. W02 remains pending W01 security closure.
- Record R2's merged containment, exact-head CI and operational limitation. Distinguish total/passed/skipped tests.
- Mark R3 ready for its own design/implementation assessment; retain its concurrency, retry and rollback criteria.
- Replace future “framework ready” wording with explicit enablement gates above. Keep the unsupported funding capability visible in the wider capability backlog.
- Preserve historical receipts while clearly superseding outdated conclusions. Do not erase known requirements or count a disabled path as a working integration.

## Paste into Claude — W01-R3 only

```text
Continue S2/W01-R3 only: atomic payment-reference consumption.

Repository: SM-Web-Systems/lms-crypto-production
https://github.com/SM-Web-Systems/lms-crypto-production.git
Read docs/release/CLAUDE-SERVER-W01-R3-PROMPT.md on documentation branch
codex/platform-wiring-audit. This is a branch, not a separate repository.
Read the handover without merging its unrelated RBAC base stack.

Reported starting main: 17d93f0490078c41f76785927b8cd265218434e3 (#107 merged).
Revalidate current main, PR/head/CI and existing work before branching; do not
duplicate newer fixes. Planning is on codex/staged-rollout-plan (PR #103),
reviewed at f0628296b7949124a807875745cde04932b5008d.

FIRST correct the planning records from this handover: R3 only is next,
W02 remains pending, R2 is completed containment with Paystack reward funding
unavailable, and future binding/settlement enablement still needs explicit
evidence. Preserve all historical receipts and refresh actual counts/CI IDs.

AI owns approvals; Claude executes merges after independent review and
required checks. Use using-superpowers, find-skills, brainstorming,
writing-plans, executing-plans and/or subagent-driven-development,
test-driven-development, systematic-debugging, verification-before-completion,
using-git-worktrees, requesting-code-review and receiving-code-review.
Use Ponytail, Caveman and Ripwire with verified availability records.
Do not claim unavailable tools ran or install unreviewed production hooks.

ASSESS AND DESIGN R3

Trace every fund writer, reward_transactions schema/index, startup/upgrade
migration, idempotency check, async verification boundary and financial
transaction. checkReferenceNotReused() before an await is insufficient:
two calls can pass before either writes. Enforce the invariant in the
database as well as the transaction logic.

Write a focused developer spec and bite-sized TDD plan under
docs/superpowers/specs/ and docs/superpowers/plans/. Maintain checkbox tasks
with IDs, exact files/interfaces, dependencies, commands, expected results
and requirement-to-test mapping. Create Mermaid diagrams for competing
requests/one winner, same-operation retry, transaction rollback, legacy
upgrade/duplicate detection and R3-to-W02 dependency. Get independent AI
spec review, resolve findings and continue without routine human sign-off.

Define canonical funding identity and uniqueness scope explicitly.
Preserve existing cross-reward no-reuse policy unless an independently
reviewed compatible policy change is required. Respect provider/network
identity and case semantics; do not lowercase opaque references blindly.
Do not include reward ID or idempotency key in a uniqueness key that would
allow the same payment to fund different rewards.

Use the smallest correct database-enforced UNIQUE constraint/partial index,
or a uniquely keyed claim record if necessary. Define null/empty/invalid
reference behavior for legacy data and optional-reference internal grants.
Do not let whitespace or source-type changes bypass the approved identity
rule. A sequential SELECT or idempotency-key index alone does not suffice.

Provider verification stays outside SQLite transactions. Within the write
transaction, validate the current authorized operation, atomically claim or
consume the reference, and commit fund/reserve ledger plus reward state.
Handle duplicate constraints as a controlled conflict (normally 409
DUPLICATE_REFERENCE), without leaking another reward's ID or falling
through to a partial success. Exactly one competing operation may commit.

Define genuine same-operation retry behavior. A retry must not create a
second claim, funding credit or reservation. Different reward/key inputs
cannot disguise a second use. Rollback must undo both financial writes
and the claim; cancellation, expiry or refund must not make an already
consumed external receipt available as fresh funding.

TDD AND DATABASE SAFETY

Use an isolated codex/ worktree/branch from verified current main, synthetic
databases and mocked providers. No real payments or production test writes.

First reproduce RED with concurrently started async fund calls using the
same nonempty reference, separate legitimate rewards and distinct
idempotency keys. Use supported, independently authorized admin_grant paths
where appropriate. Do not disable R2's currency denial, create unsupported
USD rewards or add a test-only bypass just to manufacture a Paystack success.

Prove GREEN for:
- One winner and one controlled conflict; exactly one financial credit and
  reservation; losing reward/accounts/ledger unchanged.
- Sequential and overlapping retries for the same operation.
- Distinct references funding independently without false conflicts.
- Failure after claim before commit, followed by a legitimate successful
  retry, with no orphan claim or partial state.
- Duplicate attempts after cancel/expire/refund do not credit new money.
- Database protection against another connection/writer bypassing the
  application precheck, under the approved identity policy.

Test clean bootstrap and upgrade from realistic prior schemas, repeated
migration, legacy null/empty references, and pre-existing duplicate groups.
Never delete or rewrite immutable financial history to make an index install.
If legacy conflicts prevent enforcement, abort safely with bounded diagnostics
and a separate reconciliation procedure; do not log and continue unprotected.
Do not claim production data is clean without inspecting an authorized copy.

Include upgrade/old-writer/recovery compatibility in the spec. Keep the
invariant enforced across supported paths. Do not remove database protection
as an automatic rollback convenience. Test migration/recovery on synthetic
or protected copies only; no production migration in this unit. Record any
missing real-copy evidence for the later release gate.

Preserve all R1 authorization/beneficiary/interleaving behavior and R2's
fail-closed posture. No Horizon client, fiat settlement service, W02-W04,
unrelated refactor or external funding enablement is in this unit.

VERIFY AND STOP AT R3

Run focused RED/GREEN and concurrency/upgrade tests, affected reward/payment/
lifecycle regressions, build and required fresh candidate CI. Independently
review spec compliance, database atomicity, migration compatibility and
financial correctness. Repair valid findings and re-review changed portions.
AI records APPROVED, CHANGES_REQUIRED or BLOCKED against exact head/base.
Claude may merge only after all required checks/reviews pass; verify and
record actual merge and post-merge checks. Pending checks are CHECKPOINTED,
not expected-pass completion.

Use /loop only if supported and scoped to this unit's design/test/review/CI.
Inspect stale monitors before acting; do not replay completed operations.
Stop/cancel the unit's loop at completion, blocker or credit/context
checkpoint. Preserve SHAs, tasks, RED/GREEN results, migration evidence,
pending gates and exact resume before long operations or budget exhaustion.
Limit review fan-out and redundant runs without omitting required checks.

Commit/push implementation and authoritative ledgers on their own branches.
Return UNIT_COMPLETE or CHECKPOINTED with exact evidence and limitations.
Assess W01 closure against its original invariants: distinguish verified
security containment from disabled Paystack/Stellar capabilities and any
pending deployment/data/device evidence. Do not declare all funding
integrations operational. Recommend W02 only if W01's security criteria
are actually satisfied, and STOP before starting W02.

No deployment, live migration, real funding, unrelated merge or automatic
progression to another unit.
```
