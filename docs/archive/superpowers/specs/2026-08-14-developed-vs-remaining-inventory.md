# LMS-AmmaWallet — Developed vs Remaining Inventory

> **Date:** 2026-08-14 | **Commit:** fd6e66d | **Remote:** Pushed ✅

## 1. Executive Status

The LMS-AmmaWallet platform is a feature-rich learning management system with:
- 58 database tables
- 992 backend tests + 193 frontend tests (1185 total, 100% passing)
- 14 E2E tests
- 12 user roles with RBAC (76 permissions)
- Full reward system backend (R2-R12 of 17 steps)
- Complete authentication (local + AmmaWallet SSO)
- Course management, quiz, assignment, certificate/NFT workflows
- Multi-tenant architecture
- Payment processing (Paystack + Stellar + Manual)
- Production deploy pipeline

**Production readiness: ~85% backend, ~70% frontend, ~50% reward system**

## 2. GitHub Verification

| Check | Result |
|-------|--------|
| Local HEAD | fd6e66d |
| Remote HEAD | fd6e66d |
| Unpushed commits | 0 |
| Uncommitted changes | 0 |
| Branch | main |

## 3. Test Baseline

| Suite | Files | Tests | Pass | Fail | Exit |
|-------|-------|-------|------|------|------|
| Backend | 121 | 992 | 992 | 0 | 0 |
| Frontend | 31 | 193 | 193 | 0 | 0 |
| E2E | 6 | 14 | Not verified this session | — | — |
| **Total** | **158** | **1199** | **1185 verified** | **0** | — |

## 4. Complete Phase Inventory

### Foundation Phases (All COMPLETE)

| Phase | Feature | Status | Backend | Frontend | Tests |
|-------|---------|--------|---------|----------|-------|
| Phase A | Foundation (users, links, groups, login history, course approval) | ✅ Complete | 8 route files | ParentDashboard, TeacherDashboard, EmployerDashboard | phase-a-foundation.test.ts |
| Phase B | Sponsor + Employer roles | ✅ Complete | sponsor.ts, employer.ts | SponsorDashboard, EmployerDashboard | phase-b-sponsor-employer.test.ts |
| Phase C | Parent + Teacher roles, Lecturer | ✅ Complete | parent.ts, teacher.ts | ParentDashboard, TeacherDashboard, LecturerDashboard | phase-c-parent-teacher.test.ts |
| Phase D | Instructor/TA refinement | ✅ Complete | ta.ts, TA grading workflow | TADashboard | phase-d-instructor-ta.test.ts |
| Phase E | Admin tiers, super-student | ✅ Complete | system_config, admin tiers | AdminDashboard enhancements | phase-e-admin-tiers.test.ts |
| Phase F | Cross-cutting (sessions, GDPR, disputes, login history, messaging) | ⚠️ Partial | Sessions, GDPR, disputes, login history complete; Messaging rate limit NOT implemented | No frontend for login history, GDPR | phase-f-cross-cutting.test.ts |

### LMS Core Phases (All COMPLETE)

