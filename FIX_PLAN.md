# Phase 1: Immediate Auth/Fund-Loss CRITICALs — Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix 4 Phase 1 CRITICALs (6 finding IDs) that allow unauthenticated access to financial operations or produce incorrect blockchain data.

**Architecture:** Minimal, targeted fixes. Each adds `preHandler: authMiddleware` to unprotected routes (Tasks 1-2), corrects a property path (Task 3), or fixes a data constant (Task 4). All follow established codebase patterns.

**Tech Stack:** Fastify, Drizzle ORM, Vitest, TypeScript, Stellar SDK

## Global Constraints

- Branch: `audit/full-codebase-2026-07-26` (worktree `.worktrees/audit-2026-07-26/`)
- NEVER merge to main. NEVER push to production.
- TDD: write the failing test FIRST, then implement the fix.
- One commit per fix. Commit message references finding ID.
- Test runner: `cd packages/backend && npx vitest run`
- Current test count: 221/221 passing. Must stay at 100%.
- `authMiddleware` is at `packages/backend/src/middleware/auth.ts`. It sets `request.user = payload` where `payload: JwtPayload` has `{ userId: number, email: string, iat, exp }`.
- The standard pattern for accessing userId in protected routes is: `request.user!.userId` (see wallets.ts, nft.ts, fiat.ts, auth.ts, two-fa.ts — 25+ occurrences).
- After ALL fixes, update `FINDINGS.md` marking each finding as FIXED with commit hash.

---

### Task 1: P3-2-F1/F2 — Add authMiddleware to earn routes

**Files:**
- Modify: `packages/backend/src/routes/earn.ts` (lines 1-2 for import, lines 13, 75, 149, 218 for preHandler)
- Create: `packages/backend/src/routes/earn.test.ts`

**Interfaces:**
- Consumes: `authMiddleware` from `../middleware/auth` (Fastify preHandler hook — returns 401 `{ error: "No token provided" }` when no Bearer token, 401 `{ error: "Invalid or expired token" }` when bad token)
- Produces: 4 routes now reject unauthenticated requests with 401

- [x] **Step 1: Write the failing test**

```typescript
// packages/backend/src/routes/earn.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("../config", () => ({
  config: {
    HORIZON_URL: "https://horizon-testnet.stellar.org",
    STELLAR_NETWORK: "testnet",
  },
}));

vi.mock("@stellar/stellar-sdk", () => {
  const mockServer = {
    liquidityPools: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    call: vi.fn().mockResolvedValue({ records: [] }),
  };
  return {
    Horizon: { Server: vi.fn(() => mockServer) },
  };
});

import Fastify from "fastify";
import { earnRoutes } from "./earn";

describe("Earn routes — auth enforcement", () => {
  const app = Fastify();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Register routes once
  app.register(earnRoutes);

  it("POST /api/v1/earn/deposit returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/earn/deposit",
      payload: {
        publicKey: "GABC123",
        poolId: "pool123",
        maxAmountA: "100",
        maxAmountB: "100",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });

  it("POST /api/v1/earn/withdraw returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/earn/withdraw",
      payload: {
        publicKey: "GABC123",
        poolId: "pool123",
        shares: "50",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });

  it("GET /api/v1/earn/pools returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/earn/pools",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });

  it("GET /api/v1/earn/positions/GABC123 returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/earn/positions/GABC123",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/routes/earn.test.ts`
Expected: FAIL — all 4 tests fail because routes currently return 200 (no auth check), not 401.

- [x] **Step 3: Implement the fix**

In `packages/backend/src/routes/earn.ts`:

1. Add import at top (after existing imports):
```typescript
import { authMiddleware } from "../middleware/auth";
```

2. Add `preHandler: authMiddleware` to each route's options object:

For `GET /api/v1/earn/pools` (~line 12-13):
```typescript
    {
      preHandler: authMiddleware,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
```

For `GET /api/v1/earn/positions/:publicKey` (~line 74-75):
```typescript
    {
      preHandler: authMiddleware,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
```

For `POST /api/v1/earn/deposit` (~line 149):
```typescript
    {
      preHandler: authMiddleware,
      schema: {
```

