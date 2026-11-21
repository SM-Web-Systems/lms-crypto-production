# Phase 26 C1: Global Search — Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Phase:** 26 C1
**Baseline:** 808 tests (652 BE + 156 FE)

---

## 1. Problem Statement

The LMS has no unified search. Students must navigate to specific pages to find courses, badges, or quizzes. Admins must browse paginated lists to find students or courses. The only existing server-side search is `GET /students?search=` which searches by name/email/enrollment. BadgeGallery has client-side substring filtering but no server-side search. There is no way to search across entity types from a single input.

## 2. Goals

1. Add a unified search API endpoint that queries across courses, users, credentials, and quizzes
2. Return results categorized by type with role-based access control
3. Add a global search bar (Ctrl+K / Cmd+K) accessible from any page
4. Results are clickable and navigate to the relevant detail page
5. Search is fast (LIKE queries on indexed columns, response < 200ms for typical datasets)

## 3. Non-Goals

- Full-text search (FTS5) — LIKE queries are sufficient for current data volume
- Search history or saved searches
- Search suggestions / autocomplete from a separate index
- Fuzzy matching or typo correction
- Search within course content/sections (JSON blob)

## 4. Architecture

### 4.1 Backend Endpoint

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/search` | GET | JWT (any authenticated user) | Unified multi-entity search |

**Query parameters:**
- `q` (required): Search term, minimum 2 characters
- `types` (optional): Comma-separated list of entity types to search. Default: all types the user has access to. Valid values: `courses`, `users`, `credentials`, `quizzes`
- `limit` (optional): Max results per type. Default: 5, max: 20

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "blockchain",
    "results": {
      "courses": [
        { "id": "uuid", "title": "Blockchain Fundamentals", "courseCode": "BLK-101", "description": "Introduction to..." }
      ],
      "users": [
        { "id": "uuid", "name": "John Doe", "email": "john@example.com", "role": "student" }
      ],
      "credentials": [
        { "id": "uuid", "courseTitle": "Blockchain Fundamentals", "studentName": "Jane Doe", "issuedAt": "2026-01-01" }
      ],
      "quizzes": [
        { "id": "uuid", "title": "Blockchain Quiz 1", "courseTitle": "Blockchain Fundamentals" }
      ]
    },
    "counts": { "courses": 1, "users": 1, "credentials": 1, "quizzes": 1 }
  }
}
```

### 4.2 RBAC Rules

| Role | Courses | Users | Credentials | Quizzes |
|------|---------|-------|-------------|---------|
| student | All courses | No | Own credentials only | Quizzes for enrolled courses |
| lecturer | All courses | Students in their courses | No | Their own quizzes |
| admin/super-admin | All | All | All | All |
| sponsor | All courses | Cohort members | Cohort credentials | No |

Simplified for Phase 26 C1:
- **Students**: search courses + own credentials
- **Admin/instructor**: search courses + users + all credentials + quizzes
- Other roles: search courses only

### 4.3 Search Queries

Each entity type is a separate SQL query using `LIKE '%term%'` on relevant text columns:

- **Courses**: `title`, `course_code`, `description`
- **Users**: `name`, `email` (admin only)
- **Credentials**: `course_title` (via JOIN), `student_name` (via JOIN) — filtered by `user_id` for students
- **Quizzes**: `title`, `description` — admin sees all, students see quizzes for courses they have access to

### 4.4 Rate Limiting

Uses the existing `readLimiter` (60 req/min) applied at the route level. No separate limiter needed — search is a read operation.

## 5. Frontend

### 5.1 GlobalSearchBar Component

- Renders in the navbar/layout, accessible from all pages
- Keyboard shortcut: `Ctrl+K` (Windows/Linux) / `Cmd+K` (Mac) to open
- Modal/dropdown overlay with search input and categorized results
- Debounced input (300ms) to avoid excessive API calls
- Results grouped by type with icons: courses (BookOpen), users (Users), credentials (Award), quizzes (FileQuestion)
- Click navigates to: `/student/course/:id`, `/admin/students`, `/student/badges`, `/admin/quizzes`
- Escape or click outside closes the search
- Empty state: "Type to search across courses, certificates, and more"
- Loading state: spinner in results area
- No results state: "No results found for 'term'"

### 5.2 Navigation Links from Results

| Result Type | Student Navigation | Admin Navigation |
|-------------|-------------------|------------------|
| Course | `/student/course/:courseId` | `/admin/courses` (with search pre-filled) |
| User | N/A | `/admin/students` (with search pre-filled) |
| Credential | `/student/badges` | `/admin/certificates` |
| Quiz | `/student/quizzes` | `/admin/quizzes` |

## 6. New Files

| File | Purpose |
|------|---------|
| `LMS-Server/src/routes/search.ts` | Search route registration |
| `LMS-Server/src/controllers/searchController.ts` | Search query logic with RBAC |
| `LMS-Server/src/__tests__/search.test.ts` | 4 BE tests |
| `LMS-Frontend/src/components/GlobalSearchBar.tsx` | Search UI component |
| `LMS-Frontend/src/services/searchService.ts` | Search API client |
| `LMS-Frontend/src/__tests__/components/GlobalSearchBar.test.tsx` | 2 FE tests |

## 7. Modified Files

| File | Change |
|------|--------|
| `LMS-Server/src/app.ts` | Register `/search` route |
| `LMS-Frontend/src/components/Layout.tsx` | Add GlobalSearchBar to navbar |

## 8. Security

- Search requires JWT authentication (no public search)
- RBAC filtering: students cannot search users, only their own credentials
- SQL parameterized queries (no injection risk from search terms)
- Rate limited via existing readLimiter
- Search term sanitized: trimmed, min 2 chars, max 100 chars
- No new tables or schema changes

## 9. Test Plan

### Backend (4 new tests)

| ID | Test | Expected |
|----|------|----------|
| SRCH-BE-1 | GET /search?q=<term> returns matching courses | 200 + courses array with matches |
| SRCH-BE-2 | GET /search?q=<term> as admin returns users | 200 + users array with matches |
| SRCH-BE-3 | GET /search?q=<term> as student does NOT return users | 200 + users array empty/absent |
| SRCH-BE-4 | GET /search without q returns 400 | 400 + error message |

### Frontend (2 new tests)

| ID | Test | Expected |
|----|------|----------|
| SRCH-FE-1 | GlobalSearchBar renders and shows results on input | Results dropdown visible with categories |
| SRCH-FE-2 | GlobalSearchBar opens on Ctrl+K keyboard shortcut | Search modal becomes visible |

### Target counts:
- Backend: 652 → 656 (+4)
- Frontend: 156 → 158 (+2)
- Total: 808 → 814 (+6)

## 10. Rollback

- Revert merge commit
- Remove search route from app.ts
- No schema changes, no new tables — clean rollback
