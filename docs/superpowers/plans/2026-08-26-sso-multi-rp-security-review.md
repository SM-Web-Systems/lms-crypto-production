# SSO Multi-RP Core — Independent Security Review

**Date:** 2026-08-26
**Reviewer:** Claude Code (automated)
**Branch:** feature/sso-multi-rp-core
**Commit range:** 2d03ba3..90c64ae (7 commits)

## Summary

The SSO Multi-RP core implementation is **solid and well-structured**. The architecture follows OAuth 2.1 best practices with ES256 signing, PKCE enforcement, refresh token rotation with family revocation, and exact-match redirect URI validation. 9 implementation files and 8 test files were reviewed (1,862 lines added, 1 line removed).

**Total findings: 14** — 0 BLOCKER, 2 HIGH, 5 MEDIUM, 4 LOW, 3 NOTE

The two HIGH findings (TOCTOU race in `markTokenUsed` and JWKS cache never invalidated on key rotation) should be addressed before merge. All other findings are hardening improvements that can be addressed in follow-up commits.

---

## Findings

### [HIGH] SR-001: TOCTOU Race in markTokenUsed Allows Auth Code Double-Spend

**File:** `/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core/packages/backend/src/services/token-registry.service.ts`
**Line(s):** 34-56
**Description:** `markTokenUsed()` performs a SELECT followed by a separate UPDATE. Between the SELECT (which reads `usedAt=null`) and the UPDATE (which sets `usedAt=now`), a concurrent request could also read `usedAt=null` and both would proceed. This is a classic time-of-check-time-of-use (TOCTOU) race condition.
**Risk:** Under concurrent load, an authorization code could be exchanged twice, issuing two sets of access/refresh tokens. This is the primary attack vector for token theft in OAuth.
**Recommendation:** Use an atomic `UPDATE ... WHERE usedAt IS NULL AND revokedAt IS NULL AND expiresAt > now() RETURNING *` pattern. If zero rows are returned, the token was already used/revoked/expired. In Drizzle:
```typescript
const result = await db
  .update(schema.tokenRegistry)
  .set({ usedAt: new Date() })
  .where(and(
    eq(schema.tokenRegistry.jti, jti),
    isNull(schema.tokenRegistry.usedAt),
    isNull(schema.tokenRegistry.revokedAt),
    gt(schema.tokenRegistry.expiresAt, new Date()),
  ))
  .returning();

if (result.length === 0) {
  // Token already used, revoked, expired, or unknown — look up for familyId
  const entry = await lookupToken(jti);
  return { alreadyUsed: true, familyId: entry?.familyId ?? null };
}
return { alreadyUsed: false, familyId: result[0].familyId };
```
This makes the check-and-mark atomic at the database level.
**Resolution:** _pending_

---

### [HIGH] SR-002: JWKS Public Key Cache Never Invalidated — Key Rotation Blocked

**File:** `/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core/packages/backend/src/lib/oauth-signing.ts`
**Line(s):** 6-7, 20-22, 51-61
**Description:** `cachedPublicKeyPem` and `cachedJwk` are module-level variables set once and never cleared. If `OAUTH_SIGNING_KEY` is changed (key rotation), the old public key and JWK remain cached until the process restarts. The JWKS endpoint will continue serving the old public key. The `verifyOAuthToken()` function will continue verifying against the old public key.
**Risk:** Key rotation requires a full process restart to take effect. If an operator rotates the key and expects immediate effect, tokens signed with the new key will be rejected by `verifyOAuthToken()` (which still uses the old cached public key), and the JWKS endpoint will still serve the old key. This is operationally dangerous — an operator may believe rotation worked when it did not.
**Recommendation:** Either: (a) document explicitly that key rotation requires process restart, or (b) add a `clearKeyCache()` export and call it when env changes are detected, or (c) derive from `getPrivateKey()` on every call (minimal perf cost for EC keys). Option (a) is acceptable for v1 if documented clearly.
**Resolution:** _pending_

---

### [MEDIUM] SR-003: No Rate Limiting on /token Endpoint

**File:** `/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core/packages/backend/src/routes/oauth.ts`
**Line(s):** 120-146
**Description:** The `POST /api/v1/oauth/token` endpoint has no rate limiting. An attacker with a valid `client_id` (which is not secret — it appears in URLs) could brute-force `client_secret` values.
**Risk:** Credential stuffing against the token endpoint. The bcrypt comparison in `verifyClientSecret` provides some timing resistance (each attempt takes ~100ms), but without rate limiting an attacker can still make thousands of attempts per second across multiple connections.
**Recommendation:** Apply a rate limiter to `/api/v1/oauth/token`, e.g., 20 requests per minute per IP (similar to the existing auth rate limits). The existing rate limiting infrastructure in the codebase (seen in `auth.ts`) can be reused.
**Resolution:** _pending_

