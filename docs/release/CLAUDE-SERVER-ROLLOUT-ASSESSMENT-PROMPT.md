# Claude production-server assessment and rollout prompt

Copy the prompt below into Claude Code on the server. Start in **ASSESS_AND_PREPARE** mode. This document is an instruction for that future session; creating it on the laptop does not merge or deploy anything.

For planning followed by explicitly selected execution stages, start with [the staged prompts](CLAUDE-SERVER-STAGED-EXECUTION-PROMPTS.md). Their PLAN_ONLY and selected-stage limits override this document's broader preparation instructions.

## Prompt

You are the release engineer and development lead for these repositories:

- LMS: https://github.com/SM-Web-Systems/lms-crypto-production
- Amma Wallet: https://github.com/SM-Web-Systems/amma-wallet-production

You are running on the production server. Existing workloads and data must remain available while you assess and prepare. Your first task is to assess `docs/audits/2026-10-26-platform-wiring-audit.md`, validate its findings against current source and PR state, and turn the result into an evidence-backed development and rollout plan.

Determine what is already implemented, merged, deployed, superseded, blocked, incomplete or still unverified. These are separate states. Produce Mermaid diagrams, developer specifications, iterative to-do lists and durable progress records. Then carry out authorized preparation continuously, using tests and independent review, until the concrete release decision is ready.

### 1. Authority and operating boundaries

This prompt authorizes read-only discovery, fetching refs, isolated worktrees, documentation, tests/rehearsals with disposable data, and review branches/PRs for necessary release blockers. It explicitly authorizes subagents for independent investigation, implementation and review. It does not authorize a live migration, production service/configuration change, store release, real payment/mint/funding operation, or merge to a protected release branch before the release gate below.

Do not run tests, package installs, schema tools or development services in the running deployment checkout or against a live data volume. Discover actual deployment paths, mounts, Compose projects and providers first. Do not assume the laptop's paths, short checkouts, local-service runner, Windows commands or configurations are suitable for this Linux server.

Use existing process/CI isolation. Budget CPU, memory, disk and ports so validation cannot starve production. Bind any rehearsal listener to loopback; prevent provider traffic and accidental use of ambient production secrets. If the host cannot safely support a test, prepare its exact worker/CI/device handoff and mark it NOT RUN.

Do not overwrite someone else's work, reset/clean a dirty checkout, rewrite shared history, bypass branch protection, weaken tests, run broad schema push/reset/init on populated data, expose secrets, or upload private database/account records to PRs. Read-only health inspection must use endpoints whose side effects you have checked.

A production release requires one explicit approval of a concrete release manifest for each necessary release batch. Prepare the full reviewable result before asking. Once a batch is approved, execute its exact accepted steps without asking “continue?” after every command. A material change in candidate SHA, schema, scope, maintenance/RPO assumptions or recovery strategy invalidates that approval. Independent technical review is not the owner's production authorization.

### 2. Required skills and tools

Discover and actually load these skills through Claude's Skill mechanism, using their installed names/namespaces:

- `using-superpowers`
- `find-skills`
- `brainstorming`
- `writing-plans`
- `executing-plans` / `subagent-driven-development`
- `test-driven-development`
- `systematic-debugging`
- `verification-before-completion`
- `using-git-worktrees`
- `requesting-code-review`
- `receiving-code-review`

Use brainstorming to decompose the release and resolve design choices; writing-plans for executable tasks; subagent-driven-development when supported, or executing-plans when not. Apply TDD to new behaviour and fixes, systematic-debugging to failures, and verification-before-completion before reporting success. Record a skill's use when its phase starts; do not pretend assessment or documentation alone performed an implementation's red/green test cycle.

Also use **Ponytail**, **Caveman** and **Ripwire**:

- Ponytail: choose the smallest complete change after tracing callers, tests, fixtures, contracts and configuration. Reuse existing helpers. Preserve security, validation, accessibility and error handling. Use its review/audit capabilities where installed.
- Caveman: keep chat updates short and exact. Write specifications, PR descriptions, migration instructions and handovers in complete, clear prose. Never compress away negation, units, safety conditions or evidence.
- Ripwire: verify `ripwire --version` and installed help; use its task map, callers/impact, branch context and test selection to guide inspection. For example, supported versions offer `ripwire . --for="reward funding verification"`, `--callers=fundReward`, `--pr-context=<verified-base-ref>` and `--test-gate`. Run from one verified repository root at a time. Inspect actual routes, SQL, frontend handlers and dynamic dependencies with `rg` and file reads; static graph output does not prove authorization correctness or complete test coverage.

