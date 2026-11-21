# Stellar CLI Installation Specification

**Date:** 2026-08-19
**Status:** COMPLETE

## Problem Statement
Testnet contract deployment and verification require the Stellar CLI, which was not installed on the server.

## Goals
- Install the Stellar CLI for testnet operations only
- Use the least invasive installation method
- Do not affect production services

## Non-Goals
- Install Rust/Cargo toolchain (not needed for pre-built binary)
- Build contracts from source (separate step)
- Configure production environment
- Generate keypairs (separate approval)

## Solution
Installed Stellar CLI v27.1.0 via official install script with `--user` flag.

## Installation Details

| Property | Value |
|----------|-------|
| Version | 27.1.0 |
| Binary | /home/webadmin/.local/bin/stellar |
| Installer | https://github.com/stellar/stellar-cli/raw/main/install.sh |
| Installer SHA-256 | fc0dde4effffcd2859c1ec640967c398cc47e208dc1f55baf8aa1fc7cedcb12d |
| Method | Official install script with --user flag |
| Scope | User-local (~/.local/bin) |
| Privileges | No sudo required |
| Platform | x86_64-unknown-linux-gnu |
| Dependencies installed | None (pre-built binary) |
| Shell profile changes | None (PATH already included ~/.local/bin) |

## Installation Options Evaluated

| Method | Pros | Cons | Decision |
|--------|------|------|----------|
| Official install script --user | No sudo, user-local, official, handles deps | Remote script (mitigated by review) | SELECTED |
| Official install script (default) | System-wide | Requires sudo | Rejected (unnecessary privilege) |
| cargo install | Full-featured, native | Requires Rust toolchain install | Rejected (too invasive) |
| Homebrew | Package-managed | brew not installed | Rejected (extra dependency) |
| npm | Familiar stack | NOT AVAILABLE (no npm package for CLI) | Rejected (unavailable) |

## Installer Review

The 837-line installer was downloaded to a temp file, SHA-256 hashed, and fully reviewed before execution:
- Does NOT read application secrets or env files
- Does NOT upload local files
- Does NOT modify the repository or shell profiles
- Does NOT install Rust/Cargo without --install-deps flag
- Does NOT generate keys, fund accounts, or deploy contracts
- Downloads pre-built binary from GitHub Releases (HTTPS)
- Cleans up temp directory on exit

## CLI Capabilities Verified

```
stellar 27.1.0 (8e402ea28202950b272fbabc34caad4d2f64fe87)
stellar-xdr 27.0.0
```

Key subcommands available:
- `stellar contract fetch` — fetch WASM from deployed contracts
- `stellar contract deploy` — deploy contracts to networks
- `stellar contract invoke` — invoke contract functions
- `stellar keys` — key generation and management
- `stellar network` — network configuration

## Rust/Cargo Status
NOT INSTALLED — not needed for pre-built binary installation. Only required for building contracts from source (`stellar contract build`).

## Security
- CLI installed in user-local directory (no system-wide impact)
- CLI must never be configured with production secrets
- Testnet-only usage enforced by environment configuration
- No production services affected
- Rollback: `rm ~/.local/bin/stellar`

## Acceptance Criteria
- [x] `stellar --version` returns 27.1.0
- [x] `stellar contract --help` shows fetch/deploy subcommands
- [x] `stellar network --help` shows network management
- [x] No production services disrupted
- [x] No environment files modified
- [x] No keypairs generated
- [x] No sudo used
- [x] PATH already includes ~/.local/bin

## Explicit Approval Gates (Next Steps)
- Generate testnet keypair: REQUIRES APPROVAL
- Fund account via Friendbot: REQUIRES APPROVAL
- Fetch contract WASM: REQUIRES APPROVAL
- Deploy testnet contract: REQUIRES APPROVAL
- Configure testnet environment: REQUIRES APPROVAL
- Execute testnet mint: REQUIRES APPROVAL
