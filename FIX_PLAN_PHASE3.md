# Phase 3: Remaining HIGH/CRITICALs — Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 Phase 3 items: auth test coverage (4 CRITICAL gaps), SSRF hostname validation (3 vectors), multi-stage Docker build, 2FA timing-safe + rate limiting, and NFT auditLog signatures.

**Architecture:** New URL validator utility for SSRF protection. Timing-safe comparison utility for 2FA codes. Multi-stage Dockerfile to exclude devDeps. Auth test suite covering critical security paths.

**Tech Stack:** Fastify, Vitest, TypeScript, Node.js crypto, Docker multi-stage, @fastify/rate-limit

## Global Constraints

- Branch: `audit/full-codebase-2026-07-26` (worktree `.worktrees/audit-2026-07-26/`)
- NEVER merge to main. NEVER push to production.
- TDD: write the failing test FIRST, then implement the fix.
- One commit per fix. Commit message references finding ID.
- Test runner: `cd packages/backend && npx vitest run`
- Current test count: 244/244 passing (Phase 2 baseline).
- After ALL fixes, update `FINDINGS.md` marking each finding as FIXED with commit hash.

---

### Task 1: P4-9-F1 — Auth route test suite (critical paths)

**Files:**
- Create: `packages/backend/src/routes/auth.test.ts`

**Interfaces:**
- Consumes: All mocked — db, config, mailer, auth middleware, bcryptjs, speakeasy, totp-crypto, jwt
- Produces: ~20 tests covering register, login (with 2FA), refresh, logout, /me, change-password, forgot/reset password, verify-email

**Note:** This is a test-only task — no production code changes. The "TDD" here is: write the tests, run them, verify they all pass against the existing (correct) route implementations. The tests validate that security-critical behaviors work correctly.

- [ ] **Step 1: Write the auth route test suite**

The test file must mock all external dependencies (db, config, mailer, crypto, jwt, speakeasy, totp-crypto) and test each route via `app.inject()`. Pattern reference: `auth-critical-fixes.test.ts` and `earn.test.ts`.

Tests to include (minimum — implementer may add more if straightforward):

**Register:**
1. Successful registration returns 201 with user data
2. Duplicate email returns 409
3. Missing email+phone returns 400

**Login:**
4. Valid credentials return tokens
5. Wrong password returns 401
6. Non-existent user returns 401 (same response as wrong password — no enumeration)
7. 2FA-enabled user returns `twoFaRequired: true` without tokens
8. 2FA-enabled user with valid TOTP code returns tokens

**Refresh:**
9. Valid refresh token returns new token pair
10. Invalid/expired refresh token returns 401

**Logout:**
11. Successful logout returns 200

**/me:**
12. Returns user profile for authenticated user
13. Returns 401 without auth token

**Change password:**
14. Successful change returns 200
15. Wrong current password returns 401

