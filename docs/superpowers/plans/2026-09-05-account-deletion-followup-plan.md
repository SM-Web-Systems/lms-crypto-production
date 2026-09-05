# Account Deletion Follow-up — Implementation Plan

## Context

Account deletion & forum anonymization shipped in PR #3 (merged 2026-09-05, deployed as `96d2e8c`). Four items were intentionally deferred:

1. Frontend "Deleted User" styling
2. Avatar disk cleanup on finalization
3. Docs alignment with main
4. E2E Playwright specs

All four are independent. We'll work through them sequentially on a single feature branch.

---

## Branch

`feat/account-deletion-followup` off current `main` (`cdb28c0`)

---

## Workstream 1: Frontend "Deleted User" Styling

### Files to modify

- `LMS-Frontend/src/types/forum.ts` — Add `isDeleted?: boolean`, fix `email: string | null`
- `LMS-Frontend/src/pages/Forum.tsx` — Update `PostAuthor` component + topic list author rendering

### Changes

**`forum.ts`** — Update `ForumAuthor`:
```typescript
export interface ForumAuthor {
  id: string;
  name: string;
  email: string | null;        // was: string (non-nullable)
  role: 'student' | 'admin';
  isDeleted?: boolean;          // new
}
```

**`Forum.tsx` — `PostAuthor` component**:
- Accept `isDeleted?: boolean` prop
- When `isDeleted`: muted text (`text-neutral-400` instead of `text-neutral-700`), italic name, hide role badge
- Add `title="This user has deleted their account"` on the name span for tooltip

**`Forum.tsx` — topic list**:
- Pass `isDeleted` through from `topic.author?.isDeleted`
- Apply same muted styling to topic list author name

### Tests

- Frontend tests: check `PostAuthor` renders muted styling when `isDeleted=true`

---

## Workstream 2: Avatar Disk Cleanup

### Files to modify

- `LMS-Server/src/services/deletionService.ts` — Add avatar file deletion in `anonymizeUser()`

### Changes

In `anonymizeUser()`, before the `user_profiles` UPDATE:
1. Query `user_profiles.avatar_path` for the user
2. If a path exists, call `fs.unlinkSync(path)` wrapped in try/catch (log error but don't block finalization)
3. The existing UPDATE already sets `avatar_url = NULL`

### Tests

- ANON-07: User with avatar_path: file deleted after anonymization
- ANON-08: User without avatar_path: no errors

---

## Workstream 3: Docs Alignment

Save follow-up plan document to `docs/superpowers/plans/`.

---

## Workstream 4: E2E Playwright Specs

### Files to create

- `e2e/tests/account-deletion.spec.ts`

### Test scenarios (API-based, matching existing E2E patterns)

1. **Deletion request lifecycle** — Register test user, request deletion, check status, cancel, verify user can still access endpoints
2. **Auth gate for pending deletion** — Request deletion, verify restricted endpoints return 403, verify allowed endpoints still work
3. **Forum anonymization** — Create forum topic+post, request+finalize deletion, verify forum GET returns `"Deleted User"` and `isDeleted: true`
4. **Compliance identity access** — As admin with `privacy.view_deleted_identity`, call `GET /admin/deleted-identities/:id`, verify original PII returned

---

## Verification

- `cd LMS-Server && npx vitest run` — all backend tests pass
- `cd LMS-Frontend && npx vitest run` — all frontend tests pass
- `cd e2e && npx playwright test account-deletion` — E2E specs pass
