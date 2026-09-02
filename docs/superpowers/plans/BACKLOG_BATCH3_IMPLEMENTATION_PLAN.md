# Backlog Batch 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10-12 deferred findings (2 HIGH, 3 MEDIUM, 5-7 LOW) from the AmmaWallet security audit backlog.

**Architecture:** Source-only fixes to existing backend modules. No migrations, no schema changes, no frontend changes. TDD with source-assertion tests for config/guard changes.

**Tech Stack:** Node.js, Fastify, Drizzle ORM, vitest, @stellar/stellar-sdk

## Global Constraints

- Branch: `fix/backlog-batch3` from `main`
- Backend only — zero frontend changes
- No stub module changes (Earn/Fiat/MoneyGram)
- TDD: test FAIL → implement → test PASS → full suite → commit
- Commit format: `fix(module): description (Finding-ID)\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- No new `as any` casts in non-test source
- No secrets in source
- Deferral gate after Fix 10 for Fixes 11-12

---

### Task 1: Setup

**Files:**
- None (branch creation only)

- [ ] **Step 1: Create branch**
```bash
cd /home/webadmin/web-stack/html/amma-wallet
git checkout main && git checkout -b fix/backlog-batch3
```

- [ ] **Step 2: Verify baseline**
```bash
cd packages/backend && npx vitest run
```
Expected: 453/453 PASS

---

### Task 2: Fix 1 — P3-8-F1 Push Subscription Takeover (HIGH)

**Files:**
- Modify: `packages/backend/src/routes/push.ts:72-84`
- Test: `packages/backend/src/routes/push-takeover.test.ts`

**Interfaces:**
- Consumes: `pushSubscriptions` schema, `eq` from drizzle-orm
- Produces: Secure upsert — no userId overwrite on conflict

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/routes/push-takeover.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("P3-8-F1: Push subscription takeover guard", () => {
  const filePath = path.resolve(__dirname, "push.ts");
  const source = fs.readFileSync(filePath, "utf-8");

  // Find the onConflictDoUpdate block
  const conflictIdx = source.indexOf("onConflictDoUpdate");
  const conflictBlock = source.slice(conflictIdx, conflictIdx + 300);

  it("does not include userId in onConflictDoUpdate set clause", () => {
    // The set: { } block should NOT contain userId
    const setMatch = conflictBlock.match(/set:\s*\{([^}]+)\}/);
    expect(setMatch).toBeTruthy();
    expect(setMatch![1]).not.toContain("userId");
  });

  it("has a WHERE guard on the conflict update", () => {
    expect(conflictBlock).toContain("where:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd packages/backend && npx vitest run src/routes/push-takeover.test.ts
```
Expected: FAIL — userId IS in set clause, no WHERE guard

- [ ] **Step 3: Implement the fix**

In `packages/backend/src/routes/push.ts`, change the onConflictDoUpdate block:

**Before:**
```typescript
.onConflictDoUpdate({
  target: pushSubscriptions.endpoint,
  set: { p256dh: keys.p256dh, auth: keys.auth, userId: user.id },
});
```

**After:**
```typescript
.onConflictDoUpdate({
  target: pushSubscriptions.endpoint,
  set: { p256dh: keys.p256dh, auth: keys.auth },
  where: eq(pushSubscriptions.userId, user.id),
});
```

Ensure `eq` is imported from `drizzle-orm` (should already be available).

- [ ] **Step 4: Run test to verify it passes**
```bash
cd packages/backend && npx vitest run src/routes/push-takeover.test.ts
```
Expected: PASS

- [ ] **Step 5: Run full suite**
```bash
cd packages/backend && npx vitest run
```
Expected: 453 + 2 = 455 PASS

