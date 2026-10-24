# AUTH-13: Server Validation Baseline

**Date:** 2026-10-23T14:50:16Z (16:50 SAST)
**Server:** ScarletFlamingo
**Operator:** Claude (automated)

---

## 1. Production State

| Item | Value |
|------|-------|
| Deployed application SHA | `6763f4eed778de920559cd497f91e2c630d4e028` |
| API container | running, healthy, 0 restarts, started 2026-10-22T12:37:16Z |
| Web container | running, healthy, 0 restarts, started 2026-10-22T12:37:59Z |
| API status | ok |
| DB status | ok |
| Uptime | 94,379s (~26.2h) |
| Frontend | HTTP 200 |

## 2. Repository State

| Item | Value |
|------|-------|
| Production checkout | `/home/webadmin/lms-crypto-production` |
| Production branch | `main` |
| Production HEAD | `67cfb88` (AUTH-12 closure commit) |
| GitHub main SHA | `67cfb88a4bc8d3332acdb58d3d66ae14faf05696` |
| Working tree | clean |
| Remote sync | up to date |

## 3. SHA Separation

| Context | SHA | Description |
|---------|-----|-------------|
| Production image | `6763f4e` | Deployed Docker image, running in containers |
| Production checkout (main) | `67cfb88` | Includes AUTH-12 docs on top of deployed code |
| GitHub main | `67cfb88` | Synced with production checkout |
| PR #77 HEAD | `bbf17a0` | `codex/platform-audit-remediation` |
| PR #78 HEAD | `a594056` | `codex/auth13-database-bootstrap` |
| PR #79 HEAD | `4a48674` | `codex/auth13-authorization-policy` |
| PR #80 HEAD | `9697390` | `codex/auth13-payment-monitoring` |
| PR #81 HEAD | `f30d86f` | `codex/api-web-dependency-security` |
| Wallet PR #2 HEAD | `04c3f0c` | `codex/lms-verified-email-onboarding` |

## 4. PR Stack

| PR | Branch | Base | CI | Mergeable | Changes |
|----|--------|------|----|-----------|---------|
| #77 | `codex/platform-audit-remediation` | `main` | 3/3 SUCCESS | YES | +8120/-2246, 199 files |
| #78 | `codex/auth13-database-bootstrap` | PR #77 | 3/3 SUCCESS | YES | +3536/-1186, 20 files |
| #79 | `codex/auth13-authorization-policy` | PR #78 | 3/3 SUCCESS | YES | +317/-101, 21 files |
| #80 | `codex/auth13-payment-monitoring` | PR #79 | 4/4 SUCCESS | YES | +1497/-829, 31 files |
| #81 | `codex/api-web-dependency-security` | PR #80 | 4/4 SUCCESS | YES | +918/-1796, 9 files |
| Wallet #2 | `codex/lms-verified-email-onboarding` | `main` | — | YES | +706/-22, 21 files |

Stack order: #77 -> #78 -> #79 -> #80 -> #81

## 5. System Resources

| Resource | Value |
|----------|-------|
| Disk | 56GB free of 158GB (64% used) |
| Memory | 4.5GB available of 7.8GB |
| CPUs | 4 |
| Load | 0.42, 0.23, 0.20 |

## 6. Active Cron (not to be modified)

- LMS DB backup: daily 03:00
- Health monitor: every 5 minutes
- Dead-man check: every 15 minutes
- Cert renewal: twice daily
- Various other backups and checks

## 7. Isolated Work Environments

| Path | Purpose |
|------|---------|
| `/home/webadmin/worktrees/auth13-review` | Documentation, baseline (detached at main) |
| `/home/webadmin/worktrees/auth13-integration` | Full integration candidate (detached at #81 tip `f30d86f`) |
| `/home/webadmin/auth13-validation` | Test databases, fixtures, isolated runs |

## 8. Safety Constraints

- Production repository: READ-ONLY
- No production container modifications
- No production database modifications
- No production cron changes
- No production environment changes
- No deployments authorized
- No merges to main
- All testing uses isolated databases and containers
