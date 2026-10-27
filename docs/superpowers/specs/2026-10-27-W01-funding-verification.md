# W01: Reward funding verification gate

Date: 2026-10-27 | Priority: P1 | Stage: S2-T01
Audit: `docs/audits/2026-10-26-platform-wiring-audit.md` finding W01

## Problem

`fundReward()` in `LMS-Server/src/services/rewards/rewardService.ts:91-162` accepts any `FundingSource { type: FundingSourceType, reference?: string }` and writes two ledger entries (fund + reserve) without verifying the funding reference against any external provider or internal balance.

`FundingSourceType` admits `'platform_credit' | 'admin_grant' | 'stellar' | 'paystack'` (defined in `rewardTypes.ts:22`). For `stellar` and `paystack` types, the `reference` field should point to a verified external transaction. For `platform_credit`, an internal balance check should be required. For `admin_grant`, the actor must have the `reward.admin_grant` capability.

`verifyTransaction()` exists in `paystackService.ts:84` but is never called from the reward funding path.

### Ripwire evidence

- `fundReward`: rank 1, 6 callers, 11 callees. Calls `validateScope`, `assertTransition`, `getOrCreateAccount`, `writeLedgerEntry`, `calculateMaxExposure`, `checkTransactionIdempotency`. Does **not** call `verifyTransaction` or any Stellar verification function.
- `verifyTransaction`: rank 11 for "reward funding verification" — exists but unreachable from the funding path.

### Callers (routes that invoke fundReward)

- `sponsor.ts` — POST `/api/v1/sponsor/rewards/:rewardId/fund`
- `employer.ts` — POST `/api/v1/employer/rewards/:rewardId/fund`
- `parent.ts` — POST `/api/v1/parent/rewards/:rewardId/fund`
- `teacher.ts` — POST `/api/v1/teacher/rewards/:rewardId/fund`
- `adminRewards.ts` — admin funding path

## Current behavior

```
Actor → POST /fund { type: "stellar", reference: "tx_abc" } → 200 OK (no verification)
Actor → POST /fund { type: "paystack", reference: "ref_123" } → 200 OK (no verification)
Actor → POST /fund { type: "platform_credit" } → 200 OK (no balance check)
```

## Intended behavior

| Source type | Verification | Failure response |
| --- | --- | --- |
| `stellar` | Verify transaction exists on Stellar network via Horizon API; confirm amount, recipient and finality | 402 `FUNDING_UNVERIFIED` with reason |
| `paystack` | Call `verifyTransaction(reference)` (already exists); confirm amount, currency, success status | 402 `FUNDING_UNVERIFIED` with reason |
| `platform_credit` | Verify funder's platform credit balance ≥ total exposure | 402 `INSUFFICIENT_CREDIT` |
| `admin_grant` | Verify actor has `reward.admin_grant` capability | 403 `SCOPE_DENIED` |

For all types, `reference` must be non-empty when an external source is claimed. The reference must not have been used for a different reward (cross-reference idempotency).

## Invariants

1. No reward transitions to `funded` without verified funding evidence.
2. A funding reference cannot be reused across different rewards.
3. Ledger entries record the verified source, not just the claimed source.
4. External verification failures are retryable; partial state never persists (transaction wraps all writes).

## API contract

**Request** (unchanged shape):
```json
{ "type": "stellar", "reference": "tx_hash_or_paystack_ref" }
```

**Success response** (unchanged): 200 with reward in `funded` state.

**New error responses**:
- `402 { error: { code: "FUNDING_UNVERIFIED", message: "..." } }` — external verification failed
- `402 { error: { code: "INSUFFICIENT_CREDIT", message: "..." } }` — platform credit insufficient
- `409 { error: { code: "DUPLICATE_REFERENCE", message: "..." } }` — reference already used

## Touched files

| File | Change |
| --- | --- |
| `src/services/rewards/rewardService.ts` | Add verification dispatch in `fundReward()` before state transition |
| `src/services/rewards/rewardFundingVerifier.ts` | **New**: verification dispatch per source type |
| `src/services/paystackService.ts` | Wire existing `verifyTransaction` for reward use |
| `src/services/rewards/rewardErrors.ts` | Add `FUNDING_UNVERIFIED`, `INSUFFICIENT_CREDIT`, `DUPLICATE_REFERENCE` |
| `src/services/rewards/rewardTypes.ts` | No change; existing types sufficient |
| `src/__tests__/reward-funding-verification.test.ts` | **New**: focused verification tests |

## TDD steps

1. **RED**: Write test: `fundReward()` with `type: "paystack"` and invalid reference → expect 402 → currently returns 200 (FAILS).
2. **RED**: Write test: `fundReward()` with `type: "stellar"` and no reference → expect 402 → currently returns 200 (FAILS).
3. **RED**: Write test: `fundReward()` with `type: "platform_credit"` and insufficient balance → expect 402 → currently returns 200 (FAILS).
4. **GREEN**: Implement `verifyFunding()` dispatch in `fundReward()`. Mock external providers in tests.
5. **GREEN**: Wire `verifyTransaction()` for paystack. Add Stellar Horizon check (or stub with deny-by-default if no Horizon client exists).
6. **REFACTOR**: Extract verification into `rewardFundingVerifier.ts`. Ensure existing tests still pass.

## Acceptance criteria

- [ ] `fundReward()` with unverified/missing reference returns 402
- [ ] `fundReward()` with verified reference returns 200 and transitions to funded
- [ ] Duplicate reference for different reward returns 409
- [ ] Platform credit check enforces available balance
- [ ] Existing reward test suite passes without regression
- [ ] Characterization probe W01 now fails (defect no longer reproducible)
- [ ] Independent security review completed

## Alternatives considered

**A. Deny all external funding, allow only platform_credit/admin_grant**: Too restrictive — removes Stellar/Paystack integration capability. Not recommended.

**B. Async verification with pending state**: Add `pending_verification` state between `draft` and `pending_funding`. More complex; defers the problem. Not recommended for initial fix — synchronous verification is simpler and the existing state machine already has atomic transitions.

**Recommended: Synchronous verification in the existing transaction** (described above). Smallest complete change. Reuses existing `verifyTransaction()`. Preserves the atomic ledger+state transition.
