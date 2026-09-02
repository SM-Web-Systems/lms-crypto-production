# Backlog Batch 1 — Checkpoint Report

> Date: 2026-07-28
> Branch: `fix/backlog-batch1` from `main` (`bd21cc3`)
> Execution method: subagent-driven development (1 subagent per fix)

---

## Summary

**10 fixes executed, 10 committed, 0 blocked.**

All 10 planned fixes from the Backlog Batch 1 design spec were implemented using TDD (behavioral changes) or source-assertion (logging/config changes), verified with full suite runs after each commit, and code-reviewed per fix.

---

## Items Fixed

| # | Finding | Description | Commit | Tests Added |
|---|---------|-------------|--------|-------------|
| 1 | P0-3-F14 | Remove PII console.log from sign-and-submit | `7be3ae9` | 2 |
| 2 | P2-4-F4 | TURNSTILE_SECRET_KEY startup warning | `e019a93` | 1 |
| 3 | P1-1-F4 | Log warning on lastUsedAt catch | `98fe639` | 1 |
| 4 | P2-3-F2 | Division by zero guard in calcPriceImpact | `716de24` | 5 |
| 5 | P2-3-F4 | Quote amount validation at getBestQuote entry | `6a37b3d` | 3 |
| 6 | P1-2-F4 | writeBillingCredit positive-amount validation | `61b4487` | 3 |
| 7 | P2-2-F5 | ILIKE wildcard escape + query length cap | `1133210` | 4 |
| 8 | P1-1-F5 | Evict expired rate-limit windows (>100 entries) | `83ce3d4` | 2 |
| 9 | P0-1-F16 | Invalidate stale verification tokens on re-send | `13c9d41` | 1 |
| 10 | P3-6-F5 | DELETE 404 for nonexistent contact | `d24e1a6` | 1 |

**Planning docs commit:** `df1376d`

---

## Test Count

| Stage | Tests |
|-------|------:|
| Baseline (main) | 387 |
| After Fix 7 | 389 |
| After Fix 8 | 390 |
| After Fix 10 | 391 |
| After Fix 1 | 396 |
| After Fix 2 | 399 |
| After Fix 3 | 402 |
| After Fix 6 | 406 |
| After Fix 4 | 408 |
| After Fix 5 | 409 |
| After Fix 9 | 410 |
| **Final (backend)** | **410** |
| **Final (web-app)** | **23** |

All tests passing. Zero regressions.

---

## Docs Updated

- [x] `FINDINGS.md` — 9 items marked FIXED, P1-1-F5 marked IMPROVED
- [x] `CUMULATIVE_STATUS.md` — 77 → 86 resolved, Batch 1 section added
- [x] `TODO_LOW_PRIORITY.md` — 9 items marked ✅
- [x] `docs/superpowers/todos/BACKLOG_BATCH1_TODO.md` — All items checked off

---

## Surprises

1. **Finding ID mismatch (Fix 4):** The batch planning documents labeled the rateLimitWindows eviction fix as P4-7-F2, but P4-7-F2 in FINDINGS.md refers to `MemoryCache` in `cache.ts`. The actual finding addressed is P1-1-F5 (`rateLimitWindows` Map in `tenant-api-key.ts`), which was classified as INFO. The code change is correct and valuable; only the finding ID was wrong in planning. P4-7-F2 (MemoryCache) remains unaddressed.

2. **Fix 7 test scoping:** The initial PII logging test would have matched the admin liquifier log at line 2299 (out of scope). The subagent correctly scoped the test to `sign-and-submit` handlers only.

3. **Fix 1/2 mock requirements:** Importing `swap.service.ts` transitively triggered config validation requiring `JWT_SECRET`. Subagent added `vi.mock` for `stellar-client` and `cache.js` to isolate the test.

4. **Fix 4 pre-pass:** Eviction tests technically passed before implementation because `checkAndCountRateLimit` already resets expired windows on individual access. The fix addresses unbounded Map growth (memory management), not functional correctness.

5. **Fix 9 API contract:** Frontend `Contacts.tsx:53` confirmed to handle errors via `toast.error()`, making the 404 change safe.

---

## Cumulative Status

| Category | Before | After | Delta |
|----------|-------:|------:|------:|
| Resolved | 77 | 86 | +9 |
| INFO / No Action | 67 | 67 | 0 |
| Deferred | 175 | 166 | -9 |
| **Total** | **319** | **319** | — |
| **Tests** | **387** | **410** | **+23** |

Note: P1-1-F5 was INFO (not deferred), so fixing it doesn't change the deferred count. The 9 deferred LOWs fixed bring us from 175 to 166 deferred.

---

## Batch 2 Recommendation

**Suggested scope: 8-10 items from remaining deferred backlog, focusing on:**

### Tier 1: More defensive guards (LOW, quick wins)
- P2-1-F4: Input format validation on publicKey/assetCode/assetIssuer in trustlines
- P2-1-F5: Stop exposing raw error.message in 500 responses
- P2-2-F2: Validate stored TOML image URL scheme
- P2-2-F3: Max file size on icon downloads
- P1-3-F2: `unsuspend()` defensive guard

### Tier 2: Rate limiting gaps (LOW)
- P3-6-F4: Rate limit on contacts CRUD
- P3-8-F3: Rate limit on /push/test
- P3-9-F2: Rate limit on /curated-tokens/seed

### Tier 3: Observability (LOW-MEDIUM)
- P4-7-F2: MemoryCache unbounded size (the actual finding, now correctly identified)
- P2-7-F4: Capture userAgent in audit log calls

### Deferred to later batches
- P0-4-F8/F9/F12/F16: Feature enhancements (slippage, memo, reserves) — need product decisions
- P2-5-F1/F2: Schema migrations (FK constraints, indexes) — need maintenance window
- P4-2-F3/F4: Architectural (AbortController, concurrent refresh) — larger scope

---

## Branch Status

Branch `fix/backlog-batch1` is ready to merge to `main`. 11 commits (1 docs + 10 fixes), all independently revertable. No secrets in diff. No production behavior regressions.

**Next action:** User decision on merge → deploy → Batch 2 planning.
