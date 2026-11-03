# RBAC retirement — server assessment handover index

Each section has its own numbered handover, review branch/PR, evidence, server checklist and return record. Assess the exact PR head; do not treat acceptance of one section as deployment approval for another.

| Section | Work | Handover | Server assessment |
| --- | --- | --- | --- |
| RBAC-STEP-01 | Read-only role inventory and policy tests | [Step 1 handover](SERVER-HANDOVER-RBAC-STEP-01-INVENTORY-AND-POLICY-TESTS.md), PR #98 | Pending production inventory/account and usage evidence |
| RBAC-STEP-02 | Backend authorization and explicit provisioning | Separate handover issued with Step 2 PR | Development authorized; production cutover gated by Step 1 decisions and migration rehearsal |
| RBAC-STEP-03 | Web/mobile contracts and role UI | Not yet issued | Planned |
| RBAC-STEP-04 | Legacy schema/compatibility removal | Not yet issued | Planned; requires earlier sections and rollback proof |

The server owns real account decisions, merges, deployment and production migration execution. Laptop work uses local/synthetic tests. Preserve existing private account decision records; handover documents and PRs must not contain account credentials or production database exports.
