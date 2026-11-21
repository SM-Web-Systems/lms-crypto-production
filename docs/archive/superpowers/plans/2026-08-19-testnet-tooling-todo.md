# Testnet Tooling TODO

**Date:** 2026-08-19

## P1 — Required (COMPLETE)

| ID | Task | Owner | Status | Evidence |
|----|------|-------|--------|----------|
| TT-001 | Post PR correction comment | E | COMPLETE | Comment URL posted |
| TT-002 | Research CLI installation | D | COMPLETE | npm/cargo/binary options documented |
| TT-003 | Read-only testnet preflight | D | COMPLETE | Matrix in preflight spec |

## P2 — Important (BLOCKED)

| ID | Task | Owner | Status | Blocker |
|----|------|-------|--------|---------|
| TT-004 | Install Stellar CLI | B | BLOCKED | Approval + method review |
| TT-005 | Verify CLI capabilities | B | BLOCKED | TT-004 |
| TT-006 | Investigate WASM provenance | B | BLOCKED | Approval |
| TT-007 | Fetch/build contract WASM | B | BLOCKED | TT-004 + TT-006 |

## P3 — Testnet Pipeline (BLOCKED)

| ID | Task | Owner | Status | Blocker |
|----|------|-------|--------|---------|
| TT-008 | Generate testnet keypair | B | BLOCKED | Approval + secret storage plan |
| TT-009 | Fund testnet account | B | BLOCKED | TT-008 + Approval |
| TT-010 | Deploy testnet contract | B | BLOCKED | TT-007 + TT-009 + Approval |
| TT-011 | Configure testnet env | B | BLOCKED | TT-010 + Approval |
| TT-012 | Execute one test mint | C | BLOCKED | TT-011 + Approval |