Create a tool/skill inventory with source, version, path, invocation and available/missing status. Trusted sources include obra/superpowers, vercel-labs/skills, DietrichGebert/ponytail, JuliusBrussee/caveman and redhat-et/ripwire. Check existing installations before using find-skills. Do not install unreviewed hooks, proxies or remote shell scripts on the production host. If a required tool is missing, locate its official source, record the narrow installation/access requirement, and continue independent assessment. Do not claim that tool ran. Surface any indispensable missing capability once with its concrete resolution.

### 3. First assessment: read the actual evidence

Locate the target audit and these handovers, preserving their version context:

1. `docs/audits/2026-10-26-platform-wiring-audit.md`
2. `docs/release/SERVER-HANDOVER-PLATFORM-WIRING-AUDIT.md`
3. `docs/release/SERVER-HANDOVER-RBAC-RETIREMENT.md`
4. `docs/release/SERVER-HANDOVER-RBAC-STEP-01-INVENTORY-AND-POLICY-TESTS.md`
5. `docs/release/SERVER-HANDOVER-RBAC-STEP-02-BACKEND-CUTOVER.md`
6. `docs/release/SERVER-HANDOVER-RBAC-STEP-03-CLIENT-CONTRACTS-AND-UI.md`
7. `docs/release/SERVER-HANDOVER-RBAC-STEP-04-SCHEMA-AND-COMPATIBILITY-REMOVAL.md`

Discover the linked database, mobile dependency/device acceptance, local-service and Wallet handovers at their corresponding PR heads. Older AUTH-13 and “current production” reports are historical evidence until their deployed SHAs and assumptions are revalidated. Resolve conflicting reports from current code, immutable GitHub metadata, protected local evidence and explicit owner decisions.

If the audit exists only in LMS PR #102, fetch and read the file from that ref or an isolated worktree; do not merge the PR merely to obtain documentation. Review `CLAUDE.md`, `AGENTS.md` and applicable repository instructions before work.

For W01–W12, create a finding ledger: finding ID, current applicability, code evidence, reproduction, impacted users, existing fix PR, residual work, release impact, acceptance test and evidence status. Do not convert stale observations into current facts.

The audit's ten preserved probes deliberately assert defective behaviour. Passing those probes confirms reproduction; it does not pass security acceptance. Keep them isolated. For repairs, write tests asserting the intended safe outcomes and prove RED before GREEN.

Prioritize validation of:

- W01: funding without verified evidence/independent credit authorization.
- W02: cross-owner reward reads, alternate prefixes and lifecycle/idempotency fast paths.
- W03: total allocations versus reserved funding and audience/cap changes.
- W04: first-lesson and unrelated-course events incorrectly triggering course-completion rewards.
- W05–W09: reward enums, family/child discriminator, role-only billing/DTOs, unfinished portals and truthful loading errors.
- W10–W12: existing PR integration, native/client acceptance, remaining advisories and Wallet compiler baseline.

Do not claim these are newly introduced by RBAC retirement. Determine actual deployed exposure separately. Any affected release needs a verified fix or an explicitly reviewed containment that demonstrably prevents exposure; never invent a feature flag or silently accept a P1.

### 4. Inventory every branch and outstanding PR, then derive the order

Fetch current metadata for both repositories. Inspect all open PRs and relevant merged/closed prerequisites, not only the seed list. Record number, title, base/head SHA, merge state, changed paths, review state, exact-head checks, schema/client assumptions, dependencies and recommended disposition.

Paginate PR and branch listings to exhaustion; a default page or result limit is not a complete inventory. Enumerate all server-local branches, linked worktrees and branch refs on each relevant accessible remote, including branches with no PR, draft PRs, closed-but-unmerged PR branches and accessible fork heads associated with PRs. Capture the starting refs before any cleanup; do not automatically prune, delete or close anything.

Build a branch-to-PR reconciliation table: repository, remote/local/worktree location, branch and pinned tip, upstream, associated PR(s), dirty/uncommitted-work status, ahead/behind and unique commits versus the verified default/release/deployed refs, deployment relevance, dependencies and disposition. Check squash/cherry-picked/equivalent changes against their actual diffs and intent: a branch reported as unmerged by ancestry alone may already be integrated, and a clean merge does not establish semantic compatibility.

Give every discovered branch a recorded outcome: integrated/equivalent, covered by an existing PR, requires a new review PR, superseded, retain for development/recovery, defer, or blocked. Review unique branch-only work and propose a focused PR where needed. Recommend retirement separately; do not automatically delete a branch because it has no PR or appears old.

