# Manual QA Checklist — Admin Role

> **Purpose:** Click-by-click manual QA checklist for the Admin role on the live LMS platform.
> **Date:** 2026-07-31
> **Live site:** https://lms.smwebsystems.com
> **Estimated walkthrough time:** 40–55 minutes (18 sections × 2–3 min each)
> **Run this checklist FIRST** — it creates test data (courses, quizzes, students) that the Student and Lecturer checklists depend on.

---

## Test Accounts

| Placeholder | Role | Purpose |
|-------------|------|---------|
| `[test-admin-1]` | Admin | Primary admin test account |
| `[test-admin-password]` | — | Admin password placeholder |
| `[test-student-1]` | Student | Student created/managed during this checklist |
| `[test-student-email]` | — | Email for student invite testing |
| `[test-lecturer-1]` | Lecturer | Lecturer for assignment testing |
| `[test-course-code]` | — | Course code created during testing |

---

## Section 1: Admin Login

- [ ] **Step 1:** Navigate to `https://lms.smwebsystems.com/login`
  - **Expected:** Login page loads with AmmaWallet SSO button as primary option

- [ ] **Step 2:** Click the email/password fallback area to expand the admin login form (this is the secondary login method, collapsed by default)
  - **Expected:** Email and password input fields appear
  - **Source:** `Login.tsx` (admin email/password form, collapsed by default)

- [ ] **Step 3:** Enter `[test-admin-1]` email and `[test-admin-password]`, then submit
  - **Expected:** Successful login redirects to `/admin` dashboard

---

## Section 2: Dashboard (A1)

- [ ] **Step 4:** Verify the dashboard shows a personalized greeting: "Good morning/afternoon/evening, [first-name]"
  - **Expected:** Time-appropriate greeting with admin's first name
  - **Source:** `AdminDashboard.tsx:32-36, 85-86`

- [ ] **Step 5:** Verify the daily admin tip is displayed (e.g. "Clearing the queue keeps learners moving…")
  - **Expected:** One of 5 rotating daily tips shown in the nudge area
  - **Source:** `AdminDashboard.tsx:38-44`

- [ ] **Step 6:** Verify submission statistics are visible — pending, approved, rejected counts
  - **Expected:** Three stat cards showing submission counts by status
  - **Source:** `AdminDashboard.tsx:76-78`

- [ ] **Step 7:** Verify the Announcements panel is present on the dashboard
  - **Expected:** AnnouncementsPanel component rendered with any existing announcements
  - **Source:** `AdminDashboard.tsx:28`

- [ ] **Step 8:** Verify "Recent submissions" section shows up to 5 most recent submissions
  - **Expected:** List of recent submissions sorted by date, newest first
  - **Source:** `AdminDashboard.tsx:80-82`

---

## Section 3: Course Builder (A4)

- [ ] **Step 9:** Click "Course" in the sidebar navigation
  - **Expected:** Navigates to `/admin/course`
  - **Source:** `Layout.tsx:71`

- [ ] **Step 10:** Click the button to create a new course — heading reads "New course"
  - **Expected:** Course creation form appears with fields for title, description, course code, and sponsor label
  - **Source:** `AdminCourse.tsx:813`

- [ ] **Step 11:** Fill in the course title, description, and `[test-course-code]`, then click "Save course"
  - **Expected:** Course is created and appears in the course list
  - **Source:** `AdminCourse.tsx:1127-1129`

- [ ] **Step 12:** Open the newly created course for editing. Click "Add item" to add a content item to a section
  - **Expected:** Item creation form appears with type selector (video/PDF/link/text)
  - **Source:** `AdminCourse.tsx:1015-1016`

- [ ] **Step 13:** Add at least one item of each type (video URL, PDF, external link, text content), then click "Save course"
  - **Expected:** All items saved to the course sections structure

- [ ] **Step 14:** Scroll to the "Completion requirements" section, configure lesson threshold and quiz requirements, click "Save requirements"
  - **Expected:** Requirements saved successfully
  - **Source:** `AdminCourse.tsx:1116-1120`

