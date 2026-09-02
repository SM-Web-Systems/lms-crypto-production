# Phase 5B — Auth Hardening Fix Plan

> Branch: `fix/phase5a-critical-security` (continuing from Phase 5A)
> Baseline: 329 tests, 0 failures

---

### Task 1: T1-6 — Turnstile fails open on network error (P0-1-F4)

**Files:**
- Modify: `packages/backend/src/middleware/turnstile.ts:52-56`
- Create: `packages/backend/src/middleware/turnstile.test.ts`

**Fix:** Change catch block from fail-open (`console.warn` + allow) to fail-closed (`reply.status(503).send({error: "Verification service unavailable"})`)

**Tests:**
- [x] Turnstile network error returns 503
- [x] Turnstile success allows request
- [x] Turnstile failure returns 403
- [x] Missing token returns 400

**Effort:** Small (<1hr)

---

### Task 2: T1-7 — Math.random() for 2FA email codes (P0-1-F8)

**Files:**
- Modify: `packages/backend/src/routes/auth.ts:374`
- Modify: `packages/backend/src/routes/two-fa.ts:25`
- Create: `packages/backend/src/routes/two-fa-security.test.ts`

**Fix:** Replace `Math.floor(100000 + Math.random() * 900000)` with `crypto.randomInt(100000, 1000000)` in both locations. Add `import crypto from "crypto"` if not present.

**Tests:**
- [x] Source code contains no Math.random() calls
- [x] Source code uses crypto.randomInt for code generation

**Effort:** Small (<30min)

---

### Task 3: T1-8 — Turnstile bypass via twoFaToken on register (P0-1-F11)

**Files:**
- Modify: `packages/backend/src/middleware/turnstile.ts:21-23`
- Update: `packages/backend/src/middleware/turnstile.test.ts`

**Fix:** The blanket `if (body?.twoFaToken) return;` check skips Turnstile for ANY route (including register) when twoFaToken is in the body. Fix: only skip Turnstile for twoFaToken when the route is `/api/v1/auth/login` (the only route where 2FA step 2 is legitimate).

**Tests:**
- [x] twoFaToken on login route skips Turnstile (allowed)
- [x] twoFaToken on register route does NOT skip Turnstile (rejected)

**Effort:** Small (<1hr)

---

### Task 4: T2-8 — SSO_SECRET not validated at startup (P1-4-F2)

**Files:**
- Modify: `packages/backend/src/config/index.ts`
- Create: `packages/backend/src/config/config-security.test.ts`

**Fix:** Add `SSO_SECRET` to requiredEnvVars array. Add assertion: `SSO_SECRET !== JWT_SECRET` (key confusion guard).

**Tests:**
- [x] Config source includes SSO_SECRET in requiredEnvVars
- [x] Config source includes SSO_SECRET !== JWT_SECRET assertion

**Effort:** Small (<30min)

---

### Task 5: T2-9 — Secret defaults not validated at startup (P2-4-F1/F2)

**Files:**
- Modify: `packages/backend/src/config/index.ts`
- Update: `packages/backend/src/config/config-security.test.ts`

**Fix:** Add assertions that ADMIN_JWT_SECRET !== JWT_SECRET (already partially covered by T2-8 pattern). Add minimum length validation for all secret env vars (>= 16 chars).

**Tests:**
- [x] Config source includes ADMIN_JWT_SECRET !== JWT_SECRET assertion
- [x] Config source includes minimum length validation for secrets

**Effort:** Small (<30min)

---

## Completion Checklist

- [x] Task 1 committed (057b157) — combined with Task 3
- [x] Task 2 committed (c2aac2c)
- [x] Task 3 committed (057b157) — combined with Task 1
- [x] Task 4 committed (af098e9) — combined with Task 5
- [x] Task 5 committed (af098e9) — combined with Task 4
- [x] FINDINGS.md updated for all findings
- [x] Full test suite passes (344 tests, 0 failures)