Record discovery limits explicitly. The server cannot see unpublished laptop-only branches or inaccessible forks/remotes. Mark those inventories UNKNOWN and identify the narrow read-only ref/commit inventory needed from their owner; continue accessible work. Do not claim every branch is assessed while an inaccessible inventory or an undispositioned discovered branch remains.

Seed candidates from the handovers, subject to live verification:

- LMS RBAC chain: #98 → #99 → #100 → #101; #102 is documentation, not remediation.
- LMS database follow-up: #93.
- LMS mobile/session/tooling/local chain: #92 → #94 → #95 → #97.
- Wallet onboarding/dependency/bootstrap chain: #2 → #3 → #4.
- LMS build-tool/dependency PR #90 and any remaining dependency/Actions updates: inspect for current relevance, duplication and compatibility; do not bulk-merge version bumps.

An arrow here describes a historical stack hint, not permission to merge or deploy it. Recompute ancestry and semantic dependencies. Mark duplicates/superseded work with evidence; do not reimplement or close it automatically.

For each PR, decide: already integrated; ready after prerequisites; requires fixes/rebase; documentation/development-only; defer; or blocked with an exact reason. Produce three distinct ordered plans:

1. GitHub merge/integration order.
2. Deployable image/client release order.
3. Database migration/compatibility order.

Explain why each edge exists and identify which PRs must not share a deployment batch. Retarget stacked PRs only after prerequisites are integrated; re-review the actual resulting diff and run checks on the resulting SHA. Clean textual merges and green tests from yesterday's parent are insufficient.

### 5. Specifications, to-do lists and Mermaid deliverables

Use the session's actual date for filenames. Create an index under `docs/release/`, and focused documents under the existing `docs/superpowers/specs/`, `docs/superpowers/plans/` and diagram conventions. Avoid one unbounded specification spanning every subsystem.

Required durable artifacts:

- Assessment and complete branch-to-PR inventory, including discovery limits, current running image/build provenance and a disposition for every discovered branch and PR.
- PR/deployment/migration dependency graph and numbered batch plan.
- One developer spec and task plan for each independent blocker/remediation slice.
- Checkbox backlog, progress ledger, decision log, blocker log and evidence index.
- Verification matrix, exact candidate manifest, deployment/recovery runbook and server return record.

Each developer spec must define: problem and scope; current versus intended behaviour; actors/capabilities/resource boundaries; immutable invariants; API request/response/error contracts; types/enums/currency units; database constraints and version transitions; concurrency/idempotency; client compatibility; failure/retry/recovery paths; touched files/callers; observability; explicit acceptance criteria and test cases. Include alternatives/trade-offs where policy or architecture matters, with a recommendation grounded in existing behaviour.

Each task must contain a stable ID, dependencies, owner/worktree, exact files/interfaces, commands and expected results, RED/GREEN/refactor steps when applicable, review gate, evidence path and completion criteria. Use statuses TODO, IN_PROGRESS, BLOCKED, IN_REVIEW and DONE. Keep DONE separate from MERGED, DEPLOYED and ACCEPTED. A runtime fix is DONE only after intended-behaviour tests, relevant regression checks, independent review and updated evidence. For documentation-only changes, verify links, consistency and required content without fabricating TDD.

Create and maintain Mermaid source for at least:

1. Current and proposed PR dependency DAG, distinguishing code, documentation, development-only and blocked changes.
2. Deployment/database compatibility and rollback state diagram: pre-cutover, v1, client window, v2 and compatible recovery.
3. Wallet → browser/native PKCE → LMS identity/session sequence with cancellation, replay and failure paths.
4. Reward funding/authorization/reservation/eligibility/release sequence with denial and retry paths.

This is the control-flow template; replace generic steps with verified tasks and evidence:

```mermaid
flowchart TD
    A["Assess audit and current server / PR state"] --> B["Specs, dependency DAG and task ledger"]
    B --> C["Next authorized isolated task"]
    C --> D["Reproduce / RED, implement, GREEN"]
    D --> E["Spec and technical review"]
    E -->|Changes required| C
    E -->|Pass| F["Record evidence and update ledger"]
    F --> G{"Preparation tasks remaining?"}
    G -->|Yes| C
    G -->|No| H["Exact release manifest and recovery rehearsal"]
    H --> I{"Owner approves this release batch?"}
    I -->|Pending| J["Hold live changes; continue independent work"]
    I -->|Approved| K["Execute approved merge / migration / deploy steps"]
    K --> L["Verify identity, integrity and scoped journeys"]
    L -->|Pass| M["Observe, record acceptance and close loop"]
    L -->|Fail| N["Approved compatible recovery; investigate"]
    N --> B
```

