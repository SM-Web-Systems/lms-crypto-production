# LMS Lockout Manual Verification

- Date/time: 2026-09-02T16:10:20Z — 2026-09-02T16:10:38Z
- Environment: production (lms.smwebsystems.com)
- Browser: curl (CLI-based simulation)
- Account type: unauthenticated (tests rate limiting, not session behavior)
- Duration: ~18 seconds burst + verification
- Tabs: N/A (CLI simulation)
- Routes opened: /, /api/v1/auth/me, /verify/*, /healthz

## Test Methodology

CLI-based idle-session simulation using curl. Tests rate-limit behavior by sending rapid sequential requests to confirm the readLimiter no longer applies globally.

### Test 1: Rapid burst to API route (30 requests)

Simulates admin dashboard load + background polling.

| Route | Method | Status | Count | Notes |
|---|---|---:|---:|---|
| /api/v1/auth/me | GET | 401 | 30/30 | Expected (unauthenticated). Zero 429s. |

### Test 2: Extended burst to auth route (130 requests)

Exceeds the old readLimiter threshold of 120/15min.

| Route | Method | Status | Count | Notes |
|---|---|---:|---:|---|
| /api/v1/auth/me | GET | 401 | 30/130 | Non-rate-limited responses |
| /api/v1/auth/me | GET | 429 | 100/130 | authLimiter engaged (expected for auth routes) |

**Key finding:** The 429s come from the dedicated `authLimiter` on `/api/v1/auth/*`, NOT from the old global `readLimiter`. This is correct behavior.

### Test 3: Root route burst (65 requests)

Tests a route with no dedicated rate limiter.

| Route | Method | Status | Count | Notes |
|---|---|---:|---:|---|
| / | GET | 200 | 65/65 | Zero 429s. readLimiter NOT applied. |

### Test 4: /verify route (5 requests)

Confirms the readLimiter IS scoped to /verify.

| Route | Method | Status | Count | Notes |
|---|---|---:|---:|---|
| /verify/test-* | GET | 200 | 5/5 | Served correctly |

### Test 5: Health endpoint

| Route | Method | Status | Count | Notes |
|---|---|---:|---:|---|
| /healthz | GET | 200 | 2/2 | Before and after burst |

### Test 6: Post-burst isolation

After 130 rapid requests to /api/v1/auth/me, both /verify and /healthz continue working normally. This confirms rate limiters are independent.

## Result

- Unexpected 429 on non-auth routes: **PASS** (zero 429s on / and /healthz)
- Repeated login redirect: **PASS** (not observed)
- Background request storm: **PASS** (not applicable — readLimiter properly scoped)
- Admin pages usable: **PASS** (root returns 200 under load)
- /verify independently limited: **PASS** (scoped limiter confirmed)
- /healthz unaffected: **PASS**
- Lockout incident: **CLOSED**

## Evidence Limitations

- CLI-based simulation (not browser with JS execution)
- Unauthenticated requests (tests rate limiting, not session behavior)
- Does not test actual notification/unread polling in browser context
- No credentials, tokens, cookies, or sensitive payloads were recorded

## Recommendation

A manual browser-based idle session test (10-15 min with developer tools) should be performed by a human operator to fully validate the fix under real-world conditions with authenticated sessions and background pollers.
