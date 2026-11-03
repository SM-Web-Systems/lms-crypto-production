# AUTH-13: Dependency Integration Review

**Date:** 2026-10-23
**Reviewer:** Claude (independent automated review)
**PR:** #81 (`codex/api-web-dependency-security`)

---

## 1. Backend Dependency Changes

| Package | Before | After | Type | Risk |
|---------|--------|-------|------|------|
| `express` | ^4.21.0 | ^4.22.3 | Runtime | **Medium** — security patch for proxy-addr IPv6 trust |
| `@stellar/stellar-sdk` | ^16.2.0 | ^16.4.1 | Runtime | Low — minor version bump |
| `adm-zip` | ^0.6.0 | ^0.6.1 | Runtime | Low — patch |
| `isomorphic-dompurify` | ^3.19.0 | 3.19.0 | Runtime | Low — pinned (removes caret) |
| `multer` | ^2.3.0 | ^2.5.0 | Runtime | Low — minor version bump |
| `nodemailer` | ^9.0.5 | ^10.2.1 | Runtime | **Medium** — major version bump |
| `vitest` | ^4.0.18 | ^4.1.12 | Dev | Low — test framework update |

### Express 4.22.3 (Security)

The `proxy-addr` dependency had a bug where short IPv4-mapped IPv6 subnets (e.g., `::ffff:10.0.0.0/8`) could cause unintended trust of all IPv4 clients. This is verified by the new `dependency-security.test.ts`:

```typescript
const trust = proxyaddr.compile(['::ffff:10.0.0.0/8']);
expect(trust('203.0.113.10')).toBe(false); // Would have been true on old version
```

### Nodemailer 10.x (Major Version)

Major version bump from 9.x to 10.x. Verified by test:
```typescript
const transport = nodemailer.createTransport({ jsonTransport: true });
const result = await transport.sendMail({...});
expect(result.envelope).toEqual({from: '...', to: ['...']});
```

The `jsonTransport` test confirms email composition works without SMTP, validating API compatibility.

### DOMPurify (Pinned)

`isomorphic-dompurify` pinned to exact version 3.19.0 (removed caret). XSS sanitization verified by test:
```typescript
expect(html).not.toMatch(/<script|<iframe|<svg|onerror=|onclick=|javascript:/i);
```

## 2. Frontend Dependency Changes

PR #81 also patches frontend dependencies (visible in `LMS-Frontend/package.json` and lockfile changes). The frontend audit gate now uses:
- `--omit=dev --audit-level=high` for production dependencies
- `--audit-level=critical` for all dependencies (accommodating Tailwind 3 build-tool findings)

## 3. CI Gate Changes

```yaml
# BEFORE: Advisory only
- name: Audit backend dependencies
  run: npm audit --audit-level=high
  continue-on-error: true

# AFTER: Blocking
- name: Audit backend dependencies
  run: npm audit --audit-level=high
```

All `continue-on-error: true` removed from audit steps. CI now fails on:
- Backend: high-severity or above
- Frontend production deps: high-severity or above
- Frontend all deps: critical-severity or above

## 4. Security Verification

| Check | Status |
|-------|--------|
| Express proxy-addr IPv6 trust boundary | Verified by test |
| DOMPurify XSS sanitization | Verified by test |
| Nodemailer v10 API compatibility | Verified by test |
| No hardcoded secrets in source | Verified (grep for password/secret/key in non-test files) |
| helmet middleware present | Yes |
| CORS configured | Yes |
| Rate limiting configured | Yes (express-rate-limit) |
| bcryptjs for password hashing | Yes |
| jsonwebtoken for JWT | Yes |
| better-sqlite3 compatible | Yes (v11.3.0) |

## 5. Verdict

**PASS** — All dependency changes are security-motivated and verified by automated tests. The nodemailer major version bump is the highest-risk change but has test coverage confirming API compatibility. CI audit gates are now blocking, which is a net positive for ongoing security posture.
