# Claude staged planning and execution prompts

Use Prompt 1 first. Review its completed plan, then use Prompt 2 for one selected stage. These prompts narrow the [general assessment prompt](CLAUDE-SERVER-ROLLOUT-ASSESSMENT-PROMPT.md): planning does not authorize implementation, and selecting a stage does not authorize later stages. These documents do not execute anything on the laptop.

The owner subsequently delegated approvals to AI and merge execution to Claude. For that continuation, apply the [AI approval and bounded-stage controller](CLAUDE-SERVER-AI-APPROVAL-STAGE-CONTROLLER.md): AI decisions replace human sign-off below, technical evidence gates remain, and stage boundaries serve as credit/recovery checkpoints.

## Prompt 1 — Assess and plan; stop before execution

Copy into Claude Code on the server:

```text
Plan the staged assessment, integration and rollout of all outstanding LMS and Amma Wallet work. This session is PLAN_ONLY.

First read:
- docs/release/CLAUDE-SERVER-ROLLOUT-ASSESSMENT-PROMPT.md
- docs/release/SERVER-HANDOVER-PLATFORM-WIRING-AUDIT.md
- docs/audits/2026-10-26-platform-wiring-audit.md
- docs/release/SERVER-HANDOVER-RBAC-RETIREMENT.md
- All numbered RBAC and relevant database/mobile/Wallet handovers linked from them.

If these exist only in LMS PR #102, retrieve them in an isolated checkout without merging or modifying the running deployment.

Apply the general prompt's discovery, evidence, isolation and safety rules. This PLAN_ONLY instruction overrides its permission to begin implementation. Do not follow its “begin isolated blocker work” instruction during planning. Do not run or retain a broader execution /loop.

Load using-superpowers, find-skills, brainstorming, writing-plans, using-git-worktrees, requesting-code-review, receiving-code-review and verification-before-completion. Include executing-plans/subagent-driven-development, test-driven-development and systematic-debugging in the execution workflow. Use Ponytail for complete minimal changes, Caveman for concise updates and Ripwire for verified impact analysis. Record missing tools honestly; do not install unreviewed tools/hooks on production.

1. Inventory every accessible local/remote branch, worktree, open/draft PR and relevant closed/merged prerequisite in both repositories. Paginate fully. Include branches with no PR, unique commits, squash/cherry-pick equivalents, deployment provenance and discovery gaps. Give every discovered item a disposition; delete nothing.

2. Reassess W01–W12 against current source. Distinguish implemented, tested, merged, deployed and accepted. Passing the audit's characterization probes demonstrates defects, not security acceptance.

3. Derive separate merge, deployment/client and database migration orders. Build a Mermaid dependency DAG from actual ancestry and semantic requirements. Treat the seed PR order as a historical hint, not a fixed release order.

4. Compare practical rollout approaches and recommend bounded stages. Stage types may include inventory/specification, isolated blocker fixes, combined integration/recovery rehearsal, compatible release batches, installed-client acceptance and later schema retirement. Preserve the accepted v1 cutover artifact, Step 3 compatibility window and separate v2 contraction/recovery gates. Split stages where production evidence or compatibility requires it.

5. Write focused developer specs and executable task plans using repository conventions. Define actors/scopes, APIs/types/units, data invariants, concurrency/idempotency, errors, migrations, compatibility, exact tests and acceptance criteria. Document routine design decisions without repeated spec-section approval prompts. Consolidate indispensable policy/access decisions once.

Create or update these entry points, preserving prior evidence and decisions:
- docs/release/STAGED-ROLLOUT-INDEX.md
- docs/release/STAGED-ROLLOUT-TASKS.md
- docs/release/STAGED-ROLLOUT-EVIDENCE.md

Link dated specs, plans, decisions, diagrams and stage return records from the index.

For EACH stage define:
- Stable ID, purpose, scope, exclusions and prerequisite stage/evidence IDs.
- Exact repositories, branches/PRs and baseline SHAs.
- Permitted operations: documentation, isolated development, rehearsal, merge, migration or deployment.
- Task IDs/dependencies, affected files/interfaces and intended outcomes.
- TDD RED/GREEN/refactor steps for behaviour changes and systematic-debugging procedure.
- Exact test/build/audit commands, expected results and independent spec/technical review.
- Abort/recovery criteria, compatible image/database assumptions and required owner decisions.
- Completion evidence and the next stage's entry criteria.
- Whether exact production-manifest approval is required; preparation-stage selection alone does not provide it.

Create Mermaid diagrams for PR dependencies, staged workflow, v1/v2/client compatibility and recovery. Add Wallet/PKCE and reward lifecycle diagrams where the specs require them. Verify rendering where available; label unrendered source honestly.

Workflow:
Assess → Spec → Plan → Select stage → Execute its tasks → Verify → Review → Record → Stop at stage boundary.

Use checkbox lists plus TODO, IN_PROGRESS, BLOCKED, IN_REVIEW and DONE states. Keep MERGED, DEPLOYED and ACCEPTED separate. Every branch, PR and finding must map to a stage/disposition or recorded discovery gap.

You may run necessary read-only checks and isolated diagnostic reproductions to make the plan concrete. Do not change application behaviour/dependencies, implement fixes, merge, migrate, change live configuration or deploy. Commit/push planning documents on a review branch; never directly to a protected release branch.

Obtain independent plan review, resolve actionable feedback and verify consistency. Present the completed plan, its recommended first execution stage and consolidated unresolved decisions.

STOP after planning. Report PLAN_READY, the index path, plan commit SHA, recommended next stage ID and blockers. Do not execute that stage automatically.
```

