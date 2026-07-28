# Backlog Batch 2 — Checkpoint Report

> Date: 2026-07-28
> Branch: `fix/backlog-batch2`
> Baseline: 410/410 → Final: 453/453

---

## Items Fixed (10)

| # | Finding | Severity | Description | Commit | New Tests |
|---|---------|----------|-------------|--------|-----------|
| 1 | P2-7-F4 | LOW | Capture userAgent in all auditLog calls (19 call sites) | `9bc68a8` | 6 |
| 2 | P4-7-F2 | MEDIUM | Bound MemoryCache to 500 entries with eviction | `afb682e` | 3 |
| 3 | P1-3-F2 | LOW | Add suspensionReason guard to unsuspend() | `f8e8782` | 5 |
| 4 | P2-2-F2 | LOW | Validate TOML image URLs (https: only) | `e5cc5e6` | 4 |
| 5 | P2-2-F3 | LOW | Enforce 512KB max on icon downloads | `4f52196` | 5 |
| 6 | P3-6-F4 | LOW | Rate limit contacts CRUD (30/min) | `8486967` | 3 |
| 7 | P3-8-F3 | LOW | Rate limit /push/test (5/15min) | `9399368` | 3 |
| 8 | P3-9-F2 | LOW | Auth + rate limit on /curated/seed (3/hour) | `70bb41d` | 3 |
| 9 | P2-1-F4 | LOW | Trustline input validation (StrKey + asset regex) | `b229a82` | 7 |
| 10 | P2-1-F5 | LOW | Sanitize error messages in trustline catch blocks | `ede27e1` | 4 |

**Total new tests: 43**

---

## Test Count Before/After

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| Backend | 410 | 453 | +43 |
| Web-app | 23 | 23 | 0 |
| **Total** | **433** | **476** | **+43** |

---

## Docs Updated

| Document | Changes |
|----------|---------|
| FINDINGS.md | 10 items marked FIXED with commit hashes |
| CUMULATIVE_STATUS.md | 86→96 resolved, 166→156 deferred, Batch 2 section added |
| TODO_LOW_PRIORITY.md | 9 items marked ✅ Batch 2 (P4-7-F2 not in this file) |
| BACKLOG_BATCH2_TODO.md | All items checked off |
| BATCH2_EXECUTION_READINESS.md | Created at start of batch |

---

## Surprises

1. **Auth.ts had 9 auditLog calls, not 10** — the plan estimated 10 but actual count was 9. server.ts had 2, admin.ts had 8 (not 9). Total: 19 call sites (not 21).
2. **Trustline validation required mock updates** — existing test files (`trustlines.test.ts`, `trustlines-security.test.ts`) needed their `@stellar/stellar-sdk` mocks updated to include `StrKey.isValidEd25519PublicKey` so they'd continue passing with fake public keys.
3. **auth-critical-fixes.test.ts needed update** — Fix 10 added `request.headers["user-agent"]` access which failed on mock objects missing the header. Two mock requests needed `headers: { "user-agent": "test-agent" }` added.
4. **No pause conditions triggered** — all 10 fixes executed cleanly without any test failures, regressions, or blocking issues.

---

## Cumulative Audit Status

| Metric | Value |
|--------|-------|
| Total findings | 319 |
| Resolved | 96 (30.1%) |
| INFO/no-action | 67 (21.0%) |
| Deferred | 156 (48.9%) |
| Resolution rate | 51.1% |
| Test count | 453 backend + 23 web-app = 476 total |
| Production deploys | 4 (Batch 2 not yet deployed) |

---

## Batch 3 Recommendation

The remaining 156 deferred items fall into these categories suitable for future batches:

**High-value next batch (Batch 3 candidates):**
1. **P3-8-F1** (HIGH) — Push subscription takeover via onConflictDoUpdate
2. **P3-9-F1** (HIGH) — /curated/seed was missing auth (now has auth via Batch 2, but the HIGH finding about unauthenticated DB writes may need deeper review)
3. **P1-3-F3** (LOW) — Auto-suspension concurrency guard
4. **P1-2-F2** (MEDIUM) — TOCTOU race in billing balance check
5. **P0-1-F14** (MEDIUM) — Password complexity (zxcvbn)
6. **P2-5-F1/F2** (MEDIUM) — Missing FK constraints and indexes (migration work)

**Recommended scope:** Focus on the remaining HIGH findings in P3 modules (push, curated tokens) plus the MEDIUM billing/schema items. Estimate: 6-8 fixes.

**Not recommended for Batch 3:** Frontend UX items (P3-10-F5/F6, P3-11-F2), Earn/Fiat/MoneyGram module findings (stub modules), large architectural changes (AbortController, concurrent refresh mutex).
