# Phase D — Instructor/TA Refinement Design

**Date:** 2026-08-12
**Depends on:** Phase A (course_approval_workflow table, approval_status column, permissions)
**Blocks:** None directly
**Scope:** Backend-only (frontend deferred to Phase G)

---

## Drift Resolution (spec vs. code)

| # | Original spec assumption | Actual code state | Resolution |
|---|---|---|---|
| 1 | Submissions need new `grade_status` + `graded_by` | Submissions already have `status`, `reviewed_by_id`, `reviewed_at`, `feedback` | ADD `grade_status` + `graded_by` as parallel columns — TA grading is a separate workflow track |
| 2 | `approval_status` filtering in course listing | `getCourses()` does zero `approval_status` filtering | ADD WHERE clause for student-facing queries |
| 3 | Instructor creates course → draft | `createCourse()` defaults to 'published' for all roles | ADD role-aware default: `course.approve` perm → published, else → draft |
| 4 | TA material endpoint needs material rows | Courses store content as JSON `sections` blobs | CREATE `course_material_submissions` staging table |
| 5 | Need `course.grade` permission | Already exists in seed data (79 perms) | No change needed |

## Permission Matrix (confirmed from seed data)

| Permission | TA | Instructor | Admin | Admin-2 | Super-Admin |
|---|---|---|---|---|---|
| `course.grade_pending` | YES | — | YES | YES | YES |
| `course.grade` | **NO** | YES | YES | YES | YES |
| `course.approve` | **NO** | **NO** | YES | YES | YES |
| `course.manage` | **NO** | YES | YES | YES | YES |

**Decision #4 enforcement:** TA has `course.grade_pending` (can grade, result is pending). Only `course.grade` holders can approve TA grades. Only `course.approve` holders can approve courses.

---

## Schema Changes

### New Tables

**`course_tas`** — TA-to-course assignment
```sql
CREATE TABLE IF NOT EXISTS course_tas (
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users(id),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (course_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_course_tas_user ON course_tas(user_id);
```

