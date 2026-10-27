# PLATFORM-AUDIT-2026-10-26 — Server assessment handover

This packet is a **new platform wiring audit**, separate from RBAC-STEP-01 through RBAC-STEP-04. It does not implement fixes or authorize migration/deployment.

Read the [full report and recommended order](../audits/2026-10-26-platform-wiring-audit.md), including exact candidate/main/Wallet/mobile baselines, evidence limits, working-area matrix and W01–W12. The [ten synthetic characterization probes](../audits/2026-10-26-platform-wiring-audit.probe.test.ts.txt) are inert documentation; their passing assertions reproduce defects, not acceptance.

## Assess these first

| Section | Finding | Assessment |
| --- | --- | --- |
| AUDIT-01 | W01: missing funding verification/independent credit authorization | Confirmed in isolated API; funding returned 200 without references for three source types |
| AUDIT-02 | W02: cross-owner reward reads and lifecycle no-op/fast returns | Confirmed across parent/teacher/employer prefixes and unrelated sponsor activation |
| AUDIT-03 | W03: audience allocations exceed reserved funds | Confirmed with two recipients and one reserved award |
| AUDIT-04 | W04: premature and cross-course completion eligibility | Confirmed via first-lesson API and unrelated-course event |
| AUDIT-05 | W05–W09: reward/portal contract and UI completion | Reproduced type/family/billing/route failures; additional UI/error omissions source-confirmed |
| AUDIT-06 | W10–W12: integration, device acceptance, advisories and Wallet compilation | Existing pending work; preserve and reconcile current PRs rather than duplicate implementation |

The reward funding/scope/lifecycle source inspected is also present on refreshed main; these findings are not presented as newly introduced by the RBAC schema contraction. Server exposure and deployed configuration have not been inspected.

## Validation already available

LMS source baseline `b8015e27eae1328197bf248031da25c2e16c68cf`: [all five CI jobs passed](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40331094017). This audit adds ten local in-memory characterization probes, fresh npm audit reports and a fresh Wallet typecheck (65 diagnostics). Detailed counts and limitations are in the report. Runtime source, migrations, dependencies and deployments are unchanged by this packet.

## Return record

For each finding, record finding ID, reviewed application/image/artifact SHA, affected environment, confirmed exposure, implementation PR, expected denial/success cases, actual test/acceptance evidence, and fixed/retested/accepted-limitation status.

Keep the [RBAC numbered handovers](SERVER-HANDOVER-RBAC-RETIREMENT.md) as separate prerequisite records. The open database/mobile/Wallet stacks and protected-copy/device/provider checks are listed under W10–W12. Historical production reports must not substitute for the current exact-image/client/database evidence.

Production accounts, private decision records and database exports stay with the operator. The laptop audit made no SSH/server changes, live financial/provider operations, merges or deployments.

## Claude assessment and rollout prompts

For **plan first, then execute one selected stage at a time**, use the [staged planning and execution prompts](CLAUDE-SERVER-STAGED-EXECUTION-PROMPTS.md). Prompt 1 stops at PLAN_READY; Prompt 2 executes the chosen stage, records evidence and stops at its boundary. These stage limits take precedence over continuous preparation across the entire backlog.

Start a Claude server session with the [assessment and rollout prompt](CLAUDE-SERVER-ROLLOUT-ASSESSMENT-PROMPT.md). Its first task assesses this audit against current PR/source/server evidence, then prepares specs, Mermaid diagrams, iterative tasks and exact release batches. Routine preparation is delegated; production changes require the concrete batch decision described in the prompt.

The assessment includes every accessible branch and PR in both repositories, with paginated listings and a branch-to-PR disposition table. Branches without PRs, retained development/recovery work and squash-equivalent changes are explicitly assessed. Unpublished laptop-only branches and inaccessible remotes remain declared inventory gaps until their owner supplies evidence.

After the plan and ledger exist, the [scoped /loop companion](CLAUDE-SERVER-ROLLOUT-LOOP-PROMPT.md) can continue authorized preparation and CI monitoring. It cannot approve or perform a production release. These documents do not start a scheduled task, merge PRs or modify server state from the laptop.