## Prompt 2 — Execute one selected stage

Replace STAGE-ID below with the exact ID from the reviewed index.

```text
Execute STAGE-ID from docs/release/STAGED-ROLLOUT-INDEX.md.

This request authorizes only that selected preparation stage's recorded scope. It does not approve later stages or bypass exact production-release approval. If the selected stage includes a protected-branch merge, live migration, configuration change, provider operation or deployment, verify the owner's explicit approval covers the exact pinned actions/artifacts first. Otherwise prepare the concrete decision packet and stop before those actions.

Read the index, selected stage's spec/plan, task ledger, evidence, decisions and relevant server handovers. Apply docs/release/CLAUDE-SERVER-ROLLOUT-ASSESSMENT-PROMPT.md as the baseline procedure. This selected-stage boundary overrides instructions to continue through the entire backlog.

Recheck branch/PR heads, schema/client/deployment assumptions and prerequisite evidence. Reconcile material changes and re-review the affected plan. Never reuse stale production approval. Cancel or replace any broader all-backlog /loop before execution; record the actual result.

Use using-superpowers, find-skills, brainstorming when design changes, writing-plans, subagent-driven-development or executing-plans, test-driven-development, systematic-debugging, using-git-worktrees, requesting-code-review, receiving-code-review and verification-before-completion. Use Ponytail, Caveman and Ripwire under the assessment prompt's rules.

Execute this stage's unblocked tasks without asking “shall I continue?” between tasks:
1. Verify isolated worktree, baseline and exclusive task ownership.
2. Reproduce and prove intended-behaviour tests fail before new fixes.
3. Implement the smallest complete change; verify GREEN and relevant regressions.
4. Diagnose failures systematically; never weaken assertions, skip checks or mask diagnostics.
5. Obtain independent spec and technical/security review; resolve valid findings and re-review.
6. Commit/push reviewed work and record exact SHAs, commands, results and evidence.
7. Continue until this stage's exit criteria are verified or no independent task in this stage can progress.

For already-built work, execute its planned acceptance checks and fix new defects through TDD; do not claim the old work was originally test-first. For documentation, verify content/links/consistency without fabricating runtime tests.

Parallelize independent investigation/review only. Serialize dependent changes and live operations. Keep one task owner and production controller. Never run tests or package/schema tools against live deployment folders/databases.

If /loop is useful and supported, adapt docs/release/CLAUDE-SERVER-ROLLOUT-LOOP-PROMPT.md to STAGE-ID only. It may monitor CI or continue authorized isolated tasks within this stage. It cannot select another stage, approve/execute live operations or replay completed actions. Record job ID/ownership/stop conditions and cancel at this stage's boundary.

Continue independent tasks in this stage while a decision is pending. Ask one consolidated actionable question only when an indispensable decision blocks all remaining work. After three unsuccessful attempts at one blocker, reassess the design. Do not skip prerequisites or cross into another stage.

Verify exit criteria against fresh exact-head results before declaring completion. Automated tests do not prove physical-device, installed-client, protected-database or provider acceptance. Mark unperformed checks NOT RUN and preserve their release impact.

Write the stage return record and update the index/ledger/evidence:
- Stage ID and STAGE_COMPLETE, STAGE_BLOCKED or AWAITING_RELEASE_APPROVAL.
- Changes and dispositions of affected branches/PRs/findings.
- Exact final commits and image/artifact IDs; merge/deploy/acceptance states.
- Test/build/audit commands, counts, failures/skips and evidence references.
- Independent review verdicts and remaining risks/decisions.
- Recovery evidence and any executed operation receipts.
- Recommended next stage and remaining entry criteria.

STOP at this stage's boundary. Cancel its loop and release ownership. Report results and the next-stage recommendation. Do not start another stage until I explicitly select it.
```

## Completion contract

A completed plan is not an executed stage. A completed development stage is not a merged PR or deployed release. A merged release does not prove database/client/provider acceptance. Keep each state and its evidence explicit.
