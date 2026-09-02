# LMS Amma-Login Rate-Limit — Fix Options

**Date:** 2026-09-02
**Status:** Option A selected

---

## Option A: Exempt All GET Requests from authLimiter (SELECTED)

**Change:** Replace `skip: (req) => req.method === 'GET' && SSO_PATHS.has(req.path)` with `skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'`

| Criterion | Assessment |
|---|---|
| Fixes the bug | Yes — GET /auth/me no longer counted |
| Maintains POST protection | Yes — 60/15min on login, register, forgot-password, reset-password |
| Consistent with codebase | Yes — matches writeLimiter pattern exactly |
| Minimal change | Yes — 1 line changed, 1 constant removed |
| Risk | Very low — GET auth endpoints are already JWT-gated |
| Precedent | writeLimiter uses identical pattern (app.ts:165) |

**Why selected:** Minimal change, consistent with existing codebase pattern, maintains all brute-force protection.

---

## Option B: Add `/me` to SSO_PATHS

**Change:** `const SSO_PATHS = new Set(['/amma-login', '/amma-callback', '/me']);`

| Criterion | Assessment |
|---|---|
| Fixes the bug | Yes |
| Maintains POST protection | Yes |
| Consistent with codebase | No — SSO_PATHS name is misleading (/me is not SSO) |
| Minimal change | Yes — 1 line |
| Risk | Low but fragile — any new GET auth route would need to be manually added |
| Precedent | None |

**Why rejected:** Fragile; naming is misleading; new GET routes would silently inherit the bug.

---

## Option C: Increase authLimiter max to 300

**Change:** `return isDev ? 200 : 300;`

| Criterion | Assessment |
|---|---|
| Fixes the bug | Partially — raises threshold but doesn't eliminate the root cause |
| Maintains POST protection | Weakened — 300/15min is much more permissive for brute-force |
| Consistent with codebase | No — makes auth limit equal to write limit |
| Minimal change | Yes — 1 number |
| Risk | Medium — weakens brute-force protection |
| Precedent | None |

**Why rejected:** Doesn't fix the root cause; weakens security.

---

## Option D: Separate Limiters for GET and POST Auth Routes

**Change:** Create `authReadLimiter` (high limit) and `authWriteLimiter` (60/15min), mount separately.

| Criterion | Assessment |
|---|---|
| Fixes the bug | Yes |
| Maintains POST protection | Yes |
| Consistent with codebase | Partially — adds complexity |
| Minimal change | No — requires route restructuring and two limiter instances |
| Risk | Low but over-engineered |
| Precedent | None |

**Why rejected:** Over-engineered; Option A achieves the same result with 1 line.

---

## Decision Matrix

| Criterion | A | B | C | D |
|---|---|---|---|---|
| Fixes root cause | Yes | Yes | Partially | Yes |
| POST protection intact | Yes | Yes | Weakened | Yes |
| Codebase consistency | High | Low | Low | Medium |
| Change size | 2 lines | 1 line | 1 line | ~20 lines |
| Future-proof | Yes | No | No | Yes |

**Selected: Option A**
