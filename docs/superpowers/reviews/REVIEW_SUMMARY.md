# Spec Review Summary — Backlog Batch 1

> Reviewed: 2026-07-28
> Spec: `docs/superpowers/specs/2026-07-28-backlog-batch1-design.md`
> Reviewer: Claude (automated spec review)

## Overall Assessment: APPROVED with minor patches

The spec is well-scoped, internally consistent, and execution-ready. All 10 items are valid quick wins in core backend modules with correct file paths verified against source.

## Strengths

1. **Clear scope boundaries** — backend only, no architectural changes, independently revertable
2. **Correct file paths** — all verified against current `main` (bd21cc3)
3. **TDD/non-TDD correctly classified** — behavioral changes get TDD, logging/config get source-assertion
4. **Fix 9 API contract risk flagged** — DELETE 404 change properly identified as caller-impacting
5. **Risk assessment is accurate** — all items are genuinely low-risk

## Gaps Found (patched in SPEC_GAP_LIST.md)

| # | Gap | Severity | Resolution |
|---|-----|----------|------------|
| 1 | Fix 4 eviction threshold (1000) is arbitrary — needs justification | Minor | Document that 1000 is generous for single-tenant deployment; eviction is O(n) sweep |
| 2 | Fix 5 uses raw SQL — should confirm table name matches schema | Minor | Verified: table is `email_verification_tokens` (raw SQL, not Drizzle schema) |
| 3 | Fix 6 escape function not specified — `\%` and `\_` need PG `ESCAPE` clause or drizzle support | Minor | Use string replacement before interpolation; drizzle `ilike` handles `\` escapes natively in PG |
| 4 | Fix 7 line numbers approximate — need exact lines | Minor | Verified: lines 1234, 1372, 1409 (exact), plus 2299 (admin liquifier, out of scope) |
| 5 | Missing: existing test file locations for swap, token modules | Minor | No existing test files for swap.service or token.service — new files needed |
| 6 | Fix 3: `toStroops` already validates format — should reuse for consistency | Minor | Use `toStroops` to validate; it throws on non-numeric. Add explicit `<= 0` guard. |
| 7 | Commit message format missing Co-Authored-By line | Minor | Add `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` |

## Verdict

**APPROVED** — no blocking issues. Gaps are minor clarifications, all addressed in the dev spec.
