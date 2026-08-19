# Integration Readiness Plan

**Date:** 2026-08-19
**Phase:** 17 (Post-Mint Verification)
**Status:** ASSESSMENT

## Current State

Testnet mint VERIFIED. The contract correctly:
- Accepts mint(to, caller) calls
- Emits Mint events with token_id
- Increments TokenIdCounter and TotalSupply
- Stores admin and metadata in instance storage
- Charges reasonable fees (~0.035 XLM per mint)

## Identified Gaps (Priority Order)

### Gap 1: Metadata JSON Endpoint (P1)
- **Impact:** NFT tokens have no queryable metadata — base_uri returns SPA HTML
- **Effort:** Create /nft/:tokenId API route returning JSON (name, description, image, attributes)
- **Approval:** Separate implementation approval required
- **Blocker for:** NFT display in wallets, marketplaces, explorers

### Gap 2: Timeout-Then-Success Reconciliation (P2)
- **Impact:** If mint poll times out but tx lands, DB says 'failed' while on-chain token exists
- **Effort:** Reconciliation function that checks Horizon for 'failed' credentials, updates DB
- **Approval:** Separate implementation approval required
- **Blocker for:** Production reliability, duplicate prevention

### Gap 3: Admin UI Network Filter (P3)
- **Impact:** Testnet credentials appear alongside production in admin views
- **Effort:** Add WHERE network=? filter to queries, toggle in UI
- **Approval:** Separate implementation approval required
- **Blocker for:** Ongoing testnet usage, visual clarity

### Gap 4: Real-RPC Integration Tests (P3)
- **Impact:** No automated regression for contract compatibility
- **Effort:** Read-only tests using stellar contract read + simulation
- **Approval:** Separate implementation approval required
- **Blocker for:** CI/CD confidence, upgrade safety

## Recommended Sequence

1. Metadata endpoint (P1) — enables NFT display
2. Timeout reconciliation (P2) — enables production reliability
3. Admin UI filter (P3) — enables ongoing testnet usage
4. Real-RPC tests (P3) — enables regression safety

## NOT Authorized

- Production mint
- Auto-mint enablement
- Second testnet mint
- Production configuration changes
