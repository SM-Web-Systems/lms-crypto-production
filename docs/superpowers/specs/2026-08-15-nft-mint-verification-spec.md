# NFT Mint Verification Specification — SDK v16

**Date:** 2026-08-15
**Status:** BLOCKED — Requires testnet contract or authorized production mint

## Problem Statement

The Stellar SDK v16 upgrade (15.1.0 -> 16.2.0) replaced `axios` transport with native `fetch`. While `mintService.ts` had zero code changes, the underlying SDK API surface changed. No live Soroban transaction has been executed under SDK v16 yet.

## Risk Assessment

| Factor | Risk Level | Rationale |
|--------|-----------|-----------|
| mintService.ts code change | None | Zero diff in SDK upgrade |
| SDK transport change | Low | `rpc.Server`, `Contract.call()`, `assembleTransaction()` APIs unchanged |
| Network passphrase | None | Hardcoded `StellarSdk.Networks.PUBLIC`, not affected |
| Soroban RPC compatibility | Low | `mainnet.sorobanrpc.com` supports SDK v16 |

## Current Architecture

### Two Mint Paths

**Legacy (quiz-triggered, DISABLED):**
- Trigger: quiz pass + `NFT_AUTO_MINT_ENABLED=true`
- Entry: `quizzesController.ts:467`
- Function: `mintCredentialForQuiz()` — fire-and-forget
- Status: Disabled (`NFT_AUTO_MINT_ENABLED=false`)

**Admin-triggered (ACTIVE):**
- Trigger: admin clicks "Mint" on approved application
- Endpoint: `POST /courses/:courseId/completions/applications/:appId/mint`
- Route: `nftApplications.ts:810-950`
- Function: `mintCredential()` — throws on failure
- Permission: `certificate.mint` RBAC

### Transaction Flow (mintService.ts)
1. Create `rpc.Server(NFT_SOROBAN_RPC_URL)` — line 95/207
2. Load minter keypair from `NFT_MINTER_SECRET` — line 96/208
3. Fetch account sequence — line 97/209
4. Build `contract.call('mint', to, caller)` transaction — lines 100-112/212-224
5. `server.simulateTransaction()` — line 115/227
6. `rpc.assembleTransaction()` — line 122/234
7. `transaction.sign(minterKeypair)` — line 123/235
8. `server.sendTransaction()` — line 125/237
9. Poll `server.getTransaction()` for confirmation — lines 134-138/241-249
10. Extract `soroban_token_id` from result — lines 141-147/251-257

### Configuration (Production)
```
NFT_CONTRACT_ID=CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524
NFT_SOROBAN_RPC_URL=https://mainnet.sorobanrpc.com
Network: StellarSdk.Networks.PUBLIC (hardcoded)
```

## Verification Strategy

### Option A: Testnet-First (Recommended, BLOCKED)

**Prerequisites:**
1. Deploy NFT contract to Stellar testnet
2. Create testnet minter keypair (Friendbot funded)
3. Add `STELLAR_NETWORK` env var to switch passphrase
4. Modify `mintService.ts` lines 102/209 to read network from env
5. Stand up testnet API instance (`docker-compose.testnet.yml`)

**Verification steps:**
1. Trigger admin mint via testnet API
2. Confirm simulation succeeds
3. Confirm transaction submitted and confirmed
4. Confirm `nft_credentials` row created with `network='testnet'`
5. Verify on Stellar Expert (testnet)

**Current blockers:**
- No testnet contract deployed
- `mintService.ts` hardcodes PUBLIC network
- Requires code change (network passphrase parameterization)

### Option B: Production Opportunistic (Available)

**Prerequisites:**
1. Real student with approved NFT application + completed payment
2. Admin authorization to trigger mint
3. Minter wallet has sufficient XLM (last check: 26 XLM)

**Verification steps:**
1. Admin triggers mint through normal UI flow
2. Monitor `docker logs lms-api` for Soroban RPC calls
3. Confirm `nft_credentials` row with `mint_status='minted'`
4. Verify transaction on Stellar Expert (mainnet)

**Risk:** If SDK v16 introduces a breaking change in Soroban RPC, the mint fails. Rollback: documented procedure to revert to SDK v15.

### Option C: Unit-Level Verification (Already Done)

- SDK import test (`stellar-sdk-import.test.ts`): validates API surface
- Mint tests (`phase-f-mint.test.ts`): mock-based, validates control flow
- All 1091 backend tests pass including mint-related tests

## Error Taxonomy

| Error | Cause | Recovery |
|-------|-------|----------|
| Simulation failure | Contract incompatibility | Rollback SDK |
| Insufficient fee | Network fee spike | Retry with higher fee |
| Minter balance low | XLM depleted | Top up from treasury |
| Transaction timeout | RPC congestion | Auto-retry (polling) |
| Duplicate mint | Idempotency check | Skip (existing credential) |

## Idempotency

- Legacy path: checks `nft_credentials` for existing `mint_status='minted'` before attempting
- Admin path: route validates no existing minted credential (line 888)
- Re-execution safe: returns existing credential or skips

## Feature Flags

| Flag | Value | Effect |
|------|-------|--------|
| `NFT_AUTO_MINT_ENABLED` | `false` | Disables legacy quiz-triggered mints |
| Admin mint endpoint | Always active | Gated by RBAC `certificate.mint` permission |

## Migration Requirements

None for verification. Testnet-first path would need:
- New env var: `STELLAR_NETWORK=testnet|public`
- Update `mintService.ts` to read network passphrase from env

## Backward Compatibility

SDK v16 is backward-compatible for the APIs used in `mintService.ts`. The `rpc.Server`, `Contract`, `TransactionBuilder`, `assembleTransaction` APIs are unchanged.

## Rollback Strategy

1. Revert to SDK v15: `npm install @stellar/stellar-sdk@15.1.0`
2. Rebuild API container: `docker compose build api && docker compose up -d --no-deps api`
3. Verify: `docker exec lms-api node -e "console.log(require('@stellar/stellar-sdk/package.json').version)"`

## Acceptance Criteria

- [ ] At least one successful Soroban transaction under SDK v16 (testnet or production)
- [ ] Transaction hash verified on Stellar Expert
- [ ] `nft_credentials` row correctly populated
- [ ] No secrets in logs
- [ ] Duplicate execution does not create unintended duplicate

## Open Decisions

1. **Testnet vs. production first?** Testnet requires code change; production is available but higher risk.
2. **Parameterize network passphrase now or defer?** Low-effort change but adds testnet capability.
3. **Who authorizes the first production mint?** Requires admin with `certificate.mint` permission.