---

### [MEDIUM] SR-004: No Rate Limiting on /authorize Endpoint

**File:** `/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core/packages/backend/src/routes/oauth.ts`
**Line(s):** 27-118
**Description:** The `GET /api/v1/oauth/authorize` endpoint requires `authMiddleware` (Bearer token), which limits abuse to authenticated users. However, there is no per-user rate limit, allowing an authenticated user to generate an unbounded number of authorization codes.
**Risk:** A compromised user session could flood the `token_registry` table with auth code entries (5-minute TTL each). While not a direct credential attack, it creates unnecessary DB load and could be used for resource exhaustion.
**Recommendation:** Apply a per-user rate limit (e.g., 30 requests per minute per userId). Lower priority than SR-003.
**Resolution:** _pending_

---

### [MEDIUM] SR-005: PKCE Not Enforced When Client Has requirePkce=false and No code_challenge Sent

**File:** `/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core/packages/backend/src/routes/oauth.ts`
**Line(s):** 73-80, 177-193
**Description:** When `client.requirePkce` is `false`, the `/authorize` endpoint allows requests without `code_challenge`. At the `/token` endpoint, PKCE verification is conditioned on `entry.codeChallenge` being present (line 177: `if (entry.codeChallenge)`). If no `code_challenge` was stored, PKCE is skipped entirely.

This is technically correct behavior per the spec (PKCE is optional per-client). However, the spec says `requirePkce` defaults to `true`, and the Drizzle schema confirms `.default(true)`. The risk is only if an admin explicitly sets `requirePkce=false` for a client.

**Risk:** A client with `requirePkce=false` is vulnerable to authorization code interception attacks. An attacker who intercepts the auth code (e.g., via open redirect on the RP, browser history, or referrer leakage) can exchange it without PKCE proof.
**Recommendation:** Consider making PKCE mandatory for all clients (remove the `requirePkce` toggle) per OAuth 2.1 which mandates PKCE. Alternatively, add a comment/warning in the admin UI when creating a client with `requirePkce=false`.
**Resolution:** _pending_

---

### [MEDIUM] SR-006: `code_challenge_method` Not Validated — Only S256 Checked at /authorize, Not at /token

**File:** `/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core/packages/backend/src/routes/oauth.ts`
**Line(s):** 73-80, 177-193
**Description:** The `/authorize` endpoint validates that `code_challenge_method === "S256"` (line 77), which is correct. However, at the `/token` endpoint, the code verifier is always hashed with SHA-256 (line 186: `crypto.createHash("sha256")`). The `code_challenge_method` is not stored in the `token_registry` entry and is not re-validated at exchange time.

Currently this works because only S256 is accepted, but if `plain` method support were ever added without updating the token exchange, PKCE would silently fail. The `code_challenge_method` value is not persisted in `token_registry`.

**Risk:** Low immediate risk (S256 is the only accepted method). Future risk if code is modified to accept `plain` without corresponding exchange-side changes.
**Recommendation:** Store `code_challenge_method` in `token_registry` alongside `code_challenge` for defense-in-depth. Verify the method at exchange time.
**Resolution:** _pending_

---

### [MEDIUM] SR-007: Redirect After response_type Validation Includes Unvalidated `state` Parameter in URL

**File:** `/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core/packages/backend/src/routes/oauth.ts`
**Line(s):** 82-85
**Description:** When `response_type` is not `"code"`, the endpoint redirects to:
```
`${redirect_uri}?error=unsupported_response_type&state=${encodeURIComponent(state || "")}`
```
This uses string interpolation to build the redirect URL with `redirect_uri` directly. At this point, `redirect_uri` has been validated via `validateRedirectUri()` (line 68-72), so open redirect is prevented. The `state` value is properly `encodeURIComponent`-encoded.

However, this redirect is constructed via string concatenation rather than the safer `new URL()` pattern used elsewhere (line 115). If `redirect_uri` contains a query string (e.g., `https://crm.example.com/callback?existing=param`), the `?error=` would create a malformed URL.

