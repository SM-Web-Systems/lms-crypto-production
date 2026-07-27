# Phase 5D — Defense-in-Depth Implementation Plan

> **For agentic workers:** Use executing-plans to implement task-by-task. Steps use checkbox (`- [x]`) syntax.

**Goal:** Fix 6 remaining Tier 2 security findings (defense-in-depth hardening).

**Architecture:** Minimal, targeted fixes — each finding gets a failing test first (TDD), then the smallest code change that makes the test pass.

**Tech Stack:** TypeScript, Fastify, Vitest, Stellar SDK, Docker

## Global Constraints

- Branch: `fix/phase5a-critical-security` (do NOT merge to main)
- One commit per fix, referencing finding ID
- TDD mandatory: no test → no commit
- Run full `npx vitest run` after each fix
- Update FINDINGS.md with FIXED marker + commit hash after each fix

## Pre-Flight: Already Fixed (Skip)

| Item | Finding | Status |
|------|---------|--------|
| T2-12 | P0-2-F4 (ADMIN_JWT_SECRET guard) | FIXED in af098e9 (Phase 5B) |
| T2-13 | P2-4-F1/F2 (secret defaults) | FIXED in af098e9 (Phase 5B) |
| T2-15 | P1-4-F2 (SSO_SECRET validation) | FIXED in af098e9 (Phase 5B) |

---

### Task 1: P0-1-F10 — Logout must revoke all user tokens when refreshToken omitted

**Files:**
- Modify: `packages/backend/src/routes/auth.ts` (logout handler, ~line 600)
- Test: `packages/backend/src/routes/logout-revoke.test.ts` (NEW)

**Interfaces:**
- Consumes: `revokeAllUserTokens(userId)` from `lib/auth.ts` (already exists)
- Produces: Logout handler always revokes (either single token or all user tokens)

**Effort:** Small

- [x] **Step 1: Write failing test**

```typescript
// logout-revoke.test.ts — source assertion
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const authSrc = readFileSync(join(__dirname, "auth.ts"), "utf-8");

describe("Logout token revocation (P0-1-F10)", () => {
  it("calls revokeAllUserTokens when refreshToken is missing", () => {
    // The else branch should call revokeAllUserTokens
    expect(authSrc).toContain("revokeAllUserTokens");
    // Verify it's in the logout handler context
    const logoutIdx = authSrc.indexOf("/api/v1/auth/logout");
    const nextRouteIdx = authSrc.indexOf("app.", logoutIdx + 1);
    const logoutHandler = authSrc.substring(logoutIdx, nextRouteIdx > 0 ? nextRouteIdx : logoutIdx + 1000);
    expect(logoutHandler).toContain("revokeAllUserTokens");
  });
});
```

- [x] **Step 2: Run test, verify failure**
Run: `npx vitest run src/routes/logout-revoke.test.ts`
Expected: FAIL — revokeAllUserTokens not in logout handler

- [x] **Step 3: Implement fix**
In auth.ts logout handler, change:
```typescript
if (refreshToken) {
  await revokeRefreshToken(refreshToken);
}
```
to:
```typescript
if (refreshToken) {
  await revokeRefreshToken(refreshToken);
} else {
  await revokeAllUserTokens(userId);
}
```

- [x] **Step 4: Run test, verify pass**
Run: `npx vitest run src/routes/logout-revoke.test.ts`

- [x] **Step 5: Run full suite**
Run: `npx vitest run` (in packages/backend)

- [x] **Step 6: Commit**
```bash
git add packages/backend/src/routes/auth.ts packages/backend/src/routes/logout-revoke.test.ts
git commit -m "fix(P0-1-F10): revoke all user tokens when logout called without refreshToken"
```

---

### Task 2: P0-3-F6 — Ignore client networkPassphrase in sign-and-submit

**Files:**
- Modify: `packages/backend/src/server.ts` (~line 1428)
- Test: `packages/backend/src/routes/sign-submit-passphrase.test.ts` (NEW)

**Interfaces:**
- Consumes: `stellarClient.networkPassphrase` (server-configured)
- Produces: sign-and-submit always uses server passphrase, ignores client value

**Effort:** Small

- [x] **Step 1: Write failing test**

```typescript
// sign-submit-passphrase.test.ts — source assertion
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const serverSrc = readFileSync(join(__dirname, "..", "server.ts"), "utf-8");

describe("sign-and-submit networkPassphrase (P0-3-F6)", () => {
  it("does not use clientPassphrase or client-supplied networkPassphrase", () => {
    // After fix, the server should NOT have a fallback to clientPassphrase
    expect(serverSrc).not.toContain("clientPassphrase || ");
    expect(serverSrc).not.toContain("clientPassphrase ||");
  });
});
```

- [x] **Step 2: Run test, verify failure**
- [x] **Step 3: Implement fix**
In server.ts, change:
```typescript
const passphrase = clientPassphrase || stellarClient.networkPassphrase;
```
to:
```typescript
const passphrase = stellarClient.networkPassphrase;
```
Also remove `networkPassphrase` from the body schema properties and from the destructuring.

- [x] **Step 4-6: Run test, full suite, commit**

---

### Task 3: P0-3-F8 — Activate-wallet: verify target exists before deactivating all

**Files:**
- Modify: `packages/backend/src/routes/wallets.ts` (activate handler, ~line 272-302)
- Test: `packages/backend/src/routes/wallet-activate.test.ts` (NEW)

**Interfaces:**
- Produces: Activate handler checks target ownership before deactivating all wallets

**Effort:** Small

