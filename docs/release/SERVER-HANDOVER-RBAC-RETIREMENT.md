# RBAC retirement — server assessment handover index

Each section has its own numbered handover, review branch/PR, evidence, server checklist and return record. Assess the exact PR head; do not treat acceptance of one section as deployment approval for another.

| Section | Work | Handover | Server assessment |
| --- | --- | --- | --- |
| RBAC-STEP-01 | Read-only role inventory and policy tests | [Step 1 handover](SERVER-HANDOVER-RBAC-STEP-01-INVENTORY-AND-POLICY-TESTS.md), PR #98 | Pending production inventory/account and usage evidence |
| RBAC-STEP-02 | Backend authorization and explicit provisioning | [Step 2 handover, sections 2A–2D](SERVER-HANDOVER-RBAC-STEP-02-BACKEND-CUTOVER.md), PR #99 | Separate review branch codex/rbac-backend-cutover; production cutover gated by Step 1 decisions and protected-copy/image rehearsal |
| RBAC-STEP-03 | Web/mobile contracts and role UI | [Step 3 handover, sections 3A–3D](SERVER-HANDOVER-RBAC-STEP-03-CLIENT-CONTRACTS-AND-UI.md), PR #100 | Separate review branch codex/rbac-client-retirement; supported native builds and compatibility retirement condition require server acceptance |
| RBAC-STEP-04 | Legacy schema/compatibility removal | [Step 4 handover, sections 4A–4D](SERVER-HANDOVER-RBAC-STEP-04-SCHEMA-AND-COMPATIBILITY-REMOVAL.md), PR #101 | Separate review branch codex/rbac-schema-retirement; production blocked pending earlier server/client acceptance, protected-copy contraction and exact-image recovery proof |

The server owns real account decisions, merges, deployment and production migration execution. Laptop work uses local/synthetic tests. Preserve existing private account decision records; handover documents and PRs must not contain account credentials or production database exports.
