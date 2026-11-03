# LMS platform audit — 22 October 2026

Audited commit: `bef865366f36293ea152a9f89524ce1bb7337603` on `main`, pulled with `git pull --ff-only` from `27f9535`.

Step 1 (A01, A02, A07) is implemented and locally validated: 1,626 backend tests passed. See [Step 1 — role changes and search authorization](2026-10-22-step1-security-remediation.md) for changes and deployment behavior. Findings below preserve the original audited state; production deployment remains pending.

Scope: LMS-Server, LMS-Frontend, LMS-Mobile, their API contracts, and relevant test coverage. The separate Amma Wallet packages, extension, blockchain contracts, deployed server configuration, and production data were not comprehensively audited. No production server access, deployment, payment, email delivery, or blockchain transaction was performed.

This is a source and local-test audit. UI findings describe routing, data loading, controls, and feature completeness; they are not a screenshot-based assessment of visual polish. No mobile emulator or physical device was used. Database probes used the existing isolated Vitest in-memory database and synthetic accounts. Findings about production depend on the deployed version and actual role assignments.

## Findings and priorities

P1 means a security boundary defect or a major workflow blocker. P2 means a functional gap or misleading UI that should follow the P1 fixes. “Probe confirmed” means reproduced against the local API, not production.

### A01 — P1: A lower administrator can revoke a higher administrator's role

Evidence: `LMS-Server/src/routes/rbac.ts:550`, especially the DELETE handler's self-modification check and subsequent unconditional role deletion. The POST assignment handler checks privilege levels; DELETE does not check the target role's level, the target user's level, or whether a super-admin would be the last one.

Probe confirmed: an actor with only `role_admin2` deleted another user's `role_super_admin` assignment and received HTTP 200. This permits administrative denial of service and can remove the highest privileged operator.

Fix: enforce target-user and target-role hierarchy on revocation, protect the last super-admin, and perform the count/check/delete atomically. Add tests for peer, higher-tier, last-super-admin, and allowed lower-tier removal.

### A02 — P1: Legacy role demotion does not revoke effective privileges

Evidence: `LMS-Server/src/controllers/usersController.ts:285` updates only `users.role`; `LMS-Server/database/schema.sql:523` has an INSERT-only legacy-to-RBAC trigger. Permission checks read `user_roles`.

Probe confirmed: PATCH `/api/v1/users/:id/role` changed an admin's legacy role to `student`, returned 200, and left `role_admin` assigned. Changing the visible role therefore does not remove administrative API permissions. Old JWT legacy claims can also disagree with the changed database role until token renewal.

Fix: choose an authoritative role model, explicitly define whether this endpoint is a display-role change or effective demotion, and expose that distinction accurately. A true demotion must reconcile effective assignments and invalidate affected sessions. Test permissions and active tokens after demotion, not just the PATCH response.

### A03 — P1: Web routing does not use effective RBAC roles

Evidence: `LMS-Frontend/src/App.tsx:52` and `:88`, `LMS-Frontend/src/components/Layout.tsx:159`, `LMS-Frontend/src/types/api.ts:52`, and `LMS-Server/src/controllers/authController.ts:367`.

The backend's legacy role supports only student/lecturer/admin; its RBAC model includes sponsor, employer, parent, teacher, TA, and administrator tiers. `/auth/me` returns `rbacRoles` and `adminTier`, but the frontend User interface omits both and routes/navigation use `user.role` alone. There is no effective-workspace selector for multiple roles.

Probe confirmed: a sponsor-only RBAC account with legacy `student` receives `role: student` and `rbacRoles: [sponsor]`. The browser directs that account to the student workspace and rejects `/sponsor`. Similar mismatches affect other added roles. Mapping a custom name heuristically does not resolve capability or assignment scope.

Fix: return a typed effective authorization context; derive available workspaces/navigation and action controls from it. Keep backend enforcement authoritative. Test role combinations, newly assigned and revoked roles, and direct navigation after session restoration.

### A04 — P1: Assigned instructors can lose course discovery and reading access

Evidence: `LMS-Server/src/controllers/coursesController.ts:89` and `:160`. Course listing and reading still branch on the legacy JWT role, despite newer permission-based course-scope middleware used elsewhere.

Probe confirmed: a legacy-student account with `role_instructor` and a `course_lecturers` assignment received an empty course list. The single-course read path also checks enrollment codes rather than that assignment for such an actor.

Fix: use consistent effective permissions and assignment scopes for list, detail, editing, member rosters, and related resources. Test an instructor without student enrollment and without legacy lecturer status.

### A05 — P1: Sponsor overview depends on admin-only analytics

Evidence: `LMS-Frontend/src/pages/SponsorDashboard.tsx:516` calls `analyticsService.getCourseAnalytics()`; `LMS-Server/src/routes/analytics.ts:10` gates the entire router with `system.view_audit_log`. Sponsor exports and student drill-down use that router too. The existing `/sponsor/dashboard` service is not used by this page.

