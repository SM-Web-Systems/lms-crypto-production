# Forum Anonymization & Account Deletion — TODO List

**Last updated:** 2026-09-04
**Plan:** `docs/superpowers/plans/2026-09-04-forum-anonymization-implementation-plan.md`

---

## Status Legend
- `[ ]` Pending
- `[~]` In Progress
- `[x]` Completed
- `[!]` Blocked

---

## Phase 1: Schema & Infrastructure

| # | Task | Status | Depends On | Acceptance Criteria | Test Evidence | Commit |
|---|------|--------|-----------|---------------------|---------------|--------|
| 1.1 | Create feature branch from origin/main | [ ] | — | Branch `feat/account-deletion-forum-anonymization` exists based on `2491bd5` | `git branch --show-current` | — |
| 1.2 | Add deletion columns to users table | [ ] | 1.1 | `PRAGMA table_info(users)` shows deletion_status, deletion_requested_at, deletion_finalized_at, deletion_requested_by, legal_hold_reason, legal_hold_placed_at, legal_hold_review_date | Migration test | C1 |
| 1.3 | Create deleted_user_identities table | [ ] | 1.1 | `SELECT name FROM sqlite_master WHERE type='table' AND name='deleted_user_identities'` returns 1 row | Migration test | C1 |
| 1.4 | Create deletion_requests table | [ ] | 1.1 | Table exists with correct columns and indexes | Migration test | C1 |
| 1.5 | Create identity_access_log table | [ ] | 1.1 | Table exists with correct columns and indexes | Migration test | C1 |
| 1.6 | Add privacy.view_deleted_identity permission | [ ] | 1.1 | `SELECT * FROM permissions WHERE name='privacy.view_deleted_identity'` returns 1 row | Seed test | C1 |
| 1.7 | Write migration tests | [ ] | 1.2-1.6 | All schema assertions pass | `npx vitest run` | C1 |

## Phase 2: Deletion Request Service

| # | Task | Status | Depends On | Acceptance Criteria | Test Evidence | Commit |
|---|------|--------|-----------|---------------------|---------------|--------|
| 2.1 | Write DEL-01 through DEL-10 tests (failing) | [ ] | 1.7 | Tests exist and fail | `npx vitest run deletion-request` shows 10 failures | C2 |
| 2.2 | Implement deletionService.ts | [ ] | 2.1 | requestDeletion, cancelDeletion, getDeletionStatus, placeLegalHold, releaseLegalHold | Tests pass | C2 |
| 2.3 | Implement accountDeletion routes | [ ] | 2.2 | Routes registered in app.ts | HTTP tests pass | C2 |
| 2.4 | Send confirmation email with cancel link | [ ] | 2.2 | Email sent on request; cancel token valid | Manual verify | C2 |
| 2.5 | Verify all DEL tests pass | [ ] | 2.2-2.4 | 10/10 pass | `npx vitest run deletion-request` | C2 |

## Phase 3: Auth Gate

| # | Task | Status | Depends On | Acceptance Criteria | Test Evidence | Commit |
|---|------|--------|-----------|---------------------|---------------|--------|
| 3.1 | Write auth gate tests (DEL-05 through DEL-08) | [ ] | 2.5 | Tests exist | Test file | C3 |
| 3.2 | Modify middleware/auth.ts | [ ] | 3.1 | pending_deletion blocks normal routes; finalized returns 401; allowlist works | Tests pass | C3 |
| 3.3 | Verify existing auth tests still pass | [ ] | 3.2 | All pre-existing auth tests pass | `npx vitest run` | C3 |

## Phase 4: Anonymization Service

| # | Task | Status | Depends On | Acceptance Criteria | Test Evidence | Commit |
|---|------|--------|-----------|---------------------|---------------|--------|
| 4.1 | Write ANON-01 through ANON-15 tests (failing) | [ ] | 3.3 | Tests exist and fail | `npx vitest run anonymization` | C4 |
| 4.2 | Implement anonymizationService.ts | [ ] | 4.1 | snapshotIdentity, anonymizeUser | Tests pass | C4 |
| 4.3 | Verify idempotency (ANON-13) | [ ] | 4.2 | Running twice produces same result | Test pass | C4 |
| 4.4 | Verify email placeholder randomness (ANON-14) | [ ] | 4.2 | Email not derived from user ID | Test pass | C4 |
| 4.5 | Verify all ANON tests pass | [ ] | 4.2-4.4 | 15/15 pass | `npx vitest run anonymization` | C4 |