For `POST /api/v1/earn/withdraw` (~line 218):
```typescript
    {
      preHandler: authMiddleware,
      schema: {
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/routes/earn.test.ts`
Expected: PASS — all 4 tests pass (401 returned for unauthenticated requests)

- [x] **Step 5: Run full suite to verify no regressions**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass (221 + 4 new = 225)

- [x] **Step 6: Commit**

```bash
git add packages/backend/src/routes/earn.ts packages/backend/src/routes/earn.test.ts
git commit -m "fix(earn): P3-2-F1/F2 — add authMiddleware to all earn routes

Earn routes (pools, positions, deposit, withdraw) had zero auth
checks, allowing unauthenticated users to build LP deposit/withdraw
transactions. Added preHandler: authMiddleware to all 4 routes.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: P3-5-F1/F2 — Add authMiddleware to MoneyGram routes

**Files:**
- Modify: `packages/backend/src/routes/moneygram.ts` (add import + preHandler to 3 of 4 routes)
- Create: `packages/backend/src/routes/moneygram.test.ts`

**Interfaces:**
- Consumes: `authMiddleware` from `../middleware/auth`
- Produces: deposit, withdraw, and transaction-status routes now reject 401 without auth. `GET /info` remains public (static config, no server key usage).

- [x] **Step 1: Write the failing test**

```typescript
// packages/backend/src/routes/moneygram.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config", () => ({
  config: {
    MONEYGRAM_RAMPS_URL: "https://extstellar.moneygram.com/ramps",
    MONEYGRAM_RAMPS_DOMAIN: "extstellar.moneygram.com",
    SIGNING_SECRET_KEY: "SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE6PNVPZ7ZTLHGM3AGAZYASP",
    SIGNING_PUBLIC_KEY: "GCTEST123",
    STELLAR_NETWORK: "testnet",
    FIAT_RAMP_FEE_PERCENT: 1.5,
    HORIZON_URL: "https://horizon-testnet.stellar.org",
  },
}));

vi.mock("@stellar/stellar-sdk", () => ({
  Horizon: { Server: vi.fn(() => ({})) },
  Keypair: { fromSecret: vi.fn(() => ({ sign: vi.fn() })) },
  TransactionBuilder: { fromXDR: vi.fn(() => ({ sign: vi.fn(), toXDR: vi.fn(() => "xdr") })) },
  Networks: { TESTNET: "Test SDF Network ; September 2015", PUBLIC: "Public Global Stellar Network ; September 2015" },
}));

import Fastify from "fastify";
import { moneygramRoutes } from "./moneygram";

