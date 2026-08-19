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
| TNS-008 | Fund testnet account via Friendbot | P2 | BLOCKED | TNS-006 + Approval | curl friendbot.stellar.org |
| TNS-009 | Deploy contract to testnet | P2 | BLOCKED | TNS-004 + TNS-008 + Approval | `stellar contract deploy` |
| TNS-010 | Configure testnet env vars | P2 | BLOCKED | TNS-009 + Approval | Isolated from production |
| TNS-011 | Execute one test mint | P2 | BLOCKED | TNS-010 + Approval | mintCredential() call |
| TNS-012 | Verify on testnet explorer | P2 | BLOCKED | TNS-011 | Read-only check |

## P3 — Cleanup

| ID | Task | Status |
|----|------|--------|
| TNS-013 | Update documentation with results | NOT STARTED |
| TNS-014 | Clean up stale feature branches | NOT STARTED |
