# Testnet Tooling Plan

**Date:** 2026-08-19
**Status:** BLOCKED — CLI installation requires approval

## Execution Order

| # | Task | Priority | Status | Approval |
|---|------|----------|--------|----------|
| 1 | Post PR correction comment | P1 | COMPLETE | Approved |
| 2 | Research CLI installation options | P1 | COMPLETE | N/A (read-only) |
| 3 | Install Stellar CLI | P2 | BLOCKED | REQUIRES APPROVAL |
| 4 | Verify CLI version and capabilities | P2 | BLOCKED | Depends on #3 |
| 5 | Investigate WASM provenance | P2 | BLOCKED | REQUIRES APPROVAL |
| 6 | Fetch/build contract WASM | P2 | BLOCKED | Depends on #3 + #5 |
| 7 | Generate testnet keypair | P3 | BLOCKED | REQUIRES SEPARATE APPROVAL |
| 8 | Fund testnet account | P3 | BLOCKED | REQUIRES SEPARATE APPROVAL |
| 9 | Deploy testnet contract | P3 | BLOCKED | REQUIRES SEPARATE APPROVAL |
| 10 | Configure testnet environment | P3 | BLOCKED | REQUIRES SEPARATE APPROVAL |
| 11 | Execute test mint | P3 | BLOCKED | REQUIRES SEPARATE APPROVAL |

## CLI Installation Research

**Note:** Stellar CLI is NOT available via npm. The npm package `@stellar/stellar-sdk` is the JS SDK, not the CLI.

### Recommended: Official install script
```bash
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh
# OR with auto-installed dependencies:
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh -s -- --install-deps
# Verify:
stellar --version
```
- Official Stellar project script
- Handles dependencies automatically with `--install-deps`
- Installs pre-built binary for platform
- Source: https://developers.stellar.org/docs/tools/cli/install-cli

### Alternative: Homebrew
```bash
brew install stellar-cli
```
- Package-managed, easy updates
- brew may not be installed on this server

### Alternative: Cargo install
```bash
# Would require installing Rust first:
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install --locked stellar-cli
```
- Full-featured native binary
- Heavier dependency footprint
- More invasive

## Brainstorming Decisions

### CLI installation method
- Selected: Official install script (least invasive, official, handles deps)
- Rejected: npm (NOT AVAILABLE — no npm package for CLI)
- Rejected: Cargo (requires Rust toolchain, too invasive)
- Rejected: Pre-built binary manual download (manual updates, provenance)
- Rejected: apt package (not available)

### WASM acquisition
- Preferred: Fetch from mainnet contract (same ABI guaranteed)
- Alternative: Build from source (reproducible but no source exists)
- Rejected: Unverified external artifact (security concern)

### Account type
- Selected: Dedicated testnet-only keypair
- Rejected: Shared dev account (contamination risk)
- Rejected: Production account reuse (secret leakage risk)
