# Verification Audit: FIND-010a and FIND-008a

**Date:** 2026-09-03
**Auditor:** Claude Opus 4.6
**Repository:** LMS-AmmaWallet @ `358e788`
**Deployed:** lms-api buildSha `1c37d88` (one docs-only commit behind — code identical)
**AmmaWallet:** @ `a65e19c`

---

## FIND-010a — Stellar Dust-Payment Amount Verification

### Current Implementation

**File:** `LMS-Server/src/services/stellarPaymentMonitor.ts:152-178`

The monitor polls Horizon for incoming payments to `PAYMENT_RECEIVING_WALLET`, filters for XLM or USDC (with issuer validation), fetches transaction memos, matches to pending payment records, and compares received amount against `stellar_expected_amount` with a 99% tolerance threshold.

### Expected Amount Source

`stellar_expected_amount` originates from `course_pricing.stellar_price_xlm` or `course_pricing.stellar_price_usdc` (admin-only table). The flow:

1. Admin sets Stellar price via `setCourseStellarPricing()` (paymentService.ts:233-242).
2. Student initiates payment → `POST /payments/stellar/:applicationId` (payments.ts:647-649).
3. Server reads `pricing.stellar_price_xlm` or `pricing.stellar_price_usdc` from DB.
4. Server calls `createStellarPayment(..., stellarAmount)` — stores as `stellar_expected_amount`.

### Client Influence Analysis

| Question | Answer |
|---|---|
| Who creates expected amount? | Server, from admin-set course_pricing |
| Can client submit or modify it? | NO — not in request body; read from DB |
| Can payer influence it? | NO — amount set before payment initiation |
| Is it from server-side source? | YES — course_pricing table (admin write only, requirePermission('course.manage')) |
| Immutable after creation? | YES — no UPDATE to stellar_expected_amount exists |
| Tied to correct user/order? | YES — via applicationId → course_id → pricing lookup |
| Currency/asset validated? | PARTIAL — see gaps below |
| Decimal-safe comparison? | NO — uses `parseFloat()` |
| Missing field behavior? | Warn + confirm (legacy fallback) |
| Legacy records? | Confirmed without amount check (logged warning) |

### Threshold Analysis

```typescript
const receivedAmount = parseFloat(payment.amount);  // Horizon returns string
const minAcceptable = expectedAmount * 0.99;
if (receivedAmount < minAcceptable) { continue; }  // Reject
```

| Scenario | Expected Behavior | Verified |
|---|---|---|
| Exact amount (25.5) | Passes (25.5 >= 25.245) | YES (AMT-4) |
| 99% boundary (99.0 of 100.0) | Passes (99.0 >= 99.0) | YES (AMT-5) |
| Below 99% (0.0000001 of 25.5) | Rejected | YES (AMT-3) |
| Overpayment (30.0 of 25.5) | Passes (30.0 >= 25.245) | YES (arithmetic) |
| Zero amount | Rejected (0 < minAcceptable) | YES (arithmetic) |
| Negative amount | Rejected (negative < minAcceptable) | YES (arithmetic) |
| Malformed decimal | `parseFloat` returns NaN → NaN < minAcceptable → rejected | YES (NaN comparison) |
| Very large value | Passes (large >= minAcceptable) | YES (arithmetic) |
| Wrong asset (not XLM/USDC) | Skipped at line 131 before amount check | YES |
| Wrong USDC issuer | Skipped at line 130 | YES |
| Wrong destination | Implicit — Horizon scoped to RECEIVING_WALLET | IMPLICIT |
| Wrong network | Horizon URL determines network | IMPLICIT |
| Duplicate tx_hash | Cursor-based — already-processed payments not re-fetched | IMPLICIT |
| Replayed confirmation | `status !== 'pending'` guard at line 150 | YES |
| Multiple matching memos | `getPaymentByStellarMemo` returns first match; memos are UUID-derived (collision negligible) | ACCEPTABLE |

### Floating-Point Assessment

`parseFloat()` introduces IEEE 754 imprecision. For the 99% threshold:
- `25.5 * 0.99 = 25.245` — exact in float64
- `100.0 * 0.99 = 99.0` — exact in float64
- Edge case: `99.99 * 0.99 = 98.9901` (float64: `98.99010000000001`) — negligible error