---

## Section 4: Quiz Management (A5)

- [ ] **Step 15:** Click "Quizzes" in the sidebar navigation
  - **Expected:** Navigates to `/admin/quizzes`
  - **Source:** `Layout.tsx:72`

- [ ] **Step 16:** Click "Create quiz" button
  - **Expected:** Quiz creation form appears with heading "New quiz"
  - **Source:** `AdminQuizzes.tsx:460-461, 505`

- [ ] **Step 17:** Fill in quiz title, select the course created in Section 3, set passing score (default 70), then click "Add question"
  - **Expected:** Question form appears with fields for question text, options, and correct answer indicator
  - **Source:** `AdminQuizzes.tsx:207, 571-572`

- [ ] **Step 18:** Add at least 2 questions with multiple-choice answers and mark correct answers, then click "Save quiz"
  - **Expected:** Quiz saved, appears in quiz list with question count and passing score
  - **Source:** `AdminQuizzes.tsx:669-670`

- [ ] **Step 19:** Verify that quiz answer keys are visible to admin — correct answers should be shown/indicated in the admin quiz view
  - **Expected:** Correct answers visible to admin role
  - 🔒 **LMS-QUIZ-001** — Answer keys must be visible to admin but hidden from students

---

## Section 5: Resource Upload (A6)

- [ ] **Step 20:** Click "Resources" in the sidebar navigation
  - **Expected:** Navigates to `/admin/documents`
  - **Source:** `Layout.tsx:73`

- [ ] **Step 21:** Click the upload button to open the upload modal
  - **Expected:** Upload form appears with fields for title, description, category, course assignment, and file picker
  - **Source:** `AdminDocuments.tsx:90, 179`

- [ ] **Step 22:** Upload a PDF file (under 10MB), fill in title and category, assign to the test course, then submit
  - **Expected:** Document uploads and appears in the document list with correct category
  - **Source:** `AdminDocuments.tsx:191-196`

- [ ] **Step 23:** Use the category filter dropdown to filter documents by the category you just used
  - **Expected:** Only documents in that category are shown
  - **Source:** `AdminDocuments.tsx:87, 120`

- [ ] **Step 24:** Use the search box to search for the uploaded document by title
  - **Expected:** Search filters documents to match
  - **Source:** `AdminDocuments.tsx:118`

---

## Section 6: Student Management (A2)

- [ ] **Step 25:** Click "Students" in the sidebar navigation
  - **Expected:** Navigates to `/admin/students`, page title "Student Management" with subtitle "Manage student records and information"
  - **Source:** `Layout.tsx:69`, `AdminStudents.tsx:251-253`

- [ ] **Step 26:** Click "Add Student" button
  - **Expected:** Modal opens with form fields: name, email, enrollment number, department (dropdown), semester (dropdown), course access (checkboxes)
  - **Source:** `AdminStudents.tsx:259-262`

- [ ] **Step 27:** Fill in student details and select course access for `[test-course-code]`, then submit
  - **Expected:** Student created and appears in the students table with name, email, enrollment number, department, semester, course access, wallet status, and action buttons

- [ ] **Step 28:** Click "Import CSV" button
  - **Expected:** CSV import modal opens with file picker
  - **Source:** `AdminStudents.tsx:255-258`

- [ ] **Step 29:** (Optional) Click the template download link to get `students_import_template.csv`, verify it contains headers: name, email, enrollmentNumber, department, semester
  - **Expected:** CSV template downloads with correct headers and 2 example rows
  - **Source:** `AdminStudents.tsx:17-22`

- [ ] **Step 30:** Use the search box ("Search by name, email, enrollment…") to find the student you just created
  - **Expected:** Table filters to show matching student
  - **Source:** `AdminStudents.tsx:281-284`

- [ ] **Step 31:** Use the wallet filter dropdown — select "Linked", then "No wallet", then "Action needed", then "All wallets"
  - **Expected:** Table filters correctly for each wallet status. Options: "All wallets", "Linked", "No wallet", "Action needed"
  - **Source:** `AdminStudents.tsx:287-296`