**Risk:** URL construction inconsistency. Unlikely to be exploitable since redirect_uris are admin-configured and exact-matched, but the inconsistent pattern is a maintenance hazard.
**Recommendation:** Use `new URL(redirect_uri)` + `searchParams.set()` consistently, matching the pattern on line 115-117.
**Resolution:** _pending_

---

### [LOW] SR-008: ID Token Missing `nonce` Claim

**File:** `/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core/packages/backend/src/routes/oauth.ts`
**Line(s):** 263-272
**Description:** The OIDC specification requires that if a `nonce` parameter is provided in the authorization request, it MUST be included in the ID token. The `/authorize` endpoint does not accept or store a `nonce` parameter, and the ID token does not include one.
**Risk:** OIDC replay protection for ID tokens is weaker without `nonce`. However, this is partially mitigated by the `jti` claim included via `signOAuthToken`. The spec explicitly states this is "OAuth 2.1 + OIDC-inspired" (not full OIDC compliance), so this is acceptable for v1.
**Recommendation:** Add `nonce` support in a future iteration when full OIDC compliance is targeted.
**Resolution:** _deferred per spec (ADR-007)_

---

### [LOW] SR-009: Access Token JTI Extraction via Base64 Decode Instead of jwt.decode

**File:** `/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core/packages/backend/src/routes/oauth.ts`
**Line(s):** 286-289
**Description:** The `issueTokens` function extracts the access token's JTI by manually decoding the JWT payload:
```typescript
const accessPayload = JSON.parse(
  Buffer.from(accessToken.split(".")[1], "base64url").toString(),
);
```
This works correctly but bypasses the `jsonwebtoken` library's `decode()` function, which handles edge cases (e.g., padding, encoding variations).
**Risk:** Very low. The token was just signed by the same process, so the format is guaranteed. However, using `jwt.decode()` would be more defensive.
**Recommendation:** Use `jwt.decode(accessToken)` instead of manual base64 parsing.
**Resolution:** _pending_

---

### [LOW] SR-010: Cleanup Job Not Wired — `cleanupExpiredTokens` Is Exported but Never Called

**File:** `/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core/packages/backend/src/services/token-registry.service.ts`
**Line(s):** 78-87
**Description:** The `cleanupExpiredTokens()` function is implemented and exported, and the spec says it should run as "a scheduled task (e.g., daily or hourly via Fastify onReady hook or cron)". However, no scheduler or cron job is wired in `server.ts` or anywhere else in the diff.
**Risk:** The `token_registry` table will grow unboundedly. For each OAuth flow, 3 rows are inserted (auth_code + access + refresh). At moderate volume, this becomes a performance issue. The 7-day retention rule is never enforced.
**Recommendation:** Wire `cleanupExpiredTokens()` into the existing Fastify `onReady` scheduler or add a setInterval (e.g., hourly). The spec's to-do list includes "Implement token_registry cleanup job with 7-day retention" which appears incomplete.
**Resolution:** _pending_

---

### [LOW] SR-011: `grantTypes` Field Not Validated on Token Exchange

**File:** `/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core/packages/backend/src/routes/oauth.ts`
**Line(s):** 120-146
**Description:** The `oauth_clients` table has a `grantTypes` field (e.g., `"authorization_code refresh_token"`), but the `/token` endpoint never checks whether the requested `grant_type` is in the client's allowed `grantTypes`. A client configured for `authorization_code` only could still perform `refresh_token` exchanges.
**Risk:** A client intended to be restricted to one-time code exchange (no refresh) could obtain refresh tokens. This depends on admin intent when configuring the client.
**Recommendation:** Add a check: `if (!client.grantTypes.split(" ").includes(grant_type)) return reply.status(400).send({ error: "unauthorized_client" });`
**Resolution:** _pending_

---

### [NOTE] SR-012: No New npm Dependencies Added

**File:** `packages/backend/package.json`
**Description:** The diff shows zero changes to `package.json`. All functionality uses existing dependencies (`jsonwebtoken`, `bcryptjs`, `drizzle-orm`, `node:crypto`). This is excellent — no new supply chain surface.
**Resolution:** _no action needed_

---

### [NOTE] SR-013: Config Fail-Closed on Missing OAUTH_SIGNING_KEY

**File:** `/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core/packages/backend/src/lib/oauth-signing.ts`
**Line(s):** 8-12
**Description:** `getPrivateKey()` throws `Error("OAUTH_SIGNING_KEY is not configured")` when the env var is empty. Config defaults to `""` (line 100 of config/index.ts: `process.env.OAUTH_SIGNING_KEY || ""`). This means any call to `signOAuthToken` or `verifyOAuthToken` or `getJwks` will throw immediately if the key is not configured. The system fails closed — no silent bypass.

