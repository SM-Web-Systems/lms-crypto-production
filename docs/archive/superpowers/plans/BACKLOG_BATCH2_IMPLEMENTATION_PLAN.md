# Backlog Batch 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 deferred findings — input validation, rate limiting, memory bounds, observability

**Architecture:** All fixes are backend-only, touching route handlers, middleware, and library code. No schema changes, no frontend changes.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, vitest, @stellar/stellar-sdk

## Global Constraints

- Branch: `fix/backlog-batch2` from `main` at `461bada`
- Tests baseline: 410/410 passing
- One commit per fix, format: `fix(module): description (Finding-ID)`
- All commits include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- TDD for behavioral changes, source-assertion for config/logging changes
- Full backend suite after each fix
- No frontend changes, no stub module changes, no schema migrations

---

### Task 1: Setup

**Files:**
- None (git operations only)

- [ ] **Step 1: Create branch**
```bash
cd /home/webadmin/web-stack/html/amma-wallet
git checkout main
git checkout -b fix/backlog-batch2
```

- [ ] **Step 2: Verify baseline**
```bash
cd packages/backend && npx vitest run
```
Expected: 410/410 passing

---

### Task 2: Fix 10 — P2-7-F4 — Capture userAgent in audit log calls

**Files:**
- Modify: `packages/backend/src/routes/auth.ts` — 10 auditLog call sites
- Modify: `packages/backend/src/server.ts` — 2 auditLog call sites
- Modify: `packages/backend/src/routes/admin.ts` — 9 auditLog call sites
- Test: `packages/backend/src/routes/audit-useragent.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/backend/src/routes/audit-useragent.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("P2-7-F4: userAgent in audit log calls", () => {
  const backendSrc = path.join(__dirname, "..");

  it("auth.ts auditLog calls include userAgent", () => {
    const source = fs.readFileSync(path.join(backendSrc, "routes/auth.ts"), "utf-8");
    // Find all auditLog( calls and check they include userAgent
    const auditCalls = source.match(/auditLog\([^)]*\{[^}]*\}/gs) || [];
    const authCalls = auditCalls.filter(c => !c.includes("// no-request"));
    // At least 8 auth calls should have userAgent
    const withUserAgent = authCalls.filter(c => c.includes("userAgent"));
    expect(withUserAgent.length).toBeGreaterThanOrEqual(8);
  });

  it("server.ts auditLog calls include userAgent", () => {
    const source = fs.readFileSync(path.join(backendSrc, "server.ts"), "utf-8");
    const auditCalls = source.match(/auditLog\([^)]*\{[^}]*\}/gs) || [];
    const withUserAgent = auditCalls.filter(c => c.includes("userAgent"));
    expect(withUserAgent.length).toBeGreaterThanOrEqual(2);
  });

  it("admin.ts auditLog calls include userAgent", () => {
    const source = fs.readFileSync(path.join(backendSrc, "routes/admin.ts"), "utf-8");
    const auditCalls = source.match(/auditLog\([^)]*\{[^}]*\}/gs) || [];
    const withUserAgent = auditCalls.filter(c => c.includes("userAgent"));
    expect(withUserAgent.length).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
npx vitest run src/routes/audit-useragent.test.ts
```
Expected: FAIL — no auditLog calls currently include userAgent

- [ ] **Step 3: Add userAgent to all auditLog call sites**

At each `auditLog(` call in auth.ts, server.ts, and admin.ts where `request` is in scope, add:
```typescript
userAgent: request.headers["user-agent"]
```

- [ ] **Step 4: Run test to verify it passes**
```bash
npx vitest run src/routes/audit-useragent.test.ts
```
Expected: PASS