| Phase | Feature | Status |
|-------|---------|--------|
| Phase 2 | Admin course builder new item types | ✅ Complete |
| Phase 3 | Student viewer new item types | ✅ Complete |
| Phase 4 | Smart completion | ✅ Complete |
| Phase 5 | Enhanced course interactions | ✅ Complete |
| Phase 6 | Deeper course interactions | ✅ Complete |
| Phase 7 C1 | Audio playback progress | ✅ Complete |
| Phase 11 | Manual payments + freemium tiers + sponsor cohorts | ✅ Complete |
| Phase 12B | Capability-based RBAC | ✅ Complete |
| Phase 12 C1 | Paystack + Stellar payment automation | ✅ Complete |
| Phase 13 C1 | RBAC route migration (51 authorize→requirePermission) | ✅ Complete |
| Phase 14 C1 | Cohort completion tracking | ✅ Complete |
| Phase 15 C1 | Browser QA sweep | ✅ Complete |
| Phase 16 C1 | Invoice/Receipt PDF | ✅ Complete |
| Phase 16 C2 | Dead code cleanup | ✅ Complete |
| Phase 16 C4 | RBAC admin panel | ✅ Complete |
| Phase 17 C3 | Accessibility fixes | ✅ Complete |
| Phase 18 C1 | Student payment history | ✅ Complete |
| Phase 19 C1 | Payment analytics dashboard | ✅ Complete |
| Phase 20 C1 | Multi-tenant architecture | ✅ Complete |
| Phase 21 C1 | Observability (pino logging, request tracing) | ✅ Complete |
| Phase 21 C2 | Quiz UX improvements | ✅ Complete |
| Phase 21 C3 | E2E testing framework | ✅ Complete |
| Phase 22 C1 | Technical debt cleanup | ✅ Complete |
| Phase 22 C2 | Cohort status transitions | ✅ Complete |
| Phase 22 C3 | Email template extraction | ✅ Complete |
| Phase 22 C4 | Sponsor enhancements (bulk invite, spending report) | ✅ Complete |
| Phase 23 C1 | Production deploy pipeline | ✅ Complete |
| Phase 23 C2 | API documentation (OpenAPI/Swagger) | ✅ Complete |
| Phase 23 C3 | Notifications v2 | ✅ Complete |
| Phase 23 C4 | NFT certificate badge improvements | ✅ Complete |
| Phase 24 C1 | QR code on certificate PDF | ✅ Complete |
| Phase 24 C2 | Social media sharing | ✅ Complete |
| Phase 24 C3 | Badge gallery page | ✅ Complete |
| Phase 25 C5 | Bulk certificate export | ✅ Complete |
| Phase 26 C1 | Global search | ✅ Complete |
| Phase 26 C2 | Course bulk upload UI | ✅ Complete |
| Phase 26 C3 | Course data model + import template | ✅ Complete |
| Phase 26 C4 | Course import workflow | ✅ Complete |
| Phase 27 C1 | Upload extensions + GitHub import | ✅ Complete |

### Reward System Phases

| Loop | Feature | Status | Tests |
|------|---------|--------|-------|
| R0 | Baseline + inventory | ✅ Complete | — |
| R1 | Spec finalization | ✅ Complete | — |
| R2 | Schema + migration | ✅ Complete | 11 tests |
| R3 | Currency config | ✅ Complete | 10 tests |
| R4 | Balance service | ✅ Complete | 10 tests |
| R5 | Ledger | ✅ Complete | 22 tests |
| R6 | State machine | ✅ Complete | 17 tests |
| R7 | Scope service | ✅ Complete | 9 tests |
| R8 | Permissions + orchestration | ✅ Complete | 5 + 12 tests |
| R9 | Sponsor + employer routes | ✅ Complete | 11 + 8 tests |
| R10 | Parent routes | ✅ Complete | 8 tests |
| R11 | Teacher routes | ✅ Complete | 8 tests |
| R12 | Eligibility outbox + controller hooks | ✅ Complete (with deviation) | 12 tests |
| R13 | Lifecycle tests (cancel, expiry, group refund) | ❌ Not started | 0 of 10 planned |
| R14 | Reward frontend components | ❌ Not started | 0 of 8 planned |
| R15 | Security hardening tests | ❌ Not started | 0 of 8 planned |
| R16 | Full regression | ❌ Not started | — |
| R17 | Tag + push release | ❌ Not started | — |

**Reward tests: 143 of ~170 planned (84%)**

## 5. Role Readiness Matrix

