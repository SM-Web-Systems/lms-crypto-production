# Manual QA Checklist — Lecturer Role

> **Purpose:** Click-by-click manual QA checklist for the Lecturer role on the live LMS platform.
> **Date:** 2026-07-31
> **Live site:** https://lms.smwebsystems.com
> **Estimated walkthrough time:** 15–20 minutes (7 sections × 2–3 min each)
> **Prerequisites:** An admin must have already created at least one course, assigned `[test-lecturer-1]` to it, and enrolled at least one student who has a pending certificate application.

---

## Test Account

| Placeholder | Role | Purpose |
|-------------|------|---------|
| `[test-lecturer-1]` | Lecturer | Primary lecturer test account |
| `[test-lecturer-password]` | — | Password for lecturer account |
| `[test-student-1]` | Student | Student enrolled in lecturer's assigned course |

---

## Section 1: Lecturer Login

- [ ] **Step 1:** Navigate to `https://lms.smwebsystems.com/login`
  - **Expected:** Login page loads with AmmaWallet SSO button as primary option and a collapsible email/password form

- [ ] **Step 2:** Log in as `[test-lecturer-1]` using either SSO or the email/password fallback form
  - **Expected:** Successful login redirects to `/lecturer`

- [ ] **Step 3:** Verify the page header displays "Welcome, [first-name]" and the subtitle "Your assigned courses — review student progress and add recommendations."
  - **Expected:** Personalized greeting with lecturer's first name
  - **Source:** `LecturerDashboard.tsx:53-56`

---

## Section 2: Dashboard (L1)

- [ ] **Step 4:** On the `/lecturer` dashboard, verify the badge label reads "Lecturer portal"
  - **Expected:** Badge with text "Lecturer portal" visible at top of page
  - **Source:** `LecturerDashboard.tsx:50-51`

- [ ] **Step 5:** Verify assigned courses are displayed as cards with title, course code, and description
  - **Expected:** Course cards in a grid layout (1 column on mobile, 2 on tablet, 3 on desktop), each showing course title, code (monospace), and truncated description
  - **Source:** `LecturerDashboard.tsx:81-116`

- [ ] **Step 6:** Verify that only courses assigned to this lecturer appear — no unassigned courses
  - **Expected:** Course list filtered to lecturer's assignments only (via `courseService.fetchCourses()` which returns lecturer-scoped results)

- [ ] **Step 7:** If no courses are assigned, verify empty state shows a book icon and text "No courses assigned yet."
  - **Expected:** Centered empty state message
  - **Source:** `LecturerDashboard.tsx:74-77`

- [ ] **Step 8:** Click the "Refresh" button (top-right)
  - **Expected:** Course list reloads, no errors
  - **Source:** `LecturerDashboard.tsx:58-61`

- [ ] **Step 9:** Click the "Student progress" button on any course card
  - **Expected:** Navigates to `/lecturer/courses/[courseId]`
  - **Source:** `LecturerDashboard.tsx:107-111`

---

## Section 3: Course Students (L2)

- [ ] **Step 10:** On `/lecturer/courses/[courseId]`, verify the page header shows the course title and subtitle "Student progress & certificate applications"
  - **Expected:** Course title displayed with subtitle
  - **Source:** `LecturerCourseStudents.tsx:117-123`

- [ ] **Step 11:** Verify the enrolled student count is shown (e.g. "3 enrolled students")
  - **Expected:** Card title shows count with correct pluralization
  - **Source:** `LecturerCourseStudents.tsx:143-145`

- [ ] **Step 12:** For each student row, verify the following data is displayed:
  - Student name (or email if name unavailable)
  - "Eligible" badge if `meetsAllRequirements` is true (green badge with checkmark)
  - Application status badge (Pending/Approved/Rejected/Minted) if an application exists
  - Lesson progress: "Lessons: X/Y"
  - Quiz progress: "Quizzes: All passed" or "X/Y"
  - Submission status: "Approved" or "N/A"
  - Progress bar showing lesson completion percentage with "[N]% lessons complete" label
  - **Expected:** All data fields populated correctly for each student
  - **Source:** `LecturerCourseStudents.tsx:158-228`

- [ ] **Step 13:** Find a student with a **pending** certificate application and click the "Recommend" button
  - **Expected:** A modal opens with title "Add recommendation", description "Your recommendation will be visible to the admin when reviewing this application.", a text area labeled "Recommendation" with placeholder "Write your recommendation for this student…", and a "Save recommendation" button
  - **Source:** `LecturerCourseStudents.tsx:96-107, 248-267`

