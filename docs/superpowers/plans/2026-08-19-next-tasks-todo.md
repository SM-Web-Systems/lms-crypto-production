# Next Tasks TODO

**Date:** 2026-08-19
**Updated:** Phase 4 (Post-Worktree-Cleanup)

## P0 — Safety-Critical

None.

## P1 — Required (COMPLETE)

| ID | Task | Owner | Status | Evidence |
|----|------|-------|--------|----------|
| NT-001 | Commit vitest.config.ts fix | A | COMPLETE | 94a7d4d, 1108/1108 |
| NT-002 | Push test hardening | A | COMPLETE | 51f337c pushed |
| NT-003 | Commit documentation | E | COMPLETE | 51f337c (30 files) |
| NT-004 | Push documentation | E | COMPLETE | Remote main = 51f337c |
| NT-012 | Delete NFT worktree | D | COMPLETE | `git worktree list` = main only |
| NT-012b | Delete merged feature branch | D | COMPLETE | `git branch -d` (was 490780c) |

## P2 — PR Historical Record (READY FOR DECISION)

| ID | Task | Owner | Status | Blocker |
|----|------|-------|--------|---------|
| NT-013 | Correct PR #1 stale test counts | E | READY | Decision: comment vs body edit vs leave |

Recommended: Add PR comment (preserves history). See `pr-record-correction-plan.md`.

## P3 — Testnet (All BLOCKED — Require Individual Approval)

| ID | Task | Owner | Status | Blocker |
|----|------|-------|--------|---------|
| NT-005 | Install Stellar CLI | B | BLOCKED | Approval |
| NT-006 | Generate testnet keypair | B | BLOCKED | NT-005 + Approval |
| NT-007 | Fund testnet account (Friendbot) | B | BLOCKED | NT-006 + Approval |
| NT-008 | Obtain contract WASM | B | BLOCKED | Approval |
| NT-009 | Deploy testnet contract | B | BLOCKED | NT-007 + NT-008 + Approval |
| NT-010 | Configure testnet environment | B | BLOCKED | NT-009 + Approval |
| NT-011 | Execute one testnet mint | C | BLOCKED | NT-010 + Approval |