- [ ] **Step 32:** Click the edit icon on a student row to open the edit modal, change a field, save
  - **Expected:** Student record updated in table
  - **Source:** `AdminStudents.tsx:138-156`

- [ ] **Step 33:** Click the delete icon on a test student (not `[test-student-1]`), confirm the "Delete this student?" dialog
  - **Expected:** Student removed from table. Confirmation dialog warns "All their submissions will also be deleted."
  - **Source:** `AdminStudents.tsx:189-196`

---

## Section 7: Invite System

- [ ] **Step 34:** Navigate to the course detail view and find the invite section for the test course
  - **Expected:** Invite management area accessible with email input and send functionality

- [ ] **Step 35:** Send an invite to `[test-student-email]` for `[test-course-code]`
  - **Expected:** Invite created with status "pending" and an expiry date set
  - 🔒 **LMS-INVITE-001** — Verify invite has an expiry timestamp (not perpetual)

- [ ] **Step 36:** View the list of invites — verify status, email, and expiry columns are visible
  - **Expected:** Invite list shows pending invites with correct details

- [ ] **Step 37:** Revoke the invite you just created
  - **Expected:** Invite status changes to "revoked"

---

## Section 8: Submission Review (A3)

- [ ] **Step 38:** Click "Submissions" in the sidebar navigation
  - **Expected:** Navigates to `/admin/submissions`
  - **Source:** `Layout.tsx:70`

- [ ] **Step 39:** Verify the submissions page shows grouped by course member — each member row shows name, email, initials avatar, submission count, and pending count badge
  - **Expected:** Member rows with expandable submission lists
  - **Source:** `AdminSubmissions.tsx:49-91`

- [ ] **Step 40:** Click on a member row to expand their submissions
  - **Expected:** Submissions list expands showing title, file name, file size, status badge (Pending/Approved/Rejected), and action buttons
  - **Source:** `AdminSubmissions.tsx:93-100`

- [ ] **Step 41:** Click the download button on a submission to download the submitted file
  - **Expected:** File downloads via browser

- [ ] **Step 42:** Click "Review" on a pending submission — provide feedback text and select "Approve"
  - **Expected:** Submission status changes to "Approved" with green badge, feedback saved

- [ ] **Step 43:** Review another submission and select "Reject" with feedback
  - **Expected:** Submission status changes to "Rejected" with red badge, feedback saved

---

## Section 9: Certificate Management (A7)

- [ ] **Step 44:** Click "Certificates" in the sidebar navigation
  - **Expected:** Navigates to `/admin/certificates`
  - **Source:** `Layout.tsx:74`

- [ ] **Step 45:** Verify the status filter tabs are visible: "All", "Pending", "Approved", "Minted", "Rejected" — each with a count badge
  - **Expected:** Five filter tabs with correct counts
  - **Source:** `AdminCertificates.tsx:301-306`

- [ ] **Step 46:** Click the "Pending" tab to filter to pending applications only
  - **Expected:** Only pending applications shown

- [ ] **Step 47:** On a pending application, click the "Approve" button
  - **Expected:** Application status changes to "Approved" with green badge
  - **Source:** `AdminCertificates.tsx:390-392`

- [ ] **Step 48:** On a pending application, click the "Reject" button
  - **Expected:** A modal opens with title "Reject application", a text area labeled "Reason for rejection" with placeholder text, and a "Confirm rejection" button
  - **Source:** `AdminCertificates.tsx:222-231`

- [ ] **Step 49:** On an approved application, click "Mint NFT"
  - **Expected:** A confirmation modal appears asking to confirm the mint action
  - **Source:** `AdminCertificates.tsx:400-403`
  - 🔒 **LMS-MINT-002** — Verify the confirmation modal prevents accidental minting