- [ ] **Step 5: Run full suite and commit**
```bash
npx vitest run
git add -A && git commit -m "fix(audit): capture userAgent in audit log calls (P2-7-F4)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Fix 9 — P4-7-F2 — MemoryCache max size bound

**Files:**
- Modify: `packages/backend/src/lib/cache.ts`
- Test: `packages/backend/src/lib/cache.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/backend/src/lib/cache.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("P4-7-F2: MemoryCache max size bound", () => {
  it("MemoryCache has a maxSize property", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "cache.ts"), "utf-8"
    );
    expect(source).toMatch(/maxSize\s*[=:]\s*\d+/);
  });

  it("set() method checks size before inserting", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "cache.ts"), "utf-8"
    );
    // The set method should reference maxSize
    const setMethod = source.match(/async set\([^{]*\{[\s\S]*?^\s{2}\}/m)?.[0] || "";
    expect(setMethod).toContain("maxSize");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement maxSize bound in cache.ts**

Add `private readonly maxSize = 500;` and size check in `set()`:
```typescript
async set(key: string, value: unknown, ttlSeconds: number = 300): Promise<void> {
  if (this.store.size >= this.maxSize) {
    this.evict();
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
  }
  this.store.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run full suite and commit**
```bash
git commit -m "fix(cache): bound MemoryCache size to 500 entries (P4-7-F2)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Fix 5 — P1-3-F2 — unsuspend() defensive guard

**Files:**
- Modify: `packages/backend/src/jobs/auto-suspension.ts:44-51`
- Test: `packages/backend/src/jobs/auto-suspension-guard.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("P1-3-F2: unsuspend() defensive guard", () => {
  it("unsuspend WHERE clause includes suspensionReason guard", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "auto-suspension.ts"), "utf-8"
    );
    // Extract the unsuspend function
    const unsuspendFn = source.match(/async function unsuspend[\s\S]*?^\}/m)?.[0] || "";
    expect(unsuspendFn).toContain("suspensionReason");
    expect(unsuspendFn).toMatch(/inArray|IN\s*\(/i);
  });

  it("unsuspend checks tenant is actually suspended", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "auto-suspension.ts"), "utf-8"
    );
    const unsuspendFn = source.match(/async function unsuspend[\s\S]*?^\}/m)?.[0] || "";
    expect(unsuspendFn).toContain("isNotNull");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add defensive WHERE clause to unsuspend()**

```typescript
import { and, eq, isNotNull, inArray } from "drizzle-orm";

async function unsuspend(tenantId: number): Promise<void> {
  const now = new Date();
  await db
    .update(schema.tenants)
    .set({ suspendedAt: null, suspensionReason: null, updatedAt: now })
    .where(
      and(
        eq(schema.tenants.id, tenantId),
        isNotNull(schema.tenants.suspendedAt),
        inArray(schema.tenants.suspensionReason, ["debt_limit", "maintenance_grace_expired"]),
      ),
    );
}
```

- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run full suite and commit**

---

### Task 5: Fix 3 — P2-2-F2 — TOML image URL scheme validation

**Files:**
- Modify: `packages/backend/src/lib/toml-sync.ts:62-87`
- Test: `packages/backend/src/lib/toml-sync-url.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("P2-2-F2: TOML image URL scheme validation", () => {
  const source = fs.readFileSync(path.join(__dirname, "toml-sync.ts"), "utf-8");

  it("isValidImageUrl helper exists", () => {
    expect(source).toContain("isValidImageUrl");
  });

  it("imageUrl DB write is guarded by isValidImageUrl", () => {
    // The imageUrl write path should check isValidImageUrl before db.update
    expect(source).toMatch(/isValidImageUrl\(imageUrl\)/);
  });

  it("orgLogo DB write is also guarded", () => {
    expect(source).toMatch(/isValidImageUrl\(orgLogoMatch/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add isValidImageUrl helper and apply to both paths**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run full suite and commit**

---

### Task 6: Fix 4 — P2-2-F3 — Icon download max file size

**Files:**
- Modify: `packages/backend/src/lib/icon-resolver.ts` — two download paths
- Test: `packages/backend/src/lib/icon-resolver-size.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("P2-2-F3: Icon download max file size", () => {
  const source = fs.readFileSync(path.join(__dirname, "icon-resolver.ts"), "utf-8");

  it("MAX_ICON_SIZE constant exists", () => {
    expect(source).toMatch(/MAX_ICON_SIZE\s*=\s*512\s*\*\s*1024/);
  });

  it("resolveIcon download path checks size", () => {
    // After Buffer.from, should check buffer.length > MAX_ICON_SIZE
    expect(source).toMatch(/buffer\.length\s*>\s*MAX_ICON_SIZE/);
  });

  it("syncAllIcons download path checks size", () => {
    expect(source).toMatch(/buf\.length\s*>\s*MAX_ICON_SIZE/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add MAX_ICON_SIZE and size checks to both download paths**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run full suite and commit**

---

### Task 7: Fix 6 — P3-6-F4 — Rate limit contacts CRUD

**Files:**
- Modify: `packages/backend/src/routes/contacts.ts` — 4 endpoints
- Test: `packages/backend/src/routes/contacts-ratelimit.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("P3-6-F4: Contacts CRUD rate limiting", () => {
  const source = fs.readFileSync(path.join(__dirname, "contacts.ts"), "utf-8");

  it("all 4 contact endpoints have rateLimit config", () => {
    // Count rateLimit occurrences — should be 4 (GET, POST, PATCH, DELETE)
    const matches = source.match(/rateLimit/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it("rate limit is 30 per minute", () => {
    expect(source).toMatch(/max:\s*30/);
    expect(source).toMatch(/timeWindow.*1 minute|timeWindow.*60/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add config.rateLimit to all 4 contact endpoints**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run full suite and commit**

---

### Task 8: Fix 7 — P3-8-F3 — Rate limit /push/test

**Files:**
- Modify: `packages/backend/src/routes/push.ts:127-183`
- Test: `packages/backend/src/routes/push-ratelimit.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("P3-8-F3: /push/test rate limit", () => {
  const source = fs.readFileSync(path.join(__dirname, "push.ts"), "utf-8");

  it("/push/test route includes rateLimit config", () => {
    // Find the /push/test route block and check for rateLimit
    const testRoute = source.match(/push\/test[\s\S]*?async/)?.[0] || "";
    expect(testRoute).toContain("rateLimit");
  });

  it("rate limit is 5 per 15 minutes", () => {
    expect(source).toMatch(/max:\s*5/);
    expect(source).toMatch(/timeWindow.*15 minute/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add config.rateLimit to /push/test endpoint**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run full suite and commit**

---

### Task 9: Fix 8 — P3-9-F2 — Rate limit + auth on /curated/seed

**Files:**
- Modify: `packages/backend/src/routes/curated-tokens.ts:72-138`
- Test: `packages/backend/src/routes/curated-tokens-auth.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("P3-9-F2: /curated/seed auth + rate limit", () => {
  const source = fs.readFileSync(path.join(__dirname, "curated-tokens.ts"), "utf-8");

  it("/curated/seed has authMiddleware", () => {
    // Find the seed POST route and check for authMiddleware
    const seedRoute = source.match(/curated\/seed[\s\S]*?async/)?.[0] || "";
    expect(seedRoute).toContain("authMiddleware");
  });

  it("/curated/seed has rate limit", () => {
    const seedRoute = source.match(/curated\/seed[\s\S]*?async/)?.[0] || "";
    expect(seedRoute).toContain("rateLimit");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add preHandler and config.rateLimit to /curated/seed**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run full suite and commit**

---

### Task 10: Fix 1 — P2-1-F4 — Trustline input format validation

**Files:**
- Modify: `packages/backend/src/routes/trustlines.ts` — 5 endpoints
- Test: `packages/backend/src/routes/trustlines-validation.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("P2-1-F4: Trustline input validation", () => {
  const source = fs.readFileSync(path.join(__dirname, "trustlines.ts"), "utf-8");

  it("imports StrKey from stellar-sdk", () => {
    expect(source).toMatch(/StrKey/);
  });

  it("validates publicKey with StrKey.isValidEd25519PublicKey", () => {
    expect(source).toContain("isValidEd25519PublicKey");
  });

  it("validates assetCode with regex", () => {
    expect(source).toMatch(/validateAssetCode|[a-zA-Z0-9]\{1,12\}/);
  });

  it("returns 400 for invalid inputs", () => {
    const badKeyResponses = source.match(/400.*Invalid.*public key/gi) || [];
    expect(badKeyResponses.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add validation helpers and apply to all 5 endpoints**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run full suite and commit**

---

### Task 11: Fix 2 — P2-1-F5 — Error message sanitization

**Files:**
- Modify: `packages/backend/src/routes/trustlines.ts` — 5 catch blocks
- Test: `packages/backend/src/routes/trustlines-errors.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("P2-1-F5: Error message sanitization", () => {
  const source = fs.readFileSync(path.join(__dirname, "trustlines.ts"), "utf-8");

  it("no catch block sends raw error.message to client", () => {
    // Find all send({ error: ... }) patterns in catch blocks
    const catchBlocks = source.match(/catch[\s\S]*?(?=\n\s*(app\.|}\)|\Z))/g) || [];
    for (const block of catchBlocks) {
      // Should not contain send({ error: error.message }) — only "Internal server error"
      if (block.includes("send(") && block.includes("500")) {
        expect(block).not.toMatch(/send\(\{\s*error:\s*error\.message/);
      }
    }
  });

  it("catch blocks log the real error with console.warn", () => {
    const warnCalls = source.match(/console\.warn.*\[trustlines\]/g) || [];
    expect(warnCalls.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Replace error.message with "Internal server error" in 5 catch blocks**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run full suite and commit**

---

### Task 12: Post-Batch Verification

- [ ] **Step 1: Run full backend suite**
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run
```
Expected: 410 + N tests pass

- [ ] **Step 2: Run full web-app suite**
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app && npx vitest run
```
Expected: 23/23 pass

- [ ] **Step 3: Secret scan**
```bash
git diff main -- packages/backend/src/ | grep -iE "(password|secret|key|token|credential)" | grep -vE "(test|mock|StrKey|publicKey|assetCode|assetIssuer|user-agent|userAgent|rateLimit|authMiddleware|console\.|maxSize|MAX_ICON_SIZE|isValidImageUrl|suspensionReason)"
```
Expected: No secrets

- [ ] **Step 4: Update FINDINGS.md, CUMULATIVE_STATUS.md, TODO_LOW_PRIORITY.md**
- [ ] **Step 5: Write checkpoint report**
- [ ] **Step 6: Commit docs update**