- [ ] **Step 14:** Type a recommendation in the text area and click "Save recommendation"
  - **Expected:** Modal closes, the recommendation text appears below the student's progress as italic text: 'Recommendation: "[your text]"'. The button changes to "Edit recommendation"
  - **Source:** `LecturerCourseStudents.tsx:231-235, 264-265`

- [ ] **Step 15:** Click "Edit recommendation" on the same student
  - **Expected:** Modal opens with title "Edit recommendation" and the previously saved text pre-filled in the text area
  - **Source:** `LecturerCourseStudents.tsx:98, 253-256`

- [ ] **Step 16:** Verify that students without a pending application do NOT show a Recommend/Edit button
  - **Expected:** No action button for students with status approved/rejected/minted or no application
  - **Source:** `LecturerCourseStudents.tsx:247`

- [ ] **Step 17:** Click the "Back" button (top-left)
  - **Expected:** Navigates back to `/lecturer` dashboard
  - **Source:** `LecturerCourseStudents.tsx:112-115`

- [ ] **Step 18:** Click the "Refresh" button on the course students page
  - **Expected:** Student data reloads without error
  - **Source:** `LecturerCourseStudents.tsx:125-128`

---

## Section 4: Submission Review

- [ ] **Step 19:** As `[test-lecturer-1]`, verify you can view submissions for students in your assigned courses
  - **Expected:** Submissions list loads showing student submissions with status badges

- [ ] **Step 20:** Attempt to delete a submission belonging to a student in an **unassigned** course (if possible via direct API call or UI)
  - **Expected:** Action is blocked with "You do not have permission to delete this submission" (403 response)
  - 🔒 **LMS-RBAC-006** — Lecturer delete scoped to assigned courses only
  - **Source:** `submissionsController.ts:382-385` (`isLecturerForStudent` check)

---

## Section 5: Messages (L3)

- [ ] **Step 21:** Click "Messages" in the sidebar navigation
  - **Expected:** Navigates to `/lecturer/messages`, conversations list loads
  - **Source:** `Layout.tsx:84`

- [ ] **Step 22:** Start a new conversation with `[test-student-1]`
  - **Expected:** Conversation created, message input area appears

- [ ] **Step 23:** Type and send a message
  - **Expected:** Message appears in the conversation thread

- [ ] **Step 24:** Verify the unread message badge appears in the sidebar when a new message is received
  - **Expected:** Red/colored badge with unread count next to "Messages" nav item (polled every 30 seconds)
  - **Source:** `Layout.tsx` (unread count polling via `/api/v1/messages/unread-count`)

---

## Section 6: Profile (L4)

- [ ] **Step 25:** Click "Profile" in the sidebar navigation
  - **Expected:** Navigates to `/lecturer/profile`, profile page loads with current user info
  - **Source:** `Layout.tsx:85`

- [ ] **Step 26:** Edit the profile description field and save
  - **Expected:** Description updated successfully, confirmation shown

- [ ] **Step 27:** Add or update a social link (e.g. LinkedIn URL) and save
  - **Expected:** Social link saved and displayed on profile

- [ ] **Step 28:** Upload a new avatar image
  - **Expected:** Avatar uploads and displays (max 5MB, image files only)

---

## Section 7: Permission Boundaries

- [ ] **Step 29:** While logged in as `[test-lecturer-1]`, manually navigate to `/admin/students` by typing the URL
  - **Expected:** Redirected to `/lecturer` dashboard (ProtectedRoute enforces role check)
  - **Source:** `App.tsx:52-71` (ProtectedRoute with `allowedRole`)

- [ ] **Step 30:** Manually navigate to `/admin/certificates`
  - **Expected:** Redirected to `/lecturer` dashboard

- [ ] **Step 31:** Manually navigate to `/admin/quizzes`
  - **Expected:** Redirected to `/lecturer` dashboard

- [ ] **Step 32:** Verify the sidebar navigation shows ONLY three items: "Dashboard", "Messages", "Profile"
  - **Expected:** No admin nav items (Students, Submissions, Course, Quizzes, Resources, Certificates, Sponsor Portal, Forum, Course members) visible
  - **Source:** `Layout.tsx:81-86` (lecturer nav: 3 items only)

- [ ] **Step 33:** Manually navigate to `/student/dashboard`
  - **Expected:** Redirected to `/lecturer` dashboard (cannot access student routes either)

---

## Verification Summary

| Section | Items | Security Tags |
|---------|-------|---------------|
| 1. Login | 3 | — |
| 2. Dashboard (L1) | 6 | — |
| 3. Course Students (L2) | 9 | — |
| 4. Submission Review | 2 | 🔒 LMS-RBAC-006 |
| 5. Messages (L3) | 4 | — |
| 6. Profile (L4) | 4 | — |
| 7. Permission Boundaries | 5 | — |
| **Total** | **33** | **1** |
