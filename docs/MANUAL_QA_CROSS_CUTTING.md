# Manual QA Checklist — Cross-Cutting Concerns

> **Purpose:** Verify cross-cutting behaviors (responsiveness, error handling, SSO, session management, security fixes) on the live production site.
> **Date:** 2026-07-31
> **Live site:** https://lms.smwebsystems.com
> **Estimated walkthrough time:** 30–40 minutes (10 sections)

---

## Test Accounts

| Placeholder | Role | Purpose |
|-------------|------|---------|
| `[test-admin-1]` | Admin | Admin access for FK checks, rate limit testing |
| `[test-student-1]` | Student | Primary student (enrolled in a course, wallet linked) |
| `[test-student-2]` | Student | Empty-state student (no enrollments, no submissions, no messages) |
| `[test-lecturer-1]` | Lecturer | Lecturer access for mobile test |

> **Note:** FK integrity checks (Section 8) require admin privileges and should only be performed on test data.

---

## Section 1: Mobile Responsiveness (375px width)

Open Chrome DevTools (F12), toggle device toolbar, set viewport to **375 × 812** (iPhone SE).

- [ ] **Step 1:** Log in as `[test-admin-1]` and navigate to `/admin`
  - **Expected:** The left sidebar navigation is hidden (translated off-screen via `-translate-x-full`). A hamburger menu icon is visible in the top-left header area. Main content spans the full width and text is readable without horizontal scrolling.
  - **Source:** `Layout.tsx:102-108` (mobile overlay + hamburger)

- [ ] **Step 2:** Tap the hamburger menu icon in the header
  - **Expected:** Sidebar slides in from the left. A semi-transparent dark overlay (`bg-neutral-900/40`) covers the main content. All 12 admin nav items are visible and scrollable: Dashboard, Students, Submissions, Course, Quizzes, Resources, Certificates, Sponsor Portal, Forum, Messages, Course members, Profile.
  - **Source:** `Layout.tsx:67-79` (admin nav items)

- [ ] **Step 3:** Tap the overlay area (outside the sidebar) to close it
  - **Expected:** Sidebar slides back off-screen. Overlay disappears. Main content is interactive again.
  - **Source:** `Layout.tsx:102-108` (close on overlay click)

- [ ] **Step 4:** Open hamburger menu and tap "Messages" in the nav list
  - **Expected:** Sidebar auto-closes on route change. Messages page loads. Hamburger icon reappears.

- [ ] **Step 5:** Log out. Log in as `[test-student-1]` and navigate to `/student` at 375px
  - **Expected:** Same mobile layout. Student nav items visible when opened: Dashboard, My Progress, My Submissions, Course, Quizzes, Resources, Forum, Messages, Course members, Profile (10 items).
  - **Source:** `Layout.tsx:87-98` (student nav items)

- [ ] **Step 6:** Log out. Log in as `[test-lecturer-1]` and navigate to `/lecturer` at 375px
  - **Expected:** Same mobile layout. Lecturer nav items: Dashboard, Messages, Profile (3 items).
  - **Source:** `Layout.tsx:81-86` (lecturer nav items)

- [ ] **Step 7:** On any dashboard at 375px, check the header area
  - **Expected:** User's name and role label are hidden at small viewports (`hidden sm:block` hides them below 640px). Only the Logout button icon is visible. The logout button remains tappable.

- [ ] **Step 8:** Resize viewport to 1024px+ (desktop breakpoint `lg`)
  - **Expected:** Sidebar is permanently visible as a sticky column. Hamburger icon is hidden. User's name and role are visible in the header.

---

## Section 2: Error State Handling

- [ ] **Step 9:** On the login page, submit the email/password form with both fields empty
  - **Expected:** Client-side validation prevents submission or displays an inline error message. No raw error or stack trace is shown.

- [ ] **Step 10:** Enter an incorrect email/password combination and submit
  - **Expected:** A user-friendly error message appears (e.g. "Invalid email or password."). No server stack traces or technical details exposed.

- [ ] **Step 11:** While logged in, navigate to a non-existent route such as `/student/nonexistent` or `/admin/does-not-exist`
  - **Expected:** Catch-all route (`<Route path="*" element={<Navigate to="/" replace />}`) redirects to `/`. Since user is authenticated, they are further redirected to their role dashboard. No blank page.
  - **Source:** `App.tsx` (catch-all route)

