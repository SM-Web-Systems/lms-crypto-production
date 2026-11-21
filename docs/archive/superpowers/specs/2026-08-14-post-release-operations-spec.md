# Post-Release Operations Spec — 2026-08-14

## Daily Checks

| Check | Command/URL | Expected | Alert If |
|-------|-------------|----------|----------|
| API liveness | `GET /health` | `{ status: "ok" }` | Non-200 or status != "ok" |
| API readiness | `GET /healthz` | `{ ready: true }` | `ready: false` or any check failing |
| Container status | `docker compose ps` | Both `lms-api` and `lms-web` running | Any container unhealthy/exited |
| Disk usage | `df -h /home/webadmin/web-stack/` | < 80% | > 85% |
| DB size | `ls -lh data/student_ms.db` | Reasonable growth | > 500MB |
| Error logs | `docker compose logs api --since 24h \| grep ERROR` | Minimal | Spike in errors |

## Weekly Checks

| Check | Command | Expected |
|-------|---------|----------|
| Backup success | Verify daily backup cron ran | `.db` backup in backup dir |
| Outbox stats | `GET /admin/rewards/outbox-stats` (admin token) | 0 dead-lettered, low failed |
| Failed refund attempts | `GET /admin/rewards/refund-attempts?status=blocked` | Review and resolve |
| Scheduler health | Check scheduler tick logs | Regular ticks, no sustained skips |
| npm audit | `cd LMS-Server && npm audit --omit=dev` | No new critical/high |
| SSL certificate | Check expiry dates | > 30 days remaining |

## Monthly Checks

| Check | Action |
|-------|--------|
| Dependency updates | Review npm outdated, plan upgrades |
| Database maintenance | VACUUM/ANALYZE if WAL file large |
| Load review | Review response times, error rates |
| Security review | Check for new advisories on key packages |
| Backup restore test | Restore backup to test instance, verify data |

## Scheduler & Outbox Monitoring

### Scheduler Health Indicators
- **Healthy:** Regular ticks (60s interval), `result: 'completed'`
- **Warning:** Consecutive `result: 'skipped'` (lease held by another instance)
- **Critical:** No ticks recorded for > 5 minutes

### Outbox Health Indicators
- **Healthy:** 0 pending, 0 failed, 0 dead-lettered
- **Warning:** > 10 failed events with backoff
- **Critical:** Any dead-lettered events (attempt_count >= 5)

### Alert Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Dead-lettered events | 1+ | 5+ |
| Failed outbox events | 10+ | 50+ |
| Blocked refund attempts | 1+ (review needed) | N/A |
| Scheduler skipped ticks | 5 consecutive | 10 consecutive |
| Health check failure | 1 failure | 3 consecutive |

## Financial Reconciliation

### Reward Balance Checks
- Sum of all `available_stroops` + `reserved_stroops` across accounts
- Cross-reference with reward transaction ledger
- Verify no negative balances (CHECK constraints prevent this)

### Refund Integrity
- All `blocked` refund attempts should be reviewed
- `resolved` attempts should have matching ledger entries
- No orphaned allocations (released without corresponding account credit)

## Incident Response

### Severity Levels
| Level | Definition | Response Time | Escalation |
|-------|-----------|---------------|------------|
| P1 | Service down, data loss risk | 15 min | Immediate |
| P2 | Feature broken, workaround exists | 1 hour | Within shift |
| P3 | Minor issue, no user impact | 24 hours | Next business day |

### Rollback Procedure
1. `cd /home/webadmin/web-stack/html/LMS-AmmaWallet && ./scripts/rollback.sh`
2. Verify health: `curl http://localhost:3001/healthz`
3. Check DB integrity: `sqlite3 data/student_ms.db "PRAGMA integrity_check"`

### Backup & Restore
- **Backup:** Daily cron at 03:00 via `sqlite3 .dump` or file copy
- **Restore:** Stop container → replace DB file → restart → verify
- **Off-host:** rclone to amber-pangolin (see automation section in MEMORY.md)

## Release Checklist

- [ ] All tests pass (BE + FE + E2E)
- [ ] TypeScript build succeeds
- [ ] `npm audit --omit=dev` reviewed
- [ ] Docker build succeeds
- [ ] Staging deploy + smoke test
- [ ] Production deploy via `./scripts/deploy.sh`
- [ ] Post-deploy smoke test passes
- [ ] Health endpoints responding
- [ ] Scheduler producing ticks
- [ ] Outbox processing events
- [ ] No new error log spikes