However, the error is thrown lazily (on first use), not at startup. If no OAuth flow is attempted, the missing key goes unnoticed. This is acceptable since the feature is opt-in (RPs must be registered).
**Resolution:** _no action needed — fail-closed confirmed_

---

### [NOTE] SR-014: Legacy SSO Flow Completely Untouched

**File:** `packages/backend/src/routes/sso.ts`
**Description:** The diff for `sso.ts` is empty (zero changes). The regression test suite (`oauth-legacy-regression.test.ts`) confirms: in-memory `usedJtis` Set present, 60-second cleanup timer present, HS256 signing via `SSO_SECRET`, `lms-amma-sso` audience hardcoded, no imports from any new OAuth modules. Full backward compatibility maintained.
**Resolution:** _no action needed — verified_

---

## Checklist Results

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | `oauth_clients` schema matches spec | PASS | All field names, types, constraints match ADR-005 exactly |
| 2 | `token_registry` schema matches spec | PASS | All fields match including `family_id` column |
| 3 | `consent_records` schema matches spec | PASS | Unique index on `(userId, clientId)` present |
| 4 | No destructive change to existing tables | PASS | Only additive: 3 new tables appended to schema |
| 5 | ES256 signing, no key material in source | PASS | Key loaded from env, never logged or committed |
| 6 | JWKS returns public key only (no `d` component) | PASS | Uses `crypto.createPublicKey()` then `.export({ format: "jwk" })` — `d` is absent. Test JWKS-01 confirms |
| 7 | Key cache handles rotation | FAIL | SR-002: cache never invalidated |
| 8 | Redirect URI exact string match | PASS | `Array.includes()` — no substring, prefix, or regex |
| 9 | `client_secret` never returned in responses | PASS | Only `clientSecretHash` in DB; no endpoint returns client details |
| 10 | `bcrypt.compare()` for secret verification | PASS | Uses `bcryptjs.compare()` — constant-time via bcrypt |
| 11 | Auth code single-use enforcement | PARTIAL | Logic correct but TOCTOU race (SR-001) |
| 12 | Refresh token reuse triggers family revocation | PASS | `markTokenUsed` returns `alreadyUsed=true` + `familyId` → `revokeFamily()` called |
| 13 | Cleanup deletes only rows > 7 days past expiry | PASS | `WHERE expires_at < (now - 7 days)` — cannot delete active rows |
| 14 | Cleanup job wired | FAIL | SR-010: function exists but not scheduled |
| 15 | Consent per (userId, clientId) with skip | PASS | Unique index + `hasActiveConsent()` check in `/authorize` |
| 16 | Consent revocation sets `revoked_at` | PASS | `revokeConsent()` sets `revokedAt: new Date()` |
| 17 | Audit trail for consent events | PASS | `oauth_consent_granted` and `oauth_consent_revoked` logged via `auditLog()` |
| 18 | PKCE enforced when `requirePkce=true` | PASS | Missing `code_challenge` or non-S256 method → 400 |
| 19 | `/authorize` rejects unknown client_id | PASS | Returns 400 `invalid_client` |
| 20 | `/authorize` rejects mismatched redirect_uri | PASS | Returns 400 before any redirect |
| 21 | `/token` validates auth code single-use | PASS | `markTokenUsed()` before `lookupToken()` |
| 22 | Refresh rotation same family_id | PASS | `issueTokens()` receives and passes through `familyId` |
| 23 | Reuse of rotated refresh triggers family revocation | PASS | `handleRefreshExchange` calls `revokeFamily(familyId)` on `alreadyUsed` |
| 24 | Error responses safe (no stack traces) | PASS | All errors return RFC 6749 `error`/`error_description` format |
| 25 | `/authorize` uses authMiddleware | PASS | `{ preHandler: authMiddleware }` on route registration |
| 26 | `/token` handles missing/invalid grant_type | PASS | Returns 400 `unsupported_grant_type` |
| 27 | State parameter preserved in redirect | PASS | `redirectUrl.searchParams.set("state", state)` |
| 28 | Code exchange verifies redirect_uri match | PASS | `entry.redirectUri !== redirect_uri` → 400 |
| 29 | Legacy `sso.ts` zero code changes | PASS | Empty diff confirmed |
| 30 | Legacy in-memory JTI Set untouched | PASS | Regression tests LEGACY-01 through LEGACY-06 verify |
| 31 | No secret/key/token logged in new files | PASS | No `console.log`, `logger.info`, or similar with sensitive data |
| 32 | No new npm dependencies | PASS | `package.json` unchanged |
| 33 | Config fails closed on empty signing key | PASS | Throws `Error("OAUTH_SIGNING_KEY is not configured")` |
| 34 | Audit actions don't log PII beyond necessary | PASS | Logs `userId`, `clientId`, `scopes` — no email, no IP in detail object (IP passed to `auditLog` as standard param) |
| 35 | All DB queries use Drizzle ORM (no raw SQL) | PASS | Every query uses Drizzle builder API with parameterized values |
| 36 | Rate limiting on /token | FAIL | SR-003: no rate limiter applied |
| 37 | Rate limiting on /authorize | FAIL | SR-004: no rate limiter (authMiddleware provides some protection) |
| 38 | CSRF on /authorize | PASS | Uses Bearer token auth (not cookies), immune to browser-based CSRF |
| 39 | `grantTypes` validated on /token | FAIL | SR-011: field exists but not checked |

