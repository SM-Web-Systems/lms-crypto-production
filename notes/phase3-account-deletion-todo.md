# Phase 3 — Account Deletion + Forum Integration TODO

**Spec:** `docs/phase3/specs/01-account-deletion-forum.md`
**Branch:** `feat/phase3-account-deletion-forum` (merged)
**Status:** DEPLOYED — 2026-09-07

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

## Loop 16 — PR + Deploy (DONE)
- [x] Final code review pass (security, PII, RBAC, audit)
- [x] PR #41 created and merged: https://github.com/SM-Web-Systems/lms-crypto-production/pull/41
  - Merge commit: `414dc26`
- [x] Post-merge fixes (committed directly to main):
  - `31a236b`: fix user_profiles anonymization (dynamic column detection)
  - `cfa2405`: fix deploy health check URL (port 3001 not mapped to host)
- [x] Production deploy: `cfa2405` deployed 2026-09-07 ~13:35 UTC
- [x] Smoke test PASSED:
  - Created test user with forum topic + reply
  - Deleted account → finalized via docker exec
  - Tombstones confirmed: `title: null`, `body: null`, `isDeleted: true`, `author: "Deleted User"`
  - Single topic returns 404
  - Admin audit view: full content visible with `deletion_type = 'account_deletion'`
  - Audit event logged: `account_deletion.forum_content_removed` with correct counts
  - Identity snapshot preserved: original name + email
- [x] Data integrity: 17/4/10/47/3/4 (baseline +2 smoke users, +1 topic, +1 post)

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

## Issues Found During Deploy

1. **Deploy script health check** — `http://127.0.0.1:3001/health` not reachable from host (port not mapped). Fixed to `https://lms.smwebsystems.com/api/v1/health`.
2. **user_profiles schema mismatch** — `anonymizeUser()` referenced columns (`bio`, `phone`, `address`, `avatar_url`, `date_of_birth`) that don't exist in production (actual: `avatar_path`, `whatsapp`, `telegram`, etc.). Fixed with dynamic column detection via `pragma_table_info`.
