# Testnet-to-Production Readiness Spec

**Date:** 2026-08-19
**Status:** ASSESSMENT
**Scope:** Gap analysis between testnet verification and production deployment readiness

---

## Statement

Testnet success does not authorize production deployment or auto-mint enablement.

---

## What Testnet Success Proves

The controlled testnet mint (tx `05e459cc...44b2`) validates the following:

| Capability | Evidence |
|---|---|
| Contract deployment | Contract `CAJ74ZCQ...THRB` deployed and accessible |
| ABI compatibility | `mintService.ts` successfully constructed and submitted the `mint` invocation |
| Mint execution | Token ID 0 minted, TokenIdCounter incremented to 1 |
| Event emission | `Mint` event emitted with correct `token_id` |
| Token ID tracking | DB recorded `soroban_token_id` matching on-chain state |
| Fee economics (testnet) | 349,292 stroops (0.0349 XLM) — reasonable for a single invocation |
| Self-mint flow | Minter can mint to own address (admin self-mint pattern) |
| WASM integrity | Hash unchanged between deployment and mint |
| Backend integration | `mintService.ts` end-to-end flow works against real Soroban RPC |
| Test suite stability | 1108/1108 backend tests pass with no regressions |

---

## What Testnet Does NOT Prove

| Concern | Why Testnet Is Insufficient |
|---|---|
| Production RPC reliability | Testnet and mainnet RPC endpoints have different uptime, latency, and rate limits |
| Mainnet fee economics | Mainnet fees may differ due to network congestion and surge pricing |
| Production wallet balance sufficiency | Platform ops wallet balance and top-up cadence not validated for mint volume |
| User wallet compatibility | Testnet mint was self-mint (minter=recipient); user wallets not tested as recipients |
| Concurrent mint behavior | Single sequential mint does not validate concurrent/parallel mint safety |
| Mainnet contract deployment | Production contract must be separately deployed to mainnet |
| Production secret management | Testnet secrets are in `.env.secrets`; production secret rotation/access not validated |
| Metadata service under load | Metadata endpoint does not exist yet (see token-metadata-verification-spec) |
| Timeout-then-success recovery | Reconciliation process not implemented (see timeout-reconciliation-spec) |

---

## Remaining Gaps

### Gap 1: Metadata Service
- **Spec:** `2026-08-19-token-metadata-verification-spec.md`
- **Status:** NOT IMPLEMENTED
- **Impact:** NFTs will not have resolvable metadata JSON; affects discoverability and display in wallets/explorers
- **Required for:** Production NFTs that are publicly shareable or displayed in external wallets

### Gap 2: Timeout Reconciliation
- **Spec:** `2026-08-19-timeout-reconciliation-spec.md`
- **Status:** PROPOSED
- **Impact:** Failed-but-actually-minted tokens cause DB/on-chain mismatch; risk of duplicate mints on remint
- **Required for:** Any environment where mint timeouts are possible (always)

### Gap 3: Admin UI Network Filtering
- **Spec:** `2026-08-19-admin-network-filtering-spec.md`
- **Status:** PROPOSED
- **Impact:** Testnet credentials appear alongside production credentials in admin views
- **Required for:** Ongoing testnet usage alongside production

### Gap 4: Real-RPC Regression Tests
- **Spec:** `2026-08-19-real-rpc-integration-test-spec.md`
- **Status:** PROPOSED
- **Impact:** No automated detection of contract/ABI/RPC changes
- **Required for:** Confidence in ongoing contract compatibility

---

## Production Prerequisites

Before production mint (mainnet) can be authorized:

### Must Have

1. **Metadata endpoint** — `/nft/:tokenId` returning JSON metadata per token
2. **Timeout reconciliation** — automated or manual process to detect and fix DB/on-chain mismatches
3. **Monitoring and alerting** — mint failure notifications (beyond current minter-balance-check cron)
4. **Mainnet contract deployment** — separate deployment to Stellar public network with its own contract ID
5. **Production wallet funding** — sufficient XLM for expected mint volume (current: 26 XLM in ops wallet)

### Should Have

6. **Admin network filtering** — prevent testnet/production credential confusion
7. **Real-RPC regression tests** — automated ABI and state checks against deployed contract
8. **Concurrent mint testing** — validate behavior under parallel mint requests
9. **User wallet mint testing** — mint to a non-minter address to validate recipient flow

### Nice to Have

10. **Fee estimation logging** — log estimated vs actual fees for mainnet cost tracking
11. **Mint rate limiting** — prevent runaway mints from draining ops wallet
12. **Audit trail** — admin-visible log of all mint attempts, successes, and failures

---

## Approval Gates

Each of the following requires separate, explicit approval:

| Action | Prerequisite |
|---|---|
| Production contract deployment (mainnet) | Must-have items 1-5 |
| First production mint test | Deployed mainnet contract + manual trigger |
| Auto-mint enablement (`NFT_AUTO_MINT_ENABLED=true`) | Successful production mint test + reconciliation in place |
| Metadata service deployment | Implemented and tested endpoint |

No gate may be skipped. Each approval is independent.

---

## Current Production Configuration

These values must remain unchanged until explicitly approved:

```
NFT_STELLAR_NETWORK=public          # unchanged
NFT_AUTO_MINT_ENABLED=false         # unchanged — admin-triggered only
```

The production contract ID (`CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524`) is for the existing mainnet contract. It is not the testnet contract.
