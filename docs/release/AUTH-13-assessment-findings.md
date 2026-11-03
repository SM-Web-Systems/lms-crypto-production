# AUTH-13 assessment findings

Assessment executed locally on 2026-10-23 before implementation. Remote main remains `bef8653`; branch baseline `bbf17a0` includes unmerged PR #77. GitHub currently has two open issues (#67/#68) and fourteen open PRs, including #77, mobile verification handoff #62, and twelve dependency PRs (#70, #69, #53, #52, #50, #51, #49, #48, #46, #45, #43, #42). No issue, PR, branch protection, secret or production setting was changed by assessment.

## History reconciliation

| History | Evidence inspected | Current disposition |
| --- | --- | --- |
| AUTH-01 | `payment-rbac-auth01.test.ts`, AUTH-06 coverage inventory | Payment permission gates exist; retain and rerun, not a fresh implementation |
| AUTH-02 | release report, `auth02-sponsor-billing-scope.test.ts`, payments/badges routes, issue #68 | Cohort billing isolation implemented on main; verify all five issue criteria and prepare closure evidence |
| AUTH-03 | sponsor-cohort ownership report, ownership/integration tests | Owned-cohort mutations implemented; preserve legitimate owner/shared-member cases |
| AUTH-04 | integrated review I-1–I-5 and `auth04-cross-module-integration.test.ts` | Follow-up discriminator/context/trigger debt remains; reassess with explicit admin policy |
| AUTH-05 | merged regression history represented in AUTH-06 consolidated report and current tests | No separate new vulnerability inferred from phase number; verify integrated boundaries |
| AUTH-06 | security coverage/release readiness SEC-01–SEC-04 | Consolidation and fail-closed tests still required; existing sponsor regressions are evidence to retain |
| AUTH-07 | deployment report/specification | Historical deployment evidence only; no redeployment authorized |
| AUTH-08 | post-deployment report | Historical stability/security validation; do not reuse as proof of current runtime |
| AUTH-09 | infrastructure report and hardening specification | Deferred non-root/read-only work subsequently addressed by AUTH-10/11; environment secrets remain accepted risk |
| AUTH-10 | assessment/hardening report, Dockerfile/compose, monitoring scripts | Non-root API/read-only API root implemented; capabilities/frontend filesystem/dependency work remain separate |
| AUTH-11 | deployment report and assessment | Reports deployed `6763f4e`, UID/volume migration, rollback backup/images; current state not independently inspected here |
| AUTH-12 | assessment/specification/stability report and verifier scripts | Observation and backup/mail evidence incomplete or historical; existing verifier intentionally returns PENDING REVIEW, but does not enforce complete evidence or failure exit status |
| Platform/Wallet follow-up | PR #77, Wallet PR #2, October 22/23 audit reports and passing CI | Role revocation/effective context/sponsor UI/native parity/SSO hardening implemented and tested on review branches; unmerged, undeployed; carry forward |

## Prioritized backlog

Severity is the assessment's original priority; current status does not imply a live production failure. Acceptance and dependency details follow the table.

