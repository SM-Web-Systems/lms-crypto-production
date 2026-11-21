# Testnet Invocation and Mint Approval Specification

**Date:** 2026-08-19
**Status:** NOT APPROVED — REQUIRES SEPARATE AUTHORIZATION

## Problem
Define the approval gates for testnet contract invocation and NFT minting.

## Goals
- Document what requires approval before invocation/minting
- Define the sequence of approvals
- Prevent unauthorized contract interaction

## Non-Goals
- Authorize invocation or minting (this spec defines gates, not grants)
- Change production
- Enable auto-mint

## Current State
- Contract deployed: VERIFIED
- Contract code verified: VERIFIED
- Constructor state: LIKELY (from deployment evidence)
- Environment configured: NO
- API running against testnet: NO
- Contract invoked: NO
- NFT minted: NO
- Auto-mint: false

## Approval Sequence
Each step requires explicit, separate approval:

1. **Write testnet environment** — Add NFT vars to app.testnet.env
   - Status: NOT APPROVED
   - Prerequisite: Deployment verification COMPLETE

2. **Run API in testnet mode** — Start amma-api-testnet with NFT config
   - Status: NOT APPROVED
   - Prerequisite: Environment configuration reviewed

3. **Read-only contract smoke test** — Invoke a non-mutating method (e.g., name(), total_supply())
   - Status: NOT APPROVED
   - Prerequisite: API running, separate review of invocation safety

4. **Execute one test mint** — Call mintCredential() for one test credential
   - Status: NOT APPROVED
   - Prerequisite: Smoke test passed, separate transaction approval

5. **Verify mint on explorer** — Read-only check of minted NFT
   - Status: NOT APPROVED
   - Prerequisite: Mint completed

6. **Keep auto-mint disabled** — NFT_AUTO_MINT_ENABLED=false
   - Status: YES (default)
   - No approval needed to maintain current state

## Authorization Boundaries
- Each approval is for ONE specific action
- No approval carries forward to subsequent steps
- Timeout/retry after failure requires new approval
- Production is never affected

## Risks
- Testnet may reset (public testnet has periodic resets)
- Constructor state is LIKELY, not VERIFIED (no read-only method invoked)
- Minter credential in GPG may need re-decryption for API use

## Acceptance Criteria
- [ ] All approval gates documented
- [ ] No unauthorized invocation or mint
- [ ] Production unchanged
- [ ] Auto-mint remains false

Deployment verification does not authorize contract invocation or NFT minting.
