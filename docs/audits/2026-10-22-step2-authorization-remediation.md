# Step 2 — effective authorization across API and web

Addresses A03, A04 and A09 from the [platform audit](2026-10-22-platform-audit.md). Status: implemented and locally validated. This stage builds on the [step 1 security changes](2026-10-22-step1-security-remediation.md). Nothing has been pushed or deployed. Sponsor API/loading/billing work and native mobile changes remain stages 3–5.

## Authorization contract

Password login, registration and `GET /api/v1/auth/me` return the same effective context alongside the existing account fields:

| Field | Meaning |
| --- | --- |
| `rbacRoles` | Current database role names |
| `permissions` | Current effective permission union |
| `workspaces` | Available web workspaces derived from permissions, roles and staff assignments |
| `defaultWorkspace` | Preferred available workspace, or null when none is available |
| `adminTier` | Known administrative role label for display; never a permission check |
| `assignedCourses` | Instructor and teaching-assistant assignment IDs |

The legacy `role` field remains compatible with older clients. The web app uses effective workspaces and capabilities for its home page, route guards, navigation, search destinations, course editor actions and administrative panels. A missing context grants no privileged route access. Role names alone do not manufacture permissions.

Multi-role accounts can switch workspaces without changing identity. Personal course/submission/completion/application requests explicitly request personal scope, while staff screens request assigned management scope. A denied route explains the access restriction and offers a return link when a workspace exists. Shared profile/message routes avoid sending staff and sponsors into student-only URLs. AmmaWallet SSO hydrates `/auth/me` before choosing a workspace.

An active web session rechecks context on focus, becoming visible, and a 60-second visible-page interval. A rejected session signs out; transient refresh failures retain the current session. Identity, permission, workspace or staff-assignment changes clear cached rosters and submissions. Initial session restoration during an outage remains A14/stage 5.

## Course and resource boundaries

Course lists, details, member rosters and management routes share one scope with search. Instructors and TAs can read assigned courses without student enrollment, including assigned drafts. Student enrollment exposes approved/published courses. Sponsor cohort access does not grant member-roster access. Administrators retain platform-course and administered-tenant scope; `tenant.manage` permits cross-tenant administration.

The list endpoint accepts `access=manage`, `access=members`, or `access=enrolled`. Management excludes access obtained only through enrollment, sponsorship or TA assignment. Enrolled scope excludes staff and sponsor access. New instructor-created drafts are assigned to their creator. Editing/importing an unrelated course is rejected; deleting a course requires `course.delete`.

Related reads now use effective permissions and the same course boundary: documents, announcements, quizzes and answer-key exports, submissions and downloads, quiz/lesson/course progress, certificate applications and credential review lists. Personal submission access resolves the current student's database record rather than relying on a token's legacy role. Legacy submissions without `course_id` use shared staff enrollment or the administrator's student-directory boundary. Other learners' quiz completions require analytics permission and an accessible staff course. These changes cover the audited API read paths; they do not claim a complete migration of every legacy authorization branch elsewhere in the platform.

## Administrative controls

Dashboard panels mount only when their API capabilities are available. Role and tenant panels are independently gated; limited administrators receive available tools without unauthorized analytics requests.

`GET /api/v1/admin/users/:id/role-options` returns permitted grants and revocations for that actor/target pair. User Role Management uses these options, hides unavailable actions and fails closed when options cannot load. Self, peer and higher-tier targets expose no mutations. Granting a low role to a protected target is also rejected server-side. Every mutation rechecks current authorization; displayed options do not confer authority.

## Validation

- Backend and frontend TypeScript production builds pass.
- The full web suite passes 465 tests across 49 files, including workspace routing, navigation, restricted panels, role options, SSO hydration and active-session refresh regressions.
- New API regressions cover login/context parity, multi-role accounts, stale legacy roles, assignment-only instructor/TA reads, tenant isolation, course writes, related resources, personal views and administrative hierarchy.
- Playwright checked local instructor/student switching, denied admin navigation and recovery, baseline-admin controls, protected-peer role actions, permitted role choices and keyboard access to a cancellable confirmation. The limited-admin screen was visually inspected at 360, 390, 768 and 1440px; the denied state and role form were checked at 390px. The role directory scrolls inside its card on narrow screens. Phone-width checks showed no page-wide horizontal overflow. The collapsed navigation is hidden from keyboard focus, and available tool buttons wrap with spacing.
- Browser checks used synthetic API responses. They verify browser behavior independently of the API regression tests and are not a live server integration test. Reviewed screenshots: [admin phone](../../output/playwright/step2-admin-360.png), [admin desktop](../../output/playwright/step2-admin-1440.png), [denied route](../../output/playwright/step2-denied-390.png), [role controls](../../output/playwright/step2-roles-desktop.png).
- The final full backend suite passes 1,645 tests across 170 files. The new authorization suite contributes 19 tests. Earlier runs caught four missing-table fixture failures, a certificate-review 403 regression and an outdated enrollment-only administrator expectation; all were corrected before the final successful run.
- After the final tool-button spacing adjustment, the production web build and all nine workspace UI regressions were rerun successfully. `git diff --check` also passes with the repository's CRLF handling.

## Release notes

Deploy the backend and web changes together, or backend first. The new web build requires the effective context and role-options endpoint; it fails closed against an older API. Step 2 adds no database migration beyond the authorization-version change already documented for step 1.

After deployment, verify representative student, instructor, TA, sponsor, admin and admin-2 accounts against actual assignments and tenant membership. Verify forbidden direct URLs and API requests as well as visible menus. No server access or production data was used during this local implementation.

To repeat automated checks, run `npm run build` and `npm test` separately inside `LMS-Server` and `LMS-Frontend`. API tests use the suite's isolated SQLite database. New regressions live in `audit-step2-authorization.test.ts`, `audit-step2-ui.test.tsx` and `audit-step2-session.test.tsx`; role-manager and message-audit fixtures also exercise effective permissions with legacy student accounts.
