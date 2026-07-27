# Phase 6A — Fix Plan

> Branch: `fix/phase6a-quick-wins` | Base: `main` @ `f4a8ee9`
> TDD mandatory. One commit per fix.

---

## Task 1: P0-1-F3 — Fix audit userId in email-based password reset

**Files:**
- Modify: `packages/backend/src/routes/auth.ts:1029`
- Test: `packages/backend/src/routes/auth-reset-audit.test.ts` (NEW)

**Steps:**
- [ ] Write test: read auth.ts source, assert `record.user_id` (not `record.userId`) near `password_reset` auditLog call
- [ ] Run test, confirm FAIL
- [ ] Fix: change `record.userId` → `record.user_id` on line 1029
- [ ] Run test, confirm PASS
- [ ] Run full suite: `cd packages/backend && npx vitest run`
- [ ] Commit

**Effort:** 15 min

---

## Task 2: P0-3-F5 — Add length validation to decrypt-secret

**Files:**
- Modify: `packages/backend/src/lib/decrypt-secret.ts`
- Test: `packages/backend/src/lib/decrypt-secret.test.ts` (NEW)

**Steps:**
- [ ] Write test: call `decryptSecret("short", "pin")` → expect throw "too short"
- [ ] Write test: call `decryptSecret("", "pin")` → expect throw
- [ ] Write test: call with valid-length but garbage base64 → expect throw (bad decrypt, not CPU burn)
- [ ] Run tests, confirm FAIL
- [ ] Fix: add guards before PBKDF2:
  ```typescript
  if (!encrypted || encrypted.length < 60) {
    throw new Error("Encrypted data too short or missing");
  }
  const combined = Buffer.from(encrypted, "base64");
  if (combined.length < SALT_LENGTH + IV_LENGTH + 17) {
    throw new Error("Encrypted data too short or corrupted");
  }
  ```
- [ ] Run tests, confirm PASS
- [ ] Run full suite
- [ ] Commit

**Effort:** 1-2 hours

---

## Task 3: P0-3-F9 — Exclude encryptedSecret from localStorage persist

**Files:**
- Modify: `packages/web-app/src/store/wallet.ts:453-461` (partialize config)
- Test: `packages/web-app/src/store/wallet-persist.test.ts` (NEW)

**Steps:**
- [ ] Write test: read wallet.ts source, assert `partialize` strips encryptedSecret from accounts
- [ ] Run test, confirm FAIL
- [ ] Fix: update partialize to map accounts excluding encryptedSecret:
  ```typescript
  partialize: (state) => ({
    accounts: state.accounts.map(({ encryptedSecret, ...rest }) => rest),
    activeAccountId: state.activeAccountId,
  }),
  ```
- [ ] Run test, confirm PASS
- [ ] Run full suite (frontend build test: `cd packages/web-app && npx tsc --noEmit`)
- [ ] Commit

**Effort:** 2-3 hours

---

## Task 4: P0-3-F10 — Remove mnemonic from localStorage

**Files:**
- Modify: `packages/web-app/src/store/wallet.ts:253-254, 317-318`
- Test: `packages/web-app/src/store/wallet-mnemonic.test.ts` (NEW)

**Steps:**
- [ ] Write test: read wallet.ts source, assert no `localStorage.setItem.*mnemonic` calls
- [ ] Run test, confirm FAIL
- [ ] Fix: remove both `localStorage.setItem("mnemonic_*")` calls (lines 253-254, 317-318)
- [ ] Keep cleanup calls (`localStorage.removeItem`) — they handle migration for existing users
- [ ] Run test, confirm PASS
- [ ] Run full suite
- [ ] Commit

**Effort:** 1-2 hours

---

## Post-Fix Checklist
- [ ] All 4 tests pass
- [ ] Full backend suite: 377+ tests passing
- [ ] FINDINGS.md updated for all 4 findings
- [ ] FIX_PLAN_PHASE6A.md tasks checked off
- [ ] Branch NOT merged to main (pending review)
