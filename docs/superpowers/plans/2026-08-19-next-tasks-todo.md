# Next Tasks TODO

**Date:** 2026-08-19

## P1 — Required

| ID | Task | Owner | Status | Evidence |
|----|------|-------|--------|----------|
| NT-001 | Commit vitest.config.ts fix | A | READY | 1108/1108 both worktrees |
| NT-002 | Push test hardening | A | READY | After commit |
| NT-003 | Commit documentation | E | READY | 5 specs + plans + diagrams |
| NT-004 | Push documentation | E | READY | After commit |

## P2 — Testnet (All BLOCKED — Require Approval)

| ID | Task | Owner | Status | Blocker |
|----|------|-------|--------|---------|
| NT-005 | Install Stellar CLI | B | BLOCKED | Approval |
| NT-006 | Generate testnet keypair | B | BLOCKED | NT-005 |
| NT-007 | Fund testnet account (Friendbot) | B | BLOCKED | NT-006 |
| NT-008 | Obtain contract WASM | B | BLOCKED | Approval |
| NT-009 | Deploy testnet contract | B | BLOCKED | NT-007 + NT-008 |
| NT-010 | Configure testnet environment | B | BLOCKED | NT-009 |
| NT-011 | Execute one testnet mint | C | BLOCKED | NT-010 |

## P3 — Cleanup

| ID | Task | Owner | Status |
|----|------|-------|--------|
| NT-012 | Delete NFT worktree | D | READY (approval needed) |
| NT-013 | Update PR body (24/24 → 67/67) | E | NOT STARTED |
