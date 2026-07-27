# Phase 6A — Fix Plan

> Branch: `fix/phase6a-quick-wins` | Base: `main` @ `f4a8ee9`
> TDD mandatory. One commit per fix.

---

## Task 1: P0-1-F3 — Fix audit userId in email-based password reset

**Files:**
- Modify: `packages/backend/src/routes/auth.ts:1029`
- Test: `packages/backend/src/routes/auth-reset-audit.test.ts` (NEW)

**Steps:**
- [x] Write test: read auth.ts source, assert `record.user_id` (not `record.userId`) near `password_reset` auditLog call
- [x] Run test, confirm FAIL
- [x] Fix: change `record.userId` → `record.user_id` on line 1029
- [x] Run test, confirm PASS
- [x] Run full suite: `cd packages/backend && npx vitest run`
- [x] Commit — `3eeb7f8`

**Effort:** 15 min

---

## Task 2: P0-3-F5 — Add length validation to decrypt-secret

**Files:**
- Modify: `packages/backend/src/lib/decrypt-secret.ts`
- Test: `packages/backend/src/lib/decrypt-secret.test.ts` (NEW)

**Steps:**
- [x] Write test: call `decryptSecret("short", "pin")` → expect throw "too short"
- [x] Write test: call `decryptSecret("", "pin")` → expect throw
- [x] Write test: call with valid-length but garbage base64 → expect throw (bad decrypt, not CPU burn)
- [x] Run tests, confirm FAIL
- [x] Fix: add guards before PBKDF2
- [x] Run tests, confirm PASS
- [x] Run full suite
- [x] Commit — `ff973af`

**Effort:** 1-2 hours

---

## Task 3: P0-3-F9 — Exclude encryptedSecret from localStorage persist

**Files:**
- Modify: `packages/web-app/src/store/wallet.ts:453-461` (partialize config)
- Test: `packages/web-app/src/store/wallet-persist.test.ts` (NEW)

**Steps:**
- [x] Write test: read wallet.ts source, assert `partialize` strips encryptedSecret from accounts
- [x] Run test, confirm FAIL
- [x] Fix: update partialize to map accounts excluding encryptedSecret
- [x] Run test, confirm PASS
- [x] Run full suite (frontend build test: `cd packages/web-app && npx tsc --noEmit`)
- [x] Commit — `c391799`

**Effort:** 2-3 hours

---

## Task 4: P0-3-F10 — Remove mnemonic from localStorage

**Files:**
- Modify: `packages/web-app/src/store/wallet.ts:253-254, 317-318`
- Test: `packages/web-app/src/store/wallet-mnemonic.test.ts` (NEW)

**Steps:**
- [x] Write test: read wallet.ts source, assert no `localStorage.setItem.*mnemonic` calls
- [x] Run test, confirm FAIL
- [x] Fix: remove both `localStorage.setItem("mnemonic_*")` calls
- [x] Keep cleanup calls (`localStorage.removeItem`) — they handle migration for existing users
- [x] Run test, confirm PASS
- [x] Run full suite
- [x] Commit — `59d1af7`

**Effort:** 1-2 hours

---

## Post-Fix Checklist
- [x] All 4 tests pass
- [x] Full backend suite: 382 tests passing
- [x] FINDINGS.md updated for all 4 findings
- [x] FIX_PLAN_PHASE6A.md tasks checked off
- [x] Branch NOT merged to main (pending review)
