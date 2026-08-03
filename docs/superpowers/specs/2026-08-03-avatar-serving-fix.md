# Avatar Serving Fix — Developer Spec

**Date:** 2026-08-03
**Classification:** Bug fix
**Severity:** High (P0)
**Affected routes:** `/student/profile`, `/lecturer/profile`, `/admin/profile`

---

## Problem Statement

Avatar upload works correctly — files are saved to disk and the database is updated. However, the returned avatar URL cannot be loaded by the browser because the nginx reverse proxy does not route `/uploads/avatars/` requests to the backend.

## Root Cause

The security audit (LMS-UPLOAD-001) correctly removed general static file serving for submissions and documents. Avatar serving was kept via `express.static` at `app.ts:210`:

```javascript
app.use('/uploads/avatars', express.static(path.join(UPLOAD_DIR, 'avatars')));
```

However, the host nginx config (`/home/webadmin/web-stack/nginx/conf/default.conf`) only has two location blocks:
- `location /api/` → `lms-api:3001` (backend)
- `location /` → `lms-web:80` (frontend SPA catch-all)

When the browser requests `https://lms.smwebsystems.com/uploads/avatars/<uuid>.jpg`, nginx matches the catch-all `location /` and proxies to the frontend SPA, which returns `index.html` (HTML) instead of the image file.

## Implementation Options Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **1. Nginx proxy block** | Add `location /uploads/avatars/` → `lms-api:3001` | Simple, 5 lines, no code change | Avatars served without auth |
| 2. Authenticated API endpoint | Create `/api/v1/avatars/:filename` route | Auth-gated | Over-engineered for public profile photos |

**Chosen:** Option 1. Avatars are profile photos visible to all authenticated users. The security audit intentionally kept `express.static` for avatars while removing it for private academic files (submissions/documents). Adding the nginx proxy completes the intended architecture.

## Scope

**In scope:**
- Add nginx `location /uploads/avatars/` proxy block
- Add browser cache headers (1 hour)
- Add integration tests for avatar upload + serving
- Regression test for LMS-UPLOAD-001 (submissions still blocked)

**Non-goals:**
- Changing the avatar upload mechanism
- Adding authentication to avatar serving
- Modifying `profileController.ts` URL construction
- CDN or external storage migration

## Affected Files

| File | Action | Purpose |
|------|--------|---------|
| `/home/webadmin/web-stack/nginx/conf/default.conf` | Modify | Add proxy block |
| `LMS-Server/src/__tests__/avatar-serving.test.ts` | Create | Integration tests |

## Security Compatibility

The LMS-UPLOAD-001 finding removed **general** static serving at `/uploads/`. The remediation explicitly scoped avatar serving as an exception (`app.ts:207` comment: "Serve uploaded avatars only — submissions/documents served via authenticated endpoints"). This fix completes that architecture:

- `/uploads/avatars/*` → proxied to backend → `express.static` serves image files
- `/uploads/submissions/*` → no proxy rule → frontend catch-all → returns HTML (not a real file)
- `/uploads/documents/*` → no proxy rule → frontend catch-all → returns HTML (not a real file)
- Submissions/documents served only via `/api/v1/submissions/:id/download` and `/api/v1/documents/:id/download` (authenticated)

## Test Plan

1. **avatar-serving.test.ts** — 4 cases:
   - Upload avatar → returns URL → URL resolves to image data (not HTML)
   - Non-image MIME type → rejected
   - Unauthenticated upload → 401
   - All three roles can upload avatars

2. **upload-security.test.ts** (existing) — verify still passes:
   - GET `/uploads/submissions/test.pdf` → 404 (not statically served)
   - GET `/uploads/avatars/test.png` → 200 (avatars still work)

3. **Manual QA** — rerun QA steps:
   - Admin profile: upload avatar, verify renders, refresh persists
   - Student profile: upload avatar, verify renders
   - Lecturer profile: upload avatar, verify renders
   - Other user's profile view: verify avatar displays

## Acceptance Criteria

- [ ] `curl https://lms.smwebsystems.com/uploads/avatars/<real-uuid>.jpg` returns `content-type: image/jpeg` (not `text/html`)
- [ ] `curl https://lms.smwebsystems.com/uploads/submissions/anything.pdf` returns `content-type: text/html` (security preserved)
- [ ] Avatar upload + display works for admin, student, and lecturer roles
- [ ] All 492+ backend tests pass
- [ ] `upload-security.test.ts` passes (LMS-UPLOAD-001 intact)
- [ ] New `avatar-serving.test.ts` passes (4 tests)

## Risks

| Risk | Mitigation |
|------|-----------|
| Nginx reload causes brief downtime | `nginx -s reload` is graceful (no downtime) |
| Proxy block accidentally serves other upload types | Block is scoped to `/uploads/avatars/` only |
| Cache headers cause stale avatars | 1-hour max-age is reasonable; avatars use UUID filenames so new uploads get new URLs |
