# Wave 2 — Developer Specification Addendum

**Date:** 2026-07-30
**Branch:** `fix/wave2-2026-07-29`

This document describes new edge cases, constraints, and modules introduced by Wave 2 security remediation. It supplements the existing `BACKEND_SPECIFICATION.md`.

---

## New Module: Audit Service

**File:** `LMS-Server/src/services/auditService.ts`

```typescript
auditLog({ action: string, actorId: string, targetId?: string, details?: string }): void
```

- Inserts into `audit_log` table (non-fatal — catches and warns on failure)
- Currently wired into: remint (`REMINT_CREDENTIAL`), role change (`CHANGE_ROLE`)
- Extend by adding `auditLog()` calls in future admin mutation handlers

**Table:** `audit_log` — `id` (autoincrement), `action`, `actor_id`, `target_id`, `details`, `created_at`

---

## FK Constraints Added (Wave 2)

### quizzes.course_id → courses.id (LMS-DB-001)
- **ON DELETE SET NULL** — deleting a course nullifies quiz references (doesn't cascade-delete quizzes)
- **Migration:** `ensureQuizzesCourseIdFK()` in `database.ts` — table rebuild on first startup
- **Edge case:** Existing quizzes with `course_id` pointing to deleted courses will fail the rebuild. In practice this shouldn't happen (courses are never deleted in production).

### nft_credentials.application_id → course_nft_applications.id (LMS-DB-002)
- **ON DELETE SET NULL** — schema.sql `ALTER TABLE` definition
- **Edge case:** Insert credential with `application_id` BEFORE inserting the application → FK violation. Always insert application first.

---

## Input Validation Constraints

| Endpoint | Field | Constraint | Finding |
|----------|-------|-----------|---------|
| POST /auth/register | name | max 200 chars | LMS-J1-005 |
| POST /auth/register | email | RFC 5322 validation | LMS-INPUT-001 |
| POST /students (bulk import) | email | RFC 5322 validation | LMS-INPUT-002 |
| POST /forum/topics | title | max 200 chars | LMS-INPUT-007 |
| POST /forum/topics | body | max 10,000 chars | LMS-INPUT-007 |
| All endpoints | JSON body | max 1 MB | LMS-INPUT-003 |
| PATCH /profile | fields | allowlist: name, description, email | LMS-SQLI-002 |

---

## Pagination Defaults

All paginated endpoints now enforce:
```
limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100)
offset = Math.max(parseInt(req.query.offset) || 0, 0)
```

Affected endpoints:
- `GET /forum/topics` (LMS-PAGINATION-001)
- `GET /forum/topics/:id/posts` (LMS-PAGINATION-001)
- `GET /messages/:conversationId` (LMS-PAGINATION-001)
- `GET /announcements` (LMS-PAGINATION-001)
- `GET /admin/certificates` (LMS-MINT-006)
- `GET /admin/credentials` (LMS-MINT-006)

---

## Rate Limiting

| Limiter | Window | Max | Scope |
|---------|--------|-----|-------|
| `authLimiter` | varies | varies | Auth endpoints (register, login, reset) |
| `globalLimiter` | 1 min | 60 | All routes |
| `readLimiter` | 1 min | 120 | GET endpoints including public credentials |

---

## Mint Flow Edge Cases

1. **Stale pending expiry** (LMS-MINT-005): Mints with `mint_status='pending'` older than 30 minutes are auto-expired to `'failed'` with `error='timeout: pending > 30 min'` on certificate/credential list queries.

2. **Eligibility re-check** (LMS-MINT-J2-001): Before minting, `getCourseProgress()` is called to verify the student still meets requirements. Prevents minting after a student's quiz score is revoked.

3. **Wallet validation** (LMS-MINT-J2-003): `StrKey.isValidEd25519PublicKey()` validates the wallet address before any Soroban RPC call.

4. **Remint cooldown** (LMS-AUTH-009): 1-hour cooldown per user+course combination. Prevents rapid re-minting.

5. **Remint TOCTOU** (LMS-MINT-002): Remint wrapped in `db.transaction()` with inner re-check of credential state.

6. **Mint transaction atomicity** (LMS-MINT-J2-004): Credential insert + application status update wrapped in `db.transaction()`.

---

## Security: Removed Insecure Defaults

- `JWT_SECRET` fallback `'dev-only-insecure-secret'` removed — server fails to start without env var (LMS-AUTH-001)
- SSO state secret no longer falls back to `JWT_SECRET` (LMS-SSO-002)
- Error responses no longer expose SQLite error messages (LMS-ERR-001)
- File download Content-Disposition filenames are sanitized (LMS-INPUT-005)
- HTML entities escaped in announcements (LMS-XSS-003) and emails (LMS-EMAIL-001)
