# AmmaWallet Security Posture — Before/After Assessment

> Generated: 2026-07-27 | Final HEAD: `bd21cc3`

---

## Threat Model

### Assets Protected

| Asset | Sensitivity | Protection |
|-------|-------------|------------|
| User secret keys | Critical | AES-256-GCM encryption, PIN-gated decryption |
| Mnemonic phrases | Critical | Client-side only, never transmitted to server |
| TOTP secrets | High | AES-256-GCM encrypted at rest |
| JWT tokens | High | Memory-only (not persisted to localStorage) |
| User passwords | High | bcrypt hashed, 12-char minimum (admin) |
| Database credentials | High | Docker secrets, runtime env only |
| Platform signing key | High | Runtime env, startup validation |

### Threat Actors Considered

1. **External attacker** — unauthenticated network access
2. **Authenticated user** — escalation, IDOR, abuse
3. **XSS/injection** — browser-side code injection
4. **Infrastructure compromise** — container escape, env leakage

---

## Before vs After Comparison

### Authentication & Authorization

| Threat | Before | After |
|--------|--------|-------|
| Login with unknown user | Crashes (TypeError) | Returns generic error |
| Brute-force login | 10/5min rate limit | 10/5min (unchanged) |
| Brute-force admin login | No specific limit | 5/5min |
| Turnstile bypass | Fails open (allows login) | Fails closed (blocks login) |
| Unauthenticated financial ops | 4 endpoints unprotected | All endpoints require auth |
| Admin token reuse as user | No type claim in JWT | `type: "user"` claim enforced |
| Password reset audit trail | Missing/broken field name | Correct `user_id` field logged |

### Cryptographic Security

| Threat | Before | After |
|--------|--------|-------|
| Mnemonic exposure to server | POSTed for HD derivation | Client-side derivation only |
| TOTP secret in database | Plaintext | AES-256-GCM encrypted |
| 2FA code predictability | `Math.random()` | `crypto.randomInt()` |
| PBKDF2 CPU DoS | No input length check | Length validation before 600K iterations |
| Secret key in API response | `encryptedSecret` returned | Excluded from response |
| Secret key in localStorage | Persisted by Zustand | Stripped via `partialize` |
| Mnemonic in localStorage | Stored in plaintext | Removed entirely |
| Transaction signing without PIN | No PIN required | PIN required for every sign |

### Infrastructure

| Threat | Before | After |
|--------|--------|-------|
| Container privilege escalation | Runs as root | Non-root user (appuser) |
| Secrets in Docker image | ENV in Dockerfile | Runtime env variables |
| DB creds in docker-compose | Plaintext in YAML | Docker secrets |
| Secrets in build context | No .dockerignore | .dockerignore excludes .env, secrets |
| Empty critical secrets | Silent fallback to empty | Production crash with FATAL error |

### Data Protection

| Threat | Before | After |
|--------|--------|-------|
| XSS token exfiltration | Tokens in memory (already safe) | Unchanged (memory-only) |
| Audit trail gaps | No logging on password change, logout | Full audit logging |
| Admin action accountability | No mutation logging | All admin mutations logged |
| Wallet ownership bypass | No ownership check on activate | Ownership verified before action |
| SSO callback hijack | No origin validation | Strict origin matching |
| Trustline auth bypass | No user ownership check | Ownership verified |

---

## Attack Surface Reduction

### Endpoints Removed (2)

| Endpoint | Risk | Resolution |
|----------|------|------------|
| `POST /api/v1/keypair/from-mnemonic` | Mnemonic transmitted over network | Client-side derivation |
| `POST /api/v1/keypair/validate-mnemonic` | Mnemonic transmitted over network | Client-side validation |

### Endpoints Hardened (12+)

| Endpoint | Hardening Applied |
|----------|-------------------|
| `POST /api/v1/auth/login` | Null-safe lookup, Turnstile fail-closed |
| `POST /api/v1/auth/change-password` | Audit logging |
| `POST /api/v1/transactions/sign` | PIN required, rate limit 3/min |
| `POST /api/v1/transactions/sign-and-submit` | PIN required, rate limit 3/min |
| `POST /api/v1/earn/deposit` | Auth middleware added |
| `POST /api/v1/earn/withdraw` | Auth middleware added |
| `POST /api/v1/moneygram/deposit` | Auth middleware added |
| `POST /api/v1/moneygram/withdraw` | Auth middleware added |
| `PATCH /api/v1/wallets/:id/activate` | Ownership verification |
| `POST /api/v1/trustlines/add` | Rate limit, StrKey validation |
| `POST /api/v1/trustlines/remove` | Rate limit, StrKey validation |
| `POST /api/v1/auth/refresh` | Rate limit 30/min |

---

## Remaining Risk Assessment

### Accepted Risks (Deferred)

| Risk | Severity | Mitigation |
|------|----------|------------|
| No auto-lock on inactivity | LOW | User must manually lock wallet |
| No transaction preview | LOW | User sees amount but not fee breakdown |
| Generic error messages | LOW | Information leakage minimal |
| Missing DB indexes | LOW | Performance only, not security |
| No concurrent refresh mutex | LOW | Rare race condition, not exploitable |

### Recommendations for Continued Hardening

1. **Secret rotation** — Rotate JWT_SECRET, JWT_REFRESH_SECRET, ADMIN_JWT_SECRET, SSO_SECRET
2. **Dependency updates** — Run `npm audit` monthly
3. **WebCrypto migration** — Move from PBKDF2 to non-exportable CryptoKey (IndexedDB)
4. **Auto-lock** — Lock wallet after configurable inactivity timeout
5. **Module test coverage** — Add tests for Earn, Fiat, MoneyGram, Push, NFT modules

---

## Compliance Notes

| Standard | Relevant Controls | Status |
|----------|-------------------|--------|
| OWASP Top 10 | A01-A10 assessed | All critical/high mitigated |
| CWE-798 (Hard-coded Creds) | Docker secrets, runtime env | Resolved |
| CWE-327 (Broken Crypto) | `crypto.randomInt()`, AES-256-GCM | Resolved |
| CWE-306 (Missing Auth) | Auth middleware on all financial endpoints | Resolved |
| CWE-400 (Resource Exhaustion) | Rate limiting on sensitive endpoints | Resolved |
| CWE-532 (Info in Logs) | Secrets excluded from responses/logs | Resolved |