- [ ] **Step 12:** Open DevTools Network tab. Trigger any API error. Check the response format
  - **Expected:** Error responses follow the format: `{ "success": false, "error": { "code": "...", "message": "..." } }`. No raw stack traces or SQLite error codes exposed to client.
  - **Source:** `errorHandler.ts` (SQLite errors always return "An unexpected error occurred")

- [ ] **Step 13:** Call a non-existent API endpoint: `https://lms.smwebsystems.com/api/v1/this-does-not-exist`
  - **Expected:** Response is 404 with body `{ "success": false, "error": { "code": "NOT_FOUND", "message": "Resource not found" } }`
  - **Source:** `errorHandler.ts` (notFoundHandler)

---

## Section 3: Empty States

- [ ] **Step 14:** Log in as `[test-student-2]` (no course enrollments). Navigate to `/student`
  - **Expected:** Dashboard displays appropriate empty state or "no courses" message. No blank section or JavaScript error.

- [ ] **Step 15:** Navigate to `/student/submissions`
  - **Expected:** Empty state message shown (e.g. "No submissions yet"). No blank table or error.

- [ ] **Step 16:** Navigate to `/student/messages`
  - **Expected:** Empty state indicating no messages. Messaging interface loads without errors.

- [ ] **Step 17:** Navigate to `/student/forum`
  - **Expected:** If no forum topics exist, empty state shown. Page renders without errors.

- [ ] **Step 18:** Navigate to `/student/quizzes`
  - **Expected:** If no quizzes available, message indicating no quizzes. No errors.

---

## Section 4: AmmaWallet SSO Handshake

- [ ] **Step 19:** Open `https://lms.smwebsystems.com/login` in a fresh browser session (no existing token in localStorage)
  - **Expected:** Login page loads with prominent "Sign in with AmmaWallet" button. Below it is a link "Create one on AmmaWallet" pointing to `https://ammawallet.com/register`.
  - **Source:** `Login.tsx`

- [ ] **Step 20:** Click "Sign in with AmmaWallet"
  - **Expected:** Browser redirects to `https://ammawallet.com/sso/login?callback=...&state=...`. The `state` parameter is a signed JWT (5-minute expiry). The `callback` URL points to LMS `/api/v1/auth/amma-callback`.
  - **Source:** `ammaWalletSSOService.ts` (buildSsoInitiateUrl)

- [ ] **Step 21:** Authenticate on ammawallet.com with credentials for `[test-student-1]`
  - **Expected:** After authentication, browser redirects back to LMS. Server validates state JWT and exchanges assertion token via server-to-server `/api/v1/sso/verify` call.

- [ ] **Step 22:** Observe the SSO callback page at `/sso-callback`
  - **Expected:** Brief success screen with green checkmark and "Wallet linked successfully" text. After ~1.2 seconds, redirects to the role-appropriate dashboard (e.g. `/student`).
  - **Source:** `SsoCallback.tsx`

- [ ] **Step 23:** On the student dashboard, verify wallet linking status
  - **Expected:** Dashboard shows wallet address (truncated). The StudentWalletStatusCard shows linked status and XLM balance.
  - **Source:** `StudentWalletStatusCard.tsx`

- [ ] **Step 24:** If `[test-student-1]` has `walletLinkingStatus === 'existing_account'`, verify the wallet linking banner
  - **Expected:** Amber banner at top of dashboard with text about existing AmmaWallet account and buttons "Open AmmaWallet" and "Reset AmmaWallet password". Dismissible with X button.
  - **Source:** `WalletLinkingBanner.tsx`

- [ ] **Step 25:** Test SSO error handling — navigate to `/login?sso_error=invalid_state`
  - **Expected:** Amber error box displays: "The sign-in session expired or was tampered with. Please try again."

- [ ] **Step 26:** Navigate to `/login?sso_error=assertion_failed`
  - **Expected:** Error box displays: "AmmaWallet could not verify your identity. Please try again."

---

## Section 5: NFT Mint → AmmaWallet Reflection

> **Prerequisites:** `[test-student-1]` must have a linked AmmaWallet. An eligible application must be in "approved" status.

- [ ] **Step 27:** Log in as `[test-admin-1]`. Navigate to `/admin/certificates`
  - **Expected:** Certificates page loads with approved applications

