# Batch 3 — Execution Readiness Assessment

> Date: 2026-07-28
> Branch: `fix/backlog-batch3` from `main` at `f8b15da`
> Baseline: 453/453 backend + 23/23 web-app

---

## Baseline Verified

- **Backend tests:** 453/453 PASS
- **Branch:** `fix/backlog-batch3` created from `main` at `f8b15da`
- **Working tree:** clean

## Execution Order (12 fixes, 3 tiers + deferral gate)

### Tier 1: Must-Fix (Fixes 1-4) — Ready immediately
| Fix | Finding | Severity | Target File |
|-----|---------|----------|-------------|
| 1 | P3-8-F1 | HIGH | push.ts — subscription takeover |
| 2 | P3-9-F1 | HIGH | curated-tokens.ts — admin guard |
| 3 | P3-6-F3 | MEDIUM | contacts.ts — PATCH injection |
| 4 | P1-3-F3 | MEDIUM | auto-suspension.ts — concurrency |

### Tier 2: Should-Fix (Fixes 5-8) — Ready immediately
| Fix | Finding | Severity | Target File |
|-----|---------|----------|-------------|
| 5 | P3-6-F2 | MEDIUM | contacts.ts — address validation |
| 6 | P3-7-F11 | LOW | two-fa.ts — code invalidation |
| 7 | P3-8-F4 | LOW | push.ts — subscription limit |
| 8 | P1-3-F1 | LOW | auto-suspension.ts — acquisitionMode |

### Tier 3: Quick Wins (Fixes 9-10) — Ready immediately
| Fix | Finding | Severity | Target File |
|-----|---------|----------|-------------|
| 9 | P3-7-F10 | LOW | two-fa.ts — TOTP window |
| 10 | P0-2-F3 | LOW | admin.ts — CREDIT_ROLES rename |

### DEFERRAL GATE — After Fix 10
Evaluate before proceeding:
| Fix | Finding | Severity | Effort | Decision criteria |
|-----|---------|----------|--------|-------------------|
| 11 | P0-1-F14 | MEDIUM | Medium | Time budget, complexity of shared validator |
| 12 | P1-2-F2 | MEDIUM | Medium | Risk to billing critical path, FOR UPDATE complexity |

## Verdict: READY FOR EXECUTION

All 10 ungated fixes are ready. Proceeding with subagent-driven TDD execution.
