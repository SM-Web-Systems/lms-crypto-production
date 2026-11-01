# S2/W01-R1 — merged runtime verification and evidence closure

Date: 2026-10-28. **Runtime corrections VERIFIED; two bounded evidence/test closure items remain.** No further runtime repair is identified by this review. Do not repeat the prior implementation or revert the merged improvement.

Subsequent closure: [PR #106 verification and next R2 prompt](CLAUDE-SERVER-W01-R2-PROMPT.md) records the merged genuine interleaving tests and updated planning branch. R1 need not be reopened; correct the R3 task identity as R2's planning preflight, then proceed with R2 only.

Repository: `SM-Web-Systems/lms-crypto-production` (`https://github.com/SM-Web-Systems/lms-crypto-production.git`). This handover is on branch `codex/platform-wiring-audit`. Authoritative staged ledgers belong to **`codex/staged-rollout-plan` (PR #103)**, not this documentation branch. Neither branch name is a separate repository.

## Verified receipt

| Item | Verified value |
| --- | --- |
| Implementation | [PR #105](https://github.com/SM-Web-Systems/lms-crypto-production/pull/105), merged |
| Original base | `115d8c4f836a059aff733bb4cdeaabc9750963f2` |
| Rejected earlier candidate | `385e5126da6e1c8958fc88bbbfba2993a040e0c6` |
| Corrected PR head | `550bd9a8abb9db6d223d20165287b498a82e0753` |
| Merge | `8096b9b904a4f765858bf0146d34cf503e3dfa08` |
| PR CI | [40641432181](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40641432181), all four jobs SUCCESS |
| Main CI | [40641989352](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40641989352), all four jobs SUCCESS |
| Main backend | Job `122661998526`: 181 files passed; **1,852 tests passed, one skipped (1,853 total)**; 23 R1 tests passed; dependency-security tests all three passed |
| Other main jobs | Frontend `122661998702`, restore `122661998748`, E2E `122662997269`, all SUCCESS |

The earlier expectation that main CI would pass is now replaced by the observed successful run. Any separate local dependency-security failure needs its own environment/command evidence; it is not a failure in this hosted main run.

The corrected PR head and merge have identical server runtime source and dependency lock. Source review confirms grant funder identity derives from the creator for internal sources, while the admin remains the audited actor. Both financial transaction paths recheck internal authorization against current reward state. Ledger-derived ownership lookup remains for historical transactions.

## Independent RED/GREEN retest

The [standalone retest harness](../audits/2026-10-28-w01-r1-merge-retest.probe.ts.txt) uses Node assertions, the installed tsx loader, synthetic users/configuration and an in-memory database. It was run unchanged against isolated extractions of both source revisions. No production application source, database or provider was used.

| Check | Earlier candidate `385e512` | Merge `8096b9b` |
| --- | --- | --- |
| Ordinary self-grant and unsupported credit denied | PASS | PASS |
| Sync grant beneficiary and cancellation ownership | FAIL | PASS |
| Async grant beneficiary and cancellation ownership | FAIL | PASS |
| Permission revoked after initial verifier, scope retained | FAIL: missing rejection | PASS: SCOPE_DENIED, no writes |
| Creator changed after initial verifier | FAIL: missing rejection | PASS: CONFLICT_OF_INTEREST, no writes |
| Total / exit | 1 passed, 4 failed / exit 1 | 5 passed, 0 failed / exit 0 |

Node `v22.18.0`; `DATABASE_PATH=:memory:`, `VITEST=true`, `NODE_ENV=test`, synthetic JWT/Paystack/SSO secrets. Dependency lock matches the installed candidate; extracted service/verifier blobs are checked against their Git revisions. Example invocation after placing the inert harness beside the extracted project's package.json as `retest-probes.ts`, with its dependencies resolvable from an ancestor:

```powershell
node --import ./node_modules/tsx/dist/loader.mjs ./tmp/r1-retest-8096b9b/LMS-Server/retest-probes.ts
```

Set the test environment before import; `_resetForTests()` is only permitted on its in-memory test database. These are direct-service regressions. They do not establish production exposure, a second HTTP callback interleaving within one event-loop turn, physical-device acceptance or real-provider behavior. Hosted CI is separate evidence. No laptop merge/deployment, live migration or real funding occurred.

Independent source review found no additional blocking runtime regression and agreed with accepting the R1 corrections once these exact-merge reproductions passed. They now pass. W01 as a whole remains partial for R2 and R3.

Independent review of this handover and its bounded closure prompt: **PASS, no actionable issues**. Local links, Markdown fences and diff whitespace checks pass. This review does not claim C1/C2 have already been completed.

## Closure item C1 — protect the actual transaction interleaving in CI

The four F2 tests at `LMS-Server/src/__tests__/reward-internal-funding-auth.test.ts:475–605` mutate permissions or creator **before calling funding**. Their names/comments imply a transaction-time interleaving, but they cannot detect removal of the new in-transaction check. This is a test-coverage limitation, not evidence that the runtime fix failed.

Add focused acceptance tests to the actual suite using this order:

1. Create distinct creator/admin identities and reward. For revocation, transfer scope ownership to the admin so ordinary scope validation could otherwise allow it.
2. Start `const pending = fundRewardAsync(...)` while the admin is authorized.
3. Before awaiting `pending`, revoke `reward.manage`, or separately change the reward's creator to the admin.
4. Assert the specific denial, draft state and unchanged accounts/ledger.
5. Demonstrate the new cases fail against `385e512` and pass on current main. Correct misleading old labels/comments rather than claiming historical RED evidence for tests that never exercised the interleaving.

The provided standalone harness already demonstrates this sequence; adapt its assertions to the existing Vitest fixtures. This does not require a new runtime feature, module mock or test-only production bypass. Keep the existing ordinary-denial tests that provide distinct value.

## Closure item C2 — reconcile the actual planning branch

At review, [PR #103](https://github.com/SM-Web-Systems/lms-crypto-production/pull/103) still has head `52d64b52ca56e50324c5dfa431929ecc6950df2d`. Its index says `W01 merged, W02 next` and W01 **Fixed**; the evidence/tasks retain stale completion/advisory and R1 PR-pending claims. The staged index/tasks/evidence files do **not** exist on `codex/platform-wiring-audit` as reviewed at `8c1b8cb`. Updating the R1 implementation spec is not updating these authoritative ledgers. The pasted claim that both had been updated is not supported by the remote refs/files.

On the current planning branch, update:

- `docs/release/STAGED-ROLLOUT-INDEX.md`
- `docs/release/STAGED-ROLLOUT-TASKS.md`
- `docs/release/STAGED-ROLLOUT-EVIDENCE.md`

Preserve historical receipts while marking superseded conclusions. Record R1's actual correction/merge/CI/local retest, C1's status and any follow-up test PR. W01 stays **PARTIALLY_FIXED**. Track W01-R2 (Paystack amount/currency/ownership/payment-obligation binding) and W01-R3 (atomic payment-reference consumption) as blocking units. W02 stays pending W01 closure. Correct hosted skipped-test counts, pending CI/review checkboxes and related spec records using verified evidence. Do not invent a past failure/pass or reclassify unmet R2/R3 criteria as optional advisories.

## Next bounded Claude prompt — R1 evidence closure only

```text
Repository: SM-Web-Systems/lms-crypto-production
https://github.com/SM-Web-Systems/lms-crypto-production.git

Read docs/release/SERVER-HANDOVER-W01-R1-MERGE-VERIFICATION.md on branch
codex/platform-wiring-audit. This is a documentation branch, not a repository.
Fetch/read the packet without merging its unrelated base stack.

R1's runtime corrections are independently verified at merge
8096b9b904a4f765858bf0146d34cf503e3dfa08. PR #105 and main CI both passed all
four jobs. Do not repeat implementation or revert it. The direct-service
retest is RED on 385e512 and GREEN on 8096b9b. Revalidate current heads first.

Complete only C1 and C2 from the handover. C1 adds genuine post-verification
revocation/creator-change acceptance regressions and corrects misleading test
labels/comments. C2 updates the authoritative staged index/tasks/evidence on
codex/staged-rollout-plan (PR #103). Those files are not on the audit branch.
The planning PR was still at 52d64b5 when reviewed. Preserve later concurrent
work and existing merge receipts; do not reset branches or silently merge
the planning PR.

Use the established Superpowers skills, Ponytail, Caveman and Ripwire with
honest availability records. Maintain a short checklist, update relevant
spec/diagram/evidence claims and get independent review. Do not create another
general audit or expand runtime scope. For C1, use a small codex/ test-only
branch/PR from verified main. Prove the new interleaving tests fail on the
earlier candidate and pass on main. Run focused tests and required CI for
that candidate; do not rerun unchanged suites merely to fill a checklist.
AI approves; Claude handles any necessary merge after fresh required checks.
Record exact test PR/head/base, RED/GREEN evidence, CI and merge result.

W01 stays partial for R2 (Paystack binding) and R3 (atomic payment-reference
consumption); W02 is pending. Commit/push planning updates to the planning
branch and test changes to their own review branch. No deployment, live
migration, real funding, unrelated merge or R2 implementation in this unit.

Use only a bounded C1/C2 loop. Checkpoint before long work or budget/context
exhaustion; preserve pending gates and exact resume instructions. Return
UNIT_COMPLETE or CHECKPOINTED truthfully and stop after evidence closure.
Recommend W01-R2 as the next separate unit, without a routine approval question.
```
