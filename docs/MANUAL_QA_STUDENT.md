# Manual QA Checklist — Student Role

> **Purpose:** Click-by-click manual QA checklist for the Student role on the live LMS platform, including Pre-Flight auth/public page checks.
> **Date:** 2026-07-31
> **Live site:** https://lms.smwebsystems.com
> **Estimated walkthrough time:** 35–45 minutes (11 sections × 2–3 min each)
> **Prerequisites:** An admin must have already created at least one course with lessons, a quiz, and uploaded resources. `[test-student-1]` must be enrolled in that course.

---

## Test Accounts

| Placeholder | Role | Purpose |
|-------------|------|---------|
| `[test-student-1]` | Student | Primary student test account (enrolled in a course, wallet linked) |
| `[test-student-email]` | — | Email for `[test-student-1]` |
| `[test-student-password]` | — | Password placeholder |
| `[test-admin-1]` | Admin | For SSO fallback test only |

---

## Section 0: Pre-Flight — Auth & Public Pages (P1–P6)

### Landing Page (P1)

- [ ] **Step 1:** Navigate to `https://lms.smwebsystems.com/`
  - **Expected:** Landing page loads with features and call-to-action. If not authenticated, shows public landing content.

- [ ] **Step 2:** While logged in as `[test-student-1]`, navigate to `/`
  - **Expected:** Auto-redirects to `/student` dashboard (role-based redirect)
  - **Source:** `App.tsx` (HomeRoute redirects authenticated users to roleHome)

### AmmaWallet SSO Login — Primary Path (P2, P6)

- [ ] **Step 3:** Log out if authenticated. Navigate to `https://lms.smwebsystems.com/login`
  - **Expected:** Login page loads with heading "Welcome back" and subtitle "Sign in with your AmmaWallet account to continue." A prominent "Sign in with AmmaWallet" button is visible with a wallet icon.
  - **Source:** `Login.tsx:63-64, 90-92`

- [ ] **Step 4:** Click "Sign in with AmmaWallet"
  - **Expected:** Browser redirects to `https://ammawallet.com/sso/login?callback=...&state=...`
  - **Source:** `Login.tsx:8` (AMMA_LOGIN_URL = `/api/v1/auth/amma-login`)

- [ ] **Step 5:** Authenticate on ammawallet.com with `[test-student-1]` credentials
  - **Expected:** After authentication, redirects back to LMS `/sso-callback` page

- [ ] **Step 6:** Observe the SSO callback page
  - **Expected:** Brief success screen with green checkmark and "Wallet linked successfully" text. After ~1.2s, redirects to `/student` dashboard.
  - **Source:** `SsoCallback.tsx`

### Email/Password Fallback — Secondary Path (P2)

- [ ] **Step 7:** Navigate to `/login`. Click the "Administrator sign in" toggle (small text with chevron, below the SSO button)
  - **Expected:** Email and password form fields expand below the SSO area
  - **Source:** `Login.tsx:111-112`

- [ ] **Step 8:** Enter `[test-student-email]` and `[test-student-password]`, submit
  - **Expected:** If the account uses AmmaWallet auth, error displays: "This account uses AmmaWallet for sign-in. Please use the button above." Otherwise, login succeeds and redirects to `/student`.
  - **Source:** `Login.tsx:41-42`

### Sign Up (P3)

- [ ] **Step 9:** Navigate to `https://lms.smwebsystems.com/sign-up`
  - **Expected:** Sign-up page loads with registration form or link to AmmaWallet registration

- [ ] **Step 10:** On the login page, verify the "Create one on AmmaWallet" link below the SSO button
  - **Expected:** Link points to `https://ammawallet.com/register`
  - **Source:** `Login.tsx:99-101`

### Forgot/Reset Password (P4, P5)

- [ ] **Step 11:** Navigate to `https://lms.smwebsystems.com/forgot-password`
  - **Expected:** Forgot password page loads with email input field

- [ ] **Step 12:** Enter `[test-student-email]` and submit
  - **Expected:** Success message displayed (e.g. "If an account exists with that email, a reset link has been sent")

- [ ] **Step 13:** (If testing with real email) Click the reset link in the email, navigate to `/reset-password` with token
  - **Expected:** Password reset form loads with new password fields

---

## Section 1: Dashboard (S1)

