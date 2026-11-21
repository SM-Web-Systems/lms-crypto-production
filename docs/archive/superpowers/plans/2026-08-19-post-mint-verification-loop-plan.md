# Post-Mint Verification Loop Plan

**Date:** 2026-08-19
**Phase:** 17 (Post-Mint Verification)

## Repeatable Checks

The loop may safely repeat:

1. Git state: branch, HEAD, remote sync, working tree status
2. Read-only transaction query: Horizon GET /transactions/05e459cc...44b2
3. Read-only operation query: Horizon GET /transactions/.../operations
4. Read-only account query: Horizon GET /accounts/GBNOP73G.../operations
5. Read-only contract state: `stellar contract read --durability persistent`
6. Metadata HTTP check: GET https://testnet.ammawallet.com/nft/
7. Token metadata check: GET https://testnet.ammawallet.com/nft/0
8. Production isolation: `docker exec lms-api` env check
9. Backend tests: `cd LMS-Server && npx vitest run`
10. Secret scan: verify no secrets in staged/committed files
11. Configuration diff: compare .env keys (redacted) against expected
12. TODO/plan/spec updates
13. Mermaid diagram updates
14. Review checklist updates

## Stop Conditions

| Condition | Action |
|-----------|--------|
| STOP_ON_SECOND_MINT | Do NOT mint again. Stop immediately. |
| STOP_ON_TRANSACTION_RETRY | Do NOT retry tx 05e459cc...44b2. Stop. |
| STOP_ON_CONTRACT_INVOCATION | Do NOT invoke any contract method. Stop. |
| STOP_ON_BLOCKCHAIN_ACTIVITY | Do NOT sign or submit any transaction. Stop. |
| STOP_ON_UNKNOWN_TRANSACTION_STATUS | Do NOT assume or retry. Reconcile read-only first. |
| STOP_ON_SECRET_LEAK | Immediately stop and report. |
| STOP_ON_PRODUCTION_CHANGE | Do NOT modify production .env or containers. Stop. |
| STOP_ON_ENVIRONMENT_CROSSOVER | Do NOT mix testnet/production config. Stop. |
| STOP_ON_UNSAFE_RETRY | Do NOT retry any blockchain operation. Stop. |
| STOP_ON_TEST_FAILURE | Investigate with systematic-debugging. Do NOT bypass. |
| STOP_ON_UNAUTHORIZED_WRITE | Do NOT commit/push without explicit approval. Stop. |

## Approval Gates

| Gate | Trigger | Requires |
|------|---------|----------|
| Commit/push documentation | All verification complete | Explicit user approval |
| Metadata endpoint implementation | Gap documented | Separate design + approval |
| Timeout reconciliation | Gap documented | Separate design + approval |
| Admin UI filter | Gap documented | Separate design + approval |
| Real-RPC integration tests | Gap documented | Separate design + approval |
| Production readiness review | All gaps addressed | Separate comprehensive review |

## Loop Behavior

The loop should:
- Continue through safe read-only verification and documentation
- Pause only at explicit approval gates
- Never request re-intervention for read-only checks
- Report findings incrementally
- Stop before any prohibited action
