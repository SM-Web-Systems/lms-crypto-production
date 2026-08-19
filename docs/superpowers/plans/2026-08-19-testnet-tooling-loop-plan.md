# Testnet Tooling Loop Plan

**Date:** 2026-08-19
**Updated:** Post-CLI Installation

## Current State

```
COMPLETE:
  ✓ PR #1 merged (b6cc879)
  ✓ Production configured (NFT_STELLAR_NETWORK=public)
  ✓ Tests 1108/1108
  ✓ PR correction comment posted
  ✓ Stellar CLI installed (v27.1.0)
  ✓ CLI verified (contract/network/keys subcommands)

BLOCKED (each requires separate approval):
  ✗ Fetch contract WASM
  ✗ Generate testnet keypair
  ✗ Fund testnet account
  ✗ Deploy testnet contract
  ✗ Configure testnet environment
  ✗ Execute testnet mint
```

## Loop Behavior

### Allowed
- Read-only Git status, branches, worktrees
- Check CLI version and help
- Run tests/builds
- Check /health and /healthz
- Read-only source/tooling inspection
- Documentation and diagram validation
- TODO status updates with evidence

### Forbidden
- Key generation
- Friendbot calls
- Contract fetch without approval
- Contract deployment
- Environment changes
- NFT minting
- Blockchain transactions
- Financial operations
- Secret rotation
- Automatic commits/pushes

### Stop and request approval before
- Fetching contract WASM (network query)
- Generating keypairs
- Funding accounts
- Deploying contracts
- Changing environment files
- Minting NFTs
- Any irreversible action

## Exit Criteria
1. All P1 tasks COMPLETE ✓
2. Testnet pipeline approvals granted or deferred
3. Final documentation committed and pushed