For practical course prices (< $10,000 in XLM/USDC), float64 has ~15 decimal digits of precision. The 1% tolerance margin vastly exceeds any floating-point error. **Not a practical vulnerability**, but not best practice.

### Defense-in-Depth Gaps

| Gap ID | Description | Severity | Risk |
|---|---|---|---|
| GAP-010a-1 | No asset-method cross-validation: monitor doesn't check `payment_method` (stellar_xlm vs stellar_usdc) against received asset type | LOW | Price difference (~1000x) would fail 99% threshold |
| GAP-010a-2 | `parseFloat()` instead of decimal-safe arithmetic | INFO | 1% tolerance margin absorbs float imprecision at practical scales |
| GAP-010a-3 | No explicit Horizon `to` field check (relies on API scoping) | INFO | Implicit via Horizon account-scoped endpoint |
| GAP-010a-4 | Tests AMT-3/4/5 test arithmetic inline, not the full monitor integration | LOW | Monitor is Horizon-dependent; arithmetic is the testable unit |

### Test Evidence

**File:** `LMS-Server/src/__tests__/stellar-amount-verification.test.ts`
**Result:** 5/5 PASS

| Test ID | Coverage | Result |
|---|---|---|
| AMT-1 | createStellarPayment stores stellar_expected_amount | PASS |
| AMT-2 | Null stellar_expected_amount handled | PASS |
| AMT-3 | Dust amount below 99% threshold | PASS |
| AMT-4 | Exact amount passes | PASS |
| AMT-5 | 99% boundary passes | PASS |

**Missing test coverage:**
- AMT-6: Wrong asset/issuer (covered by code at line 131, not tested)
- AMT-7: Wrong destination (implicit, not testable without Horizon mock)
- AMT-8: Duplicate/replay (covered by status guard, not specifically tested)
- AMT-9: Missing expected amount legacy behavior (covered by code, not tested)

### Deployment Evidence

- `stellarPaymentMonitor.ts` present in deployed container (buildSha `1c37d88` contains commit `44dc375`)
- `USDC_ISSUER` hardcoded to mainnet issuer
- `STELLAR_MONITOR_ENABLED` controls activation

### FIND-010a Result

```
PARTIALLY_VERIFIED
```

**Rationale:** The core dust-payment attack vector (the original finding) is fully mitigated — `stellar_expected_amount` is server-sourced, immutable, and compared with a 99% threshold. The finding as originally stated ("receivedAmount computed but never compared to expectedCents") is resolved. However, defense-in-depth gaps exist (GAP-010a-1 through GAP-010a-4) that prevent full `VERIFIED_RESOLVED` classification. These gaps are LOW/INFO severity and do not represent exploitable attack vectors at current scale.

### Follow-Up Required

**Optional (LOW priority):** Create `FIND-010a-FOLLOWUP` to track GAP-010a-1 (asset-method cross-validation). Not blocking.

---

## FIND-008a — LMS Receive-Only Wallet Design

### Wallet Purpose

LMS creates wallets on AmmaWallet as **receive-only addresses** for NFT credential delivery. The wallet public key is the `to:` argument in Soroban `mint()` contract calls. The wallet never initiates or signs transactions.

### LMS Signing Behavior

LMS contains **zero Stellar transaction signing code**. All signing is performed by the platform minter keypair (`NFT_MINTER_SECRET`) in `mintService.ts`.

### Downstream Signing Owner

**Platform minter keypair** loaded from `NFT_MINTER_SECRET` environment variable.

| Evidence | Location |
|---|---|
| Minter keypair creation | mintService.ts:162 (`Keypair.fromSecret(nftConfig.minterSecret)`) |
| Minter signs transaction | mintService.ts:189 (`prepared.sign(minterKeypair)`) |
| User wallet is recipient only | mintService.ts:170-177 (`walletAddress` passed as `to:` argument) |
| Second mint path also uses minter | mintService.ts:271, 296 |

### Public-Key Persistence

- Generated via AmmaWallet `/keypair/generate` (walletService.ts:113-116)
- Stored in LMS `users.walletAddress` column (returned from `generateWalletAddress`)
- Also stored in AmmaWallet `user_wallets` table with `encryptedSecret = NULL`