- [ ] **Step 28:** Locate `[test-student-1]`'s approved application. Click "Mint NFT". Confirm in the confirmation modal.
  - **Expected:** Mint initiates. UI shows loading state. After on-chain confirmation, credential status updates to "minted" with transaction hash displayed.
  - **Source:** `mintService.ts` (Soroban contract mint call)

- [ ] **Step 29:** Log in to `https://ammawallet.com` as `[test-student-1]`. Navigate to the credentials/NFT page.
  - **Expected:** Newly minted NFT credential appears in the wallet's NFT list with correct course name and matching token ID.

- [ ] **Step 30:** Back on LMS, log in as `[test-student-1]`. Check student dashboard credentials section.
  - **Expected:** Minted credential shows with status "minted", truncated wallet address, and transaction hash.

---

## Section 6: Browser Back/Forward Navigation

- [ ] **Step 31:** Log in as `[test-student-1]`. From `/student`, click "Course" in sidebar to go to `/student/course`
  - **Expected:** Course page loads. "Course" nav item highlighted.

- [ ] **Step 32:** Click "Quizzes" in sidebar to go to `/student/quizzes`
  - **Expected:** Quizzes page loads. "Quizzes" nav item highlighted.

- [ ] **Step 33:** Press browser Back button
  - **Expected:** Returns to `/student/course`. Page renders correctly, no blank screen. "Course" nav item highlighted.

- [ ] **Step 34:** Press browser Forward button
  - **Expected:** Returns to `/student/quizzes`. Page renders correctly.

- [ ] **Step 35:** Navigate: Dashboard → My Progress → Messages → Forum. Press Back three times
  - **Expected:** Each Back press returns to the previous page in order. No blank pages, no JavaScript errors.

- [ ] **Step 36:** From student dashboard, press Back (toward login/landing page)
  - **Expected:** Since user is authenticated and login route redirects authenticated users to their dashboard, navigating back to `/login` should redirect back to `/student`.

---

## Section 7: Session Expiry / Logout

- [ ] **Step 37:** Log in as `[test-student-1]`. Click the "Logout" button in the header
  - **Expected:** Redirected to `/login`. Token removed from localStorage (key: `lms_token`). Verify in DevTools > Application > Local Storage.
  - **Source:** `AuthContext.tsx` (logout clears token)

- [ ] **Step 38:** After logout, navigate to `/student` by typing the URL
  - **Expected:** ProtectedRoute detects `isAuthenticated === false` and redirects to `/login`. Dashboard not shown.
  - **Source:** `App.tsx:52-71` (ProtectedRoute)

- [ ] **Step 39:** After logout, call API directly: in DevTools console run `fetch('/api/v1/auth/me').then(r => r.json()).then(console.log)`
  - **Expected:** Response: `{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "Missing or invalid authorization header" } }` with HTTP 401.

- [ ] **Step 40:** Test password-change session invalidation. Log in as `[test-student-1]` in **Browser A**. In **Browser B**, log in as same user and change password via Profile page.
  - **Expected:** In Browser A, the next API call (or unread-message poll every 30s) returns 401 with "Session expired after password change. Please log in again." Frontend detects 401 and redirects to login.
  - **Source:** `auth.ts:32-44` (password_changed_at vs JWT iat check)

- [ ] **Step 41:** Verify expired JWT is rejected. Set an expired token in localStorage and refresh.
  - **Expected:** AuthProvider hydrate calls `/auth/me`, receives 401 ("Invalid or expired token"), clears token, redirects to login.

---

## Section 8: FK Integrity Spot-Checks

> **IMPORTANT:** Only perform on test data. Do NOT delete production courses.