| Role | Backend | Frontend | Signup | Dashboard | Rewards | Billing | Messages | Tests | Prod Ready |
|------|---------|----------|--------|-----------|---------|---------|----------|-------|------------|
| student | ✅ Full | ✅ Full (10 pages) | ✅ AmmaWallet SSO | ✅ StudentDashboard | View only | ✅ Own history | ✅ | Extensive | ✅ |
| super-student | ✅ Auto-promote | ⚠️ No dedicated UI | ✅ Auto | ⚠️ Uses student | View only | ✅ | ✅ | phase-e | ⚠️ |
| parent | ✅ Full (10 endpoints) | ✅ ParentDashboard | ❌ Admin-assigned | ✅ Multi-tab | ✅ Backend only | ✅ View | ✅ | phase-c | ⚠️ No onboard |
| teacher | ✅ Full (10 endpoints) | ✅ TeacherDashboard | ❌ Admin-assigned | ✅ Multi-tab | ✅ Backend only | ✅ View | ✅ | phase-c | ⚠️ No onboard |
| employer | ✅ Full (8 endpoints) | ✅ EmployerDashboard | ❌ Admin-assigned | ✅ Multi-tab | ✅ Backend only | ✅ View | ✅ | phase-b | ⚠️ No onboard |
| sponsor | ✅ Full + cohorts | ✅ SponsorDashboard + Portal | ❌ Admin-assigned | ✅ Multi-tab | ✅ Backend only | ✅ Full | ✅ | phase-b, cohorts | ⚠️ No onboard |
| instructor | ✅ Full + course CRUD | ✅ LecturerDashboard (3 pages) | ❌ Admin-assigned | ✅ | View only | ✅ Own | ✅ | phase-c, phase-d | ⚠️ No onboard |
| teaching-assistant | ✅ Full (6 endpoints) | ✅ TADashboard | ❌ Admin-assigned | ✅ | View only | ❌ | ✅ | phase-d | ⚠️ No onboard |
| admin | ✅ Full (all platform) | ✅ 8 pages + panels | ❌ Super-admin assigns | ✅ AdminDashboard | ✅ Manage | ✅ Full | ✅ | Extensive | ✅ |
| admin-2 | ✅ Admin + refund + roles | ⚠️ Uses admin dashboard | ❌ Super-admin assigns | ⚠️ Inherits admin | ✅ Manage | ✅ Full + refund | ✅ | rbac tests | ⚠️ |
| super-admin | ✅ All 76 permissions | ⚠️ Uses admin dashboard | Hardcoded email | ⚠️ Inherits admin | ✅ Full | ✅ Full | ✅ | rbac tests | ✅ |
| custom-user | ⚠️ 1 permission only | ⚠️ resolveClosestRole → student | ❌ Admin assigns | ⚠️ Heuristic routing | ❌ | ❌ | ❌ | phase-g (routing only) | ❌ |

**Fully production-ready roles: 3 (student, admin, super-admin)**
**Functional but missing onboarding: 8 (parent, teacher, employer, sponsor, instructor, TA, admin-2, super-student)**
**Placeholder only: 1 (custom-user)**

## 6. Reward System Detailed Status

| Component | Status | Evidence |
|-----------|--------|----------|
| Schema (8 tables) | ✅ Implemented + tested | reward-schema.test.ts (11 tests) |
| Reward accounts (funder/recipient/platform) | ✅ Implemented + tested | reward-balance.test.ts (10 tests) |
| Integer stroop accounting | ✅ No float in accounting path | currencyConfig.ts: parseStroops rejects `.` and `e` |
| XLM-only enforcement | ✅ Schema CHECK + runtime | reward-currency.test.ts (10 tests) |
| State machine (13 states) | ✅ Implemented + tested | reward-state-machine.test.ts (17 tests) |
| Allocations lifecycle | ✅ Implemented + tested | reward-orchestration.test.ts (12 tests) |
| Immutable ledger | ✅ Implemented + tested | reward-ledger.test.ts (22 tests) |
| Funding sources (4 types) | ⚠️ Schema + service, no external verification | Admin grant works; Paystack/Stellar funding refs not validated |
| Paystack funding verification | ❌ Not integrated | paystackService.ts has zero reward references |
| Stellar funding verification | ❌ Not integrated | stellarPaymentMonitor.ts has zero reward references |
| RBAC permissions (11 reward perms) | ✅ Implemented + tested | reward-permissions.test.ts (5 tests) |
| Scope enforcement (5 scope types) | ✅ Implemented + tested | reward-scope.test.ts (9 tests) |
| Audience snapshots | ✅ Frozen at activation | Tested via scope + orchestration tests |
| Eligibility outbox | ✅ Implemented + tested | reward-eligibility.test.ts (12 tests) |
| Outbox retry | ⚠️ Partial | Failed events marked `failed`; no automatic retry (manual reset required) |
| Manual approval | ⚠️ Service-level only | approveReward() exists; no dedicated route endpoint confirmed |
| Auto-release threshold | ✅ Implemented + tested | HIGH_VALUE_THRESHOLD = 100 XLM; tenant override column exists but not read |
| Cancellation | ✅ Implemented + tested | All 4 role routes have cancel; tested in orchestration + route tests |
| Expiry | ❌ Schema only | expires_at column exists; no expireReward() function or cron |
| Refund/dispute | ⚠️ Partial | refundAllocation() works + blocked refund tracking; no admin resolve endpoint |
| Sponsor rewards | ✅ 11 route tests | reward-sponsor.test.ts |
| Employer rewards | ✅ 8 route tests | reward-employer.test.ts |
| Parent rewards | ✅ 8 route tests (of 20 planned) | reward-parent.test.ts |
| Teacher rewards | ✅ 8 route tests (of 18 planned) | reward-teacher.test.ts |
| Reward frontend | ❌ Not started | Zero React components |
| Reward notifications | ❌ Not started | No reward notification types |
| Reward reconciliation | ✅ Service function | reconcileAccount() in rewardLedger.ts; no admin endpoint |
| R12 outbox deviation | ⚠️ RELEASE RISK | Primary write + outbox insert NOT in same transaction |

