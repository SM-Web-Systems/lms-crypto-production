# Phase 4 — Audit Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 remaining MEDIUM/HIGH findings from the full-codebase audit, plus repair the broken earn test from Phase 3.

**Architecture:** Minimal, targeted fixes — each task modifies 1-2 source files plus its test file. No new dependencies. All monetary computation pushed to SQL `numeric` instead of adding a decimal library.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, Vitest, @stellar/stellar-sdk

## Global Constraints

- Branch: `audit/full-codebase-2026-07-26` (worktree: `.worktrees/audit-2026-07-26/`)
- NEVER merge to main or push to remote
- TDD: write failing test first, then implement, then verify full suite
- One commit per fix, message references finding ID
- After each fix: update FINDINGS.md (mark FIXED with commit hash) and PHASE4_SUMMARY.md
- Test command: `npx vitest run` (from `packages/backend/`)
- Current baseline: 290 tests passing, 1 test file failing (earn.test.ts)

---

### Task 1: Fix earn.test.ts mock regression (Phase 3 cleanup)

**Files:**
- Modify: `packages/backend/src/routes/earn.test.ts`

**Interfaces:**
- Consumes: `@stellar/stellar-sdk` mock (Horizon.Server constructor)
- Produces: Clean test suite baseline (all files passing)

- [ ] **Step 1: Diagnose the failure**

The `vi.mock("@stellar/stellar-sdk")` factory returns `{ Horizon: { Server: vi.fn(() => mockServer) } }`. The `vi.fn(() => mockServer)` wraps an arrow function — arrow functions cannot be called with `new`. When `earn.ts:6` runs `new StellarSdk.Horizon.Server(config.HORIZON_URL)`, it throws `TypeError: () => mockServer is not a constructor`.

- [ ] **Step 2: Fix the mock**

In `packages/backend/src/routes/earn.test.ts`, replace the `@stellar/stellar-sdk` mock factory:

```typescript
vi.mock("@stellar/stellar-sdk", () => {
  const mockServer = {
    liquidityPools: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    call: vi.fn().mockResolvedValue({ records: [] }),
    loadAccount: vi.fn().mockResolvedValue({
      balances: [],
      subentry_count: 0,
    }),
  };
  return {
    Horizon: {
      Server: vi.fn().mockImplementation(() => mockServer),
    },
    Asset: { native: vi.fn() },
    TransactionBuilder: vi.fn(),
    Operation: { liquidityPoolDeposit: vi.fn(), liquidityPoolWithdraw: vi.fn() },
    BASE_FEE: "100",
    Networks: { TESTNET: "Test SDF Network ; September 2015", PUBLIC: "Public Global Stellar Network ; September 2015" },
  };
});
```

Key change: `vi.fn().mockImplementation(() => mockServer)` instead of `vi.fn(() => mockServer)`. The `mockImplementation` approach creates a proper constructor-callable mock.

- [ ] **Step 3: Run tests to verify fix**

Run: `npx vitest run packages/backend/src/routes/earn.test.ts`
Expected: PASS — all 4 earn auth tests pass

- [ ] **Step 4: Run full suite**

Run: `npx vitest run`
Expected: All test files pass, 290+ tests

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/earn.test.ts
git commit -m "fix(test): repair earn.test.ts mock — use mockImplementation for constructor

The vi.fn(() => mockServer) pattern wraps an arrow function which cannot
be called with 'new'. Replaced with vi.fn().mockImplementation() which
properly supports constructor invocation.

