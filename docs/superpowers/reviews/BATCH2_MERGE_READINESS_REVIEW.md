# Batch 2 — Merge Readiness Review

> Date: 2026-07-28
> Source: `fix/backlog-batch2` → `main`
> Commits: 11 (10 fixes + 1 docs)

---

## Pre-Merge Verification Checklist

| Check | Result |
|-------|--------|
| Backend tests | 453/453 PASS |
| Web-app tests | 23/23 PASS |
| Diff scope | 30 files — all in `packages/backend/src/` + docs |
| No frontend changes | PASS — zero diff in `packages/web-app/` |
| No stub module changes | PASS |
| Secret scan | PASS — no credentials in diff |
| Commit history | Clean — 10 fix commits + 1 docs, all with Co-Authored-By |
| Finding-to-commit mapping | All 10 verified |
| Code review | APPROVED — no critical or important findings |
| Accounting reconciliation | Consistent — 86→96 resolved, 166→156 deferred |
| P4-7-F2 finding ID | Correct — commit `afb682e` uses P4-7-F2 (MemoryCache), not P1-1-F5 |

---

## Production Behavior Changes

| Fix | Endpoint / Module | User-Visible Change |
|-----|------------------|---------------------|
| Fix 10 | All auditLog calls | user_agent column now populated — no API behavior change |
| Fix 9 | MemoryCache | Cache bounded at 500 — no API behavior change |
| Fix 5 | Auto-suspension job | Only auto-suspensions unsuspended — no API endpoint affected |
| Fix 3 | TOML sync job | Non-HTTPS image URLs skipped — background job only |
| Fix 4 | Icon resolver | Icons > 512KB skipped — background job only |
| Fix 6 | /contacts/* | 30 req/min per endpoint — new rate limit |
| Fix 7 | /push/test | 5 req/15min — new rate limit |
| Fix 8 | /curated/seed | Auth required + 3 req/hour — **breaking for unauthenticated callers** |
| Fix 1 | /trustlines/* | Invalid keys → 400 (was 500) — improved error codes |
| Fix 2 | /trustlines/* | Error messages sanitized — internal details no longer leaked |

**Risk assessment:** Fix 8 adds auth to `/curated/seed`. No known production automation calls this endpoint unauthenticated. Manual admin operation only.

---

## Verdict: APPROVED FOR MERGE

All checks pass. No blockers identified.
