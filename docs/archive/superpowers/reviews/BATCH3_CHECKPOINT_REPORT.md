# Backlog Batch 3 — Checkpoint Report

> Date: 2026-07-28
> Branch: `fix/backlog-batch3` from `main` (`f8b15da`)
> Execution method: subagent-driven development (1 subagent per fix)

---

## Summary

**11 fixes executed, 11 committed, 1 deferred (Fix 12 — Billing TOCTOU).**

All 10 ungated fixes plus 1 of 2 deferrable fixes were implemented using TDD with source-assertion tests, verified with full suite runs after each commit.

---

## Items Fixed (11)

| # | Finding | Severity | Description | Commit | Tests Added |
|---|---------|----------|-------------|--------|-------------|
| 1 | P3-8-F1 | HIGH | Push subscription takeover — remove userId from conflict set, add WHERE guard | `b1178b4` | 2 |
| 2 | P3-9-F1 | HIGH | Curated /seed admin-only guard — verifyInternalAdmin + role check | `70f1fd4` | 3 |
| 3 | P3-6-F3 | MEDIUM | Contacts PATCH injection — additionalProperties: false | `1ca8729` | 2 |
| 4 | P1-3-F3 | MEDIUM | Auto-suspension concurrency guard — isRunning + finally | `7c6997a` | 3 |
| 5 | P3-6-F2 | MEDIUM | Contacts Stellar address validation — StrKey check | `cc1080b` | 2 |
| 6 | P3-7-F11 | LOW | Email code invalidation — mark old codes used before INSERT | `ab3042f` | 2 |
| 7 | P3-8-F4 | LOW | Push subscription limit — max 10 per user, 429 | `604979d` | 3 |
| 8 | P1-3-F1 | LOW | acquisitionModeEnabled guard in enforceDebtLimit | `3450bba` | 2 |
| 9 | P3-7-F10 | LOW | TOTP window reduction from 2 to 1 | `982151c` | 2 |
| 10 | P0-2-F3 | LOW | CREDIT_ROLES → PRIVILEGED_ROLES rename | `4b9e8d8` | 2 |
| 11 | P0-1-F14 | MEDIUM | Password complexity at all 4 password-setting sites | `b942707` | 12 |

**Total new tests: 35**

---

## Items Deferred (1)

| Finding | Severity | Reason |
|---------|----------|--------|
| P1-2-F2 | MEDIUM | Billing TOCTOU race — touches billing critical path, FOR UPDATE complexity, higher regression risk. Recommended for Batch 4. |

---

## Test Count Before/After

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| Backend | 453 | 488 | +35 |
| Web-app | 23 | 23 | 0 |
| **Total** | **476** | **511** | **+35** |

---

## Deferral Gate Decision

**Gate reached after Fix 10 (476 tests).** Assessment:

- **Time budget:** Sufficient for one more fix
- **Fix 11 (P0-1-F14 Password complexity):** APPROVED — additive validation, low regression risk
- **Fix 12 (P1-2-F2 Billing TOCTOU):** DEFERRED — touches billing critical path with FOR UPDATE locking, higher regression risk, recommended for dedicated Batch 4 focus

---

## Cumulative Audit Status

| Metric | Batch 1 | Batch 2 | Batch 3 | Total |
|--------|---------|---------|---------|-------|
| Fixes | 10 | 10 | 11 | 31 |
| Tests added | 23 | 43 | 35 | 101 |
| Total tests | 410 | 453 | 488 | 488 |
| Findings resolved | 10 | 10 | 11 | 31 |

**Overall:** 319 total findings → 77 (pre-batch) + 31 (batches 1-3) = 108 resolved, 1 deferred from Batch 3 (P1-2-F2), remaining deferred findings to be triaged for Batch 4.

---

## Verification Results

- Backend: 488/488 PASS
- Web-app: 23/23 PASS
- Secret scan: CLEAN
- All commits independently revertable
- No schema changes, no migrations, no frontend changes

---

## Files Modified

| File | Fixes |
|------|-------|
| `packages/backend/src/routes/push.ts` | Fix 1, Fix 7 |
| `packages/backend/src/routes/curated-tokens.ts` | Fix 2 |
| `packages/backend/src/routes/contacts.ts` | Fix 3, Fix 5 |
| `packages/backend/src/jobs/auto-suspension.ts` | Fix 4, Fix 8 |
| `packages/backend/src/routes/two-fa.ts` | Fix 6, Fix 9 |
| `packages/backend/src/routes/admin.ts` | Fix 10 |
| `packages/backend/src/routes/auth.ts` | Fix 11 |
| `packages/backend/src/lib/password-validation.ts` | Fix 11 (new) |

---

## Batch 4 Recommendation

| Priority | Finding | Description | Effort |
|----------|---------|-------------|--------|
| 1 | P1-2-F2 | Billing TOCTOU — FOR UPDATE in wallet creation transaction | Medium |
| 2 | Remaining LOW/INFO findings | Triage from deferred backlog | Variable |

The billing TOCTOU fix should be the primary focus of Batch 4, ideally with dedicated testing against the billing critical path.
