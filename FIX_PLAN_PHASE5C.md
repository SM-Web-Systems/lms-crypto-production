# Phase 5C — Audit Trail + Data Integrity Fix Plan

> Branch: `fix/phase5a-critical-security` (continuing from Phase 5B)
> Baseline: 344 tests, 0 failures

---

### Task 1: T1-9 — Double platform fee on swaps (P0-4-F18)

**Files:**
- Modify: `packages/web-app/src/pages/Swap.tsx:117-137`
- Test: `packages/web-app/src/pages/Swap.tsx` (source assertion)

**Fix:** Remove frontend fee injection from Swap.tsx. Backend `/swap/build` is the single source of truth for platform fees.

**Effort:** Medium

---

### Task 2: T1-10 — Broken auditLog calls in fiat.ts (P2-7-F1)

**Files:**
- Modify: `packages/backend/src/routes/fiat.ts:281,357`
- Modify: `packages/backend/src/lib/audit.ts` (add AuditAction types)
- Create: `packages/backend/src/routes/fiat-audit.test.ts`

**Fix:** Convert 2 positional-arg calls to opts object pattern. Add `fiat_stripe_session` and `fiat_transak_url` to AuditAction type.

**Effort:** Small

---

### Task 3: T2-1 — Missing audit log for password change (P0-1-F5)

**Files:**
- Modify: `packages/backend/src/routes/auth.ts:856-862`
- Create: `packages/backend/src/routes/auth-audit.test.ts`

**Fix:** Add `auditLog("password_change", { userId, ip: request.ip })` after password hash update.

**Effort:** Small

---

### Task 4: T2-2 — Missing audit log for login success (P0-1-F6)

**Files:**
- Modify: `packages/backend/src/routes/auth.ts:~486`
- Update: `packages/backend/src/routes/auth-audit.test.ts`

**Fix:** Add `auditLog("login", { userId: user.id, ip: request.ip })` before returning tokens on successful login.

**Effort:** Small

---

### Task 5: T2-3 — JWT type claim missing (P0-1-F9)

**Files:**
- Modify: `packages/backend/src/lib/auth.ts:27-31` (add type:"user" to payload)
- Modify: `packages/backend/src/middleware/auth.ts` (check type claim)
- Create: `packages/backend/src/lib/auth-jwt-type.test.ts`

**Fix:** Add `type: "user"` to JWT payload in generateAccessToken(). In authMiddleware, accept tokens both with and without type claim (migration period), but reject tokens with `type: "admin"`.

**Effort:** Small

---

### Task 6: T2-14 — Admin mutation audit logging (P0-2-F1)

**Files:**
- Modify: `packages/backend/src/routes/admin.ts` (8 handlers)
- Create: `packages/backend/src/routes/admin-audit.test.ts`

**Fix:** Add auditLog calls to all 8 mutation handlers.

**Effort:** Medium

---

### Task 7: T2-6 — Wallet deletion not transactional (P0-3-F7)

**Files:**
- Modify: `packages/backend/src/routes/wallets.ts:389-415`
- Update: `packages/backend/src/routes/wallets-security.test.ts`

**Fix:** Wrap delete + auto-activate in `db.transaction()`.

**Effort:** Small

---

## Completion Checklist

- [ ] Task 1 committed
- [ ] Task 2 committed
- [ ] Task 3 committed
- [ ] Task 4 committed
- [ ] Task 5 committed
- [ ] Task 6 committed
- [ ] Task 7 committed
- [ ] FINDINGS.md updated for all findings
- [ ] Full test suite passes (344+ tests, 0 failures)
