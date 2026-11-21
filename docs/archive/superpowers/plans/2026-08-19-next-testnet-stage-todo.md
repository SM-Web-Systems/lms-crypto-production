# Next Testnet Stage TODO

**Date:** 2026-08-19
**Phase:** 16 (Repository Assessment)

## Assessment Phase — CURRENT

| ID | Task | Status | Evidence |
|----|------|--------|----------|
| NTS-001 | Read mintService.ts and map all callers | COMPLETE | 2 mint paths, 3 callers, config validated |
| NTS-002 | Assess safeguard inventory | COMPLETE | 6 categories, all STRONG or ADEQUATE |
| NTS-003 | Identify idempotency gaps | COMPLETE | Quiz path: internal. Course path: caller-handled. |
| NTS-004 | Assess test coverage | COMPLETE | 17 NET + 6 trigger + 3 no-op + 6 schema + B1 + NA4 |
| NTS-005 | Document error handling paths | COMPLETE | Timeout-then-success gap identified |
| NTS-006 | Assess production/testnet boundary | COMPLETE | 6 isolation mechanisms, all adequate |
| NTS-007 | Create assessment documentation | COMPLETE | 4 specs + 4 plans + 8 diagrams |
| NTS-008 | Commit and push documentation | BLOCKED | Requires approval |

## Stage A — Read-Only Contract Verification (BLOCKED)

| ID | Task | Status | Blocker |
|----|------|--------|---------|
| NTS-A01 | Read contract storage via CLI | BLOCKED | Approval |
| NTS-A02 | Verify admin = GBNOP73G...UUE3 | BLOCKED | NTS-A01 |
| NTS-A03 | Verify minter = GBNOP73G...UUE3 | BLOCKED | NTS-A01 |
| NTS-A04 | Verify uri = https://testnet.ammawallet.com/nft/ | BLOCKED | NTS-A01 |
| NTS-A05 | Verify token_count = 0 | BLOCKED | NTS-A01 |
| NTS-A06 | Document results | BLOCKED | NTS-A01 |

## Stage B — Simulation (BLOCKED)

| ID | Task | Status | Blocker |
|----|------|--------|---------|
| NTS-B01 | Run simulation-only mint | BLOCKED | Stage A PASS + Approval |
| NTS-B02 | Capture resource footprint | BLOCKED | NTS-B01 |
| NTS-B03 | Verify simulation success | BLOCKED | NTS-B01 |
| NTS-B04 | Document results | BLOCKED | NTS-B01 |

## Stage C — One Testnet Mint (BLOCKED)

| ID | Task | Status | Blocker |
|----|------|--------|---------|
| NTS-C01 | Decrypt testnet secret | BLOCKED | Stages A+B PASS + Approval |
| NTS-C02 | Execute exactly one mint | BLOCKED | NTS-C01 |
| NTS-C03 | Capture tx_hash + token_id | BLOCKED | NTS-C02 |
| NTS-C04 | Verify on Horizon | BLOCKED | NTS-C03 |
| NTS-C05 | Read contract storage post-mint | BLOCKED | NTS-C03 |
| NTS-C06 | Check balance delta | BLOCKED | NTS-C03 |
| NTS-C07 | Document results | BLOCKED | NTS-C03 |

## Stage D — Full Integration (DEFERRED)

Not planned until Stage C proves the mint works.
