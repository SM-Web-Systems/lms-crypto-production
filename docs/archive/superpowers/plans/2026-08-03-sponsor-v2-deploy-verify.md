# Sponsor Portal v2 — Deployment Verification & Release Closeout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to complete this checklist. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the already-deployed Sponsor Portal v2 is working in production and close the release.

**Architecture:** Backend (lms-api) and frontend (lms-web) containers were rebuilt and deployed at ~12:00 UTC 2026-08-03. Origin/main is at commit `88c412a`. This plan verifies production health, endpoint correctness, UI behavior, and CSV export, then writes the closeout note.

**Tech Stack:** Node.js/Express, React 19, Vite, Docker Compose, Nginx, SQLite

## Global Constraints

- Do NOT rebuild or redeploy unless verification fails
- Do NOT modify source code unless a production regression is found
- All verification is read-only against the live site
- Rollback trigger: any new endpoint returns 500 or auth bypass detected

---

## Pre-Deploy Confirmation

- [x] Commits pushed to origin/main (verified: origin/main = HEAD = `88c412a`)
- [x] Backend container rebuilt with Track C code (verified: `getStudentsByCourse` + `exportCoursesCsv` in container)
- [x] Frontend container rebuilt (created 2026-08-03T12:01:19Z)
- [x] Health endpoint returns `{"status":"ok"}` (verified via `/api/v1/health`)

---

### Task 1: Backend Endpoint Verification

**Purpose:** Confirm new endpoints respond correctly in production before testing UI.

- [ ] **Step 1: Verify `/api/v1/analytics/courses/export` rejects unauthenticated**

```bash
curl -s -o /dev/null -w "%{http_code}" https://lms.smwebsystems.com/api/v1/analytics/courses/export
```
Expected: `401`

- [ ] **Step 2: Verify `/api/v1/analytics/courses/FAKE-ID/students` rejects unauthenticated**

```bash
curl -s -o /dev/null -w "%{http_code}" https://lms.smwebsystems.com/api/v1/analytics/courses/fake-id/students
```
Expected: `401`

- [ ] **Step 3: Verify existing analytics endpoint still works (regression)**

```bash
curl -s -o /dev/null -w "%{http_code}" https://lms.smwebsystems.com/api/v1/analytics/courses
```
Expected: `401` (also admin-only)

---

### Task 2: Authenticated Endpoint Verification

**Purpose:** Confirm endpoints return correct data with admin auth.

- [ ] **Step 1: Get admin auth token**

```bash
# Login as admin to get JWT
curl -s -X POST https://lms.smwebsystems.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ADMIN_EMAIL","password":"ADMIN_PASS"}' | jq -r '.token'
```

- [ ] **Step 2: Verify courses analytics returns data**

```bash
curl -s https://lms.smwebsystems.com/api/v1/analytics/courses \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'
```
Expected: Number > 0

- [ ] **Step 3: Verify CSV export returns CSV with correct headers**

```bash
curl -sI https://lms.smwebsystems.com/api/v1/analytics/courses/export \
  -H "Authorization: Bearer $TOKEN"
```
Expected: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="sponsor-analytics-2026-08-03.csv"`

- [ ] **Step 4: Verify CSV content has correct schema**

```bash
curl -s https://lms.smwebsystems.com/api/v1/analytics/courses/export \
  -H "Authorization: Bearer $TOKEN" | head -2
```
Expected first line: `Sponsor,Course,Course Code,Student Name,Student Email,Wallet Address,NFT Status`

- [ ] **Step 5: Verify student drill-down with a real course ID**

```bash
# Get a course ID from analytics
COURSE_ID=$(curl -s https://lms.smwebsystems.com/api/v1/analytics/courses \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].courseId')

curl -s "https://lms.smwebsystems.com/api/v1/analytics/courses/$COURSE_ID/students" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.students | length'
```
Expected: Number >= 0 (valid response, no error)

---

### Task 3: Frontend Smoke Test

**Purpose:** Confirm the Sponsor Portal UI loads and functions correctly.

- [ ] **Step 1: Verify /admin/sponsor page loads**

Manual browser check or:
```bash
curl -s https://lms.smwebsystems.com/admin/sponsor -o /dev/null -w "%{http_code}"
```
Expected: `200` (SPA serves index.html for all routes)

- [ ] **Step 2: Manual QA checklist (browser)**

1. Log in as admin at https://lms.smwebsystems.com
2. Navigate to /admin/sponsor
3. Confirm sponsor analytics summary cards render
4. Click a course row → student list expands with Name, Email, Wallet, NFT Status
5. Click same row → collapses
6. Click another course row → expands (previous stays collapsed)
7. Click "Export CSV" → file downloads
8. Open downloaded CSV → verify schema: `Sponsor,Course,Course Code,Student Name,Student Email,Wallet Address,NFT Status`

---

### Task 4: Regression Spot-Checks

**Purpose:** Confirm existing admin functionality is not broken.

- [ ] **Step 1: Verify admin dashboard loads**

```bash
curl -s https://lms.smwebsystems.com/api/v1/analytics/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq '.data'
```
Expected: Dashboard stats object

- [ ] **Step 2: Verify course list loads**

```bash
curl -s https://lms.smwebsystems.com/api/v1/courses \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'
```
Expected: Number > 0

---

### Task 5: Release Closeout

**Purpose:** Document the release and update handoff notes.

- [ ] **Step 1: Write release closeout note**
- [ ] **Step 2: Update MEMORY.md with new test count and deployment status**
- [ ] **Step 3: Confirm git status is clean (or only untracked docs)**