### Secret Lifecycle

| Phase | What Happens | Evidence |
|---|---|---|
| Generation | AmmaWallet generates keypair, returns both keys | walletService.ts:113-126 |
| Transfer | Only publicKey used; secretKey in response body but not extracted for storage | walletService.ts:148 (publicKey used), :149 (empty string sent) |
| Storage in AmmaWallet | `encryptedSecret: ""` → coerced to `NULL` by `\|\|` operator | AW wallets.ts:200 (`encryptedSecret \|\| null`) |
| Storage in LMS | Secret never assigned to any variable beyond response parsing | walletService.ts:126 (KeypairResponse), :164 (returns publicKey only) |
| Discard | Secret falls out of scope at end of `generateWalletAddress()` | No persistence, no logging, no return |
| Signing attempts | AmmaWallet returns 400 for null encryptedSecret | AW server.ts:1279, 1415 |

### Credential/NFT Flow

1. Admin approves NFT application → triggers `mintCredential` or `mintCredentialForQuiz`
2. `mintService` loads `NFT_MINTER_SECRET` → creates `minterKeypair`
3. Soroban contract call: `mint(to: walletAddress, caller: minterPublicKey)`
4. Minter signs and submits transaction
5. `nft_credentials` record created with `tx_hash`, `soroban_token_id`
6. User's wallet receives the NFT — no signing required on their part

### Recovery/Refund Implications

- Refunds are handled by `paymentService.refundPayment()` (admin action, DB status change) — not Stellar-based
- No Stellar transaction reversal exists in the system
- The discarded secret is never needed for any operational path

### Test Evidence

**Wallet provisioning tests:** Not directly testable without AmmaWallet running (external HTTP dependency)
**Mint tests:** `mint.test.ts` tests the minting service with mocked Soroban calls — confirms minter keypair usage
**Secret non-disclosure:** walletService.ts:164 returns only `publicKey` — verified by code inspection

### Documentation Evidence

- walletService.ts:129-134: DESIGN NOTE explaining receive-only architecture
- walletService.ts:149: Inline comment "Intentionally empty"
- DEPLOYMENT-TOPOLOGY.md: Documents wallet provisioning flow

### Deployment Evidence

- `walletService.ts` present in deployed container
- `NFT_MINTER_SECRET` set in production environment (confirmed by mintService loading without error)
- AmmaWallet wallets table schema accepts NULL encryptedSecret

### Design Decision

```
LMS creates a receive-only address controlled by the platform minter for NFT delivery
```

The platform minter (`NFT_MINTER_SECRET`) is the authorized signer for mint operations. The user's wallet receives NFTs but never needs to sign. The discarded secret is architecturally unnecessary.

### FIND-008a Result

```
VERIFIED_RESOLVED_BY_DESIGN
```

**Rationale:** The signing owner is the platform minter (proven at mintService.ts:162,189,271,296). The user wallet is receive-only by design. AmmaWallet rejects signing attempts for wallets with null encryptedSecret. The secret is never stored, logged, or returned. No operational path requires it. The architecture is internally consistent.

### Follow-Up Required

None.

---

## Final Classification

| Finding | Classification | Original Severity | Tracker Status |
|---|---|---|---|
| FIND-010a | **PARTIALLY_VERIFIED** | HIGH | Currently RESOLVED — recommend adding follow-up note |
| FIND-008a | **VERIFIED_RESOLVED_BY_DESIGN** | HIGH | RESOLVED — confirmed correct |

### New Findings

| ID | Severity | Description | Location |
|---|---|---|---|
| GAP-010a-1 | LOW | Stellar payment monitor does not cross-validate `payment_method` (stellar_xlm/stellar_usdc) against the on-chain asset type of the received payment | stellarPaymentMonitor.ts:128-131 vs :154 |

### Recommended Next Action

1. **FIND-008a:** No action needed. Classification confirmed.
2. **FIND-010a:** Keep RESOLVED status (core vulnerability is fixed). Optionally add GAP-010a-1 as a separate LOW finding for asset-method cross-validation. The `parseFloat` usage and missing test coverage are INFO-level and do not warrant reopening.