## Phase 5: Finalization Scheduler

| # | Task | Status | Depends On | Acceptance Criteria | Test Evidence | Commit |
|---|------|--------|-----------|---------------------|---------------|--------|
| 5.1 | Write FIN-01 through FIN-05 tests (failing) | [ ] | 4.5 | Tests exist and fail | `npx vitest run finalization` | C5 |
| 5.2 | Implement finalizationScheduler.ts | [ ] | 5.1 | processExpiredRequests works | Tests pass | C5 |
| 5.3 | Wire scheduler into server.ts | [ ] | 5.2 | Scheduler starts/stops cleanly | Server starts without error | C5 |
| 5.4 | Verify all FIN tests pass | [ ] | 5.2-5.3 | 5/5 pass | `npx vitest run finalization` | C5 |

## Phase 6: Forum Controller Changes

| # | Task | Status | Depends On | Acceptance Criteria | Test Evidence | Commit |
|---|------|--------|-----------|---------------------|---------------|--------|
| 6.1 | Write FORUM-01 through FORUM-07 tests (failing) | [ ] | 4.5 | Tests exist and fail | `npx vitest run forum-anonymization` | C6 |
| 6.2 | Change forum JOINs to LEFT JOIN + CASE | [ ] | 6.1 | Deleted authors show as 'Deleted User' | Tests pass | C6 |
| 6.3 | Update toAuthor() and row mappers | [ ] | 6.2 | isDeletedAuthor flag in response | Tests pass | C6 |
| 6.4 | Block posting for pending/finalized users | [ ] | 6.2 | 403 on create topic/post | Tests pass | C6 |
| 6.5 | Verify existing forum tests still pass | [ ] | 6.2-6.4 | Pre-existing forum-xss and forum-length tests pass | `npx vitest run` | C6 |

## Phase 7: Data Export Enhancement

| # | Task | Status | Depends On | Acceptance Criteria | Test Evidence | Commit |
|---|------|--------|-----------|---------------------|---------------|--------|
| 7.1 | Write EXPORT-01 test (failing) | [ ] | 4.5 | Test exists and fails | `npx vitest run deletion-export` | C7 |
| 7.2 | Add forum content to dataExportService | [ ] | 7.1 | Export ZIP includes forum-topics.json and forum-posts.json | Test passes | C7 |

## Phase 8: Compliance Access API

| # | Task | Status | Depends On | Acceptance Criteria | Test Evidence | Commit |
|---|------|--------|-----------|---------------------|---------------|--------|
| 8.1 | Write AUDIT-01 through AUDIT-05 tests (failing) | [ ] | 4.5 | Tests exist and fail | `npx vitest run compliance-access` | C8 |
| 8.2 | Implement complianceAdmin routes | [ ] | 8.1 | GET /admin/deleted-identities/:userId works | Tests pass | C8 |
| 8.3 | Implement identity_access_log recording | [ ] | 8.2 | Every access logged | Tests pass | C8 |
| 8.4 | Verify permission check (AUDIT-05) | [ ] | 8.2 | Non-authorized users get 403 | Tests pass | C8 |

## Phase 9: Frontend — Deletion UI

| # | Task | Status | Depends On | Acceptance Criteria | Test Evidence | Commit |
|---|------|--------|-----------|---------------------|---------------|--------|
| 9.1 | Write FE-01 through FE-03 tests | [ ] | 8.4 | Tests exist | Frontend test run | C9 |
| 9.2 | Create DeleteAccountSection component | [ ] | 9.1 | Renders delete button and modal | Tests pass | C9 |
| 9.3 | Create PendingDeletionBanner component | [ ] | 9.1 | Shows when pending | Tests pass | C9 |
| 9.4 | Create deletionService.ts (frontend) | [ ] | 9.2 | API client for deletion endpoints | Tests pass | C9 |
| 9.5 | Update AuthContext for pending_deletion | [ ] | 9.3 | Handles 403 ACCOUNT_PENDING_DELETION | Tests pass | C9 |
| 9.6 | Integrate into Profile.tsx | [ ] | 9.2 | Delete section visible at bottom | Visual verify | C9 |

