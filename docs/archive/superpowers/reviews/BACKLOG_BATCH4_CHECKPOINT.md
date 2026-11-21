# Batch 4 — Execution Checkpoint

> Date: 2026-07-29
> Branch: `fix/backlog-batch4`
> Commit: `d2e9000`
> Status: **COMPLETE — ready for merge review**

---

## Summary

| Field | Value |
|-------|-------|
| Finding | P1-2-F2 — Billing TOCTOU Race Condition |
| Severity | MEDIUM |
| Fix | `checkWalletBillingTx()` with FOR UPDATE lock |
| Files changed | 3 (billing.service.ts, wallets.ts, billing-toctou.test.ts) |
| Tests added | 4 source-assertion tests |
| Total tests | 492/492 backend + 23/23 web-app |
| Secret scan | CLEAN |
| Code review | PASS (0 critical, 1 important deferred, 2 minor) |
| Commit hash | `d2e9000` |

---

## Changes

### billing.service.ts
- Added `checkWalletBillingTx(tx, { tenantId, userId })` — transactional variant with `FOR UPDATE` lock
- Same validation logic as `checkWalletBilling()`, uses `tx.select()` instead of `db.select()`
- Returns same `BillingCheckResult` type

### wallets.ts
- Added import for `checkWalletBillingTx`
- Inside `db.transaction()`: calls `checkWalletBillingTx()` before wallet insert
- Reassigns `billingResult` to locked result for subsequent debit
- Added `try/catch` wrapper for billing failures thrown from transaction
- Pre-flight `checkWalletBilling()` preserved outside transaction

### billing-toctou.test.ts (NEW)
- 4 source-assertion tests verifying:
  1. `checkWalletBillingTx` is exported
  2. `.for("update")` present in function body
  3. Called inside `db.transaction()` block in wallets.ts
  4. Pre-flight `checkWalletBilling` preserved outside transaction

---

## TDD Evidence

| Phase | Outcome |
|-------|---------|
| RED | 3/4 tests FAIL (expected — function not yet implemented) |
| GREEN | 4/4 tests PASS after implementation |
| Full suite | 492/492 backend PASS (488 baseline + 4 new) |
| Web-app | 23/23 PASS |

---

## Code Review Outcome

| Classification | Count | Details |
|----------------|-------|---------|
| Critical | 0 | — |
| Important | 1 | I-1: Helper functions (`getBillingPolicy`, `countUserWallets`, `isActiveTenantUser`) use `db` not `tx` inside locked function. Deferred — balance (actual race target) IS locked. |
| Minor | 2 | M-1: `tx: any` type (consistent pattern). M-2: Test char offset (acceptable). |
| Assessment | — | **Ready to commit** |

---

## Verification Evidence

- Backend: 492/492 PASS (71 test files, 12.63s)
- Web-app: 23/23 PASS (7 test files, 887ms)
- Billing unit: 99/99 PASS
- Secret scan: CLEAN (only `encryptedSecret` field name in diff)
- FOR UPDATE confirmed: line 338 of billing.service.ts
- Transaction call confirmed: line 176 of wallets.ts
- Pre-flight preserved: line 161 of wallets.ts

---

## TOCTOU Fix — Before/After

### Before (vulnerable)
```
Request 1: checkWalletBilling() → balance=3.0 (no lock)
Request 2: checkWalletBilling() → balance=3.0 (no lock)
Request 1: BEGIN → writeBillingDebit(-3.0) → COMMIT → balance=0.0
Request 2: BEGIN → writeBillingDebit(-3.0) → COMMIT → balance=-3.0 ← VIOLATION
```

### After (fixed)
```
Request 1: checkWalletBilling() → balance=3.0 (fast pre-flight, no lock)
Request 2: checkWalletBilling() → balance=3.0 (fast pre-flight, no lock)
Request 1: BEGIN → FOR UPDATE (locks tenant row) → checkWalletBillingTx → ok → debit → COMMIT
Request 2: BEGIN → FOR UPDATE (waits for R1) → checkWalletBillingTx → balance=0.0 → REJECT → ROLLBACK
```

---

## Merge/Deploy Readiness

- **Merge readiness:** YES — ready for merge to main when instructed
- **Deploy readiness:** YES — no migration, no schema change, backward compatible
- **Revertability:** YES — `git revert` with no side effects

---

## Recommendation

1. Merge `fix/backlog-batch4` to main with `--no-ff`
2. Tag as `batch4-complete-2026-07-29`
3. Deploy to production (rebuild API container)
4. Post-deploy: verify wallet creation endpoint still works
5. Future: consider `tx`-passing variants for `getBillingPolicy`/`countUserWallets`/`isActiveTenantUser` (I-1)

---

## Next Steps

After Batch 4 merge, review remaining deferred findings for Batch 5 candidates.
