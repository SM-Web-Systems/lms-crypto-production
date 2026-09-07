# Phase 3 — Account Deletion + Forum Integration TODO

**Spec:** `docs/phase3/specs/01-account-deletion-forum.md`
**Branch:** `feat/phase3-account-deletion-forum`
**Status:** Loop 15 complete (E2E), ready for Loop 16 (PR + deploy)

---

## Loop 13 — Design (DONE)
- [x] Inspect current account deletion flow (deletionService.ts)
- [x] Inspect current forum soft-delete (forumController.ts)
- [x] Confirm FK constraints (ON DELETE CASCADE — but user row preserved)
- [x] Confirm no schema changes needed
- [x] Write spec: `docs/phase3/specs/01-account-deletion-forum.md`
- [x] Write TODO: this file

## Loop 14 — Backend Implementation (DONE)
- [x] Create feature branch `feat/phase3-account-deletion-forum`
- [x] Add `softDeleteForumContentForUser()` to `deletionService.ts`
- [x] Integrate into `anonymizeUser()` (best-effort, try/catch)
- [x] Add audit logging for `account_deletion.forum_content_removed`
- [x] Write tests: `account-deletion-forum.test.ts` (TDD: red → green)
  - [x] ADF-01: Topics soft-deleted on finalization
  - [x] ADF-02: Posts soft-deleted on finalization
  - [x] ADF-03: Already-deleted content unaffected
  - [x] ADF-04: Other users' content unaffected
  - [x] ADF-05: Audit event logged with correct counts
  - [x] ADF-06: Forum soft-delete failure doesn't block finalization
  - [x] ADF-07: User with no forum content (no errors, no spurious audit)
  - [x] ADF-08: Tombstones in user-facing queries after account deletion
  - [x] ADF-09: Admin audit view shows full content + deletion_type + original identity
- [x] Run full test suite — 1413/1413, zero regressions
- [x] Run typecheck — clean
- [x] Production data verified unchanged (15/4/10/47/2/3)

## Loop 15 — Frontend + E2E (DONE)
- [x] Review frontend account-deletion UI — no dedicated UI exists (API-only flow)
- [x] Tombstones verified via backend tests ADF-08/ADF-09 (existing forum views handle soft-deleted content)
- [x] Write E2E tests: `e2e/tests/account-deletion-forum.spec.ts` (4 tests)
  - [x] E2E-ADF-01: Pending-deletion user cannot create forum topics (auth gate)
  - [x] E2E-ADF-02: Pending-deletion user cannot reply to forum topics (auth gate)
  - [x] E2E-ADF-03: Cancelling deletion restores forum access
  - [x] E2E-ADF-04: Forum content by pending-deletion user still visible to others
- [x] All 4 E2E tests passing, no regressions in existing E2E suite
- [x] Full backend suite: 1413/1413 passing
- [ ] Manual browser QA (deferred — no frontend UI to test; all behavior is API-only)

## Loop 16 — PR + Deploy
- [ ] Final code review pass (security, PII, RBAC, audit)
- [ ] Write deploy notes: `notes/phase3-deploy-notes.md`
- [ ] Prepare PR with spec links + test results
- [ ] Await approval before merge

---

## Key Decisions

1. **No schema changes** — existing soft-delete columns suffice.
2. **Best-effort** — forum soft-delete failure won't block account finalization.
3. **System actor** — `deleted_by = 'system:account_deletion'` (not a user ID).
4. **Other users' posts preserved** — only the deleted user's own content is soft-deleted.
5. **New deletion_type** — `'account_deletion'` added alongside existing types.
6. **Single audit event per user** — not per topic/post.

## Risk Assessment

- **Risk:** LOW — additive UPDATE only, no schema changes, no API changes.
- **Rollback:** Simple SQL to restore soft-deleted content by `deletion_type = 'account_deletion'`.
- **Blast radius:** Only affects `anonymizeUser()` path. Existing forum/deletion features untouched.