describe("MoneyGram routes — auth enforcement", () => {
  const app = Fastify();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  app.register(moneygramRoutes);

  it("POST /api/v1/moneygram/deposit returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/moneygram/deposit",
      payload: { publicKey: "GABC123" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });

  it("POST /api/v1/moneygram/withdraw returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/moneygram/withdraw",
      payload: { publicKey: "GABC123", amount: "100" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });

  it("GET /api/v1/moneygram/transaction/:id returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/moneygram/transaction/txn_123",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });

  it("GET /api/v1/moneygram/info remains accessible without auth (public config)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/moneygram/info",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("provider", "MoneyGram");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/routes/moneygram.test.ts`
Expected: FAIL — first 3 tests fail (routes return 200 instead of 401). The 4th test (info remains public) may pass or fail depending on mock completeness.

- [x] **Step 3: Implement the fix**

In `packages/backend/src/routes/moneygram.ts`:

1. Add import at top (after existing imports):
```typescript
import { authMiddleware } from "../middleware/auth";
```

2. Add `preHandler: authMiddleware` to 3 routes (NOT `GET /info`):

For `POST /api/v1/moneygram/deposit` (~line 152-153):
```typescript
    {
      preHandler: authMiddleware,
      schema: {
```

For `POST /api/v1/moneygram/withdraw` (~line 199-200):
```typescript
    {
      preHandler: authMiddleware,
      schema: {
```

For `GET /api/v1/moneygram/transaction/:id` (~line 246-247):
```typescript
    {
      preHandler: authMiddleware,
      schema: {
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/routes/moneygram.test.ts`
Expected: PASS — all 4 tests pass

- [x] **Step 5: Run full suite to verify no regressions**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass (225 + 4 new = 229)

- [x] **Step 6: Commit**

```bash
git add packages/backend/src/routes/moneygram.ts packages/backend/src/routes/moneygram.test.ts
git commit -m "fix(moneygram): P3-5-F1/F2 — add authMiddleware to deposit/withdraw/transaction

MoneyGram deposit and withdraw routes used the server SIGNING_SECRET_KEY
to sign SEP-10 challenges without verifying the caller is authenticated.
Added preHandler: authMiddleware to deposit, withdraw, and transaction
status routes. GET /info remains public (static config only).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: P3-6-F1 — Fix contacts userId property path

**Files:**
- Modify: `packages/backend/src/routes/contacts.ts` (lines 34, 62, 102, 130 — 4 occurrences)
- Create: `packages/backend/src/routes/contacts.test.ts`

**Interfaces:**
- Consumes: `authMiddleware` already applied (lines 10, 40, 81, 119). `request.user` is set by `authMiddleware` as `JwtPayload { userId: number, email: string, ... }`.
- Produces: All 4 CRUD operations correctly scope queries by the authenticated user's `userId`.

- [x] **Step 1: Write the failing test**

```typescript
// packages/backend/src/routes/contacts.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockDelete = vi.fn();

vi.mock("../db", () => ({
  db: {
    select: () => ({ from: (table: any) => ({ where: mockWhere, orderBy: mockOrderBy }) }),
    insert: () => ({ values: (v: any) => ({ returning: () => Promise.resolve([{ id: 1, ...v }]) }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve({ rowCount: 1 }) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  },
}));

vi.mock("../db/schema", () => ({
  addressBook: {
    userId: "userId",
    name: "name",
    address: "address",
    id: "id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ col, val }),
  and: (...args: any[]) => args,
}));

// Mock auth middleware to set request.user
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (request: any) => {
    request.user = { userId: 42, email: "test@example.com" };
  },
}));

import Fastify from "fastify";
import { addressBookRoutes } from "./contacts";
import { eq } from "drizzle-orm";

describe("Contacts routes — userId extraction", () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(addressBookRoutes);
    await app.ready();
  });

  it("GET /api/v1/contacts uses request.user.userId (not request.userId)", async () => {
    // The mock DB where clause should receive userId=42 from authMiddleware
    mockWhere.mockReturnValue({ orderBy: vi.fn().mockResolvedValue([]) });
    mockOrderBy.mockResolvedValue([]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/contacts",
      headers: { authorization: "Bearer fake-token" },
    });

    // If the bug is present (request.userId), userId will be undefined
    // If fixed (request.user!.userId), userId will be 42
    // We verify by checking the WHERE clause received the correct value
    expect(res.statusCode).toBe(200);

    // The key assertion: verify the drizzle eq() was called with userId=42
    // We can check this by inspecting the mock calls
    const whereCalls = mockWhere.mock.calls;
    // The where clause should contain eq(addressBook.userId, 42)
    // With our mock of eq, that produces { col: "userId", val: 42 }
    expect(whereCalls.length).toBeGreaterThan(0);
    const whereArg = whereCalls[0][0];
    // and() wraps eq calls — check we got userId=42 not userId=undefined
    if (Array.isArray(whereArg)) {
      const userIdEq = whereArg.find((a: any) => a.col === "userId");
      expect(userIdEq.val).toBe(42);
    } else if (whereArg.col === "userId") {
      expect(whereArg.val).toBe(42);
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/routes/contacts.test.ts`
Expected: FAIL — `userId` in the WHERE clause is `undefined` (not 42), because `contacts.ts` reads `(request as any).userId` which doesn't exist.

- [x] **Step 3: Implement the fix**

In `packages/backend/src/routes/contacts.ts`, replace all 4 occurrences:

```
Old: const userId = (request as any).userId;
New: const userId = request.user!.userId;
```

Lines 34, 62, 102, 130 — all identical replacement.

- [x] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/routes/contacts.test.ts`
Expected: PASS — userId is now 42 (from `request.user.userId`)

- [x] **Step 5: Run full suite to verify no regressions**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass (229 + new contacts tests)

- [x] **Step 6: Commit**

```bash
git add packages/backend/src/routes/contacts.ts packages/backend/src/routes/contacts.test.ts
git commit -m "fix(contacts): P3-6-F1 — use request.user!.userId instead of request.userId

All 4 CRUD handlers read (request as any).userId which is always
undefined — authMiddleware sets request.user.userId, not request.userId.
This caused GET to return 0 results, POST to create orphaned rows,
and PATCH/DELETE to match 0 rows (always 404). Fixed all 4 occurrences
to use request.user!.userId, matching the pattern in 25+ other routes.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: P4-6-F1 — Fix AQUA issuer address in known-tokens seed

**Files:**
- Modify: `packages/backend/src/db/seed/known-tokens.ts` (line 85)
- Create: `packages/backend/src/db/seed/known-tokens.test.ts`

**Interfaces:**
- Consumes: Nothing external
- Produces: Correct AQUA issuer address (`GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA`, 56 chars) matching `token-list.json:81`

- [x] **Step 1: Write the failing test**

```typescript
// packages/backend/src/db/seed/known-tokens.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("known-tokens seed data integrity", () => {
  // Read the source file directly to check the hardcoded issuer value
  const sourceCode = readFileSync(
    resolve(__dirname, "known-tokens.ts"),
    "utf-8"
  );

  it("AQUA issuer address is exactly 56 characters (valid Stellar public key)", () => {
    // Extract the AQUA issuer from the source code
    const aquaMatch = sourceCode.match(
      /assetCode:\s*"AQUA"[\s\S]*?assetIssuer:\s*"([A-Z0-9]+)"/
    );
    expect(aquaMatch).not.toBeNull();
    const aquaIssuer = aquaMatch![1];
    expect(aquaIssuer).toHaveLength(56);
  });

  it("AQUA issuer matches the canonical address from token-list.json", () => {
    const tokenList = JSON.parse(
      readFileSync(resolve(__dirname, "../../data/token-list.json"), "utf-8")
    );
    const aquaFromList = tokenList.mainnet.find(
      (t: any) => t.code === "AQUA"
    );
    expect(aquaFromList).toBeDefined();

    const aquaMatch = sourceCode.match(
      /assetCode:\s*"AQUA"[\s\S]*?assetIssuer:\s*"([A-Z0-9]+)"/
    );
    const aquaIssuer = aquaMatch![1];
    expect(aquaIssuer).toBe(aquaFromList.issuer);
  });

  it("all issuer addresses in known-tokens are exactly 56 characters", () => {
    const issuers = [...sourceCode.matchAll(/assetIssuer:\s*"([A-Z0-9]+)"/g)]
      .map((m) => m[1]);
    expect(issuers.length).toBeGreaterThan(0);
    for (const issuer of issuers) {
      expect(issuer).toHaveLength(56);
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/db/seed/known-tokens.test.ts`
Expected: FAIL — AQUA issuer is 55 characters, not 56. And it won't match token-list.json.

- [x] **Step 3: Implement the fix**

In `packages/backend/src/db/seed/known-tokens.ts` line 85:

```
Old: assetIssuer: "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67TKA",
New: assetIssuer: "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA",
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/db/seed/known-tokens.test.ts`
Expected: PASS — all 3 tests pass (56 chars, matches token-list.json, all issuers valid)

- [x] **Step 5: Run full suite to verify no regressions**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass (previous count + new known-tokens tests)

- [x] **Step 6: Commit**

```bash
git add packages/backend/src/db/seed/known-tokens.ts packages/backend/src/db/seed/known-tokens.test.ts
git commit -m "fix(seeds): P4-6-F1 — correct AQUA issuer address (55→56 chars)

known-tokens.ts had a truncated AQUA issuer ending in '...M67TKA' (55
chars). The correct address from token-list.json and the Aquarius project
is '...M67AQUA' (56 chars). Users trusting the seed data could create
trustlines to a non-existent or wrong Stellar asset.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Post-Fix Checklist

After all 4 tasks are complete:

- [x] Run full test suite: `cd packages/backend && npx vitest run` — expect all passing
- [x] Update `FINDINGS.md` — mark P3-2-F1, P3-2-F2, P3-5-F1, P3-5-F2, P3-6-F1, P4-6-F1 as **FIXED** with commit hashes
- [x] Update `AUDIT_PLAN.md` — note Phase 1 fixes applied
- [x] Present Phase 1 checkpoint summary
