# Stellar Payment Verification Flow

**Date:** 2026-09-03 | **Source:** stellarPaymentMonitor.ts, paymentService.ts, payments.ts

---

## Payment Record Creation (Server-Side)

```mermaid
flowchart TD
    Student[Student initiates Stellar payment] --> Route[POST /payments/stellar/:applicationId]
    Route --> Auth[Verify JWT + ownership]
    Auth --> Pricing[Fetch course_pricing from DB]
    Pricing --> PriceCheck{stellar_price_xlm or stellar_price_usdc set?}
    PriceCheck -->|No| Reject400[400: No price configured]
    PriceCheck -->|Yes| DupCheck{Existing confirmed/waived payment?}
    DupCheck -->|Yes| Reject409[409: Already completed]
    DupCheck -->|No| CreatePayment[createStellarPayment]
    CreatePayment --> Store[INSERT payments: stellar_memo, stellar_expected_amount, payment_method]
    Store --> Response[201: paymentId, destinationAddress, memo, amount]
```

**Trusted amount source:** `pricing.stellar_price_xlm` or `pricing.stellar_price_usdc` from `course_pricing` table (admin-only write via `setCourseStellarPricing`). The client never provides or modifies the expected amount.

---

## Payment Monitor Verification (Background Poller)

```mermaid
flowchart TD
    Poll[Poll Horizon /accounts/RECEIVING_WALLET/payments] --> Filter1{type == 'payment'?}
    Filter1 -->|No| Skip1[Skip: create_account, etc.]
    Filter1 -->|Yes| Filter2{asset == native XLM or USDC + correct issuer?}
    Filter2 -->|No| Skip2[Skip: wrong asset]
    Filter2 -->|Yes| FetchTx[Fetch transaction for memo]
    FetchTx --> Filter3{memo_type == 'text' and memo present?}
    Filter3 -->|No| Skip3[Skip: no text memo]
    Filter3 -->|Yes| Lookup[getPaymentByStellarMemo]
    Lookup --> Filter4{Matching pending payment found?}
    Filter4 -->|No| Skip4[Skip: no match or not pending]
    Filter4 -->|Yes| AmtCheck{stellar_expected_amount present and > 0?}
    AmtCheck -->|No| LegacyWarn[Warn: confirm without amount check]
    AmtCheck -->|Yes| Threshold{receivedAmount >= expectedAmount * 0.99?}
    Threshold -->|No| RejectDust[Warn + skip: dust payment]
    Threshold -->|Yes| Confirm[Update stellar_tx_hash + confirmPayment]
    LegacyWarn --> Confirm
```

---

## Validation Checks Present

| Check | Present? | Implementation |
|---|---|---|
| Asset filter (XLM or USDC) | YES | Lines 129-131: `isXlm \|\| isUsdc` |
| USDC issuer validation | YES | Line 130: `payment.asset_issuer === USDC_ISSUER` |
| Destination scoping | IMPLICIT | Horizon API scoped to RECEIVING_WALLET account |
| Text memo matching | YES | Lines 146-150 |
| Status guard (pending only) | YES | Line 150 |
| Amount threshold (99%) | YES | Lines 156-169 |
| Legacy fallback | YES | Lines 170-178 |
| Tx hash persistence | YES | Lines 181-183 |

## Validation Gaps (Defense-in-Depth)

| Gap | Risk | Mitigation |
|---|---|---|
| `parseFloat()` not decimal-safe | Floating-point precision on large amounts | Amounts in practice < 10000; rounding error negligible at this scale |
| No asset-method cross-check | XLM payment against USDC expected or vice versa | Price difference (~1000x) would fail 99% threshold naturally |
| No explicit `to` field check | Outgoing payments from receiving wallet could match | Outgoing payments wouldn't have matching memos |
| No tx_hash uniqueness guard | Theoretical replay | Stellar tx_hashes are unique on-chain; cursor prevents re-processing |
| Tests verify arithmetic only | AMT-3/4/5 test threshold logic inline, not the full monitor path | Monitor is integration-heavy (Horizon API); unit arithmetic tests adequate for the comparison logic |