---

## Test Coverage Assessment

The test suite covers the critical paths well:

- **Signing:** 5 tests (SIGN-01 to SIGN-05) + 2 JWKS tests — covers sign/verify, wrong key rejection, expiry, unique JTI, JWKS public-only output
- **Client service:** 11 tests (CLIENT-01 to CLIENT-11) — covers CRUD, secret verification, redirect URI exact matching (substring, prefix, domain, port, empty)
- **Schema:** 3 tests confirming Drizzle exports
- **Token registry:** 10 tests (TR-01 to TR-10) — covers insert, mark used (unused/used/revoked/expired/unknown), family revocation, cleanup, lookup
- **Consent:** 7 tests (CONSENT-01 to CONSENT-07) — covers active/missing/revoked/subset scopes, grant+audit, revoke+audit, no-op revoke
- **Authorize:** 5 tests (AUTH-01 to AUTH-05) — covers unknown client, mismatched redirect, missing PKCE, consent required, successful redirect
- **Token exchange:** 6 tests (TOKEN-01 to TOKEN-06) — covers invalid credentials, replayed code, successful exchange, invalid PKCE verifier, refresh rotation, refresh reuse family revocation
- **Legacy regression:** 6 tests (LEGACY-01 to LEGACY-06) — source-level verification of legacy flow integrity

**Missing test coverage:**
1. No test for `response_type !== "code"` redirect behavior
2. No test for missing `grant_type` (unsupported_grant_type response)
3. No test for `redirect_uri` mismatch at `/token` exchange time (only tested at `/authorize`)
4. No test for missing `code_verifier` when `codeChallenge` is stored (PKCE required but verifier omitted)
5. No boundary tests for the 7-day cleanup retention (e.g., 6 days retained vs 8 days purged — spec mentions these but tests only verify the function calls the right DB method)
6. No test for user not found during token exchange (line 204-206)

---

## Conclusion

The implementation is **well-engineered and security-conscious**. The architecture correctly follows OAuth 2.1 patterns: PKCE enforcement, exact-match redirect URIs, bcrypt client secrets, ES256 asymmetric signing with public-only JWKS, refresh token rotation with family-level revocation, and persistent token registry with post-expiry retention.

**Must fix before merge (HIGH):**
1. **SR-001:** The TOCTOU race in `markTokenUsed` is the most significant finding. While exploitability requires precise timing and concurrent requests, it violates the single-use guarantee that is fundamental to OAuth security. The fix (atomic UPDATE with RETURNING) is straightforward.
2. **SR-002:** Document that key rotation requires process restart, or add cache invalidation. Either option is low-effort.

**Should fix before merge (MEDIUM):**
3. **SR-003/SR-004:** Add rate limiting to `/token` and `/authorize`. The existing rate-limiting infrastructure makes this low-effort.
4. **SR-007:** Use `new URL()` consistently for redirect construction.

**Can fix post-merge (LOW):**
5. **SR-010:** Wire the cleanup scheduler.
6. **SR-011:** Validate `grantTypes` on token exchange.
7. **SR-009:** Use `jwt.decode()` instead of manual base64 parsing.

The legacy SSO flow is confirmed completely untouched with zero behavioral changes. No new dependencies, no secret exposure, no raw SQL, and proper fail-closed configuration. The codebase is ready for merge after addressing the two HIGH findings.