## 7. Release Blockers

### Critical (must fix before production)

1. **R12 outbox non-atomic write** — Primary LMS operation and outbox event are not in the same SQLite transaction. A crash between them loses the eligibility event. Risk: LOW for SQLite (synchronous, in-process), but violates stated transactional-outbox requirement.

2. **Messaging rate limit not implemented** — Phase F spec requires 10 msg/hour to new contacts. Tests exist (F5-RATE-1–4) but implementation middleware is missing. Risk: abuse vector.

3. **`GET /parent/children/wallets` references stale `u.reward_balance` column** — Will break on fresh databases after reward balance migration. Risk: runtime error for parent role.

### High Priority (should fix before production)

4. **No reward frontend** — Backend reward system is complete through R12 but has zero React UI. Sponsors/employers/parents/teachers cannot interact with rewards via browser.

5. **No automatic outbox retry** — Failed outbox events stay in `failed` status forever. No cron/scheduler to retry them.

6. **No reward expiry** — `expires_at` column exists but no `expireReward()` function or scheduler.

7. **Paystack/Stellar funding source verification** — Reward funding accepts `paystack`/`stellar` source types but does not verify payment references against external APIs.

8. **No admin endpoint for resolving blocked refund attempts** — `reward_refund_attempts` table tracks blocked refunds but no API to resolve them.

9. **Approve route endpoints** — `approveReward()` exists at service level but route-level approve endpoints are not confirmed across all 4 role prefixes.

### Medium Priority

10. **Role onboarding** — 8 of 12 roles have no self-service signup; all require admin assignment.
11. **Login history frontend** — No UI for viewing personal login history.
12. **GDPR export frontend** — No UI for requesting data export.
13. **Tenant-level HIGH_VALUE_THRESHOLD override** — Column exists but not read by maybeAutoRelease().
14. **Dedicated audit log endpoint** — No `GET /admin/audit-log`; data embedded in analytics.
15. **Admin-2 / super-admin dedicated dashboards** — Both route to admin dashboard via resolveClosestRole.
16. **E2E tests not verified this session** — 14 tests exist but require running containers.
17. **Missing reward tests** — Parent (12 of 20), Teacher (10 of 18), Sponsor (5 of 16) planned tests not written.

### Low Priority

18. **Custom-user role** — Only 1 permission (session.manage_own), placeholder role.
19. **Super-student dedicated UI** — Renders as regular student.
20. **Reward reconciliation admin endpoint** — Service function exists but no API.
21. **Phase 25 C1-C4** — Badge search, Dynamic OG, Performance, Analytics enhancements (specs exist, not implemented).
22. **Phase 24 C4** — Certificate email notification on mint (spec exists, not implemented).