- [ ] **Step 14:** After login, verify the dashboard at `/student` shows a personalized greeting: "Good morning/afternoon/evening, [first-name]!"
  - **Expected:** Time-appropriate greeting with student's first name, badge "Your learning hub"
  - **Source:** `StudentDashboard.tsx:450-458`

- [ ] **Step 15:** Verify the "Today's nudge" card displays a daily motivational message
  - **Expected:** One of 7 rotating daily messages (e.g. "Small steps today add up to big wins tomorrow.") or a context-sensitive hint based on quiz/submission status
  - **Source:** `StudentDashboard.tsx:48-56, 262-268`

- [ ] **Step 16:** Verify four stat cards are visible: "Your uploads" (total submissions), "In the queue" (pending), "Approved" (nice work!), "Quizzes passed"
  - **Expected:** Each card shows a count with icon and subtitle
  - **Source:** `StudentDashboard.tsx:281-314`

- [ ] **Step 17:** Verify "Jump in" quick-action tiles: Course ("Lessons & progress"), Quizzes ("Practice & checks"), Submissions ("Upload work"), Resources ("Files & readings"), Messages ("Chat with classmates"), Forum ("Discuss & ask")
  - **Expected:** Six clickable tiles in a grid, each navigating to the correct page
  - **Source:** `StudentDashboard.tsx:316-365`

- [ ] **Step 18:** Click "Go to course" button in the hero section
  - **Expected:** Navigates to `/student/course`
  - **Source:** `StudentDashboard.tsx:461-463`

- [ ] **Step 19:** Click "Take a quiz" button in the hero section
  - **Expected:** Navigates to `/student/quizzes`
  - **Source:** `StudentDashboard.tsx:465-467`

- [ ] **Step 20:** Verify the "Getting started" checklist is visible (if not previously dismissed): "Connect your AmmaWallet", "Enrol in a course", "Complete your first lesson", "Pass the required quiz", "Apply for your certificate" — each with a done/undone indicator
  - **Expected:** Checklist items show green checkmarks for completed steps, hollow circles for incomplete. Dismissible with X button.
  - **Source:** `StudentDashboard.tsx:272-278, 388-438`

- [ ] **Step 21:** Verify the Announcements panel is visible on the dashboard
  - **Expected:** AnnouncementsPanel renders showing any existing announcements
  - **Source:** `StudentDashboard.tsx:36`

- [ ] **Step 22:** Verify the StudentWalletStatusCard is displayed (if wallet is linked)
  - **Expected:** Card shows wallet address (truncated), linking status, and XLM balance
  - **Source:** `StudentDashboard.tsx:386`

- [ ] **Step 23:** If `walletLinkingStatus === 'existing_account'`, verify the WalletLinkingBanner appears
  - **Expected:** Amber banner with "AmmaWallet account already exists" message, "Open AmmaWallet" and "Reset AmmaWallet password" buttons, dismissible
  - **Source:** `WalletLinkingBanner.tsx`

- [ ] **Step 24:** Verify the certificate eligibility section shows per-course status with plain-English messages (CERT_STATE_MSGS)
  - **Expected:** For each enrolled course, shows status like "You have not yet met the course requirements" (not_eligible), "You have completed all course requirements" (eligible), etc. Skeleton loading on initial load.
  - **Source:** `StudentDashboard.tsx:65-90`

- [ ] **Step 25:** If eligible, verify the "Request certificate" button is present and clickable
  - **Expected:** Button triggers certificate application. On success, status changes to "pending" with message "Your application is under review."
  - **Source:** `StudentDashboard.tsx:221-247`

- [ ] **Step 26:** Verify NFT badges section displays minted credentials (if any)
  - **Expected:** NftCard components render for each minted NFT, showing token details
  - **Source:** `StudentDashboard.tsx:37, 260`

---

## Section 2: Progress (S2)

- [ ] **Step 27:** Click "My Progress" in the sidebar navigation
  - **Expected:** Navigates to `/student/progress`, heading "My Progress" with subtitle "Track your lesson completion, quiz scores, and certificate status for each course."
  - **Source:** `Layout.tsx:89`, `StudentProgress.tsx:60-63`

