# Backlog Batch 4 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Billing TOCTOU race condition (P1-2-F2) by adding a transactional billing check with FOR UPDATE locking inside the wallet creation transaction.

**Architecture:** Add `checkWalletBillingTx()` to billing.service.ts, call it inside the existing `db.transaction()` block in wallets.ts. Keep the existing pre-flight check for fast rejection. Source-assertion + unit tests.

**Tech Stack:** Node.js, Fastify, Drizzle ORM 0.45.2, vitest, PostgreSQL FOR UPDATE

## Global Constraints

- Branch: `fix/backlog-batch4` from `main`
- Backend only — zero frontend changes
- No stub module changes (Earn/Fiat/MoneyGram)
- TDD: test FAIL → implement → test PASS → full suite → commit
- Commit format: `fix(module): description (Finding-ID)\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- No new `as any` casts in non-test source (except existing `tx: any` pattern)
- No secrets in source
- Existing `checkWalletBilling()` must NOT be modified
- Existing `writeBillingDebit()` must NOT be modified
- No schema migrations

---

### Task 1: Setup

**Files:**
- None (branch creation only)

- [ ] **Step 1: Create branch**
```bash
cd /home/webadmin/web-stack/html/amma-wallet
git checkout main && git checkout -b fix/backlog-batch4
```

- [ ] **Step 2: Verify baseline**
```bash
cd packages/backend && npx vitest run
```
Expected: 488/488 PASS

---

### Task 2: Fix 1 — P1-2-F2 Billing TOCTOU (MEDIUM)

**Files:**
- Modify: `packages/backend/src/services/billing.service.ts` (add `checkWalletBillingTx`)
- Modify: `packages/backend/src/routes/wallets.ts:155-242` (call inside transaction)
- Test: `packages/backend/src/services/billing-toctou.test.ts` (source-assertion)

**Interfaces:**
- Consumes: `schema.tenants`, `getBillingPolicy()`, `countUserWallets()`, `isActiveTenantUser()`, `compareDecimalStrings()`, `addDecimalStrings()`, `negateDecimalString()`, `BillingCheckResult` type
- Produces: `checkWalletBillingTx(tx, { tenantId, userId }) => Promise<BillingCheckResult>`

- [ ] **Step 1: Write the source-assertion test**

Create `packages/backend/src/services/billing-toctou.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("P1-2-F2: Billing TOCTOU guard", () => {
  const billingPath = path.resolve(__dirname, "billing.service.ts");
  const billingSrc = fs.readFileSync(billingPath, "utf-8");

  const walletsPath = path.resolve(__dirname, "../routes/wallets.ts");
  const walletsSrc = fs.readFileSync(walletsPath, "utf-8");

  it("exports checkWalletBillingTx from billing.service.ts", () => {
    expect(billingSrc).toMatch(/export\s+(async\s+)?function\s+checkWalletBillingTx/);
  });

  it("uses FOR UPDATE lock in checkWalletBillingTx", () => {
    // Find the function body
    const fnIdx = billingSrc.indexOf("checkWalletBillingTx");
    const fnBlock = billingSrc.slice(fnIdx, fnIdx + 2000);
    expect(fnBlock).toMatch(/\.for\s*\(\s*["']update["']\s*\)|FOR\s+UPDATE/i);
  });

  it("wallets.ts calls checkWalletBillingTx inside the transaction", () => {
    // The transaction block starts with db.transaction
    const txIdx = walletsSrc.indexOf("db.transaction");
    const txBlock = walletsSrc.slice(txIdx, txIdx + 2000);
    expect(txBlock).toContain("checkWalletBillingTx");
  });

  it("wallets.ts still has pre-flight checkWalletBilling outside transaction", () => {
    const txIdx = walletsSrc.indexOf("db.transaction");
    const preflightBlock = walletsSrc.slice(0, txIdx);
    expect(preflightBlock).toContain("checkWalletBilling");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd packages/backend && npx vitest run src/services/billing-toctou.test.ts
```
Expected: FAIL — `checkWalletBillingTx` does not exist yet

- [ ] **Step 3: Implement checkWalletBillingTx in billing.service.ts**

Add the function after `checkWalletBilling()` (after line 313). The function:
1. Takes `tx` (transaction handle) and `{ tenantId, userId }`
2. Selects tenant row with `.for("update")` to acquire row lock
3. Reads policy via existing `getBillingPolicy()`
4. Counts wallets via existing `countUserWallets()`
5. Runs the same validation logic as `checkWalletBilling()`
6. Returns `BillingCheckResult`

Key differences from `checkWalletBilling()`:
- Uses `tx.select()` instead of `db.select()` for the tenant row
- Adds `.for("update")` to the tenant select
- Does NOT call `getTenantBillingState()` — reads tenant directly with lock

```typescript
export async function checkWalletBillingTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  opts: { tenantId: number; userId: number },
): Promise<BillingCheckResult> {
  const { tenantId, userId } = opts;

  // Lock tenant row — prevents concurrent billing checks
  const [lockedTenant] = await tx
    .select({
      prepaidXlmBalance: schema.tenants.prepaidXlmBalance,
      isActive: schema.tenants.isActive,
      suspendedAt: schema.tenants.suspendedAt,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .for("update");

  if (!lockedTenant) {
    return { ok: false, httpStatus: 503, message: "Tenant not found" };
  }
  if (!lockedTenant.isActive) {
    return { ok: false, httpStatus: 403, message: "Tenant account is inactive" };
  }
  if (lockedTenant.suspendedAt) {
    return {
      ok: false,
      httpStatus: 402,
      message:
        "Tenant account is suspended; please contact support to restore service",
    };
  }

  const policy = await getBillingPolicy(tenantId);
  if (!policy) {
    return {
      ok: false,
      httpStatus: 503,
      message: "No billing policy configured for tenant",
    };
  }

  const balanceStr = lockedTenant.prepaidXlmBalance;
  const walletCount = await countUserWallets(userId);

  if (walletCount === 0) {
    if (policy.acquisitionModeEnabled) {
      if (
        compareDecimalStrings(balanceStr, policy.acquisitionDebtLimitXlm) <= 0
      ) {
        return {
          ok: false,
          httpStatus: 402,
          message: `Acquisition debt limit reached (${policy.acquisitionDebtLimitXlm} XLM). Top up required before new wallet activations.`,
        };
      }
    } else {
      if (compareDecimalStrings(balanceStr, "0") <= 0) {
        return {
          ok: false,
          httpStatus: 402,
          message: "Insufficient tenant balance for new wallet activation",
        };
      }
    }

    const useWalletFunding =
      policy.walletFundingEnabled && policy.walletFundingMode === "auto";
    const amountStr = useWalletFunding
      ? addDecimalStrings(policy.walletFundingXlm, policy.newWalletPlatformFeeXlm)
      : policy.newWalletPlatformFeeXlm;

    return {
      ok: true,
      eventType: "new_wallet_activation",
      amountXlm: negateDecimalString(amountStr),
      policy,
    };
  } else {
    if (!policy.onboardingEnabled) {
      return { ok: true, eventType: "no_billing" };
    }

    const alreadyActive = await isActiveTenantUser(
      tenantId,
      userId,
      policy.activityWindowDays,
    );
    if (alreadyActive) {
      return { ok: true, eventType: "idempotent_skip" };
    }

    if (compareDecimalStrings(balanceStr, "0") <= 0) {
      return {
        ok: false,
        httpStatus: 402,
        message: "Insufficient tenant balance for user onboarding",
      };
    }

    return {
      ok: true,
      eventType: "existing_user_onboarding",
      amountXlm: negateDecimalString(policy.onboardingFeeXlm),
      policy,
    };
  }
}
```

- [ ] **Step 4: Update wallets.ts to call checkWalletBillingTx inside the transaction**

In `packages/backend/src/routes/wallets.ts`, add the import:
```typescript
import { checkWalletBilling, checkWalletBillingTx, writeBillingDebit, ... } from "../services/billing.service";
```

Inside the `db.transaction(async (tx) => { ... })` block, add the re-validation before the wallet insert:

```typescript
const wallet = await db.transaction(async (tx) => {
  // Re-validate billing with FOR UPDATE lock
  if (tenantCtx?.tenantId) {
    const txBilling = await checkWalletBillingTx(tx, {
      tenantId: tenantCtx.tenantId,
      userId,
    });
    if (!txBilling.ok) {
      throw Object.assign(new Error(txBilling.message), {
        httpStatus: txBilling.httpStatus,
      });
    }
    billingResult = txBilling;
  }

  // Deactivate other wallets (existing code, unchanged)
  await tx
    .update(schema.userWallets)
    .set({ isActive: false })
    .where(eq(schema.userWallets.userId, userId));

  // ... rest unchanged ...
});
```

Also wrap the transaction call with error handling to catch billing failures:

```typescript
try {
  const wallet = await db.transaction(async (tx) => { ... });
  // ... fire-and-forget deficit notification ...
  return wallet;
} catch (err: any) {
  if (err.httpStatus) {
    return reply.status(err.httpStatus).send({ error: err.message });
  }
  throw err;
}
```

- [ ] **Step 5: Run the source-assertion test to verify it passes**
```bash
cd packages/backend && npx vitest run src/services/billing-toctou.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 6: Run full backend suite**
```bash
cd packages/backend && npx vitest run
```
Expected: 488 + 4 = 492 PASS (no regressions)

- [ ] **Step 7: Commit**
```bash
cd /home/webadmin/web-stack/html/amma-wallet
git add packages/backend/src/services/billing.service.ts packages/backend/src/routes/wallets.ts packages/backend/src/services/billing-toctou.test.ts
git commit -m "$(cat <<'EOF'
fix(billing): prevent TOCTOU race in wallet creation with FOR UPDATE lock (P1-2-F2)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Post-Batch

- [ ] Run full backend test suite
- [ ] Run full web-app test suite
- [ ] Run secret scan
- [ ] Write checkpoint report
- [ ] Update docs/accounting

---

## Self-Review Notes

- `checkWalletBillingTx` mirrors `checkWalletBilling` validation logic exactly — any future changes to one must be reflected in the other
- The `tx: any` parameter follows the existing pattern used by `writeBillingDebit`
- FOR UPDATE lock scope: only the tenant row (single table), no deadlock risk
- Pre-flight `checkWalletBilling()` is kept for fast rejection without transaction overhead
- The thrown error with `httpStatus` property follows Fastify's error-handling patterns
