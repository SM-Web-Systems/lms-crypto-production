# Backlog Batch 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 low-risk, high-value backend defensive guards and validation improvements in core modules.

**Architecture:** Each fix is an independent, minimal patch to an existing backend file. No new modules, no architectural changes, no frontend changes. Tests use vitest with mocked DB.

**Tech Stack:** Node.js, Fastify, Drizzle ORM, PostgreSQL, vitest, TypeScript

## Global Constraints

- Backend only — no frontend changes
- One commit per fix (or tightly-related pair)
- TDD for behavioral changes; source-assertion for logging/config
- Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com> on all commits
- Fix 9 requires API contract confirmation before merge
- No stub module changes (Earn/Fiat/MoneyGram)
- Run `cd packages/backend && npx vitest run` after each fix

---

## Execution Order

Fixes are ordered by dependency (none) and risk (lowest first):

1. Fix 7 (logging gate) — zero risk, warm-up
2. Fix 8 (config warning) — zero risk
3. Fix 10 (silent catch warning) — zero risk
4. Fix 1 (div-by-zero guard) — no risk, pure guard
5. Fix 2 (quote amount validation) — no risk, pure guard
6. Fix 3 (billing amount validation) — no risk, pure guard
7. Fix 6 (ILIKE escape) — very low risk
8. Fix 4 (cache eviction) — very low risk
9. Fix 5 (stale token cleanup) — low risk
10. Fix 9 (DELETE 404) — low risk, needs contract confirmation

---

## Task 1: Fix 7 — Gate console.log PII in server.ts (P0-3-F14)

**Files:**
- Modify: `packages/backend/src/server.ts:1234, 1372, 1409-1414`
- Test: `packages/backend/src/routes/server-logging.test.ts` (new — source-assertion)

**Interfaces:**
- Consumes: nothing
- Produces: nothing (logging change only)

- [ ] **Step 1: Write source-assertion test**

Create `packages/backend/src/routes/server-logging.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("server.ts — PII logging guards (P0-3-F14)", () => {
  const src = readFileSync(
    join(__dirname, "../server.ts"),
    "utf-8"
  );

  it("should not have unguarded console.log with userId in sign-and-submit handlers", () => {
    const lines = src.split("\n");
    const userIdLogs = lines.filter(
      (l) => l.includes("console.log") && l.includes("userId") && !l.trim().startsWith("//")
    );
    expect(userIdLogs.length).toBe(0);
  });

  it("should not have unguarded console.log with publicKey in sign-and-submit handlers", () => {
    const lines = src.split("\n");
    const pkLogs = lines.filter(
      (l) => l.includes("console.log") && l.includes("publicKey") && !l.trim().startsWith("//")
    );
    expect(pkLogs.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/routes/server-logging.test.ts
```

Expected: FAIL — unguarded console.log lines exist.

- [ ] **Step 3: Remove PII console.log lines from server.ts**