- [ ] **Step 50:** In the mint confirmation modal, click "Mint NFT" to confirm (or "Cancel" to abort)
  - **Expected:** If confirmed, NFT minting initiates — button shows "Minting…" while processing. On success, status changes to "Minted" with purple badge
  - **Source:** `AdminCertificates.tsx:271-274`

- [ ] **Step 51:** Click "Export CSV" button in the applications section
  - **Expected:** CSV file downloads with application data
  - **Source:** `AdminCertificates.tsx:323-326`

- [ ] **Step 52:** Scroll to the "Issued Credentials" section — verify it shows all minted NFTs with tx hash, wallet address, and status
  - **Expected:** Credential list with filter tabs (All/Pending/Minted/Failed) and "Export CSV" button
  - **Source:** `AdminCertificates.tsx:577-613`

- [ ] **Step 53:** On a minted credential, click the "Re-mint" button to open the remint modal
  - **Expected:** Modal opens with wallet address input and "Confirm Re-mint" button
  - **Source:** `AdminCertificates.tsx:730-734, 811-813`

---

## Section 10: Sponsor Portal (A8)

- [ ] **Step 54:** Click "Sponsor Portal" in the sidebar navigation
  - **Expected:** Navigates to `/admin/sponsor`
  - **Source:** `Layout.tsx:75`

- [ ] **Step 55:** Verify enrollment analytics and NFT issuance data are displayed, grouped by sponsor label
  - **Expected:** Analytics charts/tables showing per-course enrollment counts, wallet-linking status, and NFT application counts
  - **Source:** `SponsorDashboard.tsx`

---

## Section 11: Forum Moderation (A9)

- [ ] **Step 56:** Click "Forum" in the sidebar navigation
  - **Expected:** Navigates to `/admin/forum`, shows all forum topics across all courses
  - **Source:** `Layout.tsx:76`

- [ ] **Step 57:** Verify both general and course-scoped forum channels are visible
  - **Expected:** Channel selector shows "General" plus course-specific channels

- [ ] **Step 58:** Open a topic and post a reply
  - **Expected:** Reply appears in the topic thread

---

## Section 12: Messaging (A10)

- [ ] **Step 59:** Click "Messages" in the sidebar navigation
  - **Expected:** Navigates to `/admin/messages`
  - **Source:** `Layout.tsx:77`

- [ ] **Step 60:** Verify the admin has access to a bulk student directory for starting conversations
  - **Expected:** Admin sees a full list of students/users available for messaging (not just existing conversation partners)
  - **Source:** `Messages.tsx:28` (`isAdmin` flag enables bulk student list)

- [ ] **Step 61:** Start a new conversation with `[test-student-1]` and send a message
  - **Expected:** Conversation created, message sent and displayed

---

## Section 13: Course Members (A11)

- [ ] **Step 62:** Click "Course members" in the sidebar navigation
  - **Expected:** Navigates to `/admin/course-members`
  - **Source:** `Layout.tsx:78`

- [ ] **Step 63:** Verify all course enrollments are displayed across all courses
  - **Expected:** Member list showing enrolled users per course

---

## Section 14: User/Role Management (A13)

- [ ] **Step 64:** Navigate to `/admin/students`, find `[test-student-1]` in the user list
  - **Expected:** Student visible in the table

- [ ] **Step 65:** Change the user's role (e.g. from student to lecturer or vice versa)
  - **Expected:** Role change completes successfully, user reflects new role

- [ ] **Step 66:** Verify the role change is logged in the audit system (if audit log is viewable via admin UI or API)
  - **Expected:** Audit log entry exists for the role change action

---

## Section 15: Profile (A12)

- [ ] **Step 67:** Click "Profile" in the sidebar navigation
  - **Expected:** Navigates to `/admin/profile`, shows current admin's profile
  - **Source:** `Layout.tsx:79`

- [ ] **Step 68:** Edit the profile description and add/update a social link (e.g. LinkedIn URL), then save
  - **Expected:** Profile updated successfully