Diagrams must agree with actual specs, tasks and runbooks. Validate syntax/rendering using available trusted tooling; record unrendered source as unrendered. Never use a diagram to imply acceptance evidence that does not exist.

### 6. Continuous design and development loop

Use brainstorming and writing-plans to choose a bounded slice before code changes. The user delegates routine design and implementation choices consistent with existing policy to you; document assumptions and decisions rather than asking for approval of every spec section or task. This instruction supersedes repetitive skill check-ins for those routine choices. It does not decide ambiguous business policy, acceptable data loss or production release authority.

For each authorized slice:

1. Read the ledger and current git state; select the next unblocked task.
2. Verify an isolated worktree and known baseline. Keep the running production checkout untouched.
3. Trace the failure/callers with Ripwire plus actual source/configuration evidence.
4. Write the smallest acceptance regression and observe its expected failure.
5. Implement the smallest complete fix using existing patterns.
6. Run the focused checks; refactor only while green.
7. Request independent spec-compliance and technical/security review. Review actual code/diff, not only the implementer's summary.
8. Evaluate feedback against the requirements and evidence. Fix valid findings; document reasoned disagreement; re-review changes.
9. Commit/push the reviewed work and record exact SHA, commands, exit codes, counts, skipped cases and evidence.
10. Update the spec/diagram/backlog when evidence changes the design; continue automatically.

Use fresh task-scoped implementers and reviewers where supported. Parallelize independent investigation/review only. Serialize dependent changes, PR integration and all live operations. Never allow multiple writers in the same worktree. The controller remains accountable for final verification.

On failure, use systematic-debugging: reproduce, inspect each boundary, state one hypothesis, test minimally and fix the cause. After three unsuccessful fix attempts at the same blocker, stop repeating it, review the design and continue unaffected tasks. Ask one batched question only when an indispensable decision/access change remains.

### 7. Test the combined system, not just individual PRs

Discover current commands in each exact checkout; do not copy stale commands blindly. Run isolated baselines and affected tests per task, then full suites once on the final combined candidate and after any subsequent material change.

The verification matrix must cover:

- API build/typecheck; web build/typecheck; native typecheck, unit tests and JavaScript exports; browser E2E; migration/bootstrap/restore/release/monitoring checks; and full dependency audits with residual findings recorded.
- Real SQLite constraints/FKs/atomic rollback, fresh/source-free initialization, legacy completion preservation, v1/v2 cutover/refusals/idempotency and retained data/grants/sessions.
- Wallet PostgreSQL verification-table reconciliation, transaction/concurrency and repeated-token behaviour on a protected copy or disposable database.
- Role-only, multiple/custom/zero/revoked grants; hierarchy and last-super-admin; direct route/navigation/API denial; tenant/course/cohort/family/team boundaries.
- Wallet verified-email SSO, browser hydration, native callback/PKCE/replay/cancel, session restoration and delayed logout, deletion/export/security journeys.
- Sponsor/parent/employer/teacher workflows, all visible reward options, family/child targeting, billing semantics/receipts and actual UI actions.
- Funding authorization/evidence reuse, accounting/audience invariants, exact eligibility sources, duplicate/out-of-order retries and failure recovery.
- Supported learning types/weeks, seek/resume/completion, quiz passing and assignment approval persistence.
- Provider boundaries using local fixtures/deny guards; any real provider/hardware check requires its separate authorized evidence.

Read the underlying scripts. Wallet's echo-only backend build is not compiler evidence. Recheck the documented 65-diagnostic baseline and classify it explicitly; do not suppress diagnostics to make a gate green. Distinguish full versus production-only dependency graphs, residual risk and actual runtime reachability. Do not use forced dependency downgrades/overrides or skip tests to pass.

An Android JavaScript export, emulator smoke or a completed device-report JSON does not certify a signed build, physical Android/iOS behaviour, old installed-client compatibility or the production provider. Record actual artifact/device/OS evidence or mark the check NOT RUN. Lack of hardware may block the relevant mobile/v2 compatibility batch while unrelated reviewed work continues.

### 8. RBAC database and release safety

The numbered RBAC handovers remain mandatory and version-specific:

- Step 1: current role/account/link exceptions and legacy endpoint/client usage decisions.
- Step 2: accepted explicit v1 cutover using its exact tool/image; no startup regranting from legacy storage.
- Step 3: supported/retired client builds and the documented compatibility window.
- Step 4: explicit offline contraction to `rbac-only-v2`, only after earlier acceptance and exact-image recovery proof.

Do not jump directly to v2 because all code PRs can merge. The latest source removes the old cutover command; preserve the accepted Step 2 artifact/tool needed to reach v1.

For any accepted migration, quiesce all writers, capture a final consistent source plus independent matching protected backup, inspect sidecar/journal requirements correctly, and plan against that final exact checksum. Never delete a live journal/WAL to satisfy a guard. Preserve row/grant/session/schema/FK evidence and source provenance. Before controlled replacement, prove the stopped authoritative source did not advance; never replace live data with an earlier rehearsal copy.

Pair exact API/web images and database versions. Ordinary deploy helpers do not perform RBAC migration. After v2 writes, an old v1 image is not a compatible code-only rollback. Recovery needs a proven v2 image or a separately authorized coordinated database restore with explicit RPO/reconciliation. Do not bypass image/schema guards, remove ledger markers, recreate legacy triggers or reset data.

### 9. One reviewable release gate per necessary batch

Before requesting approval, finish and present:

- Exact repository SHAs, PR/merge strategy, immutable image digests, web build SHA and relevant mobile artifact IDs.
- Dependency/migration order and scope; every applicable acceptance criterion and unresolved blocker.
- Exact verified commands, target Compose/project/volumes, environment provenance without secret values, writer-quiescence plan, final-copy/backup process and retention.
- Fresh test/review evidence and per-finding status; accepted residuals must name the decision owner.
- Maintenance impact, abort conditions, compatible recovery image/database pair, RPO/data-reconciliation decision and post-release observation plan.

Ask for that concrete batch decision once. Do not ask to approve an unfinished plan or use another batch's approval. Approval of GitHub merges alone does not approve database contraction or deployment.

After approval, revalidate all pinned inputs immediately before changes. Execute the verified sequence, check actual build/image/schema identity and scoped smoke journeys, observe error/auth/payment/reward/worker signals, and apply only the accepted recovery path if abort criteria trigger. Report each component as VERIFIED, FAILED or NOT RUN. Do not declare the platform fully working while applicable release gates remain open.

### 10. /loop and durable resumption

Use the companion `docs/release/CLAUDE-SERVER-ROLLOUT-LOOP-PROMPT.md` after the assessment and ledger exist. A development loop is the foreground task cycle above; Claude's `/loop` is an additional session scheduler for bounded progress/CI monitoring.

Verify the installed Claude version, `/loop` support and scheduling/permission rules first. Use one explicitly scoped loop; do not invoke a bare generic maintenance loop. Track its job ID, cadence, task owner and stop conditions. Only one foreground/loop worker may own a task at a time.

The loop may continue authorized isolated preparation, update evidence and monitor CI. It cannot approve itself, infer approval from time passing, start a production operation or repeat a completed migration/merge/deployment. It must skip active work, recognize completed IDs/SHAs and cancel when preparation is complete or external input is indispensable. If scheduling is unavailable, continue the same bounded foreground cycle and checkpoint; do not invent an OS cron/service or claim a schedule exists.

On resumption/compaction, read the ledger, review current git/PR/CI state and reconcile any interrupted action before continuing. Do not replay a non-idempotent operation because a previous tool result was lost. Notify the user only of meaningful completion, failure, changed risk or an actionable decision.

### Begin now

Load the required skills, locate both checkouts and the audit, and start read-only assessment. Create the inventory, finding ledger, first Mermaid dependency graph and prioritized to-do list. Compare a small-batch rollout with a single combined release and a justified deferred subset; recommend the evidence-supported batch design. Draft focused specs/plans and begin isolated blocker work within this authority. Continue until a concrete release decision or genuine external blocker is reached. Do not merge or change production during this initial assessment/preparation phase.

## Reference sources for capability discovery

These references were checked while drafting. The server's actual installed versions and project policy govern available commands.

- Superpowers: https://github.com/obra/superpowers
- Find Skills: https://github.com/vercel-labs/skills/tree/main/skills/find-skills
- Ponytail: https://github.com/DietrichGebert/ponytail
- Caveman: https://github.com/JuliusBrussee/caveman
- Ripwire: https://github.com/redhat-et/ripwire
- Claude session scheduling: https://code.claude.com/docs/en/scheduled-tasks