- [ ] **Step 28:** Verify per-course progress cards show: course name, course code, lesson completion percentage with progress bar, quiz scores, and certificate status badge
  - **Expected:** Each course card displays progress bar, lesson count, quiz results, and a certificate status badge (e.g. "In progress", "Eligible — apply now", "Certificate issued", "Application pending", "Approved — minting soon", "Application rejected")
  - **Source:** `StudentProgress.tsx:7-24, 73-95`

- [ ] **Step 29:** If no courses enrolled, verify empty state: trophy icon with "No courses enrolled yet. Once you enrol in a course it will appear here."
  - **Expected:** Clean empty state, no errors
  - **Source:** `StudentProgress.tsx:66-71`

- [ ] **Step 30:** Verify skeleton loading state appears briefly on initial page load
  - **Expected:** Spinner/loading indicator shows while data loads, then transitions to content
  - **Source:** `StudentProgress.tsx:40-45`

---

## Section 3: Submissions (S3)

- [ ] **Step 31:** Click "My Submissions" in the sidebar navigation
  - **Expected:** Navigates to `/student/submissions`, heading "My Submissions" with subtitle "Manage and track your submitted work"
  - **Source:** `Layout.tsx:90`, `StudentSubmissions.tsx:93-94`

- [ ] **Step 32:** Click "New Submission" button
  - **Expected:** Modal opens with fields: Title (input), Description (textarea), File (file picker)
  - **Source:** `StudentSubmissions.tsx:96-99`

- [ ] **Step 33:** Fill in title and description, select a file (PDF, DOC, DOCX, ZIP, or TXT, under 10MB), then submit
  - **Expected:** Submission created, appears in the "All Submissions" table with status "Pending" (yellow badge with clock icon)

- [ ] **Step 34:** Without selecting a file, try to submit
  - **Expected:** Error message "Please select a file" appears
  - **Source:** `StudentSubmissions.tsx:42-43`

- [ ] **Step 35:** Verify the submissions table shows columns: Title, File (name + size), Status (badge), Submitted (date), Actions
  - **Expected:** Table with correct column headers and data
  - **Source:** `StudentSubmissions.tsx:121-139`

- [ ] **Step 36:** If a submission has admin feedback, verify it appears below the status badge as "Feedback: [text]"
  - **Expected:** Feedback text visible in the status column
  - **Source:** `StudentSubmissions.tsx:169-173`

- [ ] **Step 37:** On a pending submission, click "Delete" button, confirm the dialog "Are you sure you want to delete this submission?"
  - **Expected:** Submission removed from table. Delete button only visible for pending submissions (not approved/rejected).
  - **Source:** `StudentSubmissions.tsx:64-71, 179-188`

- [ ] **Step 38:** Verify that approved/rejected submissions do NOT show a delete button
  - **Expected:** No delete action available for reviewed submissions
  - **Source:** `StudentSubmissions.tsx:179`

- [ ] **Step 39:** If no submissions exist, verify empty state: file icon with "No submissions yet" and "Click 'New Submission' to upload your first assignment"
  - **Expected:** Clean empty state message
  - **Source:** `StudentSubmissions.tsx:113-117`

---

## Section 4: Course Viewer (S4)

- [ ] **Step 40:** Click "Course" in the sidebar navigation
  - **Expected:** Navigates to `/student/course`, shows enrolled course cards with progress indicators ("X/Y done")
  - **Source:** `Layout.tsx:91`, `StudentCourse.tsx:616`

- [ ] **Step 41:** Click on a course card to open it
  - **Expected:** Course detail view opens showing weeks → sections → items hierarchy with a progress bar ("X of Y marked done")
  - **Source:** `StudentCourse.tsx:812-813`

- [ ] **Step 42:** Click on a material item (video, PDF, link, or text)
  - **Expected:** EmbeddedMaterialViewer opens showing the content inline (video player, PDF viewer, external link, or text content)
  - **Source:** `StudentCourse.tsx:740-743`

- [ ] **Step 43:** Click the checkmark circle next to a material item to toggle "Mark as done"
  - **Expected:** Checkmark turns green (filled CheckCircle), item counted in progress. Tooltip reads "Mark as not done" when already done, "Mark as done" when not.
  - **Source:** `StudentCourse.tsx:892-914`

