# Minting Safety and Idempotency Specification

**Date:** 2026-08-19
**Phase:** 16 (Repository Assessment)
**Status:** ASSESSMENT

## Purpose

Document the existing safety mechanisms in mintService.ts and its callers, assess their adequacy for testnet minting, and identify any gaps.

## Safeguard Inventory

### 1. Network Configuration Guards

| Guard | Location | Behavior |
|-------|----------|----------|
| NFT_STELLAR_NETWORK validation | mintService.ts:42-47 | Throws if missing, empty, or not in ['public', 'testnet'] |
| NFT_MINTER_SECRET required | mintService.ts:50-53 | Throws if missing — prevents unconfigured mint |
| NFT_CONTRACT_ID required | mintService.ts:55-58 | Throws if missing |
| Network passphrase hardcoded | mintService.ts:19-28 | NETWORK_DEFAULTS prevents cross-network passphrase |
| RPC URL defaults | mintService.ts:61 | Falls back to network-appropriate default |

**Assessment:** STRONG. Fail-closed design. No silent defaults. Cross-network protection built in.

### 2. Auto-Mint Guards

| Guard | Location | Behavior |
|-------|----------|----------|
| NFT_AUTO_MINT_ENABLED flag | quizzesController.ts:467 | Triple-gate: passed=1 AND isTriggerQuiz AND flag='true' |
| isTriggerQuiz check | mintService.ts:76-81 | Only specific quiz IDs trigger mint |
| Wallet linking check | quizzesController.ts:468-476 | Must have walletAddress AND wallet_linking_status='linked' |

**Assessment:** STRONG. Three independent guards. Default=false. Cannot accidentally enable.

### 3. Idempotency

| Path | Mechanism | Scope |
|------|-----------|-------|
| mintCredentialForQuiz | DB check: SELECT WHERE user_id=? AND quiz_id=? AND mint_status='minted' | Per (user, quiz) pair |
| mintCredential (admin) | No internal check — caller responsible | Per (user, course) via nftApplications.ts:888-898 |
| remintCredential | is_superseded + TOCTOU transaction guard | Per credential ID |
| nftApplications mint | DB check: SELECT WHERE user_id=? AND course_id=? AND mint_status='minted' | Per (user, course) pair |

**Assessment:** ADEQUATE. Quiz path is internally idempotent. Course path relies on caller, which does check. Remint has TOCTOU protection.

**Gap identified:** If mintCredential() is called directly (not via route handler), there's no idempotency guard. This is by design (admin override path), but worth noting.

### 4. Error Handling

| Path | On Failure | Retry Behavior |
|------|-----------|----------------|
| mintCredentialForQuiz | Persists 'failed' to DB, logs error, swallows exception | No automatic retry. Re-triggerable by re-submitting quiz. |
| mintCredential | Throws Error — caller returns 502 | Manual retry via admin UI |
| Simulation failure | Both paths throw before submitting transaction | No on-chain cost |
| Send failure | Both paths throw after send | Transaction may still land (edge case) |
| Poll timeout | Both paths throw "not confirmed" | Transaction may confirm later (edge case) |

**Assessment:** ADEQUATE with known edge cases.

**Edge case — transaction lands after timeout:**
- mintCredentialForQuiz: marks as 'failed' in DB. If tx actually succeeded, there's a mismatch (on-chain mint exists, DB says 'failed'). Remint would create a duplicate on-chain token.
- mintCredential: throws, caller persists 'failed'. Same mismatch risk.
- Mitigation: Admin can check Horizon and manually update DB. No automated reconciliation.

### 5. Secret Handling

| Aspect | Status |
|--------|--------|
| Secret in error messages | SAFE — NET-16 test confirms secret not leaked in errors |
| Secret in logs | SAFE — only module/userId/quizId/txHash logged, never minterSecret |
| Secret in memory | ADEQUATE — lives in process.env, read per-call, not cached in module scope |
| Secret in DB | SAFE — not persisted to nft_credentials or any table |
| Secret in responses | SAFE — never included in API responses |

**Assessment:** STRONG. No secret leakage vectors identified.

### 6. Transaction Safety

| Aspect | Status |
|--------|--------|
| Fee cap | 1,000,000 stroops (0.1 XLM) — reasonable for Soroban |
| Timeout | 120 seconds — prevents indefinite waits |
| Simulation before send | Always — validates ABI, estimates resources |
| Network passphrase | From NETWORK_DEFAULTS — prevents cross-network signing |

**Assessment:** STRONG.

## Test Coverage Summary

| Area | Tests | Coverage |
|------|-------|----------|
| Network config validation | 17 (NET-1 through NET-17) | COMPREHENSIVE |
| isTriggerQuiz | 6 | COMPREHENSIVE |
| Unconfigured no-op | 3 | ADEQUATE |
| Schema/DB constraints | 6 | ADEQUATE |
| Auto-mint flag | B1 tests + NA4 | ADEQUATE |
| Remint flow | remint.test.ts | ADEQUATE |
| Application mint | regression-mint-button.test.ts | ADEQUATE |
| Simulation failure | NOT TESTED (mocked away) | GAP |
| Poll timeout | NOT TESTED (mocked away) | GAP |
| Cross-network prevention | NET-11, NET-12 | ADEQUATE |

## Gaps for Testnet Readiness

1. **No integration test with real RPC** — all mint tests mock Soroban. Testnet mint is the first real-RPC test.
2. **No reconciliation for timeout-then-success** — if poll times out but tx lands, DB is stale.
3. **No contract storage read test** — constructor values are LIKELY, not VERIFIED.
4. **Error message truncation** — errors truncated to 500 chars. Soroban errors can be longer. Not a safety issue, but may lose diagnostic info.

## Recommendation

Proceed with Option A (read-only verification) → Option B (simulation) → Option C (one mint) progression. Each stage requires separate approval. All gaps are acceptable for a controlled testnet mint.
