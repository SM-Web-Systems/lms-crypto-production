# Testnet Tooling Loop Plan

**Date:** 2026-08-19

## Current State

```
COMPLETE:
  ✓ PR correction comment posted
  ✓ CLI installation research
  ✓ Read-only testnet preflight
  ✓ Documentation created
  ✓ Tests 1108/1108

BLOCKED (each requires separate approval):
  ✗ Install Stellar CLI
  ✗ Investigate WASM provenance
  ✗ Generate testnet keypair
  ✗ Fund testnet account
  ✗ Deploy testnet contract
  ✗ Configure testnet environment
  ✗ Execute test mint
```

## Loop Behavior

### Allowed
- Read-only Git status, branches, worktrees
- Read-only PR/comment state verification
- Run tests/builds
- Check /health and /healthz
- Read-only source/tooling inspection
- Documentation and diagram validation
- TODO status updates with evidence

### Forbidden
- Automatic PR writes
- Automatic commits/pushes
- Key generation
- Account funding
- Contract deployment
- Environment changes
- NFT minting
- Blockchain transactions
- Financial operations
- Secret rotation
- Completion claims without evidence

### Stop and request approval before
- Installing host software
- Generating keypairs
- Funding accounts
- Deploying contracts
- Changing environment files
- Minting NFTs
- Any irreversible action

## Exit Criteria
1. All P1 tasks COMPLETE ✓
2. CLI installation approved and executed
3. WASM provenance verified
4. Or: all testnet operations explicitly deferred
