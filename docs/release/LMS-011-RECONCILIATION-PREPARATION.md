# LMS-011 — RBAC reconciliation preparation

This is preparation, not cutover acceptance. LMS-010 still needs the owner's consistent private database snapshot and installed-client inventory. An asynchronous request is pending; no private inventory was fabricated from synthetic fixtures.

On 6 November 2026, connected GitHub reports [PR #99](https://github.com/SM-Web-Systems/lms-crypto-production/pull/99) open and unmergeable, head `360aa011ecde5304521cc5c5bbb119f28f682d10`, base `codex/rbac-role-inventory` at `f43c233cfd822638daff9eecacee73f8af371310`. The branch contains three backend-cutover commits beyond the inventory prerequisite. Existing old-head CI does not certify reconciliation with current main.

A read-only merge-tree probe against completion branch commit `d4eda2f` identifies eight actual conflicting paths:

- `.github/workflows/ci.yml`
- `LMS-Server/package.json`
- `LMS-Server/scripts/rbac-inventory.mjs`
- `LMS-Server/scripts/rbac-inventory.test.mjs`
- `LMS-Server/src/__tests__/rbac-retirement-policy.test.ts`
- `LMS-Server/src/__tests__/setup.ts`
- `docs/release/SERVER-HANDOVER-RBAC-RETIREMENT.md`
- `scripts/release_recovery.py`

The probe changes no checkout files or remote refs. Its result tree is not an accepted candidate. Preserve current writer-hold fixtures and CI coverage, patched dependency graph, exact-image/FK recovery validation and all current completion fixes while resolving the backend changes. Review auto-merged schema/bootstrap files as carefully as explicit conflicts.

After private inventory decisions are accepted, reconcile against the final completion branch and convert all 13 expected-failure authorization targets to ordinary passing tests. Repeat provisioning/grant/audit/session invalidation and offline cutover/startup/recovery checks before client work. Retarget/rewrite the PR only around that reviewed final diff; do not merge the old stack blindly.
