# Batch 5 — Optional Strategy

> Date: 2026-07-29
> Status: **OPTIONAL** — not required for security. All exploitable vulnerabilities are resolved.

---

## Purpose

This document outlines a strategy for continuing backlog remediation if desired. Batch 5 is **not required** — the 155 deferred items are non-exploitable code quality improvements, feature enhancements, and stub module hardening.

---

## Deferred Items by Category

| Category | Count | Effort Band | Priority |
|----------|------:|:-----------:|:--------:|
| P3 stub modules (Earn/Fiat/MoneyGram) | ~35 | Medium-Large | **Defer until activation** |
| Code quality / naming | ~25 | Quick win | Low |
| Test coverage gaps | ~20 | Small-Medium | Low |
| Feature enhancements | ~20 | Medium | Low |
| Database schema | ~15 | Medium (migration) | Low |
| Architectural improvements | ~10 | Medium-Large | Low |
| Frontend quality | ~15 | Small-Medium | Low |
| Other | ~15 | Mixed | Low |

---

## High-Leverage Candidates (if someone wants to continue)

### Tier 1: Quick Wins (< 30 min each, low risk)

| ID | Description | Why |
|----|-------------|-----|
| P0-4-F5 | Gate debug console.log behind `import.meta.env.DEV` | Prevents XDR leak in production |
| P2-4-F5 | Two statements on one line (style) | Trivial cleanup |
| P1-1-F1 | Comment says "sliding window" but is fixed window | Accuracy |
| P1-2-F3 | Maintenance idempotency catch doesn't distinguish constraint | Better error handling |
| P2-5-F3 | auditLogs.userId integer vs bigint | Type alignment |

### Tier 2: Small Fixes (30 min – 2 hours each)

| ID | Description | Why |
|----|-------------|-----|
| P0-4-F16 | Max button ignores XLM reserves | Better UX, prevents stuck transactions |
| P1-4-F4 | Raw callbackUrl rendered on SSO parse failure | Minor XSS surface |
| P3-10-F5 | Floating-point fee arithmetic in frontend | Correctness |
| P3-11-F2 | Revealed secret key no auto-hide timeout | Security UX |
| P2-6-F1 | sendPasswordResetEmail return type inconsistent | Type safety |

### Tier 3: Medium Fixes (2–4 hours each)

| ID | Description | Why |
|----|-------------|-----|
| P0-4-F8 | Fixed 1% slippage, no user control | UX improvement |
| P0-4-F9 | Swap quote staleness | Financial accuracy |
| P0-4-F12 | No memo support in payments | Feature gap |
| P4-2-F3 | No AbortController support | Resource leak prevention |
| P4-2-F4 | Race condition in concurrent 401 refresh | Edge case fix |

---

## Stopping Rule

**Stop when marginal risk reduction no longer justifies the effort.**

Specifically, stop if:
1. All remaining items are code quality / cosmetic (no security impact)
2. The only remaining HIGH items are in disabled P3 stub modules
3. Further fixes require schema migrations or architectural changes that risk stability
4. The test suite is stable and covers all critical paths

**Current assessment:** The stopping rule is already satisfied. Batch 5 is purely optional.

---

## If Starting Batch 5

### Recommended Scope
Pick 5–10 Tier 1 and Tier 2 items. Avoid Tier 3 unless there's a specific need.

### Process
1. Create `fix/backlog-batch5` from `main`
2. Follow the established TDD + code review + checkpoint pattern
3. Use `docs/superpowers/` directory for planning/review artifacts
4. Target: 492→500+ backend tests (add tests for each fix)

### What NOT to Include
- P3 stub module fixes (defer until module activation)
- Database schema migrations (defer to dedicated migration sprint)
- Architectural changes (AbortController, concurrent refresh mutex)
- Large feature work (memo support, slippage control)

---

## P3 Module Activation Checklist

When Earn, Fiat, or MoneyGram modules are activated for production:

1. Review all P3 findings for that module in `FINDINGS.md`
2. Address all HIGH and MEDIUM findings before activation
3. Add auth middleware, rate limits, and input validation
4. Add test coverage for the module
5. Deploy with the same merge/verify/deploy cycle used for Batches 1–4