Probe confirmed: a standard sponsor-only account gets HTTP 403 from `/analytics/courses`. The Promise.all failure prevents both course data and the separately successful spending report from being stored. Consequently the course selector is empty and the rewards tab can incorrectly report “No cohorts found.”

Fix: separate administrator analytics from sponsor-scoped dashboard, course selection, export, and student drill-down APIs. Load independent resources independently and distinguish errors from empty data. Do not solve this by giving sponsors global audit/analytics access.

### A06 — P2: Dedicated sponsor billing requires an ungranted permission

Evidence: `LMS-Server/src/routes/sponsor.ts:196` requires `billing.view_own`; `LMS-Server/src/config/database.ts:1352` gives sponsors `billing.view_all` but not `billing.view_own`.

Probe confirmed: a sponsor-only actor gets HTTP 403 from `/sponsor/billing`. An additional student role can mask this because it grants `billing.view_own`; this is a role-composition dependency, so not every deployed sponsor necessarily encounters it.

The dedicated billing query lists only payments whose payer is the sponsor. The separately implemented scoped admin-payment endpoint also supports cohort-member payments. The portal should explicitly explain the intended distinction between sponsor-paid invoices and cohort-member payment status.

Fix: align permission grants and endpoint semantics, then test sponsor-only and sponsor+student accounts against the exact billing page API, receipts, and cohort payments.

### A07 — P1: Global search treats directory access as global credential access

Evidence: `LMS-Server/src/controllers/searchController.ts:31` sets `isAdmin` using `user.view_all`; `:87` skips credential ownership filtering when this is true. Instructors receive that directory permission in `LMS-Server/src/config/database.ts:1367`.

Probe confirmed: an instructor with no assigned courses found a different student's minted credential through `/search?types=credentials`. The response includes credential ID, student name, course title when present, and issue date. Whether each credential is separately publicly verifiable does not justify granting unrestricted authenticated search across all students.

Fix: authorize each result type independently and enforce applicable course/tenant/ownership scope. Test instructors in unrelated courses, tenant boundaries, and custom directory-only roles.

### A08 — P2: Sponsor URL and active tab can disagree

Evidence: `LMS-Frontend/src/pages/SponsorDashboard.tsx:479` initializes activeTab from the URL once; subsequent tab clicks only call setActiveTab. Sidebar navigation changes the URL, and the component can remain mounted across matching route elements.

Code-path finding: browser refresh can return to the URL's old tab; sidebar navigation can leave a stale active tab; Cohorts has no dedicated route. A sponsor following a billing link should always see billing.

Fix: derive the tab from the URL, add a cohorts route, and navigate on tab changes. Add tests that navigate within an already mounted app, then exercise back/forward and reload. Existing initial-route tests do not cover this sequence.

### A09 — P2: Administrator screens expose controls unavailable to their tier

Evidence: `LMS-Frontend/src/pages/AdminDashboard.tsx:484` always renders RbacAdminPanel, and Layout always shows User Roles. Role-list APIs require `system.manage_roles`, and assignment APIs require `user.assign_role`; baseline `role_admin` lacks both.

Code-path finding: a baseline administrator sees tools that fail with authorization errors. Merely sharing the legacy `admin` role does not mean an actor may manage roles. UserRoleManager also offers assignments the API must reject rather than communicating the actor's actual assignable set.

Fix: gate panels/navigation/actions by effective capabilities and return server-computed assignable/revocable role choices. Give genuinely unauthorized direct links a useful explanation.

### A10 — P1: Mobile course content is materially behind the editor

Evidence: `LMS-Mobile/src/types/course.ts:1`, `LMS-Mobile/src/components/MaterialViewer.tsx:67`, compared with `LMS-Frontend/src/types/course.ts:3` and StudentCourse's inline content handling.

Mobile implements only video, link, and PDF. The web editor supports text, audio, inline quiz, assignment, and download items too. A typed assertion in the mobile course mapper does not validate or convert actual server items. Unsupported items can reach the viewer with no matching content branch, displaying a title without usable learning content.

Fix: share the content contract, implement these renderers/actions, and provide an explicit unsupported-content fallback. Separate quiz/submission screens do not replace the missing in-lesson associations. Test a course containing every supported item type.

### A11 — P2: Mobile flattens multi-week courses into Week 1

Evidence: `LMS-Mobile/src/services/courseService.ts:8` discards `weeks`. The server emits both grouped weeks and flattened compatibility sections (`LMS-Server/src/controllers/coursesController.ts:76`). Mobile getCourseWeeks falls back to a synthetic Week 1 when weeks is absent.

Code-path finding: real week names, order, and grouping are lost even though the mobile types and course screen already support weeks.

Fix: preserve and validate the weeks payload; test multiple weeks with out-of-order source data and legacy flat-section courses.

### A12 — P1: Mobile lesson consumption does not record lesson progress

Evidence: `LMS-Mobile/src/app/(student)/course.tsx:139` opens MaterialViewer, which has no lesson-completion/progress callbacks. Mobile has no lesson-completion service. In contrast, `LMS-Frontend/src/pages/StudentCourse.tsx:475` and `:501` write completion and playback progress.