**Forgot password:**
16. Valid email returns 200 (always, even if email doesn't exist — no enumeration)

**Reset password:**
17. Valid reset token + new password returns 200

**Verify email:**
18. Valid token marks email as verified
19. Invalid/expired token returns 400

Each test should use `app.inject()` with appropriate mocks. The mock setup should follow the pattern already established in `auth-critical-fixes.test.ts`:
- `vi.mock("../db", ...)` — mock all DB operations
- `vi.mock("../config", ...)` — mock config values
- `vi.mock("../lib/auth", ...)` — mock JWT functions
- `vi.mock("../middleware/auth", ...)` — mock authMiddleware to set `request.user`
- `vi.mock("../lib/email", ...)` — mock email sending
- `vi.mock("bcryptjs", ...)` — mock password hashing

- [ ] **Step 2: Run the tests**

Run: `cd packages/backend && npx vitest run src/routes/auth.test.ts`
Expected: All tests PASS (they test the existing correct implementations)

- [ ] **Step 3: Run full suite**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass (244 + ~20 new)

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/auth.test.ts
git commit -m "test(auth): P4-9-F1 — add critical-path auth route test suite

Near-zero test coverage on ~20 auth endpoints was a CRITICAL gap.
Added ~20 tests covering: register, login (with 2FA challenge),
refresh, logout, /me, change-password, forgot/reset password,
and email verification. Mocks DB, crypto, mailer, JWT.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: P2-2/P4-7-F5/F7 — SSRF hostname validation

**Files:**
- Create: `packages/backend/src/lib/url-validator.ts`
- Create: `packages/backend/src/lib/url-validator.test.ts`
- Modify: `packages/backend/src/lib/toml-sync.ts` (line 49 — validate before fetch)
- Modify: `packages/backend/src/lib/icon-resolver.ts` (line 176 — validate before fetch)
- Modify: `packages/backend/src/modules/nft/nft.service.ts` (line 444-446 — validate before fetch)

**Interfaces:**
- Produces: `validateExternalUrl(url: string): void` — throws if URL is unsafe
- Consumes: Called before every outbound fetch of user/attacker-controlled URLs

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/backend/src/lib/url-validator.test.ts
import { describe, it, expect } from "vitest";
import { validateExternalUrl } from "./url-validator";

describe("validateExternalUrl", () => {
  // Should PASS (safe URLs)
  it("allows https URLs to public domains", () => {
    expect(() => validateExternalUrl("https://example.com/path")).not.toThrow();
    expect(() => validateExternalUrl("https://stellar.org/.well-known/stellar.toml")).not.toThrow();
  });

  // Should REJECT (unsafe URLs)
  it("rejects http:// (non-TLS)", () => {
    expect(() => validateExternalUrl("http://example.com")).toThrow();
  });

  it("rejects file:// scheme", () => {
    expect(() => validateExternalUrl("file:///etc/passwd")).toThrow();
  });

  it("rejects javascript: scheme", () => {
    expect(() => validateExternalUrl("javascript:alert(1)")).toThrow();
  });

  it("rejects data: scheme", () => {
    expect(() => validateExternalUrl("data:text/html,<script>alert(1)</script>")).toThrow();
  });

  it("rejects localhost", () => {
    expect(() => validateExternalUrl("https://localhost/path")).toThrow();
    expect(() => validateExternalUrl("https://localhost:3000/path")).toThrow();
  });

  it("rejects 127.0.0.1 (loopback)", () => {
    expect(() => validateExternalUrl("https://127.0.0.1/path")).toThrow();
    expect(() => validateExternalUrl("https://127.0.0.255/path")).toThrow();
  });

  it("rejects 10.x.x.x (private class A)", () => {
    expect(() => validateExternalUrl("https://10.0.0.1/path")).toThrow();
    expect(() => validateExternalUrl("https://10.255.255.255/path")).toThrow();
  });

  it("rejects 172.16-31.x.x (private class B)", () => {
    expect(() => validateExternalUrl("https://172.16.0.1/path")).toThrow();
    expect(() => validateExternalUrl("https://172.31.255.255/path")).toThrow();
  });

  it("rejects 192.168.x.x (private class C)", () => {
    expect(() => validateExternalUrl("https://192.168.0.1/path")).toThrow();
    expect(() => validateExternalUrl("https://192.168.255.255/path")).toThrow();
  });

  it("rejects 169.254.x.x (link-local / cloud metadata)", () => {
    expect(() => validateExternalUrl("https://169.254.169.254/latest/meta-data/")).toThrow();
  });

  it("rejects 0.0.0.0", () => {
    expect(() => validateExternalUrl("https://0.0.0.0/path")).toThrow();
  });

  it("rejects IPv6 loopback (::1)", () => {
    expect(() => validateExternalUrl("https://[::1]/path")).toThrow();
  });

  it("rejects metadata.google.internal", () => {
    expect(() => validateExternalUrl("https://metadata.google.internal/")).toThrow();
  });

  it("rejects invalid URLs", () => {
    expect(() => validateExternalUrl("not-a-url")).toThrow();
    expect(() => validateExternalUrl("")).toThrow();
  });

  it("allows 172.15.x.x (not in private range)", () => {
    expect(() => validateExternalUrl("https://172.15.0.1/path")).not.toThrow();
  });

  it("allows 172.32.x.x (not in private range)", () => {
    expect(() => validateExternalUrl("https://172.32.0.1/path")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/lib/url-validator.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement url-validator.ts**

```typescript
// packages/backend/src/lib/url-validator.ts

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "instance-data",
]);

function isPrivateIp(hostname: string): boolean {
  // IPv4 patterns
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 127) return true;                    // 127.0.0.0/8 loopback
    if (a === 10) return true;                     // 10.0.0.0/8 private
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true;       // 192.168.0.0/16 private
    if (a === 169 && b === 254) return true;       // 169.254.0.0/16 link-local
    if (a === 0) return true;                      // 0.0.0.0/8
  }

  // IPv6 loopback
  if (hostname === "::1" || hostname === "[::1]") return true;
  // IPv6 unique-local
  if (/^f[cd]/i.test(hostname)) return true;

  return false;
}

export function validateExternalUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`Unsafe URL scheme: ${parsed.protocol} (only https: allowed)`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new Error(`Blocked hostname: ${hostname}`);
  }

  if (isPrivateIp(hostname)) {
    throw new Error(`Private/reserved IP address: ${hostname}`);
  }
}
```

- [ ] **Step 4: Run url-validator tests**

Run: `cd packages/backend && npx vitest run src/lib/url-validator.test.ts`
Expected: PASS

- [ ] **Step 5: Apply validation to toml-sync.ts**

In `packages/backend/src/lib/toml-sync.ts`, before the fetch on line 49:

Add import:
```typescript
import { validateExternalUrl } from "./url-validator";
```

Before `const res = await fetch(url, ...)`, add:
```typescript
      try {
        validateExternalUrl(url);
      } catch (err: any) {
        console.warn(`[toml-sync] Skipping unsafe URL for ${token.assetCode}: ${err.message}`);
        continue;
      }
```

- [ ] **Step 6: Apply validation to icon-resolver.ts**

In `packages/backend/src/lib/icon-resolver.ts`, before the fetch of `token.tomlImage` on line 176:

Add import:
```typescript
import { validateExternalUrl } from "./url-validator";
```

Before `const resp = await fetch(token.tomlImage, ...)`, add:
```typescript
      try {
        validateExternalUrl(token.tomlImage);
      } catch {
        // Skip unsafe TOML image URLs
        break;
      }
```

- [ ] **Step 7: Apply validation to nft.service.ts**

In `packages/backend/src/modules/nft/nft.service.ts`, before the fetch of `httpUri` on line 446:

Add import:
```typescript
import { validateExternalUrl } from "../../lib/url-validator";
```

Before `const resp = await fetch(httpUri, ...)`, add:
```typescript
      validateExternalUrl(httpUri); // throws on private/unsafe URLs
```

- [ ] **Step 8: Run full suite**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/lib/url-validator.ts packages/backend/src/lib/url-validator.test.ts \
       packages/backend/src/lib/toml-sync.ts packages/backend/src/lib/icon-resolver.ts \
       packages/backend/src/modules/nft/nft.service.ts
git commit -m "fix(security): P2-2/P4-7-F5/F7 — add SSRF hostname validation

Three outbound fetch calls (toml-sync, icon-resolver, nft.service)
accepted attacker-controlled URLs without validation, enabling SSRF
against internal services and cloud metadata endpoints.

Added url-validator.ts: requires https: scheme, blocks private IPs
(127/10/172.16-31/192.168/169.254), blocks localhost and cloud
metadata hostnames. Applied to all three SSRF vectors.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: P4-8-F3 — Multi-stage Docker build

**Files:**
- Modify: `packages/backend/Dockerfile`
- Modify: `packages/backend/src/docker/dockerfile.test.ts` (add multi-stage test)

**Interfaces:**
- Consumes: Existing Dockerfile from Phase 2 (pinned image, non-root user)
- Produces: Multi-stage build with production-only deps in final image

- [ ] **Step 1: Write the failing test**

Add to `packages/backend/src/docker/dockerfile.test.ts`:

```typescript
  it("uses multi-stage build (has FROM ... AS stage)", () => {
    const fromLines = dockerfile.split("\n").filter((l) => l.startsWith("FROM "));
    expect(fromLines.length).toBeGreaterThanOrEqual(2);
  });

  it("final stage does not run npm ci (deps come from build stage)", () => {
    // Split by FROM to get stages, check last stage
    const stages = dockerfile.split(/^FROM /m);
    const finalStage = stages[stages.length - 1];
    expect(finalStage).not.toContain("npm ci");
    expect(finalStage).not.toContain("npm install");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/docker/dockerfile.test.ts`
Expected: FAIL — current Dockerfile has only 1 FROM line.

- [ ] **Step 3: Implement multi-stage Dockerfile**

Replace `packages/backend/Dockerfile` with:

```dockerfile
# Stage 1: Install production dependencies only
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: Production image
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules

# Copy only what's needed at runtime
COPY --chown=appuser:appgroup package*.json ./
COPY --chown=appuser:appgroup src/ ./src/

# Remove any local .env — Docker will inject via env_file
RUN rm -f .env .env.bak

USER appuser

EXPOSE 3001

CMD ["npx", "tsx", "src/server.ts"]
```

Key differences from current:
- Two FROM lines (multi-stage)
- `npm ci --omit=dev` in deps stage (no vitest, drizzle-kit, etc.)
- Only `src/` directory copied (not tests, scripts, seeds, drizzle config)
- `node_modules` from deps stage via `COPY --from=deps`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/docker/dockerfile.test.ts`
Expected: PASS — multi-stage detected, no npm ci in final stage.

- [ ] **Step 5: Run full suite**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/Dockerfile packages/backend/src/docker/dockerfile.test.ts
git commit -m "fix(docker): P4-8-F3 — multi-stage build, exclude devDependencies

Single-stage build installed vitest, drizzle-kit, and all devDeps in
the production image. COPY . . included tests, scripts, and config.
Split into deps stage (npm ci --omit=dev) and production stage (only
src/ and production node_modules). Reduces image size and attack surface.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: P3-7-F3/F4 — Timing-safe 2FA comparison + rate limiting

**Files:**
- Create: `packages/backend/src/lib/timing-safe.ts`
- Create: `packages/backend/src/lib/timing-safe.test.ts`
- Modify: `packages/backend/src/routes/two-fa.ts` (backup code + static code comparisons + rate limits)

**Interfaces:**
- Produces: `timingSafeCompare(a: string, b: string): boolean` — constant-time string comparison
- Consumes: Used in 2FA verify and disable handlers for backup and static code checks

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/backend/src/lib/timing-safe.test.ts
import { describe, it, expect } from "vitest";
import { timingSafeCompare } from "./timing-safe";

describe("timingSafeCompare", () => {
  it("returns true for matching strings", () => {
    expect(timingSafeCompare("abc123", "abc123")).toBe(true);
  });

  it("returns false for non-matching strings", () => {
    expect(timingSafeCompare("abc123", "abc124")).toBe(false);
  });

  it("returns false for different-length strings", () => {
    expect(timingSafeCompare("short", "longer-string")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(timingSafeCompare("", "")).toBe(true);
    expect(timingSafeCompare("", "nonempty")).toBe(false);
  });

  it("handles SHA-256 hex strings (64 chars)", () => {
    const hash1 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const hash2 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const hash3 = "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592";
    expect(timingSafeCompare(hash1, hash2)).toBe(true);
    expect(timingSafeCompare(hash1, hash3)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/lib/timing-safe.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement timing-safe.ts**

```typescript
// packages/backend/src/lib/timing-safe.ts
import crypto from "node:crypto";

export function timingSafeCompare(a: string, b: string): boolean {
  // Ensure constant-time comparison regardless of input length
  // Use SHA-256 to normalize both strings to the same length before comparing
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB) && a.length === b.length;
}
```

Note: We hash both inputs to normalize length (timingSafeEqual requires same-length buffers). The `a.length === b.length` check prevents hash collision false positives for different-length inputs (vanishingly unlikely but defense-in-depth).

- [ ] **Step 4: Run timing-safe tests**

Run: `cd packages/backend && npx vitest run src/lib/timing-safe.test.ts`
Expected: PASS

- [ ] **Step 5: Apply to two-fa.ts — backup code comparison**

In `packages/backend/src/routes/two-fa.ts`:

Add import:
```typescript
import { timingSafeCompare } from "../lib/timing-safe";
```

**Verify endpoint — static code comparison** (~line 248-252):
Change:
```typescript
  if (userData?.twoFaStaticCode === hashedInput) {
    verified = true;
  }
```
To:
```typescript
  if (userData?.twoFaStaticCode && timingSafeCompare(userData.twoFaStaticCode, hashedInput)) {
    verified = true;
  }
```

**Disable endpoint — backup code indexOf** (~line 483):
Change:
```typescript
  const idx = storedCodes.indexOf(hashedInput);
  if (idx !== -1) {
```
To:
```typescript
  const idx = storedCodes.findIndex((c: string) => timingSafeCompare(c, hashedInput));
  if (idx !== -1) {
```

**Disable endpoint — static code comparison** (~line 463):
Change:
```typescript
    if (user.twoFaStaticCode === hashedInput) {
      verified = true;
    }
```
To:
```typescript
    if (user.twoFaStaticCode && timingSafeCompare(user.twoFaStaticCode, hashedInput)) {
      verified = true;
    }
```

- [ ] **Step 6: Add rate limits to 2FA verify and disable endpoints**

In `packages/backend/src/routes/two-fa.ts`:

**Verify endpoint** (~line 185) — add to the route options:
```typescript
  server.post("/api/v1/auth/2fa/verify", {
    preHandler: authMiddleware,
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    schema: { ... }
  }, async (request, reply) => {
```

**Disable endpoint** (~line 401) — add to the route options:
```typescript
  server.post("/api/v1/auth/2fa/disable", {
    preHandler: authMiddleware,
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    schema: { ... }
  }, async (request, reply) => {
```

- [ ] **Step 7: Run full suite**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/lib/timing-safe.ts packages/backend/src/lib/timing-safe.test.ts \
       packages/backend/src/routes/two-fa.ts
git commit -m "fix(2fa): P3-7-F3/F4 — timing-safe comparison + rate limiting

Backup codes used Array.indexOf() and static codes used === for
comparison — both leak timing information. Replaced with
crypto.timingSafeEqual-based comparison (via SHA-256 normalization).

2FA verify and disable endpoints had no per-route rate limit (only
global 60/min). Added 5 req/15 min per-IP rate limit matching the
auth register endpoint pattern.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: P3-1-F4/F6 — Fix auditLog signatures in NFT routes

**Files:**
- Modify: `packages/backend/src/lib/audit.ts` (add NFT action strings to AuditAction type)
- Modify: `packages/backend/src/routes/nft.ts` (fix all 4 auditLog calls)
- Create: `packages/backend/src/routes/nft-audit.test.ts` (verify correct call signature)

**Interfaces:**
- Consumes: `auditLog(action, opts)` from `../lib/audit`
- Produces: All 4 NFT audit log calls use the correct 2-argument opts-object pattern

The current broken calls in nft.ts (all 4 use wrong positional args):
```typescript
// Line 110: auditLog("nft_collection_registered", userId, { ... }, request.ip)
// Line 321: auditLog("nft_transfer", userId, { ... }, request.ip)
// Line 393: auditLog("nft_mint_indexed", userId, { ... }, request.ip)
// Line 436: auditLog("nft_collection_synced", userId, { ... }, request.ip)
```

The correct form:
```typescript
auditLog("nft_collection_registered", { userId, detail: { ... }, ip: request.ip })
```

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/backend/src/routes/nft-audit.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies
const mockAuditLog = vi.fn();
vi.mock("../lib/audit", () => ({
  auditLog: (...args: any[]) => mockAuditLog(...args),
}));

vi.mock("../db", () => ({
  db: { select: vi.fn().mockReturnThis(), from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(), values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 1 }]) },
  schema: { userWallets: {}, auditLogs: {} },
}));

vi.mock("../config", () => ({
  config: { STELLAR_NETWORK: "testnet", HORIZON_URL: "https://horizon-testnet.stellar.org",
            JWT_SECRET: "test", JWT_REFRESH_SECRET: "test", SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
            sorobanRpcUrl: "https://soroban-testnet.stellar.org" },
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (request: any) => {
    request.user = { userId: 1, email: "test@test.com" };
  },
}));

vi.mock("../modules/nft/nft.service", () => ({
  NftService: vi.fn().mockImplementation(() => ({
    registerCollection: vi.fn().mockResolvedValue({ id: 1, name: "Test", contractId: "CABC" }),
    buildSep50Transfer: vi.fn().mockResolvedValue({ xdr: "mock-xdr" }),
    indexMintedToken: vi.fn().mockResolvedValue({ id: 1 }),
    syncCollectionTokens: vi.fn().mockResolvedValue({ synced: 5 }),
  })),
}));

vi.mock("@stellar/stellar-sdk", () => ({
  Horizon: { Server: vi.fn(() => ({})) },
}));

import Fastify from "fastify";
import { nftRoutes } from "./nft";

describe("NFT routes — auditLog call signature", () => {
  let app: any;

  beforeEach(async () => {
    mockAuditLog.mockClear();
    app = Fastify();
    await app.register(nftRoutes);
    await app.ready();
  });

  it("auditLog is called with opts object (not positional args)", async () => {
    // Trigger any NFT route that calls auditLog
    // Use POST /api/v1/nfts/collections as the test case
    await app.inject({
      method: "POST",
      url: "/api/v1/nfts/collections",
      headers: { authorization: "Bearer fake" },
      payload: { name: "Test", contractId: "CABC", standard: "sep50", network: "testnet" },
    });

    // The key assertion: second argument should be an object with userId, detail, ip
    if (mockAuditLog.mock.calls.length > 0) {
      const [action, opts] = mockAuditLog.mock.calls[0];
      expect(typeof action).toBe("string");
      expect(typeof opts).toBe("object");
      expect(opts).toHaveProperty("userId");
      expect(opts).toHaveProperty("detail");
      // opts should NOT be a number (which is what happens with positional args)
      expect(typeof opts).not.toBe("number");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/routes/nft-audit.test.ts`
Expected: FAIL — the second argument is a number (userId) instead of an object.

- [ ] **Step 3: Add NFT action strings to AuditAction type**

In `packages/backend/src/lib/audit.ts`, add to the AuditAction union:

```typescript
export type AuditAction =
  | "login"
  // ... existing entries ...
  | "api_key_revoke"
  | "nft_collection_registered"
  | "nft_transfer"
  | "nft_mint_indexed"
  | "nft_collection_synced";
```

- [ ] **Step 4: Fix all 4 auditLog calls in nft.ts**

**Line 110-114:** Change:
```typescript
    await auditLog("nft_collection_registered", userId, {
      collectionId: collection.id,
      standard: body.standard,
      contractId: body.contractId,
    }, request.ip);
```
To:
```typescript
    await auditLog("nft_collection_registered", {
      userId,
      detail: { collectionId: collection.id, standard: body.standard, contractId: body.contractId },
      ip: request.ip,
    });
```

**Line 321:** Change:
```typescript
      await auditLog("nft_transfer", userId, { contractId, tokenId, from: fromAddress, to: toAddress }, request.ip);
```
To:
```typescript
      await auditLog("nft_transfer", {
        userId,
        detail: { contractId, tokenId, from: fromAddress, to: toAddress },
        ip: request.ip,
      });
```

**Line 393-397:** Change:
```typescript
      await auditLog("nft_mint_indexed", userId, {
        collectionId,
        tokenId,
        owner,
      }, request.ip);
```
To:
```typescript
      await auditLog("nft_mint_indexed", {
        userId,
        detail: { collectionId, tokenId, owner },
        ip: request.ip,
      });
```

**Line 436:** Change:
```typescript
      await auditLog("nft_collection_synced", userId, { collectionId, ...result }, request.ip);
```
To:
```typescript
      await auditLog("nft_collection_synced", {
        userId,
        detail: { collectionId, ...result },
        ip: request.ip,
      });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/routes/nft-audit.test.ts`
Expected: PASS — auditLog called with opts object.

- [ ] **Step 6: Run full suite**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/lib/audit.ts packages/backend/src/routes/nft.ts \
       packages/backend/src/routes/nft-audit.test.ts
git commit -m "fix(nft): P3-1-F4/F6 — fix auditLog signatures in NFT routes

All 4 auditLog calls in nft.ts used wrong positional args pattern
(action, userId, detail, ip). The function signature is (action, opts).
Extra args were silently ignored — every NFT audit log entry had
userId=null, detail={}, ip=null. Fixed all 4 calls to use opts object.
Added NFT action strings to AuditAction union type.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Post-Fix Checklist

After all 5 tasks are complete:

- [ ] Run full test suite: `cd packages/backend && npx vitest run` — expect all passing
- [ ] Update `FINDINGS.md` — mark P4-9-F1, P2-2-F1, P4-7-F5, P4-7-F7, P4-8-F3, P3-7-F3, P3-7-F4, P3-1-F4, P3-1-F6 as **FIXED** with commit hashes
- [ ] Present Phase 3 checkpoint summary