- [ ] **Step 42:** Log in as `[test-admin-1]`. Create a test course and associate at least one quiz (set quiz's `course_id` to test course). Then delete the test course.
  - **Expected:** Quiz is NOT deleted. Quiz's `course_id` is set to `NULL` (per `REFERENCES courses(id) ON DELETE SET NULL` in `ensureQuizzesCourseIdFK`). Quiz still appears in Quizzes list with no course association.
  - 🔒 **LMS-DB-001** — FK constraint prevents orphaned quizzes
  - **Source:** `database.ts` (ensureQuizzesCourseIdFK)

- [ ] **Step 43:** Verify `nft_credentials` with `application_id` references remain intact after application status changes
  - **Expected:** `nft_credentials` row retains `application_id` value. FK `REFERENCES course_nft_applications(id) ON DELETE SET NULL` ensures if application deleted, credential's `application_id` set to NULL (not cascading delete).
  - 🔒 **LMS-DB-002** — FK constraint prevents orphaned credentials

---

## Section 9: XSS Verification

- [ ] **Step 44:** Log in as `[test-student-1]`. Navigate to `/student/forum`. Create a new topic with:
  - **Title:** `Test XSS <script>alert('xss')</script>`
  - **Body:** `<script>alert('xss')</script> <b>bold</b> <img onerror=alert(1) src=x>`
  - **Expected:** Topic created. When viewing, script tags and HTML rendered as **escaped plain text** (visible as literal characters), NOT executed as JavaScript. No alert dialog. `<img>` tag rendered as text, not as element.
  - 🔒 **LMS-XSS-001** — Stored XSS prevention in forum

- [ ] **Step 45:** Navigate to `/student/messages`. Send a message with:
  - **Body:** `<img onerror=alert(1) src=x> <script>document.cookie</script> <a href="javascript:alert(1)">click</a>`
  - **Expected:** Message sent. All HTML rendered as escaped plain text. No JavaScript executes. No alert dialogs. `javascript:` link rendered as literal text.
  - 🔒 **LMS-XSS-002** — Stored XSS prevention in messages

- [ ] **Step 46:** View the forum topic and message from Step 44-45 in a different browser/incognito (logged in as different user)
  - **Expected:** XSS payloads remain escaped for all viewers, not just the author. Server-side HTML-escape protects all users.

---

## Section 10: Rate Limit Verification

Rate limit configuration (from `app.ts`): production uses **15-minute window**.

| Limiter | Max Requests (Production) | Window | Applies To |
|---------|--------------------------|--------|------------|
| `authLimiter` | 60 | 15 min | `/api/v1/auth/*` (login, register, etc.) |
| `writeLimiter` | 300 | 15 min | POST/PATCH/PUT/DELETE on all API routes |
| `readLimiter` | 120 | 15 min | `/api/v1/users/*`, `/api/v1/credentials/*` |

- [ ] **Step 47:** Using curl or a script, send 61+ rapid POST requests to `/api/v1/auth/login` with invalid credentials
  - **Expected:** After 60th request in 15-minute window, responses return HTTP `429 Too Many Requests` with body: `{ "success": false, "error": { "code": "RATE_LIMITED", "message": "Too many login attempts, please try again later" } }`
  - 🔒 **LMS-RATE-001** — Auth rate limiting
  - **Source:** `app.ts` (authLimiter: 60/15min production)

- [ ] **Step 48:** Send 301+ rapid POST requests to a write endpoint (e.g. `/api/v1/forum/topics`) with valid auth token
  - **Expected:** After 300th mutating request in 15-minute window, POST/PATCH/PUT/DELETE requests return HTTP `429`. GET requests to same route continue working.
  - **Source:** `app.ts` (writeLimiter: 300/15min, skips GET/HEAD/OPTIONS)

- [ ] **Step 49:** Verify admin routes are covered by rate limiter (previously missing per LMS-RATE-001)
  - **Expected:** `POST /api/v1/admin/credentials/:credentialId/remint` is rate-limited. 301+ POST requests within 15 minutes returns 429.
  - 🔒 **LMS-RATE-001** — Admin endpoints now rate-limited

---

## Verification Summary

| Section | Items | Security Tags |
|---------|-------|---------------|
| 1. Mobile Responsiveness | 8 | — |
| 2. Error State Handling | 5 | — |
| 3. Empty States | 5 | — |
| 4. AmmaWallet SSO | 8 | — |
| 5. NFT Mint Reflection | 4 | — |
| 6. Browser Back/Forward | 6 | — |
| 7. Session Expiry/Logout | 5 | — |
| 8. FK Integrity | 2 | 🔒 LMS-DB-001, LMS-DB-002 |
| 9. XSS Verification | 3 | 🔒 LMS-XSS-001, LMS-XSS-002 |
| 10. Rate Limit Verification | 3 | 🔒 LMS-RATE-001 |
| **Total** | **49** | **5 findings covered** |