Phase 4 Task 1 — Phase 3 test regression cleanup"
```

---

### Task 2: P1-1-F2 — Timing-safe API key comparison

**Files:**
- Modify: `packages/backend/src/middleware/tenant-api-key.ts:165`
- Test: `packages/backend/src/middleware/tenant-api-key.test.ts` (add new tests)

**Interfaces:**
- Consumes: `config.API_KEYS` (string array), `crypto.timingSafeEqual`
- Produces: `resolveTenantApiKey()` unchanged signature, timing-safe env-var path

- [ ] **Step 1: Write the failing test**

Add to `packages/backend/src/middleware/tenant-api-key.test.ts`:

```typescript
describe("resolveTenantApiKey — timing-safe env-var comparison", () => {
  it("accepts a valid env-var key using timing-safe comparison", async () => {
    const ctx = await resolveTenantApiKey("test-env-key-1");
    expect(ctx).toBeDefined();
    expect(ctx!.source).toBe("env");
  });

  it("rejects a key with same length but different content", async () => {
    // Same length as "test-env-key-1" (14 chars) but different
    const ctx = await resolveTenantApiKey("test-env-key-X");
    expect(ctx).toBeUndefined();
  });

  it("rejects a key with different length (no timing leak)", async () => {
    const ctx = await resolveTenantApiKey("short");
    expect(ctx).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify current state**

Run: `npx vitest run packages/backend/src/middleware/tenant-api-key.test.ts`
Note: Tests may pass since the current `includes()` is functionally correct — the timing-safe change is a defense-in-depth improvement. Verify the tests exist and pass before changing implementation.

- [ ] **Step 3: Implement timing-safe comparison**

In `packages/backend/src/middleware/tenant-api-key.ts`, replace line 165:

```typescript
// BEFORE:
if (config.API_KEYS.includes(rawKey)) {

// AFTER:
if (timingSafeIncludes(config.API_KEYS, rawKey)) {
```

Add the helper function after the existing imports (top of file, after line 24):

```typescript
/**
 * Timing-safe check: does `list` contain an entry equal to `candidate`?
 * Uses crypto.timingSafeEqual to prevent timing side-channels.
 * Returns false immediately for empty list (no timing leak — attacker
 * already knows list length is a server config detail, not a secret).
 */
function timingSafeIncludes(list: string[], candidate: string): boolean {
  const candidateBuf = Buffer.from(candidate);
  for (const entry of list) {
    const entryBuf = Buffer.from(entry);
    if (
      candidateBuf.length === entryBuf.length &&
      crypto.timingSafeEqual(candidateBuf, entryBuf)
    ) {
      return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/backend/src/middleware/tenant-api-key.test.ts`
Expected: All tests pass (including new timing-safe tests)

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/middleware/tenant-api-key.ts packages/backend/src/middleware/tenant-api-key.test.ts
git commit -m "fix(security): P1-1-F2 — timing-safe env-var API key comparison

Replace Array.includes() with crypto.timingSafeEqual() for the env-var
API key fallback path. The DB path (SHA-256 hash lookup) was already
timing-safe. This closes the last timing side-channel in key resolution."
```

---

### Task 3: P1-4-F3 — Empty SSO callback whitelist fail-closed

**Files:**
- Modify: `packages/backend/src/routes/sso.ts:64-71`
- Create: `packages/backend/src/routes/sso.test.ts`

**Interfaces:**
- Consumes: `config.SSO_CALLBACK_WHITELIST` (string array)
- Produces: 403 response when whitelist is empty (fail-closed)

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/routes/sso.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      { id: 1, email: "test@example.com", firstName: "Test", lastName: "User", isEmailVerified: true },
    ]),
    innerJoin: vi.fn().mockReturnThis(),
  },
  schema: {
    users: { id: "id", email: "email", firstName: "firstName", lastName: "lastName", isEmailVerified: "isEmailVerified" },
    userWallets: { userId: "userId", publicKey: "publicKey", network: "network", isActive: "isActive", createdAt: "createdAt" },
  },
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (request: any) => {
    request.user = { userId: 1 };
  },
}));

vi.mock("../middleware/tenant-api-key", () => ({
  requireTenantApiKey: vi.fn(async () => {}),
  requireScope: vi.fn(() => async () => {}),
}));

vi.mock("../config", () => ({
  config: {
    SSO_SECRET: "test-sso-secret-at-least-32-chars-long!!",
    SSO_CALLBACK_WHITELIST: [],  // empty = fail-open in current code
    JWT_SECRET: "test-jwt-secret",
  },
}));

import Fastify from "fastify";
import { ssoRoutes } from "./sso";

describe("SSO routes — callback whitelist", () => {
  it("POST /api/v1/sso/token rejects when SSO_CALLBACK_WHITELIST is empty (fail-closed)", async () => {
    const app = Fastify();
    app.register(ssoRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sso/token",
      headers: { authorization: "Bearer mock-token" },
      payload: {
        callbackUrl: "https://evil.com/callback",
        state: "abc123",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain("whitelist");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/backend/src/routes/sso.test.ts`
Expected: FAIL — current code allows any URL when whitelist is empty

- [ ] **Step 3: Implement fail-closed logic**

In `packages/backend/src/routes/sso.ts`, replace lines 63-71:

```typescript
// BEFORE:
const whitelist = config.SSO_CALLBACK_WHITELIST;
if (
  whitelist.length > 0 &&
  !whitelist.some((origin: string) => callbackUrl.startsWith(origin))
) {
  app.log.warn(`[sso/token] Rejected callback URL not in whitelist: ${callbackUrl}`);
  return reply.status(403).send({ error: "Callback URL not in SSO whitelist" });
}

// AFTER:
const whitelist = config.SSO_CALLBACK_WHITELIST;
if (whitelist.length === 0) {
  app.log.error("[sso/token] SSO_CALLBACK_WHITELIST is empty — rejecting all callbacks (fail-closed)");
  return reply.status(403).send({ error: "SSO callback whitelist not configured" });
}
if (!whitelist.some((origin: string) => callbackUrl.startsWith(origin))) {
  app.log.warn(`[sso/token] Rejected callback URL not in whitelist: ${callbackUrl}`);
  return reply.status(403).send({ error: "Callback URL not in SSO whitelist" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/backend/src/routes/sso.test.ts`
Expected: PASS

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/sso.ts packages/backend/src/routes/sso.test.ts
git commit -m "fix(sso): P1-4-F3 — fail-closed when SSO_CALLBACK_WHITELIST is empty

Previously, an empty whitelist silently disabled origin checks, allowing
any callback URL (open redirect). Now rejects all callbacks with 403
when the whitelist is not configured."
```

---

### Task 4: P4-2-F2 — Remove secret key from trustline API helpers

**Files:**
- Modify: `packages/web-app/src/lib/api.ts:272-280`
- Create: `packages/backend/src/routes/trustlines.test.ts`

**Interfaces:**
- Consumes: `trustlineApi.add()`, `trustlineApi.remove()` (frontend)
- Produces: API helpers that never transmit private keys

**Note:** The frontend already uses `buildTrustlineTx()` from `stellar.ts` for client-side signing. The `trustlineApi.add()` and `trustlineApi.remove()` in `api.ts` are **unused** but still define a `secretKey` parameter that would transmit the private key if ever called. The backend `/api/v1/trustlines/add` and `/remove` return unsigned XDR — they don't accept or use `secretKey`.

- [ ] **Step 1: Write the backend test confirming no secret accepted**

Create `packages/backend/src/routes/trustlines.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/stellar-client", () => ({
  stellarClient: {
    horizon: {
      loadAccount: vi.fn().mockResolvedValue({
        balances: [
          { asset_type: "native", balance: "100.0000000" },
        ],
        subentry_count: 1,
      }),
    },
    networkPassphrase: "Test SDF Network ; September 2015",
  },
}));

vi.mock("../modules/tokens/token.service", () => ({
  TokenService: vi.fn().mockImplementation(() => ({
    ensureToken: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@stellar/stellar-sdk", () => {
  const mockTx = {
    toXDR: vi.fn().mockReturnValue("mock-xdr-base64"),
    sign: vi.fn(),
  };
  const mockBuilder = {
    addOperation: vi.fn().mockReturnThis(),
    setTimeout: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue(mockTx),
  };
  return {
    Asset: vi.fn(),
    TransactionBuilder: vi.fn().mockImplementation(() => mockBuilder),
    Operation: {
      changeTrust: vi.fn().mockReturnValue({}),
    },
    BASE_FEE: "100",
  };
});

import Fastify from "fastify";
import { trustlineRoutes } from "./trustlines";

describe("Trustline routes — secret key exclusion", () => {
  it("POST /api/v1/trustlines/add response does NOT echo back any secret key", async () => {
    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/add",
      payload: {
        publicKey: "GABC123",
        assetCode: "USDC",
        assetIssuer: "GDEF456",
        secretKey: "SXXX_should_be_ignored",
      },
    });

    // Backend should ignore the secretKey field entirely
    const body = res.json();
    expect(body).not.toHaveProperty("secretKey");
    expect(body).not.toHaveProperty("secret");
  });

  it("POST /api/v1/trustlines/add returns unsigned XDR without requiring secret", async () => {
    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/add",
      payload: {
        publicKey: "GABC123",
        assetCode: "USDC",
        assetIssuer: "GDEF456",
        // No secretKey — should work fine
      },
    });

    const body = res.json();
    expect(body).toHaveProperty("xdr");
    expect(body).toHaveProperty("networkPassphrase");
  });
});
```

- [ ] **Step 2: Run test to verify backend behavior**

Run: `npx vitest run packages/backend/src/routes/trustlines.test.ts`
Expected: PASS (backend already ignores secretKey)

- [ ] **Step 3: Remove secretKey from frontend API helpers**

In `packages/web-app/src/lib/api.ts`, replace lines 272-281:

```typescript
// BEFORE:
  add: (publicKey: string, code: string, issuer: string, secretKey: string) =>
    request<any>("/api/v1/trustlines/add", {
      method: "POST",
      body: JSON.stringify({ publicKey, assetCode: code, assetIssuer: issuer, secretKey }),
    }),
  remove: (publicKey: string, code: string, issuer: string, secretKey: string) =>
    request<any>("/api/v1/trustlines/remove", {
      method: "POST",
      body: JSON.stringify({ publicKey, assetCode: code, assetIssuer: issuer, secretKey }),
    }),

// AFTER:
  add: (publicKey: string, code: string, issuer: string) =>
    request<any>("/api/v1/trustlines/add", {
      method: "POST",
      body: JSON.stringify({ publicKey, assetCode: code, assetIssuer: issuer }),
    }),
  remove: (publicKey: string, code: string, issuer: string) =>
    request<any>("/api/v1/trustlines/remove", {
      method: "POST",
      body: JSON.stringify({ publicKey, assetCode: code, assetIssuer: issuer }),
    }),
```

- [ ] **Step 4: Run full suite**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 5: Commit**

```bash
git add packages/web-app/src/lib/api.ts packages/backend/src/routes/trustlines.test.ts
git commit -m "fix(security): P4-2-F2 — remove secret key from trustline API helpers

The frontend trustlineApi.add() and trustlineApi.remove() included
secretKey in the POST body. Although the backend ignores it (returns
unsigned XDR for client-side signing), transmitting private keys over
HTTP is dangerous — proxies, CDN logs, or request logging could capture
them. Removed secretKey parameter entirely. These helpers are currently
unused (frontend uses buildTrustlineTx for client-side signing) but the
fix prevents future misuse."
```

---

### Task 5: P3-1-F5 — Fix missing drizzle-orm imports in NFT transfer

**Files:**
- Modify: `packages/backend/src/routes/nft.ts:1-5` (add import) and `:306-313` (use static import)
- Modify: `packages/backend/src/routes/nft-audit.test.ts` (add transfer test)

**Interfaces:**
- Consumes: `and`, `eq` from `drizzle-orm`; `db`, `schema` from `../db`
- Produces: Working NFT transfer ownership check

- [ ] **Step 1: Write the failing test**

Add to `packages/backend/src/routes/nft-audit.test.ts` (or create new test section):

```typescript
describe("NFT transfer — ownership check uses correct imports", () => {
  it("POST /api/v1/nfts/transfer returns 403 when wallet does not belong to user", async () => {
    // The db mock returns empty array = no wallet found
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/nfts/transfer",
      headers: { authorization: "Bearer mock-token" },
      payload: {
        contractId: "CXXX",
        fromAddress: "GABC123",
        toAddress: "GDEF456",
        tokenId: 1,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain("does not belong");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/backend/src/routes/nft-audit.test.ts`
Expected: FAIL — `and` and `eq` are not imported, causing ReferenceError

- [ ] **Step 3: Fix the imports**

In `packages/backend/src/routes/nft.ts`:

1. Add import at top (after line 3):
```typescript
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
```

2. Replace dynamic imports at lines 306-313:
```typescript
// BEFORE:
    const { db: database } = await import("../db");
    const { userWallets } = await import("../db/schema");
    const [wallet] = await database.select().from(userWallets)
      .where(and(
        eq(userWallets.userId, userId),
        eq(userWallets.publicKey, fromAddress),
      )).limit(1);

// AFTER:
    const [wallet] = await db.select().from(schema.userWallets)
      .where(and(
        eq(schema.userWallets.userId, userId),
        eq(schema.userWallets.publicKey, fromAddress),
      )).limit(1);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/backend/src/routes/nft-audit.test.ts`
Expected: PASS

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/nft.ts packages/backend/src/routes/nft-audit.test.ts
git commit -m "fix(nft): P3-1-F5 — add missing drizzle-orm imports in NFT transfer

The transfer endpoint used 'and' and 'eq' from drizzle-orm without
importing them, and used dynamic imports for db/schema unnecessarily.
This caused a ReferenceError at runtime, making the entire NFT transfer
feature non-functional. Switched to static imports matching the rest of
the file."
```

---

### Task 6: P3-1-F6 — Admin gate on NFT collection registration

**Files:**
- Modify: `packages/backend/src/routes/nft.ts:59-84` (add admin middleware)
- Modify: `packages/backend/src/routes/nft-audit.test.ts` (add test)

**Interfaces:**
- Consumes: `adminAuthMiddleware` from `../middleware/admin-auth`
- Produces: 401/403 for non-admin users attempting to register collections

**Design decision:** Use admin auth middleware (same as other privileged endpoints). Regular user auth is insufficient for collection registration — this is a platform-level operation.

- [ ] **Step 1: Write the failing test**

Add to NFT test file:

```typescript
describe("NFT collection registration — admin gate", () => {
  it("POST /api/v1/nfts/collections returns 401 without admin token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/nfts/collections",
      headers: { authorization: "Bearer regular-user-token" },
      payload: {
        name: "Test Collection",
        standard: "sep50",
        contractId: "CXXX",
      },
    });

    // Should require admin auth, not just user auth
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/backend/src/routes/nft-audit.test.ts`
Expected: FAIL — current code uses `authMiddleware` (user auth), returns 200 for any authenticated user

- [ ] **Step 3: Implement admin gate**

In `packages/backend/src/routes/nft.ts`:

1. Add import at top:
```typescript
import { adminAuthMiddleware } from "../middleware/admin-auth";
```

2. Change collection registration preHandler (line 84):
```typescript
// BEFORE:
preHandler: authMiddleware,

// AFTER:
preHandler: adminAuthMiddleware,
```

3. Update handler to read admin userId (admin middleware sets `request.admin`):
```typescript
// BEFORE:
const userId = request.user!.userId;

// AFTER:
const userId = (request as any).admin?.id ?? request.user?.userId;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/backend/src/routes/nft-audit.test.ts`
Expected: PASS

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/nft.ts packages/backend/src/routes/nft-audit.test.ts
git commit -m "fix(nft): P3-1-F6 — require admin auth for NFT collection registration

Any authenticated user could previously register NFT collections. This
is a platform-level operation that should be restricted to admins.
Changed preHandler from authMiddleware to adminAuthMiddleware."
```

---

### Task 7: P1-2-F1 — Replace floating-point arithmetic in billing with SQL numeric

**Files:**
- Modify: `packages/backend/src/services/billing.service.ts:204,210,231-233,464-466`
- Modify: `packages/backend/src/services/billing.service.test.ts` (add precision tests)

**Interfaces:**
- Consumes: `BillingPolicy` string fields (walletFundingXlm, newWalletPlatformFeeXlm, etc.)
- Produces: `checkWalletBilling()` and `runMonthlyMaintenanceForTenant()` with string-based arithmetic

**Approach:** Replace `parseFloat()` + JS arithmetic with string-based comparison and SQL `numeric` computation. For the pre-flight check, compare as strings using a helper. For the maintenance charge, compute in SQL.

- [ ] **Step 1: Write the failing test**

Add to `packages/backend/src/services/billing.service.test.ts`:

```typescript
describe("Billing — floating-point safety", () => {
  it("addDecimalStrings produces exact results for Stellar amounts", () => {
    // Import the utility
    const { addDecimalStrings, mulDecimalStrings } = require("./billing.service");

    // These would fail with parseFloat due to IEEE 754 rounding:
    expect(addDecimalStrings("0.1", "0.2")).toBe("0.3000000");
    expect(addDecimalStrings("1.0000000", "2.0000000")).toBe("3.0000000");
    expect(addDecimalStrings("0.0000001", "0.0000002")).toBe("0.0000003");
  });

  it("negateDecimalString negates correctly", () => {
    const { negateDecimalString } = require("./billing.service");
    expect(negateDecimalString("3.0000000")).toBe("-3.0000000");
    expect(negateDecimalString("0.0000001")).toBe("-0.0000001");
  });

  it("compareDecimalStrings orders correctly", () => {
    const { compareDecimalStrings } = require("./billing.service");
    expect(compareDecimalStrings("1.0", "2.0")).toBeLessThan(0);
    expect(compareDecimalStrings("2.0", "1.0")).toBeGreaterThan(0);
    expect(compareDecimalStrings("1.0", "1.0")).toBe(0);
    expect(compareDecimalStrings("-5.0", "0.0")).toBeLessThan(0);
    expect(compareDecimalStrings("-100.0", "-50.0")).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/backend/src/services/billing.service.test.ts`
Expected: FAIL — functions don't exist yet

- [ ] **Step 3: Implement string-based decimal utilities**

Add to `packages/backend/src/services/billing.service.ts` (after imports, before types):

```typescript
// ── String-based decimal arithmetic (7-decimal Stellar precision) ────────────
// Avoids IEEE 754 floating-point errors on monetary values.
// All amounts are represented as strings with 7 decimal places.

const STELLAR_DECIMALS = 7;
const SCALE = 10_000_000n; // 10^7

/** Parse a decimal string to bigint stroops (1 stroop = 0.0000001 XLM). */
function toStroops(s: string): bigint {
  const neg = s.startsWith("-");
  const abs = neg ? s.slice(1) : s;
  const [whole = "0", frac = ""] = abs.split(".");
  const paddedFrac = frac.padEnd(STELLAR_DECIMALS, "0").slice(0, STELLAR_DECIMALS);
  const stroops = BigInt(whole) * SCALE + BigInt(paddedFrac);
  return neg ? -stroops : stroops;
}

/** Format bigint stroops back to a 7-decimal string. */
function fromStroops(stroops: bigint): string {
  const neg = stroops < 0n;
  const abs = neg ? -stroops : stroops;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(STELLAR_DECIMALS, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

/** Add two decimal strings with exact precision. */
export function addDecimalStrings(a: string, b: string): string {
  return fromStroops(toStroops(a) + toStroops(b));
}

/** Multiply a decimal string by an integer count. */
export function mulDecimalStrings(amount: string, count: number): string {
  return fromStroops(toStroops(amount) * BigInt(count));
}

/** Negate a decimal string. */
export function negateDecimalString(s: string): string {
  return fromStroops(-toStroops(s));
}

/** Compare two decimal strings. Returns <0, 0, or >0. */
export function compareDecimalStrings(a: string, b: string): number {
  const diff = toStroops(a) - toStroops(b);
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}
```

- [ ] **Step 4: Replace parseFloat usage in checkWalletBilling**

In `checkWalletBilling` (lines ~204-266), replace:

```typescript
// BEFORE (line 204):
const balance = parseFloat(state.prepaidXlmBalance);

// AFTER:
const balanceStr = state.prepaidXlmBalance;
```

```typescript
// BEFORE (lines 209-211):
const debtLimit = parseFloat(policy.acquisitionDebtLimitXlm);
if (balance <= debtLimit) {

// AFTER:
if (compareDecimalStrings(balanceStr, policy.acquisitionDebtLimitXlm) <= 0) {
```

```typescript
// BEFORE (line 220):
if (balance <= 0) {

// AFTER:
if (compareDecimalStrings(balanceStr, "0") <= 0) {
```

```typescript
// BEFORE (lines 230-233):
const useWalletFunding = policy.walletFundingEnabled && policy.walletFundingMode === "auto";
const amount = useWalletFunding
  ? parseFloat(policy.walletFundingXlm) + parseFloat(policy.newWalletPlatformFeeXlm)
  : parseFloat(policy.newWalletPlatformFeeXlm);

// AFTER:
const useWalletFunding = policy.walletFundingEnabled && policy.walletFundingMode === "auto";
const amountStr = useWalletFunding
  ? addDecimalStrings(policy.walletFundingXlm, policy.newWalletPlatformFeeXlm)
  : policy.newWalletPlatformFeeXlm;
```

```typescript
// BEFORE (line 238):
amountXlm: (-amount).toFixed(7),

// AFTER:
amountXlm: negateDecimalString(amountStr),
```

```typescript
// BEFORE (line 252):
if (balance <= 0) {

// AFTER:
if (compareDecimalStrings(balanceStr, "0") <= 0) {
```

```typescript
// BEFORE (line 263):
amountXlm: (-parseFloat(policy.onboardingFeeXlm)).toFixed(7),

// AFTER:
amountXlm: negateDecimalString(policy.onboardingFeeXlm),
```

- [ ] **Step 5: Replace parseFloat in runMonthlyMaintenanceForTenant**

```typescript
// BEFORE (lines 464-468):
const feePerUser = parseFloat(policy.monthlyFeePerActiveUser);
const totalCharge = activeUserCount * feePerUser;
const amountStr = (-totalCharge).toFixed(7);
const totalStr = totalCharge.toFixed(7);
const feeStr = feePerUser.toFixed(4);

// AFTER:
const totalChargeStr = mulDecimalStrings(policy.monthlyFeePerActiveUser, activeUserCount);
const amountStr = negateDecimalString(totalChargeStr);
const totalStr = totalChargeStr;
// Fee-per-user: keep original policy value (already a string)
const feeStr = policy.monthlyFeePerActiveUser;
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run packages/backend/src/services/billing.service.test.ts`
Expected: PASS

- [ ] **Step 7: Run full suite**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/services/billing.service.ts packages/backend/src/services/billing.service.test.ts
git commit -m "fix(billing): P1-2-F1 — replace floating-point with bigint string arithmetic

All monetary computations in checkWalletBilling and
runMonthlyMaintenanceForTenant now use bigint-based stroop arithmetic
(1 stroop = 0.0000001 XLM). Eliminates IEEE 754 rounding errors for
configurable fee values. No new dependencies — uses native BigInt."
```

---

### Task 8: P2-1-F1 — Add authMiddleware to trustline routes

**Files:**
- Modify: `packages/backend/src/routes/trustlines.ts` (add preHandler to POST routes)
- Modify: `packages/backend/src/routes/trustlines.test.ts` (add auth enforcement tests)

**Interfaces:**
- Consumes: `authMiddleware` from `../middleware/auth`
- Produces: 401 for unauthenticated POST requests to trustline endpoints

**Note:** GET routes (`/trustlines/:publicKey` and `/trustlines/check/...`) remain unauthenticated — they're read-only queries against public Horizon data. POST routes (`/add`, `/remove`, `/update-limit`) build transactions and trigger DB writes, so they need auth.

- [ ] **Step 1: Write the failing test**

Add to `packages/backend/src/routes/trustlines.test.ts`:

```typescript
describe("Trustline routes — auth enforcement", () => {
  it("POST /api/v1/trustlines/add returns 401 without auth token", async () => {
    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/add",
      payload: {
        publicKey: "GABC123",
        assetCode: "USDC",
        assetIssuer: "GDEF456",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/trustlines/remove returns 401 without auth token", async () => {
    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/remove",
      payload: {
        publicKey: "GABC123",
        assetCode: "USDC",
        assetIssuer: "GDEF456",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/trustlines/update-limit returns 401 without auth token", async () => {
    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/update-limit",
      payload: {
        publicKey: "GABC123",
        assetCode: "USDC",
        assetIssuer: "GDEF456",
        limit: "1000",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/trustlines/:publicKey does NOT require auth (public read)", async () => {
    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/trustlines/GABC123",
    });

    // Should not be 401 — GET is public
    expect(res.statusCode).not.toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/backend/src/routes/trustlines.test.ts`
Expected: FAIL — POST routes currently return 500 (no auth check), not 401

- [ ] **Step 3: Add authMiddleware to POST routes**

In `packages/backend/src/routes/trustlines.ts`:

1. Add import at top (after line 3):
```typescript
import { authMiddleware } from "../middleware/auth";
```

2. Add preHandler to `/api/v1/trustlines/add` (inside the route options object, after line 233):
```typescript
preHandler: authMiddleware,
```

3. Add preHandler to `/api/v1/trustlines/remove` (inside the route options, after line 322):
```typescript
preHandler: authMiddleware,
```

4. Add preHandler to `/api/v1/trustlines/update-limit` (inside the route options, after line 401):
```typescript
preHandler: authMiddleware,
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/backend/src/routes/trustlines.test.ts`
Expected: PASS — all auth enforcement tests pass

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/trustlines.ts packages/backend/src/routes/trustlines.test.ts
git commit -m "fix(trustlines): P2-1-F1 — add authMiddleware to POST trustline routes

POST /add, /remove, and /update-limit now require Bearer auth. These
endpoints build transactions and trigger DB writes (ensureToken).
GET routes remain public — they query read-only Horizon data.
Same pattern as earn and moneygram auth fixes from Phase 3."
```

---

## Post-Fix Checklist

After all 8 tasks complete:

- [ ] Run `npx vitest run` — confirm all tests pass
- [ ] Update FINDINGS.md — mark all 7 findings as FIXED with commit hashes
- [ ] Create PHASE4_SUMMARY.md with fix-by-fix summary table
- [ ] Create MERGE_CHECKLIST.md with pre/post-merge verification steps
- [ ] `git log --oneline` — list all Phase 4 commits for review
