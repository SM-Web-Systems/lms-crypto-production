# Next Tasks Implementation Plan

**Date:** 2026-08-19
**Updated:** Phase 4 (Post-Worktree-Cleanup)
**Status:** P1 COMPLETE, P2 DECISION PENDING, P3 BLOCKED

## Completed This Session

| Task | Evidence | Status |
|------|----------|--------|
| Test-environment hardening | 1108/1108 in both worktrees | COMPLETE (94a7d4d) |
| vitest.config.ts fix | 2 lines added, committed, pushed | COMPLETE |
| Documentation (30 files) | specs, plans, diagrams | COMPLETE (51f337c) |
| NFT worktree deletion | `git worktree list` = main only | COMPLETE |
| Feature branch deletion | `git branch -d` (was 490780c) | COMPLETE |
| Testnet preflight (read-only) | No CLI/WASM/keypair available | COMPLETE |
| Test verification | 1108/1108 | VERIFIED |
| Health check | Container healthy, network=public | VERIFIED |

## Execution Order

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Commit vitest.config.ts | P1 | COMPLETE (94a7d4d) |
| 2 | Push test hardening | P1 | COMPLETE |
| 3 | Commit documentation | P1 | COMPLETE (51f337c) |
| 4 | Push documentation | P1 | COMPLETE |
| 5 | Delete NFT worktree | P1 | COMPLETE |
| 6 | Delete merged feature branch | P1 | COMPLETE |
| 7 | PR historical record correction | P2 | READY FOR DECISION |
| 8 | Install Stellar CLI | P3 | BLOCKED (Approval) |
| 9 | Generate testnet keypair | P3 | BLOCKED (Approval) |
| 10 | Fund testnet account | P3 | BLOCKED (Approval) |
| 11 | Obtain contract WASM | P3 | BLOCKED (Approval) |
| 12 | Deploy testnet contract | P3 | BLOCKED (Approval) |
| 13 | Configure testnet env | P3 | BLOCKED (Approval) |
| 14 | Execute testnet mint | P3 | BLOCKED (Approval) |

## Brainstorming Decisions

### Worktree Handling — RESOLVED
- **Selected:** Delete immediately after verified inspection.
- **Evidence:** Zero unique commits, modified file already on main, PR merged.
- **Result:** COMPLETE.

### PR Body Correction — PENDING DECISION
- **Recommended:** Add PR comment (Option 3) — preserves historical record.
- **Rejected:** Edit PR body — rewrites history on merged PR.
- **Rejected:** Leave unchanged — may confuse future readers.
- **Status:** Awaiting user decision.

### Test Environment — RESOLVED
- **Selected:** Add deterministic test fixtures to vitest.config.ts.
- **Evidence:** 1108/1108, follows JWT_SECRET pattern.
- **Result:** COMPLETE (94a7d4d).

### Testnet Contract — BLOCKED
- **Preferred:** Check for existing approved testnet contract first.
- **Finding:** No existing testnet contract found.
- **Next:** Would need deployment (requires CLI + WASM + approval).

### Testnet Account — BLOCKED
- **Selected:** Dedicated testnet-only keypair (never reuse production).
- **Next:** Requires CLI installation + keypair generation + Friendbot funding.
