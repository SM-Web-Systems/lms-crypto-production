# Testnet Next Steps TODO

**Date:** 2026-08-19

## P1 — COMPLETE

| ID | Task | Status | Evidence |
|----|------|--------|----------|
| TNS-001 | Install Stellar CLI | COMPLETE | v27.1.0, ~/.local/bin/stellar |
| TNS-002 | Verify CLI | COMPLETE | --version, --help, contract/network subcommands |
| TNS-003 | PR correction comment | COMPLETE | Comment #5340413211 |

## P2 — BLOCKED (Each Requires Separate Approval)

| ID | Task | Priority | Status | Blocker | Approval |
|----|------|----------|--------|---------|----------|
| TNS-004 | Fetch contract WASM from mainnet | P2 | COMPLETE | — | SHA-256: 2e8c87f0...ed6eb, 32,110 bytes |
| TNS-005 | Verify WASM ABI | P2 | COMPLETE | — | mint(to, caller) EXACT MATCH with mintService.ts |
| TNS-006 / TKS-011 | Generate testnet keypair | P2 | COMPLETE | — | Public: `GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3`; stellar v27.1.0; 2026-08-19 |
| TNS-007 / TKS-013 | Store testnet secret securely | P2 | COMPLETE | — | `~/.stellar-testnet-secrets.gpg` mode 600, AES-256 GPG symmetric, no plaintext on disk |
| TNS-007a | Rotate compromised GPG passphrase | P2 | COMPLETE | SIR-012 | Passphrase rotated and verified; old rejected, new accepted; mode 600 |
| TNS-008 | Fund testnet account via Friendbot | P2 | COMPLETE | — | 2x Friendbot: 9,998.9 + 9,998.9 = 19,997.8 XLM. Reconciled via Horizon API. |
| TNS-009 | Deploy contract to testnet | P2 | COMPLETE | — | Contract: `CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB`; Tx: `41511aeb...3b85`; Ledger: 4226582; 2026-08-19T15:58:43Z |
| TNS-009a | Verify deployment read-only | P2 | COMPLETE | — | WASM hash IDENTICAL; 21/21 test matrix PASS; no unauthorized activity; production unchanged |
| TNS-010 | Configure testnet env vars | P2 | COMPLETE | — | `.env.testnet-nft` created, gitignored, no secrets, production unchanged |
| TNS-010a | Verify testnet API runtime | P2 | COMPLETE | — | Health OK, NFT_STELLAR_NETWORK=testnet confirmed, port 3003, production lms-api=public |
| TNS-010b | Repository assessment | P2 | COMPLETE | — | 6 safeguard categories assessed (all STRONG/ADEQUATE), 4 gaps identified (non-blocking), 24/24 test matrix PASS |
| TNS-011 | Read contract state (Stage A) | P2 | BLOCKED | Approval | `stellar contract read` — zero risk, read-only |
| TNS-011a | Simulate mint (Stage B) | P2 | BLOCKED | TNS-011 + Approval | `stellar contract invoke --sim-only` — zero risk |
| TNS-011b | Execute one test mint (Stage C) | P2 | BLOCKED | TNS-011a + Approval | One controlled testnet mint |
| TNS-012 | Verify on testnet explorer | P2 | BLOCKED | TNS-011b | Read-only check |

## P3 — Cleanup

| ID | Task | Status |
|----|------|--------|
| TNS-013 | Update documentation with results | COMPLETE |
| TNS-014 | Clean up stale feature branches | NOT STARTED |
