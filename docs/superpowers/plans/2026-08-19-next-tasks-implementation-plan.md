# Next Tasks Implementation Plan

**Date:** 2026-08-19
**Status:** IN PROGRESS

## Completed This Session

| Task | Evidence | Status |
|------|----------|--------|
| Test-environment hardening | 1108/1108 in both worktrees | VERIFIED |
| vitest.config.ts fix | 2 lines added | COMPLETE |
| Testnet preflight (read-only) | No CLI/WASM/keypair available | BLOCKED |
| Documentation | 5 specs, plans, diagrams | COMPLETE |

## Execution Order

| # | Task | Priority | Precondition | Approval | Status |
|---|------|----------|-------------|----------|--------|
| 1 | Commit vitest.config.ts | P1 | Tests pass | User authorized | READY |
| 2 | Push test hardening | P1 | Committed | User authorized | READY |
| 3 | Commit documentation | P1 | Reviewed | User authorized | READY |
| 4 | Push documentation | P1 | Committed | User authorized | READY |
| 5 | Install Stellar CLI | P2 | None | REQUIRES APPROVAL | NOT STARTED |
| 6 | Generate testnet keypair | P2 | CLI installed | REQUIRES APPROVAL | BLOCKED |
| 7 | Fund testnet account | P2 | Keypair generated | REQUIRES APPROVAL | BLOCKED |
| 8 | Obtain contract WASM | P2 | None | REQUIRES APPROVAL | BLOCKED |
| 9 | Deploy testnet contract | P2 | WASM + funded account | REQUIRES APPROVAL | BLOCKED |
| 10 | Configure testnet env | P2 | Contract + account | REQUIRES APPROVAL | BLOCKED |
| 11 | Execute testnet mint | P2 | All above | REQUIRES APPROVAL | BLOCKED |
| 12 | Delete NFT worktree | P3 | Inspection complete | REQUIRES APPROVAL | READY |

## Brainstorming Decisions

### Test Failures — RESOLVED
- **Selected:** Add deterministic test fixtures to vitest.config.ts.
- **Rejected:** "Document as accepted prerequisite" — fragile, breaks CI/worktrees.
- **Rejected:** "Refactor module-level capture" — larger change, more risk.
- **Reason:** 2-line fix, follows existing JWT_SECRET pattern, zero behavior change.

### Testnet Contract — BLOCKED
- **Preferred:** Check for existing approved testnet contract first.
- **Finding:** No existing testnet contract ID found in repo or config.
- **Next:** Would need to deploy new contract (requires CLI + WASM + approval).

### Testnet Account — BLOCKED
- **Selected:** Dedicated testnet-only keypair (never reuse production).
- **Rejected:** Shared dev account — contamination risk.
- **Rejected:** Production account on testnet — secret leakage risk.

### Worktree Cleanup — READY (awaiting approval)
- **Finding:** Zero uncommitted changes, zero unique commits.
- **Selected:** Safe for deletion after explicit approval.
