# Claude server prompt — retrieve, assess, plan and execute W01-R1

Paste the following prompt into Claude on the server. It repairs the branch/repository ambiguity and limits execution to one unit. It does not start a loop or authorize deployment from this laptop.

Validation on 2026-10-27: GitHub authenticated file retrieval verified the original handover at the pinned commit; independent prompt review PASS. Required skill/tool names and Markdown fences checked. This validates instructions, not execution of the server repair or its tests.

```text
Continue the staged LMS rollout. First retrieve and assess the actual handover file. Then plan and execute S2/W01-R1 only, under the gates below.

SOURCE IDENTITY — DO NOT CONFUSE THESE

GitHub repository: SM-Web-Systems/lms-crypto-production
Repository URL: https://github.com/SM-Web-Systems/lms-crypto-production
Git clone URL: https://github.com/SM-Web-Systems/lms-crypto-production.git
Document branch: codex/platform-wiring-audit
Original document commit: 223b262256fefdb83c28db929a92e6cbb5f686d4
File: docs/release/SERVER-HANDOVER-W01-REVIEW-AND-REPAIR.md
Exact file URL: https://github.com/SM-Web-Systems/lms-crypto-production/blob/223b262256fefdb83c28db929a92e6cbb5f686d4/docs/release/SERVER-HANDOVER-W01-REVIEW-AND-REPAIR.md
Audit/documentation PR: #102
Planning PR: #103, branch codex/staged-rollout-plan
Reviewed runtime merge: PR #104, 115d8c4f836a059aff733bb4cdeaabc9750963f2

codex/platform-wiring-audit is a branch INSIDE the LMS repository. It is not a repository named codex/platform-wiring-audit. The previous attempt searched the wrong namespace. Do not repeat organization-wide repository searches.

1. RETRIEVE AND ASSESS FIRST

Locate an existing checkout whose remote matches this exact repository, or clone the canonical repository into an isolated development directory. Protect existing edits. Do not develop, install packages or run tests in the live deployment directory. GitHub's authenticated contents API is an alternative for reading the file if Git is unavailable.

From a verified development checkout with origin pointing to that repository, run:

git fetch origin refs/heads/codex/platform-wiring-audit:refs/remotes/origin/codex/platform-wiring-audit
git cat-file -t 223b262256fefdb83c28db929a92e6cbb5f686d4
git show 223b262256fefdb83c28db929a92e6cbb5f686d4:docs/release/SERVER-HANDOVER-W01-REVIEW-AND-REPAIR.md

Read the document without checking out its branch or merging PR #102's unrelated RBAC base stack. Distinguish authentication/access, missing local objects, changed refs and actual missing paths. A private-repository 404 alone does not prove nonexistence. Record exact failures and use the authenticated repository API as a read fallback. Never fabricate file contents or claim a tool succeeded when it failed.

Assess the handover against CURRENT main, PR #103's latest ledgers, the W01 spec and reward foundation section 5. Resolve full SHAs and reconcile newer repairs before duplicating work. Preserve historical receipts. Record each claim as confirmed, contradicted, superseded or unverified, with source/test evidence. Check whether R1 is already fixed; if so, verify and reconcile it, then stop at this same boundary.

The handover identifies three remaining W01 blockers: internal-source authorization/backing (R1), Paystack payment binding (R2), and atomic reference consumption (R3). Do not accept historical completion labels without verification. The cited hosted CI run 40476416544 reports 1827 passed and one skipped. The laptop's three additional probes never executed because Vitest failed during setup; they are proposed characterizations, not passing acceptance evidence.

2. SKILLS AND TOOL INVENTORY

You MUST use these skills in this session, when their corresponding phase is reached:
- using-superpowers
- find-skills
- brainstorming
- writing-plans
- executing-plans and/or subagent-driven-development
- test-driven-development
- systematic-debugging
- verification-before-completion
- using-git-worktrees
- requesting-code-review
- receiving-code-review

Also use Ponytail, Caveman and Ripwire. Load installed skills through the available skill mechanism; inventory source, version/path, invocation and available/missing status. Use find-skills to locate missing requested skills from verified sources. Do not claim invocation merely because a name appears in a document. Do not install unreviewed hooks, proxies or remote scripts on production. If a tool is missing, record that limitation and continue independent work; checkpoint only work that genuinely requires it.

Ponytail: smallest COMPLETE repair, trace every caller, reuse existing mechanisms, preserve security and error handling.
Caveman: concise progress and handoffs, without losing exact evidence or producing ambiguous persisted instructions.
Ripwire: inspect installed version/help, then use supported impact/caller/test-selection commands. Confirm conclusions with rg, source, SQL and route inspection. Static graphs do not establish authorization correctness. Record any rg/manual fallback as a fallback, not a Ripwire run.

3. PLAN, SPEC AND DURABLE TO-DO LIST

The owner delegates approvals to AI. Claude handles merges. Use independent AI review and recorded decisions instead of repeatedly asking the owner to approve routine design, tests or merges. Evidence prerequisites remain mandatory. Do not invent credentials, production state, payment backing or release approval evidence.

Use brainstorming to compare the smallest viable repairs, then have the independent reviewer assess the selected design. Correct the nonexistent reward.admin_grant requirement against the established reward.manage plus independent-authorizer policy. Do not invent a financial subsystem; if trusted backing cannot be established, fail closed and document the unavailable funding path.

Update the authoritative STAGED-ROLLOUT-INDEX.md, STAGED-ROLLOUT-TASKS.md and STAGED-ROLLOUT-EVIDENCE.md on the planning branch. Preserve the #104 receipt and record W01 as PARTIALLY_FIXED / CHANGES_REQUIRED unless newer verified repairs close it. Add R1/R2/R3 separately; execute only R1 now.

Write or update a focused R1 developer spec and implementation plan under docs/superpowers/specs/ and docs/superpowers/plans/. Include:
- Exact source baseline, problem, invariants, scope and exclusions.
- Caller/route/service map; authorization source; actor, creator and funder identities; audit requirements.
- Existing accounting model, total exposure, trusted grant/credit backing and atomic debit/reservation behavior.
- API errors, denied-path rollback, compatibility and recovery behavior.
- Exact files, interfaces, test fixtures, commands and expected results for each task.
- A requirement-to-test matrix and explicit acceptance criteria.

Maintain an iterative checkbox task list with IDs, dependencies, status, evidence and next action. Link it to the authoritative stage ledger. Create valid Mermaid diagrams showing the internal-funding sequence, allow/deny and rollback decisions, and the R1/R2/R3-to-W02 dependency chain. Validate rendering if a renderer is available; otherwise record the limitation.

Checkpoint the assessed source, reviewed spec and plan before runtime edits. Continue automatically after recorded AI approval; no routine human confirmation is required.

4. TDD IMPLEMENTATION — W01-R1 ONLY

Use a clean isolated worktree and a codex/ branch from verified current main. Execute the reviewed plan task by task. Use an independent reviewer for spec compliance and technical/security quality; serialize edits to shared files.

Reproduce internal self-credit with a role-only funder lacking reward.manage and approved backing. Turn this into RED security acceptance tests before changing behavior. Distinguish an assertion exposing the defect from a runner/import failure. Use systematic-debugging to isolate failures; do not skip tests or weaken assertions to get green.

Implement authorization/backing in shared service paths for sync and async callers. Cover sponsor, parent, teacher and employer routes where applicable, direct service calls, revoked permissions, independent authorizer versus creator, auditable grants, insufficient/zero credit, exposure boundaries, legitimate retries, rollback and concurrent consumption of available credit. Verify every discovered caller. Update funded-reward fixtures to use legitimate authorization/backing; never add test-only production bypasses.

Keep R2/R3 obligations visible without implementing them in this run. Do not mistake them for non-blocking advisories or mark all W01 complete after R1.

5. VERIFICATION OF EXISTING AND CHANGED BEHAVIOR

Inventory existing tests/CI across RBAC, funding/lifecycle, sponsor portals, SSO/Wallet, native mobile, migrations and rollback. Build a coverage/evidence matrix identifying source/client/image SHA, test command, environment, result and gaps. Reuse exact-head evidence where still applicable. Record untested device/provider/deployment journeys as pending.

For this unit, run focused RED/GREEN tests, affected reward suites, backend build and the candidate's required full CI including relevant API/web/E2E checks. Use synthetic databases and mocked providers. Do not test with real money or production databases. Broader unrelated remediation, physical-device acceptance and live deployment checks remain separate stages. Never claim everything works from unit tests alone.

Request independent review, evaluate findings with receiving-code-review, repair valid issues and re-review changed portions. Verify fresh results before completion. AI records APPROVED, CHANGES_REQUIRED or BLOCKED against exact head/base SHAs. Claude may merge an independently complete R1 candidate only after all required checks/reviews pass. Revalidate after a material base/head change. Do not bypass branch protection. W01 stays partial for R2/R3.

6. BOUNDED /loop AND CREDIT CHECKPOINTS

Within W01-R1, use this loop: assess -> spec -> plan -> RED -> repair -> GREEN -> independent review -> fix findings -> verify -> checkpoint. Iterate within scope without routine owner intervention.

If /loop is available, use only its documented syntax and restrict it to this unit's pending review/checkpoint/CI work. Inspect existing schedules and cancel or narrow any broader loop. Do not invent a slash command or claim scheduling occurred. A manual iterative loop is the fallback if scheduling is unavailable. It may not advance to R2/R3/W02, merge unrelated PRs or deploy. Cancel the unit's schedule at completion, a genuine blocker or a budget checkpoint.

One bounded unit per run. Limit review fan-out and avoid rerunning unchanged full suites without cause; never trade required verification for token savings. Checkpoint before a long test/build, before/after a merge and before budget/context becomes tight. Record actual budget signals if available; never invent a remaining credit balance. Preserve completed evidence and an exact resume command if interrupted. Inspect remote/process state before retrying an operation whose response was lost.

7. RETURN AND STOP

Commit/push reviewed R1 work and the authoritative ledger updates on their correct branches. Do not silently merge the planning PR or unrelated stacks. No deployment, live migration, live configuration change, real funding or branch deletion is authorized by this unit.

Return UNIT_COMPLETE, UNIT_BLOCKED or CHECKPOINTED, with:
- Exact repository, branch, head/base and handover source SHA.
- Assessed claims, spec/plan/checklist/diagram paths and completed task IDs.
- RED/GREEN, build/CI and independent review evidence.
- AI decision, PR/merge receipt if any, remaining limitations.
- W01 partial status, R2/R3 obligations and exact resume action.
- Confirmation that the unit's loop has stopped.

STOP after W01-R1. Do not start the next unit or ask a routine approval question.
```
