# Stellar CLI Installation Specification

**Date:** 2026-08-19
**Status:** BLOCKED — Requires installation approval

## Problem Statement
Testnet contract deployment and verification require the Stellar CLI (`stellar`), which is not currently installed on the server.

## Goals
- Install the Stellar CLI for testnet operations only
- Use the least invasive installation method
- Do not affect production services

## Non-Goals
- Install Rust/Cargo toolchain
- Build contracts from source (separate step)
- Configure production environment
- Generate keypairs (separate approval)

## Current State
- `which stellar` = not found
- `which soroban` = not found
- `which rustc` = not found
- `which cargo` = not found
- OS: Ubuntu 24.04.4 LTS, x86_64
- Node: v20.20.0
- npm: 10.8.2

## Installation Options

| Method | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| Install script | Official, handles deps, no Rust prereq | Runs shell script from GitHub | PREFERRED |
| Homebrew | Package-managed, easy update | brew may not be installed | SECONDARY |
| cargo install | Full-featured, native binary | Requires Rust + build-essential | HEAVY |
| Pre-built binary | Fast, no build deps | Manual updates, provenance | IF script fails |

**Note:** Stellar CLI is NOT available via npm. The `@stellar/stellar-sdk` npm package is the JS SDK, not the CLI.

## Recommended Approach
```bash
# Official install script (least invasive, handles dependencies):
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh

# Alternative with auto-installed dependencies:
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh -s -- --install-deps

# Verify:
stellar --version
```

Source: https://developers.stellar.org/docs/tools/cli/install-cli

## Security
- CLI handles keypair generation and transaction signing
- CLI must never be configured with production secrets
- Testnet-only usage enforced by environment configuration
- No production services affected by installation

## Actors and Boundaries
- Actor: Developer/CI performing testnet operations
- Boundary: CLI installation only, no configuration changes

## Acceptance Criteria
- [ ] `stellar --version` returns a version
- [ ] No production services disrupted
- [ ] No environment files modified
- [ ] No keypairs generated (separate approval)

## Explicit Approval Gates
- Install Stellar CLI: REQUIRES APPROVAL
- Method selection: REQUIRES APPROVAL