**`course_material_submissions`** — TA material staging
```sql
CREATE TABLE IF NOT EXISTS course_material_submissions (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  submitter_id  TEXT NOT NULL REFERENCES users(id),
  section_id    TEXT NOT NULL,
  item_title    TEXT NOT NULL,
  item_type     TEXT NOT NULL DEFAULT 'text' CHECK (item_type IN ('text', 'video', 'audio', 'document', 'quiz', 'assignment', 'download')),
  content       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   TEXT REFERENCES users(id),
  review_note   TEXT,
  reviewed_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Column Additions

| Table | Column | Purpose |
|---|---|---|
| `submissions` | `grade_status TEXT DEFAULT 'direct' CHECK (grade_status IN ('direct', 'pending_approval', 'approved'))` | TA grading track (parallel to existing `status`) |
| `submissions` | `graded_by TEXT REFERENCES users(id)` | Who assigned the grade |

---

## API Endpoints

### D1: Course Approval Workflow

| Endpoint | Method | Permission | Purpose |
|---|---|---|---|
| `/courses/:id/submit-for-approval` | POST | `course.manage` | Instructor submits draft for admin review |
| `/courses/:id/approve` | POST | `course.approve` | Admin approves course |
| `/courses/:id/reject` | POST | `course.approve` | Admin rejects course (with review_note) |

**Behavior changes to existing code:**
1. `createCourse()` — if caller has `course.approve` → `approval_status='published'`; else → `approval_status='draft'`
2. `getCourses()` student query — add `WHERE approval_status IN ('approved', 'published')` filter
3. New workflow: draft → submitted → approved/rejected. Rejected can be resubmitted.

### D2: TA Assignment

| Endpoint | Method | Permission | Purpose |
|---|---|---|---|
| `/courses/:id/tas` | GET | `course.manage` | List TAs for a course |
| `/courses/:id/tas` | POST | `course.manage` | Assign TA to course |
| `/courses/:id/tas/:userId` | DELETE | `course.manage` | Remove TA from course |

### D3: TA Routes (new `ta.ts` file)

| Endpoint | Method | Permission | Purpose |
|---|---|---|---|
| `/ta/courses` | GET | `course.grade_pending` | List assigned courses |
| `/ta/courses/:id/submissions` | GET | `course.grade_pending` | View submissions for assigned course |
| `/ta/submissions/:id/grade` | POST | `course.grade_pending` | Grade submission (grade_status='pending_approval') |
| `/ta/courses/:id/materials` | POST | `course.grade_pending` | Submit material to staging table |

### D4: Grade + Material Approval

| Endpoint | Method | Permission | Purpose |
|---|---|---|---|
| `/ta/submissions/:id/approve-grade` | POST | `course.grade` | Approve TA grade → grade_status='approved' |
| `/ta/submissions/:id/reject-grade` | POST | `course.grade` | Reject TA grade → reset to 'direct' |
| `/courses/:id/materials/:materialId/approve` | POST | `course.manage` | Approve material → merge into course sections JSON |
| `/courses/:id/materials/:materialId/reject` | POST | `course.manage` | Reject material with feedback |

---

## Invariants (CI-enforced)

### TA-GRADE-INV-1: TA-graded submissions with grade_status='pending_approval' never appear in student-facing submission queries

The existing `GET /submissions` endpoint returns submissions filtered by `student_id`. When `grade_status = 'pending_approval'`, the submission's main `status` field remains `'pending'` (student sees "pending review"). The TA's grade is only applied to `status` when an authorized user approves via `/ta/submissions/:id/approve-grade`.

**Invariant test:** Query submissions as student → confirm `grade_status` is never exposed, and submission `status` does not change to 'approved'/'rejected' while `grade_status = 'pending_approval'`.

### TA-GRADE-INV-2: No auto-publish mechanism exists (Decision #4)

**Invariant test:** Grep codebase for any timer, cron, or auto-approval logic on `grade_status`. Confirm `pending_approval` can only transition to `approved` via explicit POST to `/ta/submissions/:id/approve-grade`.

---

## Test Plan (TDD — 14 tests)

1. **D1-APPROVAL-1:** Instructor creates course → approval_status = 'draft' (not 'published')
2. **D1-APPROVAL-2:** Admin creates course → approval_status = 'published'
3. **D1-APPROVAL-3:** Instructor submits for approval → approval_status = 'submitted', workflow row created
4. **D1-APPROVAL-4:** Admin approves → approval_status = 'approved'
5. **D1-APPROVAL-5:** Admin rejects → approval_status = 'rejected' with review_note
6. **D1-APPROVAL-6:** Students cannot see draft/submitted/rejected courses
7. **D2-TA-1:** Instructor can assign TA to course
8. **D2-TA-2:** TA can view assigned course submissions
9. **D2-TA-3:** TA cannot view unassigned course submissions
10. **D3-GRADE-1:** TA grade sets grade_status = 'pending_approval', submission status unchanged
11. **D3-GRADE-2:** TA-graded submission NOT visible as graded to students until approved (invariant)
12. **D3-GRADE-3:** TA cannot see student billing or wallet data
13. **D4-APPROVE-1:** Instructor approves TA grade → grade_status = 'approved', submission status updated
14. **D4-MATERIAL-1:** TA-submitted material is not visible until approved, merge on approval

---

## Files Modified/Created

| File | Action | Purpose |
|---|---|---|
| `database/schema.sql` | Modify | Add course_tas, course_material_submissions tables; grade_status + graded_by columns |
| `src/config/database.ts` | Modify | Add ensure functions for new tables/columns |
| `src/routes/ta.ts` | Create | TA-scoped endpoints |
| `src/routes/courses.ts` | Modify | Add approval + TA assignment endpoints |
| `src/controllers/coursesController.ts` | Modify | Role-aware createCourse, approval_status filtering |
| `src/app.ts` | Modify | Mount ta.ts routes |
| `src/__tests__/phase-d-instructor-ta.test.ts` | Create | 14 TDD tests |
| `src/__tests__/ta-grade-invariant.test.ts` | Create | CI invariant tests for Decision #4 |
