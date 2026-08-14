# LMS-AmmaWallet — Platform Release Readiness Spec

> **Date:** 2026-08-14 | **Commit:** fd6e66d | **Author:** Release Engineering

## Purpose

This spec defines the criteria for declaring the LMS-AmmaWallet platform production-ready. It serves as the single source of truth for release readiness audits.

## 1. Functional Readiness

### 1.1 Authentication

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Local login/register | ✅ Pass | auth.test.ts |
| AmmaWallet SSO | ✅ Pass | sso-no-jwt-fallback.test.ts |
| JWT verification | ✅ Pass | jwt-secret.test.ts |
| Password reset flow | ✅ Pass | reset-token-hash.test.ts |
| Session creation on login | ✅ Pass | Active sessions table + hash |
| Session revocation (self) | ✅ Pass | DELETE /sessions/:id |
| Session revocation (admin) | ✅ Pass | DELETE /admin/sessions/:userId/:id |
| Password-changed-at invalidation | ✅ Pass | Rejects pre-change JWTs |

### 1.2 Role Dashboards

| Role | Dashboard Exists | Loads Correctly | Notes |
|------|-----------------|-----------------|-------|
| student | ✅ | ✅ | 10 frontend pages |
| super-student | ⚠️ Uses student | ✅ | No dedicated UI |
| parent | ✅ ParentDashboard | ✅ | Multi-tab single page |
| teacher | ✅ TeacherDashboard | ✅ | Multi-tab single page |
| employer | ✅ EmployerDashboard | ✅ | Multi-tab single page |
| sponsor | ✅ SponsorDashboard | ✅ | Plus admin sponsor portal |
| instructor | ✅ LecturerDashboard | ✅ | 3 pages |
| teaching-assistant | ✅ TADashboard | ✅ | 1 page |
| admin | ✅ AdminDashboard | ✅ | 8 pages + embedded panels |
| admin-2 | ⚠️ Uses admin | ✅ | resolveClosestRole |
| super-admin | ⚠️ Uses admin | ✅ | resolveClosestRole |
| custom-user | ⚠️ Uses student | ⚠️ | Heuristic routing |

### 1.3 Critical Workflows

| Workflow | Status | Test Coverage |
|----------|--------|---------------|
| Course creation → enrollment → completion | ✅ | Multiple test files |
| Quiz submit → auto-grade → auto-complete | ✅ | quiz-auto-complete.test.ts |
| Assignment submit → review → auto-complete | ✅ | assignment-auto-complete.test.ts |
| Certificate apply → approve → mint | ✅ | NFT mint tests |
| Payment checkout → webhook → confirm | ✅ | Paystack integration |
| Cohort create → add members → bulk apply | ✅ | cohorts.test.ts |
| TA grade → instructor approve | ✅ | ta-grade-invariant.test.ts |
| Course import (ZIP/CSV/GitHub) | ✅ | Phase 26-27 tests |
| Notification send → poll → read | ✅ | phase23-c3-notifications-v2.test.ts |
| Reward create → fund → activate → eligible → release | ✅ | reward-orchestration.test.ts |

## 2. Data and Migration Readiness

| Requirement | Status | Notes |
|-------------|--------|-------|
| Clean DB creation (58 tables) | ✅ | ensure*() functions run idempotently |
| Existing DB migration safety | ✅ | ALTER TABLE with IF NOT EXISTS |
| Seed data idempotency | ✅ | INSERT OR IGNORE patterns |
| Foreign keys enabled | ✅ | PRAGMA foreign_keys=ON |
| Financial FKs use ON DELETE RESTRICT | ✅ | All reward tables |
| Daily database backups | ✅ | Cron job configured |
| Reward balance reconciliation | ✅ | reconcileAccount() service function |
| Integer stroop migration | ✅ | migrateRewardBalance() runs at startup |

## 3. Security Readiness