- [ ] **Step 44:** Verify the progress bar at the top updates when items are marked done
  - **Expected:** Progress bar and "X of Y marked done" text update in real-time
  - **Source:** `StudentCourse.tsx:812-813`

- [ ] **Step 45:** Verify Previous/Next navigation between materials
  - **Expected:** Can navigate sequentially through materials in order

---

## Section 5: Quizzes (S5)

- [ ] **Step 46:** Click "Quizzes" in the sidebar navigation
  - **Expected:** Navigates to `/student/quizzes`, shows available quizzes with title and question count. Instructions: "Open a quiz for instructions, then answer one question at a time."
  - **Source:** `Layout.tsx:92`, `StudentQuizzes.tsx:631-633`

- [ ] **Step 47:** Click "Take quiz" on an unattempted quiz (or "Retake" on a previously attempted one)
  - **Expected:** Quiz intro screen shows quiz title, question count, passing score info, and instructions. Button reads "Begin quiz" (first attempt) or "Retake quiz" (subsequent).
  - **Source:** `StudentQuizzes.tsx:669-670, 472-474`

- [ ] **Step 48:** Click "Begin quiz" to start
  - **Expected:** First question appears with answer options. One question at a time — progress saved in browser until submitted.
  - **Source:** `StudentQuizzes.tsx:456-458`

- [ ] **Step 49:** Answer all questions, then click "Submit quiz"
  - **Expected:** Quiz submitted, results screen shows score, pass/fail status, per-question review with "Your answer" vs correct answer, and attempt count
  - **Source:** `StudentQuizzes.tsx:549-551`

- [ ] **Step 50:** On the results screen, verify "Retake quiz" button is available
  - **Expected:** Button to retake is visible
  - **Source:** `StudentQuizzes.tsx:399-401`

- [ ] **Step 51:** Verify that quiz answer keys are NOT visible in the student quiz listing or intro screen — only shown in the results review after submission
  - **Expected:** No `correctAnswer` or `correctIndex` fields leaked in the quiz API response before submission. After submission, correct answers shown only in the review section.
  - 🔒 **LMS-QUIZ-001** — Answer keys hidden from students pre-submission

