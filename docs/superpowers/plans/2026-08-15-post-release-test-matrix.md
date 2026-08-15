# Post-Release Test Matrix

**Date:** 2026-08-15
**Context:** Stellar SDK v16 follow-up verification

---

## Test Matrix

| Area | Scenario | Expected Result | Command | Status | Evidence |
|---|---|---|---|---|---|
| Documentation | Exact files staged | Only intended docs staged | `git diff --cached --name-only` | NOT STARTED | Pending T4 |
| Documentation | Secret scan | No secrets in staged files | Manual review of all 9 files | VERIFIED | Safety review: all 9 SAFE |
| Documentation | Mermaid validation | All 6 diagrams have valid fences | Manual review | VERIFIED | All have opening/closing fences, valid directives |
| Git | Commit | Logical documentation commit | `git commit -m "docs: ..."` | BLOCKED | Awaiting approval |
| Git | Remote | Remote matches approved commit | `git log --oneline origin/main -3` | BLOCKED | Awaiting push approval |
| Outbox | `webhook_events` schema | No outbox status column | `sudo sqlite3 'file:///var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db?mode=ro' "PRAGMA table_info(webhook_events);"` | VERIFIED | 6 cols: id, event_id, event_type, provider, processed_at, payload. No status. |
| Outbox | `reward_event_outbox` schema | Status/retry fields present | Same DB, `PRAGMA table_info(reward_event_outbox)` | VERIFIED | 12 cols incl status CHECK(pending/processing/completed/failed), attempt_count, next_attempt_at |
| Outbox | Aggregate counts | All zeros | `SELECT status, COUNT(*) FROM reward_event_outbox GROUP BY status` | VERIFIED | 0 total rows (empty result) |
| Outbox | `webhook_events` count | Zero rows | `SELECT COUNT(*) FROM webhook_events` | VERIFIED | 0 rows |
| Outbox | `getOutboxStats()` exists | Function at rewardOutboxWorker.ts:69 | Grep + Read | VERIFIED | Sync function, returns pending/failed/deadLettered/completed |
| Health | `/health` | HTTP 200, status ok | `curl -s http://172.23.0.2:3001/health` | VERIFIED | `{"status":"ok","uptime":31720,"checks":{"db":{"status":"ok"}}}` |
| Health | `/healthz` | ready=true, all checks ok | `curl -s http://172.23.0.2:3001/healthz` | VERIFIED | `{"ready":true,"checks":{"db_read":{"ok":true},"db_write":{"ok":true},"disk":{"ok":true}}}` |
| Health | Container metadata | healthy, FailingStreak=0 | `docker inspect lms-api --format '{{json .State.Health}}'` | VERIFIED | Status=healthy, FailingStreak=0, last 5 ExitCode=0 |
| Frontend | TypeScript | 0 errors | `cd LMS-Client && npx tsc --noEmit` | VERIFIED (prior) | Post a7549b1 |
| Frontend | Unit tests | 206/206 pass | `cd LMS-Client && npx vitest run` | VERIFIED (prior) | 206 tests passed |
| Frontend | Docker build | Image builds | `docker compose build web` | VERIFIED (prior) | Image `68ea5b1bc4d0` built 2026-08-15 06:48 |
| Frontend | E2E | 14/14 pass | `cd e2e && npx playwright test` | VERIFIED (prior) | 14 passed |
| Frontend | Preflight | Correct service/image/rollback | Docker inspect commands | VERIFIED | Running: SHA 414399394569. New: 68ea5b1bc4d0. Service: web |
| Frontend | Redeploy | Approved image running | `docker compose up -d --no-deps web` | BLOCKED | Awaiting explicit approval |
| Frontend | Post-deploy health | Container up, HTTPS ok, logs clean | `docker compose ps web` + `docker logs` | BLOCKED | Awaiting deploy |
| NFT | SDK imports | v16 imports correct | Prior test run | VERIFIED (prior) | stellar-sdk-import.test.ts passes |
| NFT | Mock mint | Existing behavior passes | Prior test run | VERIFIED (prior) | All mint*.test.ts pass |
| NFT | mintService.ts changes | Zero changes in SDK upgrade | `git diff 305bebf -- LMS-Server/src/services/mintService.ts` | VERIFIED (prior) | Empty diff |
| NFT | Testnet selection | Explicit testnet config works | New test: `mint-network-config.test.ts` | NOT STARTED | Blocked by T9 |
| NFT | Production selection | Explicit production config works | New test | NOT STARTED | Blocked by T9 |
| NFT | Invalid config | Fails closed | New test | NOT STARTED | Blocked by T9 |
| NFT | Cross-network prevention | Wrong contract/network rejected | New test | NOT STARTED | Blocked by T9 |
| NFT | Missing network config | Mint skipped/throws | New test | NOT STARTED | Blocked by T9 |
| NFT | Idempotency | Duplicate request → no double mint | New test | NOT STARTED | Blocked by T9 |
| NFT | Retry/timeout | Bounded safe retry | New test | NOT STARTED | Blocked by T9 |
| NFT | Feature flag disabled | Blocks auto-mint | Existing test (regression-nft-audit.test.ts NA4) | VERIFIED (prior) | Passes |
| NFT | Live testnet mint | Requires explicit approval | Never automatic | BLOCKED | Decision gate |
| NFT | Live production mint | Requires explicit approval | Never automatic | BLOCKED | Decision gate |
| Backend | Full suite | 1091/1091 | `cd LMS-Server && npx vitest run` | VERIFIED (prior) | All pass |
| Review | Self-review | Findings documented | Diff review | NOT STARTED | Pending |
| Review | Independent review | Requested and resolved | GitHub/human | NOT STARTED | Pending |
| Final | All verification | All applicable checks pass | Full suite | NOT STARTED | Pending |

---

## TDD Applicability

### Outbox (No TDD Required)
```
TDD implementation cycle not applicable because the verified defect was an incorrect
monitoring query/documentation reference, not application behavior. The application
code (rewardOutboxWorker.ts, getOutboxStats()) is correct and queries the right table.
```

### NFT Configuration (TDD Required)
Network parameterization is new application behavior. Failing tests must be written before implementation code.