| Requirement | Status | Notes |
|-------------|--------|-------|
| No secrets in git | ✅ | .env in .gitignore |
| JWT revocation via active_sessions | ✅ | SHA-256 hash + revoked_at |
| RBAC enforced server-side | ✅ | 211 requirePermission calls |
| Admin escalation guards (ESC-1–5) | ✅ | rbac.test.ts |
| Cross-tenant isolation | ✅ | Tenant-aware queries |
| Rate limiting active (4 tiers) | ✅ | auth/write/read/diag limiters |
| File upload MIME whitelist | ✅ | Phase 27 hardening |
| CORS + security headers (helmet) | ✅ | cors-patch.test.ts |
| Error sanitization | ✅ | SQLite errors masked |
| Messaging rate limit | ❌ BLOCKER | F5 tests exist, implementation missing |
| Sensitive data in logs | ✅ | Structured pino, no PII leakage |

## 4. Financial Readiness

| Requirement | Status | Notes |
|-------------|--------|-------|
| Paystack payment verification | ✅ | HMAC webhook |
| Stellar payment monitoring | ✅ | Horizon polling |
| Integer stroop accounting | ✅ | No float in accounting path |
| Fund + reserve atomic | ✅ | SQLite transaction |
| Release idempotent | ✅ | checkTransactionIdempotency |
| Refund idempotent | ✅ | Blocked refund tracking |
| Blocked refund admin resolution | ❌ | No admin endpoint |
| Invoice PDF generation | ✅ | pdfkit |
| Reward funding source verification | ❌ | Paystack/Stellar refs not validated for rewards |

## 5. Deployment Readiness

| Requirement | Status | Notes |
|-------------|--------|-------|
| Docker builds | ✅ | LMS-Server + LMS-Frontend |
| Docker Compose starts | ✅ | api + web + health check |
| Health checks (liveness + readiness) | ✅ | /health + /healthz |
| Deploy script with auto-rollback | ✅ | scripts/deploy.sh |
| Rollback script | ✅ | scripts/rollback.sh |
| Smoke tests | ✅ | scripts/smoke-test.sh |
| CI pipeline | ✅ | GitHub Actions ci.yml |
| CD pipeline | ✅ | GitHub Actions deploy.yml |
| Nginx reverse proxy | ✅ | docker/nginx.edge.conf |
| Environment docs | ✅ | DEPLOY.md |
| Database volume persistence | ✅ | Named Docker volumes |
| Log output | ✅ | pino JSON to stdout |
| Centralized log collection | ❌ | No aggregation service |
| APM / monitoring | ⚠️ | Health monitor script only |

## 6. Quality Readiness

| Requirement | Status | Notes |
|-------------|--------|-------|
| Backend tests pass | ✅ | 992/992 |
| Frontend tests pass | ✅ | 193/193 |
| E2E tests pass | ⚠️ | 14 tests, not verified this session |
| Deterministic tests | ✅ | UUID-isolated, in-memory SQLite |
| CI runs all checks | ✅ | tsc + vitest + vite build |
| Code review | ⚠️ | Reward system commits not reviewed |
| No generated files committed | ✅ | .gitignore covers all |

## 7. Release Blockers Summary

| # | Blocker | Severity | Owner |
|---|---------|----------|-------|
| 1 | Messaging rate limit (F5) not implemented | Critical | Backend |
| 2 | Parent.ts stale reward_balance column ref | Critical | Backend |
| 3 | R12 outbox non-atomic (risk assessment) | High | Architecture |
| 4 | Reward frontend (R14) not started | High | Frontend |
| 5 | No automatic outbox retry | High | Backend |
| 6 | No reward expiry function | Medium | Backend |
| 7 | Paystack/Stellar reward funding verification | Medium | Backend |
| 8 | Code review for reward commits | Medium | Team |

## 8. Recommendation

**Do NOT declare production-ready until:**
1. Blockers #1 and #2 are fixed (< 1 day effort)
2. Blocker #3 is either fixed or risk-accepted with documentation
3. Blocker #4 (reward frontend) completed — OR — reward frontend excluded from initial release scope

**Can proceed with limited release if:**
- Reward system backend is present but reward UI is excluded from v1.0
- Messaging rate limit is implemented
- Parent.ts column reference is fixed
- Code review is complete

**Estimated effort to resolve all blockers: 3-5 development sessions**
