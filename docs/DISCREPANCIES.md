# Discrepancies & Notes — Manual QA Authoring

> **Purpose:** Document any code/docs mismatches, accepted gaps, or caveats found during checklist authoring.
> **Date:** 2026-07-31
> **Codebase:** `lms-crypto-production` (HEAD: `4e7f905`)

---

## Status: No Blocking Discrepancies Found

All checklist items were verified against source code as of commit `4e7f905`. Button labels, route paths, component names, and expected behaviors match the codebase.

---

## Accepted Gaps (Non-Blocking)

### 1. LMS-MINT-003 — No Manual Test Tag

**Finding:** "Mint retry no backoff" — accepted risk per FEATURE_INVENTORY.md. Admin-only, low-frequency action. No automated test file exists (N/A).

**Impact:** Not tagged with `🔒` in any checklist because there is no observable manual behavior to verify. The risk is accepted by design.

### 2. LMS-AUTH-001 — Server Configuration Check

**Finding:** "Hardcoded JWT secret fallback removed — app rejects tokens if `JWT_SECRET` env unset."

**Impact:** This is a server startup configuration check, not a browser-clickable behavior. Covered by automated test (`jwt-secret.test.ts`). Not tagged in manual QA checklists because a manual reviewer cannot verify environment variable behavior from the browser.

### 3. Admin Dashboard — `ADMIN_LINES` vs `DAY_LINES`

**Note:** Admin daily tips use `ADMIN_LINES` (5 messages, `AdminDashboard.tsx:38-44`), while Student daily nudges use `DAY_LINES` (7 messages, `StudentDashboard.tsx:48-56`). Both rotate by `dayOfYear % count`. The checklists correctly reference the appropriate constant for each role.

---

## Cross-Checklist Duplication (By Design)

Some security checks appear in multiple checklists by design — this ensures each checklist is self-contained:

| Finding | Appears In |
|---------|-----------|
| LMS-XSS-001/002 | Student (Sections 7-8) + Cross-Cutting (Section 9) |
| LMS-QUIZ-001 | Admin (Section 4) + Student (Section 5) |
| LMS-RATE-001 | Admin (Section 17) + Cross-Cutting (Section 10) |

This duplication is intentional — each role checklist can be run independently.
