# Wave 2 — Manual QA Checklist

**Date:** 2026-07-30
**Branch:** `fix/wave2-2026-07-29`

Pre-deploy manual checks for changes introduced in Wave 2 security remediation.

---

## Batch A — Input Validation & Error Handling

- [ ] **Registration:** Try registering with a name > 200 chars — should be rejected
- [ ] **Registration:** Try registering with an invalid email format — should be rejected
- [ ] **Login:** Attempt login with wrong password — error message should NOT reveal whether email exists
- [ ] **Forum:** Try posting a topic with title > 200 chars or body > 10,000 chars — should be rejected
- [ ] **Announcements:** Create announcement with `<script>` tag in title/body — should be HTML-escaped in response
- [ ] **Error pages:** Trigger a 500 error — response should NOT contain SQLite error details or stack traces
- [ ] **File download:** Download a document with special characters in filename — Content-Disposition should be sanitized

## Batch B — Rate Limiting & Access Control

- [ ] **Rate limiting:** Make 60+ requests in 1 minute — should get 429 Too Many Requests
- [ ] **Student user lookup:** As a student, try `GET /api/v1/users/:otherId` — should get 403
- [ ] **Student progress:** As a student, try viewing another student's progress — should get 403
- [ ] **CORS:** Verify PATCH requests work from the frontend (e.g., updating course codes)
- [ ] **Remint cooldown:** Admin remints a credential, then immediately tries again — should be rejected (1hr cooldown)
- [ ] **Invite acceptance:** Try accepting an invite with a different email than invited — should be rejected

## Batch C — Mint & Data Integrity

- [ ] **Certificates list:** Navigate to admin certificates page — should load with pagination (max 100 per page)
- [ ] **Credentials list:** Navigate to admin credentials page — should load with pagination
- [ ] **Forum pagination:** Open a topic with many posts — should paginate correctly
- [ ] **Messages pagination:** Open a conversation — messages should paginate
- [ ] **NFT mint:** Admin triggers mint for a student — should complete normally
- [ ] **NFT remint:** Admin remints a credential — should see audit log entry (check via API or DB)
- [ ] **User directory:** Admin opens user directory — should load without N+1 performance issue

## Batch D — Audit & Observability

- [ ] **Role change:** Admin changes a user's role — verify `audit_log` table has CHANGE_ROLE entry
- [ ] **Remint:** Admin remints a credential — verify `audit_log` table has REMINT_CREDENTIAL entry
- [ ] **Self role change:** Admin tries to change own role — should be rejected

## Production Migration (LMS-DB-001)

- [ ] **Pre-deploy:** Back up production DB (`/app/data/student_ms.db`)
- [ ] **Post-deploy:** Verify quizzes FK: `sqlite3 /app/data/student_ms.db "SELECT sql FROM sqlite_master WHERE name='quizzes';"` — should show `REFERENCES courses(id)`
- [ ] **Verify data:** `sqlite3 /app/data/student_ms.db "SELECT COUNT(*) FROM quizzes;"` — count should match pre-deploy
- [ ] **Rollback ready:** Rollback SQL documented in `docs/WAVE2_SUMMARY.md` — verify accessible
