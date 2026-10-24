# AUTH-13 laptop release-safety checklist

Baseline: `47fe4f92e09e9c949ae80e6c22d1cd600898126b`. Statuses require executed evidence; no production completion is claimed.

| Phase | Completion criterion | Status |
| --- | --- | --- |
| 0 baseline | Preserve original checkout, fetch main, inspect script/Compose/CI/operational docs, inventory local tooling and assess hazards | PASS |
| 1 deployment | Failing behavioral tests → explicit identity/SHA/backup checks; dry run changes no state; no simulated replacement on failure | LOCAL PASS — PR #87, reviewed `1c433dc`, four CI jobs passed |
| 2 rollback | Failing tests → retained image identity/manifests; compatible-only recovery; no prune/restore; verify recovered identity/health | LOCAL PASS — PR #89, independently reviewed `4a58732`, 37 recovery tests passed; real Docker remains owner gate |
| 3 monitoring | Failing tests → versioned transition, expected SHA, privacy-safe bounded reconciliation alerts, all existing monitoring cases | LOCAL PASS — PR #88, reviewed `fe99116`; combined `212e0fa` bundle/digest verified offline, no cron installed |
| 4 integration | Synthetic backup/migration/restore and guarded release simulation; applicable API/web/full E2E/build/audit checks; document no Docker | LOCAL PASS — API 1813 +1 skip, web 515, E2E 73, builds/bootstrap/restore/audits; combined offline 110 +1 skip (111 total), shell/smoke pass |
| 5 independent review | Different agents inspect exact commits and tests; correct critical/high findings; head CI green; branch protection and manual-only deployment verified before any merge | SOURCE REVIEW PASS — `212e0fa`, all four combined CI jobs passed; documentation-head evidence in PR #88. MERGE BLOCKED by automatic approval review; main unchanged |
| 6 handoff | Exact branches/PRs/SHAs/tests/CI, migration/recovery/monitoring procedures, owner-only GO/NO-GO continuation prompt | PREPARED — `AUTH-13-codex-to-claude-handoff.md`; exact candidate/test/CI and read-only continuation instructions recorded; final documentation-head review in PR #88 |
| optional backlog | Only separately scoped after P0 reviewable PRs; do not start unrelated AUTH-14/features | DEFERRED |
| production | Actual volume/image/backup/SMTP/cron/device/runtime acceptance and release/stability observation | OWNER GATE — NOT EXECUTED |

Independent review records, test commands, before/after failures and residual limitations will be recorded per workstream and in the final handoff. No merge is permitted merely because tests pass: exact-head independent review, required-check enforcement, unchanged main, no critical/high blockers and manual-only production deployment are separate requirements.
