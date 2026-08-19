# Next Tasks Loop Plan

**Date:** 2026-08-19
**Updated:** Phase 4 (Post-Worktree-Cleanup)

## Current State

```
COMPLETE:
  ✓ PR #1 merged (b6cc879)
  ✓ Production configured (NFT_STELLAR_NETWORK=public)
  ✓ API deployed and healthy
  ✓ Tests 1108/1108
  ✓ vitest.config.ts fix committed (94a7d4d)
  ✓ Documentation committed (51f337c)
  ✓ NFT worktree deleted
  ✓ Feature branch deleted
  ✓ Testnet preflight complete (read-only)

READY FOR DECISION:
  ? PR #1 historical test-count correction

BLOCKED (each requires separate approval):
  ✗ Install Stellar CLI
  ✗ Generate testnet keypair
  ✗ Fund testnet account
  ✗ Obtain contract WASM
  ✗ Deploy testnet contract
  ✗ Configure testnet environment
  ✗ Execute testnet mint
```

## Loop Behavior

### Allowed in loop
- Read-only Git status, branches, worktrees
- Read-only PR state
- Read-only remote state
- Run tests/builds
- Check /health and /healthz
- Inspect redacted logs
- Read-only testnet preflight
- Validate documentation and diagrams
- Update TODO statuses with evidence

### Forbidden in loop
- Automatic worktree deletion (already done)
- Automatic PR editing
- Automatic commits
- Automatic pushes
- Contract deployment
- Account generation
- Account funding
- Environment changes
- Auto-mint enablement
- NFT minting
- Blockchain transactions
- Financial operations
- Secret rotation
- Destructive database operations

### Stop and request approval before
- Editing a merged PR
- Installing host software
- Generating keypairs
- Funding accounts
- Deploying contracts
- Changing environment files
- Minting NFTs
- Any irreversible action

## Exit Criteria

The loop exits when:
1. All P1 tasks are COMPLETE ✓
2. PR historical record decision is made
3. All testnet approvals are granted or explicitly deferred
4. Final documentation is committed and pushed
```