## Phase 10: Frontend — Forum Anonymous Author

| # | Task | Status | Depends On | Acceptance Criteria | Test Evidence | Commit |
|---|------|--------|-----------|---------------------|---------------|--------|
| 10.1 | Write FE-04 and FE-05 tests | [ ] | 6.5 | Tests exist | Frontend test run | C10 |
| 10.2 | Update Forum.tsx for deleted author display | [ ] | 10.1 | 'Deleted User' shown, no profile link | Tests pass | C10 |
| 10.3 | Update types/forum.ts | [ ] | 10.1 | ForumAuthor allows deleted state | TypeScript compiles | C10 |

## Phase 11: Frontend — Admin Panel

| # | Task | Status | Depends On | Acceptance Criteria | Test Evidence | Commit |
|---|------|--------|-----------|---------------------|---------------|--------|
| 11.1 | Write FE-06 test | [ ] | 8.4 | Test exists | Frontend test run | C11 |
| 11.2 | Create DeletionManagementPanel component | [ ] | 11.1 | Lists requests, legal hold controls | Tests pass | C11 |
| 11.3 | Integrate into AdminDashboard.tsx | [ ] | 11.2 | Panel visible to privacy-authorized admins | Visual verify | C11 |

## Phase 12: Integration & E2E Tests

| # | Task | Status | Depends On | Acceptance Criteria | Test Evidence | Commit |
|---|------|--------|-----------|---------------------|---------------|--------|
| 12.1 | Write INT-01 through INT-05 integration tests | [ ] | 5.4, 6.5, 7.2, 8.4 | All integration tests pass | `npx vitest run` | C12 |
| 12.2 | Write E2E-01 through E2E-03 Playwright tests | [ ] | 9.6, 10.2, 11.3 | All E2E tests pass | `npx playwright test` | C12 |
| 12.3 | Run full test suite | [ ] | 12.1-12.2 | All 1270+ BE + 227+ FE + 14+ E2E tests pass | Full test output | C12 |

## Phase 13: Documentation & Review

| # | Task | Status | Depends On | Acceptance Criteria | Test Evidence | Commit |
|---|------|--------|-----------|---------------------|---------------|--------|
| 13.1 | Update OpenAPI annotations for new endpoints | [ ] | 8.4 | Swagger UI shows new endpoints | `/api-docs` check | C13 |
| 13.2 | Update design spec with implementation notes | [ ] | 12.3 | Spec reflects actual implementation | Doc review | C13 |
| 13.3 | Update Mermaid diagrams | [ ] | 12.3 | Diagrams match implementation | Visual review | C13 |
| 13.4 | Create retention schedule document | [ ] | 12.3 | `docs/retention-schedule.md` exists | Doc review | C13 |
| 13.5 | Scan diffs for secrets and PII | [ ] | 12.3 | No secrets or user data in diffs | `git diff` review | C13 |
| 13.6 | Request code review | [ ] | 13.5 | PR created with review checklist | PR URL | C13 |

## Future Work (Out of Scope)

| # | Task | Notes |
|---|------|-------|
| F1 | Retention expiry scheduler | Auto-purge records past retention period |
| F2 | Forum moderation system | Flag, hide, lock, move topics |
| F3 | Mobile app deletion UI | LMS-Mobile updates |
| F4 | Third-party processor cleanup | Propagate deletion to external services |
| F5 | Backup restoration guard | Rerun anonymization after restore |
| F6 | Content-level redaction | Remove PII from post body text |

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| 1. Schema | 7 | Pending |
| 2. Deletion Request | 5 | Pending |
| 3. Auth Gate | 3 | Pending |
| 4. Anonymization | 5 | Pending |
| 5. Finalization | 4 | Pending |
| 6. Forum Controller | 5 | Pending |
| 7. Data Export | 2 | Pending |
| 8. Compliance Access | 4 | Pending |
| 9. Frontend Deletion | 6 | Pending |
| 10. Frontend Forum | 3 | Pending |
| 11. Frontend Admin | 3 | Pending |
| 12. Integration/E2E | 3 | Pending |
| 13. Documentation | 6 | Pending |
| **Total** | **56** | **0 complete** |
