# Testnet API Runtime TODO

**Date:** 2026-08-19

| ID | Task | Priority | Status | Evidence |
|----|------|----------|--------|----------|
| TAR-001 | Verify testnet env file | P0 | COMPLETE | exists, gitignored, no secrets |
| TAR-002 | Verify production unchanged | P0 | COMPLETE | NFT_STELLAR_NETWORK=public |
| TAR-003 | Run backend tests | P0 | COMPLETE | 1108/1108 PASS |
| TAR-004 | Start API testnet mode | P0 | COMPLETE | PID assigned, running |
| TAR-005 | Health check | P0 | COMPLETE | status=ok |
| TAR-006 | Readiness check | P1 | COMPLETE | ready=True |
| TAR-007 | Verify NFT env vars | P0 | COMPLETE | testnet, correct contract ID |
| TAR-008 | Verify production container | P0 | COMPLETE | lms-api healthy, public |
| TAR-009 | Verify no blockchain activity | P0 | COMPLETE | 3 ops unchanged |
| TAR-010 | Stop API cleanly | P0 | COMPLETE | port 3003 freed |
| TAR-011 | Final verification | P0 | COMPLETE | git clean, remote in sync |

## Next Steps (Require Separate Approval)

| ID | Task | Status | Blocker |
|----|------|--------|---------|
| TNS-SMOKE | Read-only contract invocation | BLOCKED | Approval |
| TNS-011 | Execute one test mint | BLOCKED | TNS-SMOKE + Approval |
| TNS-012 | Verify on explorer | BLOCKED | TNS-011 |
