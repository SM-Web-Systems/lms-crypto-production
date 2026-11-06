# LMS-011 — RBAC reconciliation preparation

Status: **in progress; reconciled local candidate, not cutover acceptance**. LMS-010 still needs the consistent private database snapshot, reviewed account exceptions and installed-client inventory. [Staging SSH access is confirmed](LMS-010-SERVER-ACCESS.md); no private inventory was fabricated from synthetic fixtures.

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

The initial probe changed no checkout files or remote refs. The backend branch has now been reconciled locally onto completion checkpoint `ec2aa250e4228e184c6eaf541f452e2d200d7c90`. All eight conflicts are resolved, preserving current writer-hold fixtures, cross-platform CI, patched dependency graph, exact-image/FK recovery validation and sponsor reporting fixes. Auto-merged schema/bootstrap changes were reviewed too.

All 13 expected-failure authorization targets are ordinary tests in the candidate; the policy suite includes eight additional safeguards. Synthetic provisioning, grant audit/session invalidation, earned-role scope and repeated startup checks pass. Legacy startup role resurrection is removed; the inventory still flags authorization-version-zero accounts conservatively for review because an old backend can recreate grants even without the insert trigger. Existing databases require the explicit offline cutover and new databases provision grants explicitly.

Validation so far: 38 policy/writer tests, 15 inventory/cutover checks, TypeScript and source-free bootstrap pass. Runtime rehearsal refuses an unupgraded database without writes, cuts over a synthetic copy, and preserves revoked grants across repeated restarts. The actual previous backend from `ec2aa25` was built separately and also refused the cutover database without writes. The offline Python release suite passed 266 tests with three existing skips; a further regression proves image/schema mismatch refuses before any writer stop. Sponsor authorization/reporting passed 17 Chromium cases with zero retries against the reconciled backend.

The first full backend run had 2,402 passing tests, one failure and one existing protected-copy skip. The failure was a historical reward-schema fixture reaching the new RBAC preflight first. That fixture now installs the canonical authorization gate before testing the reward gate; its false-receipt test also asserts the specific reward migration refusal. All 135 tests in that suite pass. A clean Linux export of `ba1011d002416c536fe306a95c71dc8556391723` then passed **2,403 tests, zero failed, with one existing protected-copy skip**, plus clean install, build, source-free bootstrap, dependency, inventory and runtime checks.

A Windows rerun launched without loopback permission was interrupted without a complete report. The same environment produced 118 `connect EACCES` failures in the next scoped API run; it is infrastructure failure evidence, not a product result. Repeating those scoped tests with local sockets permitted passed all 136. Full Windows validation is now running on the combined client/API candidate `af363d6fee96249ea4337febeded8ff32698d2cd` in a separate raw-source export. Original failures and incomplete attempts remain recorded.

See the [candidate receipt](evidence/lms-011-validation.json). Private account decisions, final cross-platform candidate evidence and accepted recovery remain outstanding. No migration or deployment has been executed. Client implementation may be prepared against this candidate while these acceptance gates stay open. Retarget/rewrite the original PR around the final reviewed diff before any release.