- [ ] **Step 69:** Upload a new avatar image (max 5MB, image files only)
  - **Expected:** Avatar uploads and displays on profile

- [ ] **Step 70:** Navigate to another user's profile via `/admin/profile/[userId]`
  - **Expected:** Other user's public profile loads with their name, description, and social links (read-only)

---

## Section 16: Announcements

- [ ] **Step 71:** On the admin dashboard, locate the Announcements panel and click "New announcement"
  - **Expected:** Form appears with heading "New announcement", fields for title, body, scope (general/course), and a "Pin this announcement to the top" checkbox
  - **Source:** `AnnouncementsPanel.tsx:154-155, 278, 369-376`

- [ ] **Step 72:** Create a general-scope announcement with a title and body, check "Pin this announcement to the top", then click "Post announcement"
  - **Expected:** Announcement appears at the top of the list with a "Pinned" badge
  - **Source:** `AnnouncementsPanel.tsx:196-199, 387`

- [ ] **Step 73:** Click the edit icon on the announcement, change the body text, click "Save changes"
  - **Expected:** Announcement updated with new body text
  - **Source:** `AnnouncementsPanel.tsx:387`

- [ ] **Step 74:** Click the delete icon on the announcement, confirm the "Delete this announcement?" dialog
  - **Expected:** Announcement removed from the list
  - **Source:** `AnnouncementsPanel.tsx:122-130`

---

## Section 17: Rate Limit Spot-Check

- [ ] **Step 75:** Using browser developer tools (Network tab) or a tool like curl, make 25+ rapid requests to any admin API endpoint (e.g. `GET /api/v1/admin/certificates`)
  - **Expected:** After exceeding the rate limit threshold (diagnostics limiter: 20 requests per 15 minutes), server responds with `429 Too Many Requests`
  - 🔒 **LMS-RATE-001** — Admin endpoints are rate-limited

- [ ] **Step 76:** Make 300+ rapid POST/PUT/DELETE requests to a write endpoint
  - **Expected:** After exceeding write limiter threshold (300 requests per 15 minutes), server responds with `429`
  - **Source:** `app.ts` (writeLimiter: 300/15min production)

---

## Section 18: Upload Path Security

- [ ] **Step 77:** In the browser address bar, try accessing a direct upload path like `https://lms.smwebsystems.com/uploads/2026/07/test-file.pdf`
  - **Expected:** Returns 404 Not Found — uploads are NOT served via static file middleware
  - 🔒 **LMS-UPLOAD-001** — Static `/uploads` serving was removed; files served only via authenticated download endpoints

- [ ] **Step 78:** Try accessing `https://lms.smwebsystems.com/uploads/` (directory listing attempt)
  - **Expected:** Returns 404 Not Found
  - 🔒 **LMS-UPLOAD-001**

---

## Verification Summary

| Section | Items | Security Tags |
|---------|-------|---------------|
| 1. Admin Login | 3 | — |
| 2. Dashboard (A1) | 5 | — |
| 3. Course Builder (A4) | 6 | — |
| 4. Quiz Management (A5) | 5 | 🔒 LMS-QUIZ-001 |
| 5. Resource Upload (A6) | 5 | — |
| 6. Student Management (A2) | 9 | — |
| 7. Invite System | 4 | 🔒 LMS-INVITE-001 |
| 8. Submission Review (A3) | 6 | — |
| 9. Certificate Management (A7) | 10 | 🔒 LMS-MINT-002 |
| 10. Sponsor Portal (A8) | 2 | — |
| 11. Forum Moderation (A9) | 3 | — |
| 12. Messaging (A10) | 3 | — |
| 13. Course Members (A11) | 2 | — |
| 14. User/Role Management (A13) | 3 | — |
| 15. Profile (A12) | 4 | — |
| 16. Announcements | 4 | — |
| 17. Rate Limit Spot-Check | 2 | 🔒 LMS-RATE-001 |
| 18. Upload Path Security | 2 | 🔒 LMS-UPLOAD-001 |
| **Total** | **78** | **5 findings covered** |