- [ ] **Step 52:** Verify that you can only see your own quiz completions (not other students' scores)
  - **Expected:** Quiz completions API returns only the authenticated user's scores
  - 🔒 **LMS-QUIZ-002/003** — IDOR prevention on quiz completions

---

## Section 6: Resources (S6)

- [ ] **Step 53:** Click "Resources" in the sidebar navigation
  - **Expected:** Navigates to `/student/documents`, heading "Resources" with subtitle "Download learning materials and course documents uploaded by your instructors"
  - **Source:** `Layout.tsx:93`, `StudentDocuments.tsx:131-134`

- [ ] **Step 54:** Verify documents are grouped by category with search and category filter
  - **Expected:** Search bar with search icon, category filter dropdown, documents listed with download buttons
  - **Source:** `StudentDocuments.tsx:58, 144`

- [ ] **Step 55:** Use the search bar to filter documents by title
  - **Expected:** Document list filters in real-time to show matches

- [ ] **Step 56:** Click the download button on a document
  - **Expected:** File downloads to browser

---

## Section 7: Forum (S7)

- [ ] **Step 57:** Click "Forum" in the sidebar navigation
  - **Expected:** Navigates to `/student/forum`. Description: "Ask questions and discuss. Choose a channel below." Channel tabs visible with "General" as default.
  - **Source:** `Layout.tsx:94`, `Forum.tsx:269-270, 279-281`

- [ ] **Step 58:** Verify channel tabs: "General" (globe icon) plus course-specific channels for enrolled courses
  - **Expected:** General channel always visible. Course channels loaded dynamically based on enrollment.
  - **Source:** `Forum.tsx:279-298`

- [ ] **Step 59:** Click "New topic" button
  - **Expected:** New topic form appears with title and body fields. Shows posting context (e.g. "Posting in General").
  - **Source:** `Forum.tsx:443-444, 362-363`

- [ ] **Step 60:** Fill in title and body, click "Post discussion"
  - **Expected:** Topic created and appears in the topic list
  - **Source:** `Forum.tsx:403-404`

- [ ] **Step 61:** Click on a topic to view it. Type a reply in the text area (placeholder "Write your reply...") and click "Reply"
  - **Expected:** Reply appears in the thread with your name and timestamp
  - **Source:** `Forum.tsx:237-252`

- [ ] **Step 62:** Post a topic or reply containing `<script>alert(1)</script>` in the body
  - **Expected:** HTML tags rendered as escaped plain text, NOT executed as JavaScript. No alert dialog.
  - 🔒 **LMS-XSS-001** — Stored XSS prevention in forum

---

## Section 8: Messages (S8)

- [ ] **Step 63:** Click "Messages" in the sidebar navigation
  - **Expected:** Navigates to `/student/messages`. Heading "Messages" with subtitle about direct messages. "New conversation" button visible.
  - **Source:** `Layout.tsx:95`, `Messages.tsx:222`

- [ ] **Step 64:** Click "New conversation"
  - **Expected:** Contact list shows peers from shared courses (not all users — students don't get bulk directory access like admins)
  - **Source:** `Messages.tsx:298`

- [ ] **Step 65:** Select a peer and send a message
  - **Expected:** Conversation created, message displayed in thread

- [ ] **Step 66:** Verify unread message badge appears in sidebar next to "Messages" when a new message is received
  - **Expected:** Badge count updates (polled every 30 seconds)
  - **Source:** `Layout.tsx` (unread count polling)

- [ ] **Step 67:** If no conversations exist, verify empty state: "No threads yet. Use **New conversation** to reach someone in your courses."
  - **Expected:** Clean empty state with guidance text
  - **Source:** `Messages.tsx:308-314`

- [ ] **Step 68:** Send a message containing `<img onerror=alert(1) src=x>` in the body
  - **Expected:** HTML rendered as escaped plain text, not as an image element. No JavaScript executes.
  - 🔒 **LMS-XSS-002** — Stored XSS prevention in messages

---

## Section 9: Course Members (S9)

- [ ] **Step 69:** Click "Course members" in the sidebar navigation
  - **Expected:** Navigates to `/student/course-members`, shows enrolled peers for courses the student is in
  - **Source:** `Layout.tsx:96`

- [ ] **Step 70:** Verify the member list shows name, email, and role for each enrolled peer
  - **Expected:** List of course members visible with their details

- [ ] **Step 71:** Use search/filter to find a specific member by name
  - **Expected:** List filters to show matching members

---

## Section 10: Profile (S10)

- [ ] **Step 72:** Click "Profile" in the sidebar navigation
  - **Expected:** Navigates to `/student/profile`, shows profile editing form with "Display name", "Bio / description", social links section, and avatar upload
  - **Source:** `Layout.tsx:97`

- [ ] **Step 73:** Edit the "Display name" and "Bio / description" fields, then click "Save profile"
  - **Expected:** Profile updated, green "Saved" checkmark appears briefly

- [ ] **Step 74:** In the "Social & contact" section, add a social link (e.g. WhatsApp with placeholder "+27 82 123 4567"), then save
  - **Expected:** Social link saved and displayed on profile
  - **Source:** `Profile.tsx:96`

- [ ] **Step 75:** Upload a new avatar image by clicking the camera icon on the avatar
  - **Expected:** Avatar uploads and displays (max 5MB, image files only)
  - **Source:** `Profile.tsx:104-107, 174`

- [ ] **Step 76:** Navigate to another user's profile at `/student/profile/[userId]`
  - **Expected:** Other user's profile loads in read-only mode with their name, description, social links, and a "Message [Name]" button

---

## Verification Summary

| Section | Items | Security Tags |
|---------|-------|---------------|
| 0. Pre-Flight (P1-P6) | 13 | — |
| 1. Dashboard (S1) | 13 | — |
| 2. Progress (S2) | 4 | — |
| 3. Submissions (S3) | 9 | — |
| 4. Course Viewer (S4) | 6 | — |
| 5. Quizzes (S5) | 7 | 🔒 LMS-QUIZ-001, LMS-QUIZ-002/003 |
| 6. Resources (S6) | 4 | — |
| 7. Forum (S7) | 6 | 🔒 LMS-XSS-001 |
| 8. Messages (S8) | 6 | 🔒 LMS-XSS-002 |
| 9. Course Members (S9) | 3 | — |
| 10. Profile (S10) | 5 | — |
| **Total** | **76** | **4 findings covered** |