- [x] **Step 1: Write failing test**

```typescript
// wallet-activate.test.ts — source assertion
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const walletsSrc = readFileSync(join(__dirname, "wallets.ts"), "utf-8");

describe("Activate wallet — verify before deactivate (P0-3-F8)", () => {
  it("selects/verifies target wallet before deactivating all", () => {
    const activateIdx = walletsSrc.indexOf("activate");
    const handlerSection = walletsSrc.substring(activateIdx, activateIdx + 1500);
    // The select (verify) should come before the update (deactivate-all)
    const selectIdx = handlerSection.indexOf(".select(");
    const deactivateIdx = handlerSection.indexOf("isActive: false");
    expect(selectIdx).toBeGreaterThan(-1);
    expect(deactivateIdx).toBeGreaterThan(selectIdx);
  });
});
```

- [x] **Step 2-6: Run test (fail), implement fix, run test (pass), full suite, commit**

Fix: Reorder — select target first to verify it exists and belongs to user, then deactivate all, then activate target. Wrap in transaction.

---

### Task 4: P0-4-F4 — StrKey validation on Send.tsx

**Files:**
- Modify: `packages/web-app/src/pages/Send.tsx` (~line 33)
- Test: `packages/web-app/src/pages/Send.test.ts` (NEW)

**Interfaces:**
- Consumes: `StellarSdk.StrKey.isValidEd25519PublicKey()` (already available via import)
- Produces: Send handler validates destination with proper checksum check

**Effort:** Small

- [x] **Step 1: Write failing test**

```typescript
// Send.test.ts — source assertion
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const sendSrc = readFileSync(join(__dirname, "Send.tsx"), "utf-8");

describe("Send.tsx destination validation (P0-4-F4)", () => {
  it("uses StrKey.isValidEd25519PublicKey instead of prefix+length check", () => {
    expect(sendSrc).toContain("isValidEd25519PublicKey");
    // Should NOT have the old naive check
    expect(sendSrc).not.toContain('startsWith("G")');
  });
});
```

- [x] **Step 2-6: Run test (fail), implement fix, run test (pass), full suite, commit**

Fix: Replace `!destination.startsWith("G") || destination.length !== 56` with `!StellarSdk.StrKey.isValidEd25519PublicKey(destination)`.

---

### Task 5: P4-8-F6/F7 — Create .dockerignore

**Files:**
- Create: `packages/backend/.dockerignore` (NEW)
- Test: `packages/backend/src/docker/dockerignore.test.ts` (NEW)

**Interfaces:**
- Produces: .dockerignore that excludes .env, node_modules, .git, test files, docs

**Effort:** Small

- [x] **Step 1: Write failing test**

```typescript
// dockerignore.test.ts — file existence + content assertion
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const dockerignorePath = join(__dirname, "..", "..", ".dockerignore");

describe(".dockerignore (P4-8-F6/F7)", () => {
  it("exists", () => {
    expect(existsSync(dockerignorePath)).toBe(true);
  });

  it("excludes .env files", () => {
    const content = readFileSync(dockerignorePath, "utf-8");
    expect(content).toContain(".env");
  });

  it("excludes node_modules", () => {
    const content = readFileSync(dockerignorePath, "utf-8");
    expect(content).toContain("node_modules");
  });

  it("excludes .git", () => {
    const content = readFileSync(dockerignorePath, "utf-8");
    expect(content).toContain(".git");
  });
});
```

- [x] **Step 2-6: Run test (fail), create .dockerignore, run test (pass), full suite, commit**

---

### Task 6: P2-1-F3 — Rate limit trustline POST routes

**Files:**
- Modify: `packages/backend/src/routes/trustlines.ts` (3 POST routes)
- Test: `packages/backend/src/routes/trustlines-ratelimit.test.ts` (NEW)

**Interfaces:**
- Produces: All 3 POST trustline routes have `config: { rateLimit: { max: 10, timeWindow: "1 minute" } }`

**Effort:** Small

- [x] **Step 1: Write failing test**

```typescript
// trustlines-ratelimit.test.ts — source assertion
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "trustlines.ts"), "utf-8");

describe("Trustline POST rate limiting (P2-1-F3)", () => {
  it("trustlines/add has rateLimit config", () => {
    const addIdx = src.indexOf("trustlines/add");
    const section = src.substring(addIdx, addIdx + 300);
    expect(section).toContain("rateLimit");
  });

  it("trustlines/remove has rateLimit config", () => {
    const removeIdx = src.indexOf("trustlines/remove");
    const section = src.substring(removeIdx, removeIdx + 300);
    expect(section).toContain("rateLimit");
  });

  it("trustlines/update-limit has rateLimit config", () => {
    const updateIdx = src.indexOf("trustlines/update-limit");
    const section = src.substring(updateIdx, updateIdx + 300);
    expect(section).toContain("rateLimit");
  });
});
```

- [x] **Step 2-6: Run test (fail), add rateLimit config to each POST route, run test (pass), full suite, commit**

---

## Summary

| Task | Finding | Description | Effort |
|------|---------|-------------|--------|
| 1 | P0-1-F10 | Logout revoke-all fallback | Small |
| 2 | P0-3-F6 | Remove client networkPassphrase | Small |
| 3 | P0-3-F8 | Activate-wallet verify-first | Small |
| 4 | P0-4-F4 | StrKey validation on Send.tsx | Small |
| 5 | P4-8-F6/F7 | Create .dockerignore | Small |
| 6 | P2-1-F3 | Rate limit trustline POSTs | Small |