- [ ] **Step 6: Commit**
```bash
cd /home/webadmin/web-stack/html/amma-wallet
git add packages/backend/src/routes/push.ts packages/backend/src/routes/push-takeover.test.ts
git commit -m "$(cat <<'EOF'
fix(push): prevent subscription takeover via conflict update (P3-8-F1)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Fix 2 — P3-9-F1 Curated Seed Admin Guard (HIGH)

**Files:**
- Modify: `packages/backend/src/routes/curated-tokens.ts:76-141`
- Test: `packages/backend/src/routes/curated-tokens-admin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/routes/curated-tokens-admin.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("P3-9-F1: Curated seed admin-only guard", () => {
  const filePath = path.resolve(__dirname, "curated-tokens.ts");
  const source = fs.readFileSync(filePath, "utf-8");

  const seedIdx = source.indexOf('"/api/v1/tokens/curated/seed"');
  const seedBlock = source.slice(seedIdx, seedIdx + 500);

  it("has admin role check in seed handler", () => {
    // Should check for admin role — either request.admin, requireAdmin, or role check
    expect(seedBlock).toMatch(/request\.admin|requireAdmin|admin.*role|PRIVILEGED_ROLES/i);
  });

  it("returns 403 for non-admin users", () => {
    expect(seedBlock).toContain("403");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement** — Add admin check inside the seed handler after authMiddleware
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run full suite**
- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/curated-tokens.ts packages/backend/src/routes/curated-tokens-admin.test.ts
git commit -m "$(cat <<'EOF'
fix(curated): restrict /curated/seed to admin role (P3-9-F1)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Fix 3 — P3-6-F3 Contacts PATCH Injection (MEDIUM)

**Files:**
- Modify: `packages/backend/src/routes/contacts.ts:93-110`
- Test: `packages/backend/src/routes/contacts-patch-injection.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("P3-6-F3: Contacts PATCH injection guard", () => {
  const filePath = path.resolve(__dirname, "contacts.ts");
  const source = fs.readFileSync(filePath, "utf-8");

  it("has additionalProperties: false on PATCH body schema", () => {
    // Find the PATCH route schema
    const patchIdx = source.indexOf("patch(");
    const patchBlock = source.slice(patchIdx, patchIdx + 400);
    expect(patchBlock).toContain("additionalProperties");
  });
});
```

- [ ] **Step 2-6:** TDD cycle + commit

```bash
git commit -m "$(cat <<'EOF'
fix(contacts): prevent PATCH body injection via additionalProperties (P3-6-F3)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Fix 4 — P1-3-F3 Auto-Suspension Concurrency (MEDIUM)

**Files:**
- Modify: `packages/backend/src/jobs/auto-suspension.ts:321-333`
- Test: `packages/backend/src/jobs/auto-suspension-concurrency.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("P1-3-F3: Auto-suspension concurrency guard", () => {
  const filePath = path.resolve(__dirname, "auto-suspension.ts");
  const source = fs.readFileSync(filePath, "utf-8");

  it("has isRunning guard variable", () => {
    expect(source).toMatch(/let\s+isRunning/);
  });

  it("checks isRunning before executing", () => {
    expect(source).toContain("if (isRunning)");
  });

  it("clears isRunning in finally block", () => {
    expect(source).toMatch(/finally\s*\{[\s\S]*?isRunning\s*=\s*false/);
  });
});
```

- [ ] **Step 2-6:** TDD cycle + commit

```bash
git commit -m "$(cat <<'EOF'
fix(jobs): add concurrency guard to auto-suspension job (P1-3-F3)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Fix 5 — P3-6-F2 Contacts Address Validation (MEDIUM)

**Files:**
- Modify: `packages/backend/src/routes/contacts.ts`
- Test: `packages/backend/src/routes/contacts-address-validation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("P3-6-F2: Contacts Stellar address validation", () => {
  const filePath = path.resolve(__dirname, "contacts.ts");
  const source = fs.readFileSync(filePath, "utf-8");

  it("imports StrKey or uses isValidEd25519PublicKey", () => {
    expect(source).toMatch(/StrKey|isValidEd25519PublicKey/);
  });

  it("validates address in POST handler", () => {
    const postIdx = source.indexOf(".post(");
    const postBlock = source.slice(postIdx, postIdx + 600);
    expect(postBlock).toMatch(/isValidEd25519PublicKey|StrKey/);
  });
});
```

- [ ] **Step 2-6:** TDD cycle + commit

```bash
git commit -m "$(cat <<'EOF'
fix(contacts): validate Stellar address with StrKey (P3-6-F2)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Fix 6 — P3-7-F11 Email Code Invalidation (LOW)

**Files:**
- Modify: `packages/backend/src/routes/two-fa.ts`
- Test: `packages/backend/src/routes/two-fa-code-invalidation.test.ts`

- [ ] **Step 1: Write the failing test** — Assert `used: true` UPDATE appears before each email code INSERT (3 sites)
- [ ] **Step 2-6:** TDD cycle + commit

```bash
git commit -m "$(cat <<'EOF'
fix(2fa): invalidate old email codes on re-send (P3-7-F11)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Fix 7 — P3-8-F4 Push Subscription Limit (LOW)

**Files:**
- Modify: `packages/backend/src/routes/push.ts`
- Test: `packages/backend/src/routes/push-subscription-limit.test.ts`

- [ ] **Step 1: Write the failing test** — Assert COUNT check exists before INSERT
- [ ] **Step 2-6:** TDD cycle + commit

```bash
git commit -m "$(cat <<'EOF'
fix(push): limit subscriptions to 10 per user (P3-8-F4)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Fix 8 — P1-3-F1 acquisitionModeEnabled (LOW)

**Files:**
- Modify: `packages/backend/src/jobs/auto-suspension.ts`
- Test: `packages/backend/src/jobs/auto-suspension-acquisition.test.ts`

- [ ] **Step 1: Write the failing test** — Assert `acquisitionModeEnabled` in enforceDebtLimit query
- [ ] **Step 2-6:** TDD cycle + commit

```bash
git commit -m "$(cat <<'EOF'
fix(jobs): check acquisitionModeEnabled in debt limit enforcement (P1-3-F1)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Fix 9 — P3-7-F10 TOTP Window (LOW)

**Files:**
- Modify: `packages/backend/src/routes/two-fa.ts`
- Test: `packages/backend/src/routes/two-fa-window.test.ts`

- [ ] **Step 1: Write the failing test** — Assert `window: 1` (not `window: 2`) at verification sites
- [ ] **Step 2-6:** TDD cycle + commit

```bash
git commit -m "$(cat <<'EOF'
fix(2fa): reduce TOTP verification window from 2 to 1 (P3-7-F10)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Fix 10 — P0-2-F3 CREDIT_ROLES Rename (LOW)

**Files:**
- Modify: `packages/backend/src/routes/admin.ts`
- Test: `packages/backend/src/routes/admin-roles-naming.test.ts`

- [ ] **Step 1: Write the failing test** — Assert `PRIVILEGED_ROLES` exists, `CREDIT_ROLES` does not
- [ ] **Step 2-6:** TDD cycle + commit

```bash
git commit -m "$(cat <<'EOF'
fix(admin): rename CREDIT_ROLES to PRIVILEGED_ROLES (P0-2-F3)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Deferral Gate

After Task 11, assess whether to proceed with Tasks 12-13 (Fixes 11-12).

Decision criteria:
- Time budget remaining (> 30 min needed for each)
- Risk appetite (Fix 12 touches billing critical path)
- Session stability

If deferred, skip to Task 14 (Post-Batch).

---

### Task 12: Fix 11 — P0-1-F14 Password Complexity (MEDIUM) [deferrable]

**Files:**
- Create: `packages/backend/src/lib/password-validation.ts`
- Modify: `packages/backend/src/routes/auth.ts`
- Test: `packages/backend/src/lib/password-validation.test.ts`
- Test: `packages/backend/src/routes/password-complexity.test.ts`

- [ ] **Step 1: Write unit test for validator**
- [ ] **Step 2: Implement `validatePasswordStrength()`**
- [ ] **Step 3: Write source-assertion test for call-site coverage**
- [ ] **Step 4: Apply at register, change-password, SMS password-reset**
- [ ] **Step 5: Full suite + commit**

---

### Task 13: Fix 12 — P1-2-F2 Billing TOCTOU (MEDIUM) [deferrable]

**Files:**
- Modify: `packages/backend/src/services/billing.service.ts`
- Modify: `packages/backend/src/routes/wallets.ts`
- Test: `packages/backend/src/services/billing-concurrent.test.ts`

- [ ] **Step 1: Write concurrent billing test**
- [ ] **Step 2: Add `checkWalletBillingTx(tx, opts)` with FOR UPDATE**
- [ ] **Step 3: Update wallets.ts transaction block**
- [ ] **Step 4: Full suite + commit**

---

### Task 14: Post-Batch

- [ ] Run full backend test suite
- [ ] Run full web-app test suite
- [ ] Run secret scan
- [ ] Update FINDINGS.md
- [ ] Update CUMULATIVE_STATUS.md
- [ ] Update TODO_LOW_PRIORITY.md
- [ ] Write checkpoint report
- [ ] Document deferral gate outcome
- [ ] Recommend Batch 4 scope (if applicable)