Remove the three console.log statements at lines 1234, 1372, and 1409-1414. Do not replace — simply remove, as they provide no operational value.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/routes/server-logging.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full backend suite**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run
```

Expected: All tests pass (388+).

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/amma-wallet && git add packages/backend/src/server.ts packages/backend/src/routes/server-logging.test.ts
git commit -m "$(cat <<'EOF'
fix(server): remove PII console.log from sign-and-submit handlers (P0-3-F14)

- Removed console.log that leaked userId and wallet publicKey correlation
  in production logs at lines 1234, 1372, and 1409-1414
- Added source-assertion test to prevent regression
- Test added: yes (source-assertion)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Rollback:** `git revert <hash>` — zero production impact.

---

## Task 2: Fix 8 — TURNSTILE_SECRET_KEY startup warning (P2-4-F4)

**Files:**
- Modify: `packages/backend/src/config/index.ts`
- Test: `packages/backend/src/config/config-warnings.test.ts` (new — source-assertion)

**Interfaces:**
- Consumes: nothing
- Produces: nothing (config warning only)

- [ ] **Step 1: Write source-assertion test**

Create `packages/backend/src/config/config-warnings.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("config/index.ts — startup warnings (P2-4-F4)", () => {
  const src = readFileSync(
    join(__dirname, "index.ts"),
    "utf-8"
  );

  it("should warn when TURNSTILE_SECRET_KEY is empty in production", () => {
    expect(src).toContain("TURNSTILE_SECRET_KEY");
    expect(src).toMatch(/TURNSTILE_SECRET_KEY.*production|production.*TURNSTILE_SECRET_KEY/s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/config/config-warnings.test.ts
```

Expected: FAIL — no production warning for TURNSTILE_SECRET_KEY.

- [ ] **Step 3: Add startup warning to config/index.ts**

Add after the STELLAR_NETWORK warning block (after line 59):

```typescript
// Warn if TURNSTILE_SECRET_KEY is empty in production (P2-4-F4)
if (!process.env.TURNSTILE_SECRET_KEY && process.env.NODE_ENV === "production") {
  console.warn("WARNING: TURNSTILE_SECRET_KEY is empty — Turnstile verification will be non-functional.");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/config/config-warnings.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full backend suite**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/amma-wallet && git add packages/backend/src/config/index.ts packages/backend/src/config/config-warnings.test.ts
git commit -m "$(cat <<'EOF'
fix(config): add startup warning for empty TURNSTILE_SECRET_KEY (P2-4-F4)

- Added console.warn when TURNSTILE_SECRET_KEY is empty in production
- Prevents silent Turnstile bypass from misconfiguration
- Test added: yes (source-assertion)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Rollback:** `git revert <hash>` — zero production impact.

---

## Task 3: Fix 10 — Silent catch warning in tenant-api-key (P1-1-F4)

**Files:**
- Modify: `packages/backend/src/middleware/tenant-api-key.ts:168`
- Test: `packages/backend/src/middleware/tenant-api-key.test.ts` (existing — add source-assertion)

**Interfaces:**
- Consumes: nothing
- Produces: nothing (logging change only)

- [ ] **Step 1: Add source-assertion test to existing test file**

Append to `packages/backend/src/middleware/tenant-api-key.test.ts`:

```typescript
describe("tenant-api-key — observability (P1-1-F4)", () => {
  it("lastUsedAt catch should include a warning log, not be silently swallowed", () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.join(__dirname, "tenant-api-key.ts"), "utf-8");
    expect(src).not.toMatch(/\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/);
    expect(src).toMatch(/\.catch\(.*console\.warn/s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/middleware/tenant-api-key.test.ts
```

Expected: FAIL — empty catch exists.

- [ ] **Step 3: Replace empty catch with warning log**

In `packages/backend/src/middleware/tenant-api-key.ts:168`, change:

```typescript
.catch(() => {});
```

to:

```typescript
.catch((err: any) => console.warn("[tenant-api-key] lastUsedAt update failed:", err.message));
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/middleware/tenant-api-key.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full backend suite**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/amma-wallet && git add packages/backend/src/middleware/tenant-api-key.ts packages/backend/src/middleware/tenant-api-key.test.ts
git commit -m "$(cat <<'EOF'
fix(middleware): log warning on lastUsedAt update failure (P1-1-F4)

- Replaced empty .catch(() => {}) with console.warn for observability
- DB errors on lastUsedAt update are now visible in logs
- Test added: yes (source-assertion)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Rollback:** `git revert <hash>` — zero production impact.

---

## Task 4: Fix 1 — Division by zero in calcPriceImpact (P2-3-F2)

**Files:**
- Modify: `packages/backend/src/modules/swap/swap.service.ts:260-275`
- Test: `packages/backend/src/modules/swap/swap.service.test.ts` (new)

**Interfaces:**
- Consumes: `SwapService.calcPriceImpact(asks, amount)` — private method
- Produces: returns `"0"` instead of `NaN`/`Infinity` for zero/negative inputs

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/modules/swap/swap.service.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { SwapService } from "./swap.service";

const service = new SwapService();
const calcPriceImpact = (service as any).calcPriceImpact.bind(service);

describe("SwapService.calcPriceImpact — division by zero guards (P2-3-F2)", () => {
  const asks = [
    { price: "1.5", amount: "100" },
    { price: "1.6", amount: "200" },
  ];

  it('should return "0" when amount is "0"', () => {
    expect(calcPriceImpact(asks, "0")).toBe("0");
  });

  it('should return "0" when amount is negative', () => {
    expect(calcPriceImpact(asks, "-5")).toBe("0");
  });

  it('should return "0" when asks[0].price is "0"', () => {
    const zeroAsks = [{ price: "0", amount: "100" }];
    expect(calcPriceImpact(zeroAsks, "50")).toBe("0");
  });

  it("should return correct price impact for valid inputs", () => {
    const singleAsk = [{ price: "1.5", amount: "1000" }];
    expect(calcPriceImpact(singleAsk, "100")).toBe("0.00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/modules/swap/swap.service.test.ts
```

Expected: FAIL — returns NaN or Infinity.

- [ ] **Step 3: Add guards to calcPriceImpact**

In `packages/backend/src/modules/swap/swap.service.ts`, modify `calcPriceImpact`:

```typescript
private calcPriceImpact(asks: any[], amount: string): string {
  if (asks.length === 0) return "0";
  const parsedAmount = parseFloat(amount);
  if (parsedAmount <= 0 || isNaN(parsedAmount)) return "0";
  const spotPrice = parseFloat(asks[0].price);
  if (spotPrice <= 0 || isNaN(spotPrice)) return "0";
  let remaining = parsedAmount;
  let totalCost = 0;

  for (const ask of asks) {
    const fill = Math.min(remaining, parseFloat(ask.amount));
    totalCost += fill * parseFloat(ask.price);
    remaining -= fill;
    if (remaining <= 0) break;
  }

  const avgPrice = totalCost / parsedAmount;
  return (((avgPrice - spotPrice) / spotPrice) * 100).toFixed(2);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/modules/swap/swap.service.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full backend suite**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/amma-wallet && git add packages/backend/src/modules/swap/swap.service.ts packages/backend/src/modules/swap/swap.service.test.ts
git commit -m "$(cat <<'EOF'
fix(swap): guard against division by zero in calcPriceImpact (P2-3-F2)

- Return "0" when amount <= 0, NaN, or spotPrice <= 0
- Prevents NaN/Infinity in price impact calculations
- Test added: yes (unit test with zero/negative inputs)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Rollback:** `git revert <hash>` — only affects edge-case display.

---

## Task 5: Fix 2 — Quote amount validation (P2-3-F4)

**Files:**
- Modify: `packages/backend/src/modules/swap/swap.service.ts:18-23`
- Test: `packages/backend/src/modules/swap/swap.service.test.ts` (append)

**Interfaces:**
- Consumes: `SwapService.getBestQuote(fromCode, fromIssuer, toCode, toIssuer, amount, direction)`
- Produces: throws Error for invalid amounts before calling Horizon

- [ ] **Step 1: Write failing tests**

Append to `packages/backend/src/modules/swap/swap.service.test.ts`:

```typescript
describe("SwapService.getBestQuote — amount validation (P2-3-F4)", () => {
  const service = new SwapService();

  it('should throw for amount "0"', async () => {
    await expect(
      service.getBestQuote("XLM", null, "USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "0")
    ).rejects.toThrow("amount must be a positive number");
  });

  it("should throw for negative amount", async () => {
    await expect(
      service.getBestQuote("XLM", null, "USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "-5")
    ).rejects.toThrow("amount must be a positive number");
  });

  it('should throw for non-numeric amount "abc"', async () => {
    await expect(
      service.getBestQuote("XLM", null, "USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "abc")
    ).rejects.toThrow("amount must be a positive number");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/modules/swap/swap.service.test.ts
```

Expected: FAIL — no validation exists.

- [ ] **Step 3: Add amount guard at top of getBestQuote**

```typescript
async getBestQuote(
  fromCode: string, fromIssuer: string | null,
  toCode: string, toIssuer: string | null,
  amount: string,
  direction: "send" | "receive" = "send"
): Promise<SwapQuote[]> {
  const parsed = parseFloat(amount);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error("amount must be a positive number");
  }
  // ... rest unchanged
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/modules/swap/swap.service.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full backend suite and commit**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run
cd /home/webadmin/web-stack/html/amma-wallet && git add packages/backend/src/modules/swap/swap.service.ts packages/backend/src/modules/swap/swap.service.test.ts
git commit -m "$(cat <<'EOF'
fix(swap): validate quote amount is positive before Horizon call (P2-3-F4)

- Reject zero, negative, and non-numeric amounts at getBestQuote entry
- Prevents invalid requests to Stellar Horizon API
- Test added: yes (unit test with invalid amounts)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Rollback:** `git revert <hash>` — callers see Error instead of Horizon failure.

---

## Task 6: Fix 3 — Billing credit positive-amount validation (P1-2-F4)

**Files:**
- Modify: `packages/backend/src/services/billing.service.ts:406-412`
- Test: `packages/backend/src/services/billing.service.test.ts` (existing — append)

**Interfaces:**
- Consumes: `writeBillingCredit(tx, opts)` where `opts.amountXlm` is a string
- Produces: throws Error for non-positive amounts

- [ ] **Step 1: Write failing tests**

Append to `packages/backend/src/services/billing.service.test.ts`. Use the existing test patterns and mock setup:

```typescript
describe("writeBillingCredit — positive-amount validation (P1-2-F4)", () => {
  it("should throw for zero amountXlm", async () => {
    await expect(
      writeBillingCredit(mockTx(), {
        tenantId: 1,
        eventType: "manual_topup",
        amountXlm: "0.0000000",
      })
    ).rejects.toThrow("amountXlm must be a positive value");
  });

  it("should throw for negative amountXlm", async () => {
    await expect(
      writeBillingCredit(mockTx(), {
        tenantId: 1,
        eventType: "manual_topup",
        amountXlm: "-100.0000000",
      })
    ).rejects.toThrow("amountXlm must be a positive value");
  });

  it("should throw for non-numeric amountXlm", async () => {
    await expect(
      writeBillingCredit(mockTx(), {
        tenantId: 1,
        eventType: "manual_topup",
        amountXlm: "abc",
      })
    ).rejects.toThrow();
  });
});
```

Note: Adapt `mockTx()` from the existing test file pattern.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/services/billing.service.test.ts
```

Expected: FAIL — no validation exists.

- [ ] **Step 3: Add amount guard at top of writeBillingCredit**

After destructuring `opts` (~line 412), add:

```typescript
// Validate amountXlm is a positive value (P1-2-F4)
const amountStroops = toStroops(amountXlm); // throws on non-numeric
if (amountStroops <= 0n) {
  throw new Error("amountXlm must be a positive value");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/services/billing.service.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full backend suite and commit**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run
cd /home/webadmin/web-stack/html/amma-wallet && git add packages/backend/src/services/billing.service.ts packages/backend/src/services/billing.service.test.ts
git commit -m "$(cat <<'EOF'
fix(billing): validate writeBillingCredit amountXlm is positive (P1-2-F4)

- Reject zero, negative, and non-numeric amountXlm using toStroops()
- Prevents billing balance corruption from invalid credit amounts
- Test added: yes (unit test with invalid amounts)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Rollback:** `git revert <hash>` — callers see Error instead of silent corruption.

---

## Task 7: Fix 6 — ILIKE wildcard escape in token search (P2-2-F5)

**Files:**
- Modify: `packages/backend/src/modules/tokens/token.service.ts:197-206`
- Test: `packages/backend/src/modules/tokens/token.service.test.ts` (new)

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/modules/tokens/token.service.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("token.service.ts — ILIKE wildcard escape (P2-2-F5)", () => {
  const src = readFileSync(join(__dirname, "token.service.ts"), "utf-8");

  it("should escape % characters in ILIKE query", () => {
    expect(src).toMatch(/replace.*%|escapeIlike|escapeLike/i);
  });

  it("should escape _ characters in ILIKE query", () => {
    expect(src).toMatch(/replace.*_|escapeIlike|escapeLike/i);
  });

  it("should cap query length", () => {
    expect(src).toMatch(/\.slice\(|\.substring\(|maxLength|query\.length/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/modules/tokens/token.service.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add escape helper and apply**

Add helper near top of file:

```typescript
/** Escape ILIKE metacharacters to prevent wildcard injection (P2-2-F5). */
function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
```

Modify the query block:

```typescript
if (query) {
  const safeQuery = escapeIlike(query.slice(0, 100));
  conditions.push(
    or(
      ilike(tokens.assetCode, `%${safeQuery}%`),
      ilike(tokens.tomlName, `%${safeQuery}%`),
      ilike(tokens.homeDomain, `%${safeQuery}%`),
      ilike(tokens.tomlOrg, `%${safeQuery}%`)
    )!
  );
}
```

- [ ] **Step 4: Run test and full suite, then commit**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/modules/tokens/token.service.test.ts
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run
cd /home/webadmin/web-stack/html/amma-wallet && git add packages/backend/src/modules/tokens/token.service.ts packages/backend/src/modules/tokens/token.service.test.ts
git commit -m "$(cat <<'EOF'
fix(tokens): escape ILIKE wildcards in token search query (P2-2-F5)

- Added escapeIlike() to neutralize %, _, and \ metacharacters
- Capped query length to 100 characters
- Prevents wildcard injection and PG performance degradation
- Test added: yes (source-assertion)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Rollback:** `git revert <hash>` — search literals revert to wildcard behavior.

---

## Task 8: Fix 4 — Evict expired rate-limit windows (P4-7-F2)

**Files:**
- Modify: `packages/backend/src/middleware/tenant-api-key.ts:71-90`
- Test: `packages/backend/src/middleware/tenant-api-key.test.ts` (existing — append)

- [ ] **Step 1: Write failing test**

Append to `packages/backend/src/middleware/tenant-api-key.test.ts`:

```typescript
describe("rateLimitWindows — eviction of expired entries (P4-7-F2)", () => {
  beforeEach(() => {
    _clearRateLimitWindowsForTest();
  });

  it("should evict expired windows when map exceeds threshold", () => {
    vi.useFakeTimers();
    // Create 101 entries to exceed threshold
    for (let i = 1; i <= 101; i++) {
      checkAndCountRateLimit(i, 100);
    }
    // Advance time past 60s window
    vi.advanceTimersByTime(61_000);
    // Next call should trigger eviction
    checkAndCountRateLimit(999, 100);
    // All 101 expired entries should be evicted, only 999 remains
    // Verify by checking that key 1 gets a fresh window (count=1)
    const result = checkAndCountRateLimit(1, 100);
    expect(result).toBe(true); // allowed — fresh window
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify behavior, then implement**

Add eviction logic in `checkAndCountRateLimit` after `rateLimitWindows.set(...)`:

```typescript
// Evict expired entries to prevent unbounded growth (P4-7-F2)
if (rateLimitWindows.size > 100) {
  for (const [id, w] of rateLimitWindows) {
    if (now - w.windowStart >= 60_000) {
      rateLimitWindows.delete(id);
    }
  }
}
```

- [ ] **Step 3: Run test and full suite, then commit**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/middleware/tenant-api-key.test.ts
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run
cd /home/webadmin/web-stack/html/amma-wallet && git add packages/backend/src/middleware/tenant-api-key.ts packages/backend/src/middleware/tenant-api-key.test.ts
git commit -m "$(cat <<'EOF'
fix(middleware): evict expired rate-limit windows to bound memory (P4-7-F2)

- Added eviction sweep when rateLimitWindows map exceeds 100 entries
- Removes entries with expired 60s windows
- Threshold of 100 is 10x production key count
- Test added: yes (unit test for eviction behavior)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Rollback:** `git revert <hash>` — removes eviction (original unbounded behavior).

---

## Task 9: Fix 5 — Invalidate stale verification tokens on re-send (P0-1-F16)

**Files:**
- Modify: `packages/backend/src/routes/auth.ts:1175-1180`
- Test: `packages/backend/src/routes/auth-verification-token.test.ts` (new)

- [ ] **Step 1: Write source-assertion test**

Create `packages/backend/src/routes/auth-verification-token.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("auth.ts — verification token lifecycle (P0-1-F16)", () => {
  const src = readFileSync(join(__dirname, "../routes/auth.ts"), "utf-8");

  it("should DELETE old verification tokens before inserting new ones in resend-verification", () => {
    const resendIdx = src.indexOf("resend-verification");
    const handlerBlock = src.slice(resendIdx, resendIdx + 2000);
    const deleteIdx = handlerBlock.indexOf("DELETE FROM email_verification_tokens");
    const insertIdx = handlerBlock.indexOf("INSERT INTO email_verification_tokens");
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeLessThan(insertIdx);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/routes/auth-verification-token.test.ts
```

Expected: FAIL — no DELETE before INSERT.

- [ ] **Step 3: Add DELETE before INSERT in resend-verification**

In `packages/backend/src/routes/auth.ts`, before the INSERT at line 1178:

```typescript
// Invalidate any existing verification tokens for this user (P0-1-F16)
await db.execute(
  sql`DELETE FROM email_verification_tokens WHERE user_id = ${userId}`,
);
```

- [ ] **Step 4: Run test and full suite, then commit**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/routes/auth-verification-token.test.ts
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run
cd /home/webadmin/web-stack/html/amma-wallet && git add packages/backend/src/routes/auth.ts packages/backend/src/routes/auth-verification-token.test.ts
git commit -m "$(cat <<'EOF'
fix(auth): invalidate stale verification tokens on re-send (P0-1-F16)

- DELETE existing tokens for user before inserting new one
- Prevents accumulation of multiple valid verification tokens
- Old email verification links become invalid after re-send
- Test added: yes (source-assertion verifying DELETE before INSERT)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Rollback:** `git revert <hash>` — old behavior with multiple valid tokens.

---

## Task 10: Fix 9 — DELETE returns 404 for nonexistent contact (P3-6-F5)

> **⚠️ PAUSE CONDITION:** Before implementing, confirm API contract with user.

**Files:**
- Modify: `packages/backend/src/routes/contacts.ts:117-137`
- Test: `packages/backend/src/routes/contacts.test.ts` (existing — append)

- [ ] **Step 1: PAUSE — Confirm API contract**

Ask: "Does the frontend handle 404 on DELETE /api/v1/contacts/:id?"

- [ ] **Step 2: Write failing test**

Append to `packages/backend/src/routes/contacts.test.ts`:

```typescript
describe("Contacts — DELETE nonexistent returns 404 (P3-6-F5)", () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(addressBookRoutes);
    await app.ready();
  });

  it("DELETE /api/v1/contacts/:id returns 404 when no row deleted", async () => {
    // Override mock to return rowCount: 0
    vi.mocked(db.delete as any).mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 0 }),
    });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/contacts/99999",
      headers: { authorization: "Bearer fake" },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toHaveProperty("error");
  });
});
```

- [ ] **Step 3: Implement 404 response**

```typescript
}, async (request, reply) => {
  const userId = request.user!.userId;
  const { id } = request.params as any;

  const result = await db.delete(addressBook)
    .where(and(eq(addressBook.id, id), eq(addressBook.userId, userId)));

  const count = (result as any).rowCount || 0;
  if (count === 0) {
    return reply.status(404).send({ error: "Contact not found" });
  }

  return { ok: true };
});
```

Also add 404 to the response schema:
```typescript
response: {
  200: { type: "object", properties: { ok: { type: "boolean" } } },
  404: { type: "object", properties: { error: { type: "string" } } },
},
```

- [ ] **Step 4: Run test and full suite, then commit**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run src/routes/contacts.test.ts
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run
cd /home/webadmin/web-stack/html/amma-wallet && git add packages/backend/src/routes/contacts.ts packages/backend/src/routes/contacts.test.ts
git commit -m "$(cat <<'EOF'
fix(contacts): return 404 when deleting nonexistent contact (P3-6-F5)

- Check rowCount after DELETE and return 404 if no row affected
- Aligns DELETE with PATCH (which already returns 404)
- API contract confirmed with user
- Test added: yes (integration test for DELETE 404)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Rollback:** `git revert <hash>` — reverts to always-200 behavior.

---

## Post-Batch Verification

- [ ] **Run full backend suite:** `cd packages/backend && npx vitest run`
- [ ] **Run full web-app suite:** `cd packages/web-app && npx vitest run`
- [ ] **Verify no secrets added:** `git diff main --stat`
- [ ] **Update FINDINGS.md:** Mark 10 items as FIXED
- [ ] **Update CUMULATIVE_STATUS.md:** 77 → 87 fixed
- [ ] **Update TODO_LOW_PRIORITY.md:** Mark items ✅
- [ ] **Write checkpoint report**

---

## Pause Conditions

The loop MUST pause and ask for input if:
1. Any test fails unexpectedly after implementation
2. Fix 9 API contract is not confirmed
3. A fix turns out to be larger than 15 minutes
4. Source code has changed since spec was written
5. Any regression is detected in full suite
