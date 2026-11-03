# AUTH-09: Security Impact Analysis

**Date:** 2026-10-20
**Method:** Ripwire dependency mapping — consumer/provider/blast-radius analysis

---

## Component Risk Matrix

| # | Component | Security Impact | Production Disruption | Modification Safe? |
|---|-----------|----------------|----------------------|-------------------|
| 1 | `auth.ts` (JWT middleware) | CRITICAL | YES | NO — single auth gate for 44+ routes |
| 2 | `LMS-Server/.env` | CRITICAL | YES | NO — all runtime secrets |
| 3 | `deploy.yml` (CI/CD) | HIGH | YES | NO — SSH to production |
| 4 | `docker-compose.yml` | HIGH | YES | NO — controls secrets, networks, volumes |
| 5 | `deploy.sh` | HIGH | YES | CAUTION — orchestrates safety checks |
| 6 | `docker-entrypoint.sh` | HIGH | YES | NO — runs at every container start |
| 7 | `LMS-Server/Dockerfile` | HIGH | YES | NO — controls entire runtime |
| 8 | `rbac.ts` (RBAC middleware) | HIGH | YES | NO — authorization for 43+ route files |
| 9 | `paymentService.ts` | HIGH | YES | NO — financial integrity |
| 10 | Docker volumes | HIGH | YES | NO — total data loss if corrupted |
| 11 | `rollback.sh` | MEDIUM | YES | YES — only runs during rollback |
| 12 | `smoke-test.sh` | LOW | NO | YES — read-only verification |

## Dependency Chains

### Authentication Chain
```
Client → auth.ts (JWT verify) → jwt.ts (verify token)
                               → database.ts (session check)
                               → active_sessions table
```
**Impact:** Bypassing auth.ts grants unauthenticated access to all 44 route modules.

### Authorization Chain
```
auth.ts → rbac.ts (requirePermission)
         → database.ts (permission query)
         → user_roles → role_permissions → permissions
```
**Impact:** Weakening rbac.ts enables privilege escalation across all tiers.

### Secret Delivery Chain
```
LMS-Server/.env → docker-compose.yml (env_file)
                → lms-api container (process.env.*)
                → jwt.ts, paystackService.ts, stellarPaymentMonitor.ts,
                  ammaWalletSSOService.ts, mintService.ts, walletService.ts
```
**Impact:** Leaking .env compromises JWT signing, payment processing, blockchain keys, SSO.

### Deployment Chain
```
deploy.yml → SSH → deploy.sh → backup_db()
                              → docker compose build
                              → docker compose up -d
                              → smoke-test.sh
                              → verify_data()
                              → rollback.sh (on failure)
```
**Impact:** Tampering with deploy.yml is a supply-chain attack vector (SSH to production).

### Data Persistence Chain
```
lms-ammawallet_lms-data → /app/data/student_ms.db
                         → all services via database.ts
lms-ammawallet_lms-uploads → /app/uploads/
                            → avatars, documents, imports, submissions
```
**Impact:** Volume deletion is catastrophic; backup is only recovery path.

## AUTH-09 Change Impact Assessment

### Change 1: rollback.sh health URL fix
- **Files modified:** `scripts/rollback.sh` (1 file)
- **Blast radius:** Only affects post-rollback health verification
- **Does NOT change:** Image tagging, container restart, timeout behavior
- **Consumers affected:** `deploy.sh` (calls rollback.sh on failure), manual operator
- **Production impact:** NONE — script only runs during rollback, not at runtime
- **Risk:** LOW

### Change 2: deploy.sh SHA mismatch exit
- **Files modified:** `scripts/deploy.sh` (1 file)
- **Blast radius:** Only triggers when SHA mismatch actually occurs
- **Does NOT change:** Normal deploy flow, backup, health check, smoke tests
- **Consumers affected:** `deploy.yml`, manual operator
- **Production impact:** NONE — script only runs during deployment
- **Risk:** LOW

### Change 3: COHORT-IDOR spec update
- **Files modified:** `docs/release/COHORT-IDOR-remediation-spec.md` (1 file)
- **Blast radius:** Documentation only
- **Production impact:** NONE
- **Risk:** NONE

## Deferred Changes — Impact Assessment

### SEC-INFRA-01: Non-root container user
- **Files to modify:** `LMS-Server/Dockerfile`
- **Blast radius:** Container runtime identity, volume ownership, entrypoint execution
- **Dependencies:** Volume chown, entrypoint compatibility, npm dependency builds
- **Production impact:** HIGH — requires container rebuild and restart
- **Risk:** MEDIUM — volume ownership mismatch could break DB access

### SEC-INFRA-02: Read-only filesystem
- **Files to modify:** `docker-compose.yml`
- **Blast radius:** All container write operations
- **Dependencies:** tmpfs for /tmp, volume mounts for data/uploads
- **Production impact:** HIGH — requires compose change and container restart
- **Risk:** MEDIUM — application may write to unexpected paths

### SEC-INFRA-03: Secret delivery migration
- **Files to modify:** `docker-compose.yml`, application code (all process.env readers)
- **Blast radius:** All secret consumers (JWT, payments, SSO, blockchain, SMTP)
- **Dependencies:** Docker Swarm or file-based secrets, app code changes
- **Production impact:** CRITICAL — affects all authenticated operations
- **Risk:** HIGH — incorrect migration breaks authentication and payments