Code-path finding: mobile viewing alone does not update the same lesson-progress records used on web. This can leave progress, completion requirements, and eligibility dependent on work performed elsewhere, despite the learner consuming material on the phone.

Fix: implement shared completion rules and authenticated writes, restore playback progress, and handle retries/idempotency. Verify mobile-to-web progress synchronization and certificate prerequisites using an isolated course.

### A13 — P2: Mobile role coverage and account self-service are incomplete

Evidence: `LMS-Mobile/src/app/index.tsx:23` routes every authenticated account to student; `(student)/_layout.tsx:26` special-cases only legacy admin. The app has no sponsor/staff workspace. Its README explicitly describes a student app, so broader native role coverage is a product decision, not a claim that a promised feature was removed.

Current gaps: no mobile sponsor cohorts, impact, billing, or rewards; no lecturer/TA workflows; no forgot/reset-password screens; no account-deletion/data-export/session-management screens; no student payments/rewards screens. The certificate wallet banner sends users to the web dashboard in text but does not supply an action link. No push-notification implementation was found in LMS-Mobile.

Fix: decide whether the app remains student-only. If so, show a clear web handoff for every unsupported role rather than rendering student screens. Prioritize password recovery, account management, payments/rewards, and actionable wallet handoff for students. Treat push and offline support as roadmap work requiring device validation.

### A14 — P2: Temporary connectivity failure destroys restored sessions

Evidence: `LMS-Frontend/src/context/AuthContext.tsx:75` and `LMS-Mobile/src/context/AuthContext.tsx:51` clear persisted tokens on any hydration failure, including timeout/server unavailability.

Code-path finding: restarting the app during a temporary outage logs users out. Mobile API response handling also does not centrally update auth state for a later revoked/expired session, leaving screens to show individual errors.

Fix: distinguish invalid credentials from transient connectivity; retain recoverable sessions, expose retry, and centralize unauthorized-session transitions. Test airplane mode, server 5xx, timeout, token expiry, and explicit revocation.

## Validation performed

| Check | Result |
| --- | --- |
| Backend sponsor isolation, AUTH-02 billing scope, AUTH-03 cohort ownership, RBAC CRUD, course scope, user-role contract | 89 existing tests passed across 6 files |
| Web SponsorDashboard, UserRoleManager, RbacAdminPanel, phase-g-frontend | 55 tests passed across 6 files |
| New isolated API audit probes | 7/7 reproduced the observed behaviors described above |
| LMS-Frontend production build | Passed TypeScript + Vite |
| LMS-Server production build | Passed TypeScript |
| Native mobile runtime / complete monorepo tests / visual responsive review | Not performed |

The first sandboxed backend run failed before collecting tests due to Windows temporary-file rename permissions. The successful run used normal local execution outside that sandbox. One initial probe assertion incorrectly expected undefined for a missing database row; it was corrected to null, then all final probes passed. These were audit-harness issues, not application test failures.

The UI tests emitted jsdom XMLHttpRequest connection errors despite passing. Some nested behavior is not fully mocked or asserted. Existing sponsor tests mock analytics and billing success, so they cannot establish that a real sponsor has access to those APIs. Successful tests/builds should not be treated as end-to-end authorization evidence.

Probe source is archived as `2026-10-22-platform-audit.probe.test.ts.txt` beside this report. To replay, copy it into `LMS-Server/src/__tests__/platform-audit.probe.test.ts`, run `npm test -- platform-audit.probe` from LMS-Server, then remove the temporary copy. It deliberately asserts observed defects; remediation tests should assert the corrected security/behavior contract instead. No defect-preserving probe remains in normal test discovery.

## Recommended implementation order

1. Close role revocation and demotion gaps; scope global search independently of directory permissions (A01, A02, A07).
2. Unify effective authorization context across API reads, web routing, navigation, and administrative controls (A03, A04, A09).
3. Repair sponsor APIs and independent loading, align billing semantics, and make tabs URL-driven (A05, A06, A08).
4. Restore native learning parity: content types, week grouping, progress/completion writes (A10–A12).
5. Finish mobile role handoffs/account journeys and resilient session restoration (A13, A14).

Each stage should include negative authorization tests and an actual browser/device user journey using representative roles. Follow with 360px/390px/tablet/desktop visual checks, keyboard/focus checks, accessible form errors, and empty/loading/error-state checks. The unwrapped sponsor tab row is a responsive-layout candidate for that visual pass, not a confirmed screenshot finding.

The original audit added only documents and archived probe source. Subsequent remediation is recorded separately:

- [Step 1: A01, A02 and A07](2026-10-22-step1-security-remediation.md) — implemented and locally validated.
- [Step 2: A03, A04 and A09](2026-10-22-step2-authorization-remediation.md) — implemented and locally validated.
- [Step 3: A05, A06 and A08](2026-10-22-step3-sponsor-remediation.md) — implemented and locally validated.

The findings above describe the audited baseline. No changes have been deployed to the server by this work.