## 8. Security Status

| Check | Status |
|-------|--------|
| Secrets not committed | ✅ .env in .gitignore |
| JWT revocation | ✅ Active sessions + revocation |
| Session revocation | ✅ Soft-revoke for admin, hard-delete for self |
| RBAC server-side | ✅ 211 requirePermission calls |
| Admin escalation guards | ✅ ESC-1 through ESC-5 |
| Cross-tenant access blocked | ✅ Tenant-aware queries |
| Rate limits | ✅ 4 limiter tiers |
| File upload constraints | ✅ MIME whitelist, size limits |
| CORS headers | ✅ Helmet + explicit CORS |
| Error sanitization | ✅ SQLite errors masked |
| Password hashing | ✅ bcrypt |
| Reset token hashing | ✅ SHA-256 before storage |
| Messaging rate limit | ❌ Not implemented (Phase F5) |

## 9. Financial System Status

| Check | Status |
|-------|--------|
| Paystack checkout + verify | ✅ Working |
| Stellar payment monitoring | ✅ Horizon polling |
| Manual payment confirmation | ✅ Admin workflow |
| Integer stroop accounting | ✅ No float |
| Reward fund + reserve atomic | ✅ SQLite transaction |
| Release idempotent | ✅ checkTransactionIdempotency |
| Refund idempotent | ✅ Blocked refund tracking |
| Reward balance reconciliation | ✅ Service function |
| Invoice PDF generation | ✅ pdfkit |
| Paystack webhook HMAC | ✅ Verified |
| Paystack reward funding verification | ❌ Not integrated |
| Stellar reward funding verification | ❌ Not integrated |

## 10. Deployment Status

| Component | Status |
|-----------|--------|
| Docker builds | ✅ LMS-Server + LMS-Frontend Dockerfiles |
| docker-compose.yml | ✅ api + web services |
| Health checks | ✅ /health (liveness) + /healthz (readiness) |
| Deploy script | ✅ scripts/deploy.sh (rolling + auto-rollback) |
| Rollback script | ✅ scripts/rollback.sh |
| Smoke tests | ✅ scripts/smoke-test.sh |
| GitHub Actions CI | ✅ ci.yml (backend + frontend + E2E) |
| GitHub Actions Deploy | ✅ deploy.yml (manual trigger) |
| Nginx reverse proxy | ✅ docker/nginx.edge.conf |
| TLS/Certbot | ✅ External (Cloudflare tunnel) |
| Database backups | ✅ Daily cron |
| Monitoring | ⚠️ Health monitor script exists; no APM |
| Log aggregation | ⚠️ pino JSON logs; no centralized collection |

## 11. Documentation Status

| Document Type | Count |
|---------------|-------|
| Spec files | 76 |
| Plan files | 142 |
| Diagram files | 14 |
| OpenAPI annotations | 163 (Swagger UI at /api-docs) |
| DEPLOY.md | ✅ |
| schema.sql | ✅ (canonical reference) |

## 12. Recommended Next Steps (Priority Order)

### P0 — Immediate fixes
1. Fix `parent.ts` stale `reward_balance` reference
2. Implement messaging rate limit (Phase F5)
3. Make R12 outbox atomic (or document + mitigate)

### P1 — Reward completion (R13-R17)
4. R13: Lifecycle tests (cancel-after-release, expiry, group refund)
5. Implement `expireReward()` + scheduler
6. R14: Reward frontend components
7. R15: Security hardening tests
8. R16: Full regression
9. R17: Tag + release

### P2 — Role hardening
10. Role onboarding flows for parent/teacher/employer/sponsor
11. Login history + GDPR export frontend
12. Admin-2 / super-admin UI differentiation

### P3 — Financial hardening
13. Paystack/Stellar reward funding verification
14. Admin resolve blocked refund endpoint
15. Reward approve route endpoints

### P4 — Production polish
16. Automatic outbox retry mechanism
17. Tenant-level HIGH_VALUE_THRESHOLD
18. Centralized log collection
19. APM integration
20. Missing spec implementations (Phase 25 C1-C4)