| ID | Original severity | Classification before AUTH-13 | Source / affected components | Security or data impact | Action / release allocation |
| --- | --- | --- | --- | --- | --- |
| DB-01 | P0 | CONFIRMED OPEN | `initDb.ts`, Docker entrypoint | DROP/recreate limited tables, demo credentials and credential logging on initialization | Replace with explicit canonical initialization; AUTH-13 database PR |
| DB-02 | P0 | CONFIRMED OPEN | `database.ts` bootstrap and `schema.sql` | Separate schema paths; missing file auto-created; small unexpected DB considered fresh; Windows URL pathname handling incorrect | Preflight before writes, full schema + migrations, real-process fixtures; database PR |
| DB-03 | P1 | CONFIRMED OPEN | automatic migration rebuilds, rewards stub, payments-status probe | Legacy rebuilds can drop data/columns; insert-based payment probe confuses FK errors with old CHECK | Reject legacy destructive migrations before mutation, transactionally apply safe changes; database PR |
| DB-04 | P1 | PARTIALLY RESOLVED | September incident guard and cold-start tests | Existing tests simulate copied guard logic instead of executing startup; SHM/orphan/partial cases missing | Replace/extend behavioral subprocess and WAL fixtures; database PR |
| DB-05 | P2 | CONFIRMED OPEN | entrypoint invokes runtime `npx tsx` | Startup depends on source execution and npm/tool cache under read-only container | Compiled CLI/startup proof; remove startup invocation, keep development tooling; database PR |
| AZ-01 | Low / P1 maintenance impact | CONFIRMED OPEN | AUTH-04 I-1/I-2, SEC-01, `cohorts.ts`, `payments.ts`, `rbac.ts` | Business permissions identify administrators and can accidentally grant global bypass | Explicit shared admin identity plus existing resource/tenant scopes; authorization PR |
| AZ-02 | Info / Low | CONFIRMED OPEN | I-3/I-4, SEC-02/03, cached request permissions | Missing context/order and database failure behavior are insufficiently explicit | No assertion-based bypass; structured fail-closed behavior and tests; authorization PR |
| AZ-03 | Info → P1 | CONFIRMED OPEN | I-5/SEC-04, role trigger and `migrateUsersToRbac()` | Startup additionally grants super-admin to a hardcoded email at authorization version zero | Remove email-driven promotion; audit trusted provisioning/trigger behavior; authorization PR |
| AZ-04 | P1 | RESOLVED IN CODE / STALE DOCUMENTATION | #68 and AUTH-02/03 sponsor tests | Original five billing/badge access routes now contain cohort scopes | Rerun acceptance matrix; prepare issue reconciliation, do not close automatically |
| AZ-05 | P1 | RESOLVED ON REVIEW BRANCH | PR #77 revocation/effective access/Wallet changes | Earlier gaps patched and tested, but not yet deployed | Preserve dependency; do not duplicate or claim production resolution |
| PAY-01 | P1 | PARTIALLY RESOLVED / NEEDS VERIFICATION | #67, CI workflow, webhook fixtures | CI currently passes but source depends on a repository secret; value type and enforced merge gate not proved | Isolated test-only HMAC generation/positive-negative-idempotency tests; assess gate metadata; payment/monitoring PR |
| MON-01 | P1 | PARTIALLY RESOLVED | AUTH-12 verifier | Premature PASS replaced by PENDING REVIEW, yet missing evidence/interval/SHA/security/backup gates and failed verdict exit behavior remain | Offline structured verifier and fixtures; preserve live observation; payment/monitoring PR |
| MON-02 | P1 | CONFIRMED OPEN | health/dead-man scripts and source-only monitoring tests | Read failures can be normalized to OK; future heartbeat and submission-versus-receipt semantics unclear | Behavioral shell fixtures, configurable evidence paths and explicit failure semantics; payment/monitoring PR |
| OPS-01 | P1 | NEEDS VERIFICATION | AUTH-10/11/12 backup reports, disaster recovery runbook | Daily continuity documented historically; rotation and post-hardening restore not demonstrated consistently | Disposable restore drill and evidence checklist; actual backup/retention server-owner verification |
| OPS-02 | P2 | ACCEPTED RISK | AUTH-10 secrets disposition | env_file delivery remains | AUTH-14/secret-management release; no secret access here |
| OPS-03 | P2 | CONFIRMED OPEN / DEFERRED | capability/no-new-privileges/frontend read-only recommendations | Additional isolation not implemented | AUTH-14; do not mix with application-integrity release |
| DEP-01 | P2 | CONFIRMED OPEN / DEFERRED | twelve dependency PRs and npm audit history | Known advisories and upgrade compatibility need dedicated triage | Inventory fresh audit metadata, retain separate dependency workstream; no broad upgrades |
| MOB-01 | P2 | NEEDS VERIFICATION | #62 and mobile release checklists | Installed OS browser return, SecureStore and sharing not proved by previews | Physical Android/iOS acceptance, separate human verification |
| WAL-01 | P2 | NEEDS VERIFICATION | Wallet follow-up report | Live email, key scopes/whitelist/state secret, process-local SSO caches | Controlled operational acceptance; shared-state support before multiworker scaling |
| WAL-02 | P2 | CONFIRMED OPEN / DEFERRED | Wallet local browser evidence | Existing Stellar HD dev-process shim issue and current-wallet snapshot limitation | Record in Wallet/runtime roadmap; neither blocks local AUTH-13 |

## Acceptance and dependencies

- DB-01–05 depend on assessment and PR #77. Require explicit new-database action; no user creation/password logging; complete auth/course/payment/learning/privacy schema; no change to customer rows on restart; orphan WAL/SHM/journal and corrupt/partial files rejected before mutation; valid uncheckpointed WAL preserved; late migration failure rolls back; legacy rebuilds require a separately reviewed upgrade; compiled CLI/container commands never run `npx` at startup.
- AZ-01–03 depend on database changes and existing #71/#72/#77 fixes. Cross-role/cohort tests must cover all admin tiers, owners, sponsors with unrelated admin-like permissions, shared members, billing/receipts/badges/payment mutations, missing/stale context and DB failure. No email may create a super-admin grant. Existing explicit role assignments remain.
- AZ-04 requires an executed five-route issue matrix. Issue state remains unchanged until maintainers review closure evidence. The old claim of global sponsor visibility must not drive duplicate implementation.
- PAY-01 depends on isolated fixtures, not real Paystack credentials. Reject bad/missing/tampered signatures and prove confirmed/failed/refunded/duplicate processing. Workflow code must use a freshly generated local HMAC shared only by test server/harness; branch-protection enforcement remains separately evidenced.
- MON-01/02 require positive and failing offline fixtures for <24h, absent/stale/gapped intervals, wrong SHA, container/security failures, bad/missing backup, missing heartbeat, read errors, and mail submission failures. No script may declare actual receipt from an accepted send command. No live monitor/cron execution or observation closure occurs.
- OPS-01 requires backup snapshot/restore checks using synthetic WAL data and unchanged source rows. Historical runbook retention claims must be separated from observed server retention. Actual production restore and mail/device/configuration evidence remain NEEDS VERIFICATION.

## Tool and runtime limits

Requested optional Superpowers/Ponytail/Caveman/Ripwire/find-skills packages were not present in the available catalog or local skill roots. No Docker CLI was found. Git Bash exists but requires execution outside the sandbox for MSYS runtime objects; use only isolated fixture commands. No unavailable tool output is counted as passing validation. Read-only review agents satisfy the brief's explicit independent-review/subagent workflow request.

Implementation results, exact test counts, PR/commit references, newly found payment/test-harness defects and remaining gates are recorded in the completed task checklist and final readiness report. The implementation CI passed all four jobs on 8f3f07a (run 39948571919). This assessment itself closes no operational or security issue.
