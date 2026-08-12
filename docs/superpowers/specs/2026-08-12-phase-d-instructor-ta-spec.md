# Phase D — Instructor/TA Refinement Spec

**Date:** 2026-08-12
**Depends on:** Phase A (course_approval_workflow table, permissions)
**Blocks:** None directly

---

## Schema Changes

### New Table

**`course_tas`** — TA assignments to courses
```sql
CREATE TABLE IF NOT EXISTS course_tas (
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users(id),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (course_id, user_id)
);
CREATE INDEX idx_course_tas_user ON course_tas(user_id);
```

### Column Addition

| Table | Column | Purpose |
|---|---|---|
| `submissions` | `grade_status TEXT DEFAULT 'direct' CHECK (grade_status IN ('direct', 'pending_approval', 'approved'))` | Track whether grade was direct (instructor/admin) or TA-submitted (pending approval) |
| `submissions` | `graded_by TEXT REFERENCES users(id)` | Who graded this submission |

## API Endpoints

### Course Approval Workflow

| Endpoint | Method | Role(s) | Purpose |
|---|---|---|---|
| `/courses/:id/submit-for-approval` | POST | instructor | Submit draft course for admin review |
| `/courses/:id/approve` | POST | admin, admin-2, super-admin | Approve course (sets approval_status='approved') |
| `/courses/:id/reject` | POST | admin, admin-2, super-admin | Reject course (sets approval_status='rejected', adds review_note) |

**Behavior changes:**
- When instructor creates a course, `approval_status` = 'draft' (not 'published')
- Students only see courses where `approval_status = 'approved'` OR `approval_status = 'published'` (backward compat)
- Admin-created courses default to 'published' (no approval needed)

### TA System

| Endpoint | Method | Role(s) | Purpose |
|---|---|---|---|
| `/courses/:id/tas` | GET | instructor, admin | List TAs for a course |
| `/courses/:id/tas` | POST | instructor, admin | Assign TA to course |
| `/courses/:id/tas/:userId` | DELETE | instructor, admin | Remove TA from course |
| `/ta/courses` | GET | teaching-assistant | List assigned courses |
| `/ta/courses/:id/submissions` | GET | teaching-assistant | View submissions for assigned course |
| `/ta/submissions/:id/grade` | POST | teaching-assistant | Grade submission (grade_status='pending_approval') |
| `/ta/submissions/:id/approve-grade` | POST | instructor, admin, admin-2, super-admin | Approve TA grade (grade_status='approved') |
| `/ta/submissions/:id/reject-grade` | POST | instructor, admin | Reject TA grade (sends feedback) |

**Decision #4 enforcement:** TA grades ALWAYS set `grade_status = 'pending_approval'`. There is NO auto-publish timer. The grade is only visible to students after explicit approval by instructor, admin, admin-2, or super-admin.

### Course Material Approval (TA)

| Endpoint | Method | Role(s) | Purpose |
|---|---|---|---|
| `/ta/courses/:id/materials` | POST | teaching-assistant | Submit course material (pending approval) |
| `/courses/:id/materials/:materialId/approve` | POST | instructor, admin, admin-2, super-admin | Approve TA-submitted material |

Same rule: ALWAYS explicit approval. No auto-publish.

## Frontend Components

| Component | Route | Role |
|---|---|---|
| TADashboard | `/ta` | teaching-assistant |
| TAGrading | `/ta/submissions` | teaching-assistant |
| CourseApprovalQueue | embedded in AdminDashboard | admin, admin-2, super-admin |
| SubmitForApproval button | embedded in instructor course editor | instructor |

**ProtectedRoute + Layout.tsx:** Add `teaching-assistant` to type union, add TA nav items.

## Failing Tests FIRST

1. **D1-APPROVAL-1:** Instructor creates course → approval_status = 'draft'
2. **D1-APPROVAL-2:** Instructor submits → approval_status = 'submitted'
3. **D1-APPROVAL-3:** Admin approves → approval_status = 'approved' (visible to students)
4. **D1-APPROVAL-4:** Admin rejects → approval_status = 'rejected' (with review_note)
5. **D1-APPROVAL-5:** Students cannot see draft/submitted/rejected courses
6. **D2-TA-1:** Instructor can assign TA to course
7. **D2-TA-2:** TA can view assigned course submissions
8. **D2-TA-3:** TA cannot view unassigned course submissions
9. **D3-GRADE-1:** TA grade sets grade_status = 'pending_approval'
10. **D3-GRADE-2:** TA grade is NOT visible to students until approved
11. **D3-GRADE-3:** TA cannot see student billing or wallet data
12. **D4-APPROVE-1:** Instructor approves TA grade → grade_status = 'approved', visible to student
13. **D4-APPROVE-2:** There is NO auto-publish mechanism (Decision #4 enforcement)
14. **D4-MATERIAL-1:** TA-submitted material is not visible until approved

## AmmaWallet Cross-Repo Dependency

None.
