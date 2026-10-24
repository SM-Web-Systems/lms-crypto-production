# Step 5 — Mobile account journeys and session restoration (A13, A14)

Date: 2026-10-22

Follow-up, 2026-10-23: this report records the original step-5 implementation. Normal mobile registration/recovery now delegates to AmmaWallet, with a native SSO return flow; local password recovery remains for internal accounts. See [AmmaWallet mobile authentication alignment](2026-10-23-amma-wallet-mobile-auth-alignment.md). The original step-5 validation below did not establish native AmmaWallet sign-in parity.

Scope: implementation-order step 5 from `2026-10-22-platform-audit.md`. All edits and validation were local. No server access, deployment, commit, or push was performed. Existing steps 1–4 changes were preserved.

## A13 — Role handoffs and account journeys

- The native app remains focused on student learning. Effective workspaces and capabilities determine its landing screen and available student tabs. Unsupported workspaces open explicit web handoffs; multi-role accounts can choose native learning when authorized. Pending-deletion accounts reopen directly into account management.
- Added a workspace selector with teaching, sponsorship, administrative, and other authorized web destinations. Browser handoffs use a configured application origin and fixed paths, reject unsafe URLs, and never include the mobile bearer token. The screen explains that the browser requires a separate sign-in with the same account.
- Profile now exposes account/security, workspace selection, and authorized payments/rewards/wallet handoffs. The certificates wallet prompt is actionable.
- Added forgot-password and reset-password screens with validation, generic recovery acknowledgement, server error states, and password confirmation. Reset accepts a pasted email link/token or `lmsmobile://reset-password?token=...`; successful reset returns the user to sign-in. Existing emailed web reset links remain valid.
- Added account management with independently loaded session, export, and deletion sections. One failing section does not hide the others. Session revocation requires confirmation and distinguishes the current device. Data exports can be requested, found again after restart, refreshed, downloaded with authentication, and shared on native devices. Temporary native export files are removed after sharing.
- Account deletion requires the exact typed confirmation. Pending accounts show the grace period, cancellation, export, and session controls. Cancellation refreshes effective authorization before restoring learning. Administrators receive the existing self-deletion restriction using effective workspace membership.
- `EXPO_PUBLIC_WEB_BASE_URL` is documented in the environment example and explicitly configured for EAS preview/production profiles.

## A14 — Resilient native and web sessions

- Native startup reads SecureStore (session storage in the browser preview). Network outages, timeouts, storage-read failures, and server errors preserve the saved session and show a reconnect screen with retry/sign-out actions. Active sessions retain their current identity during transient refresh failures and display a retry notice.
- Web startup also preserves the token on transient verification failures and presents recovery instead of silently sending users to sign-in. SSO verification has a retry path that preserves credentials during temporary failures.
- Both API clients centrally invalidate only the matching session on authenticated 401 responses. Permission-denied responses and server failures do not discard credentials. Public login/recovery failures do not invalidate another authenticated session.
- Foreground/focus and periodic revalidation refresh effective roles and capabilities. Request/generation guards prevent late login, refresh, SSO, profile-save, or old-token responses from restoring a signed-out identity or overwriting a newer session.
- Logout clears local identity first and sends a bounded request with the captured old token. Explicit authorization headers survive interception, so an old logout cannot revoke a newer login. Native token persistence is serialized; delayed reads cannot resurrect a cleared token. Persistence failures have visible feedback and a retry for failed saved-session removal.
- Safe-area layout uses explicit native container styles; recovery/account views remain readable at narrow phone widths. Recovery forms include keyboard avoidance on iOS.

## Supporting API corrections

- Own-session listing now identifies the current session without exposing token hashes. Revocation retains a revoked row instead of deleting it: the legacy-token fallback previously allowed a deleted session row to be treated as an untracked valid token.
- Logout records revocation for tracked and legacy tokens until JWT expiry. Authentication enforces stored session expiry as well as revocation.
- Password reset changes the password and invalidates authorization in the same transaction. Existing tokens are rejected even when reset occurs in the same second they were issued.
- Effective authorization responses include account deletion status. Pending-deletion users may verify their account, log out, manage sessions, export data, and cancel deletion while learning routes remain restricted. Allowlist matching now uses exact paths or slash-delimited descendants.
- Added personal export-history metadata and an explicit JSON status mode for ready exports. The existing ZIP download response remains available; histories and downloads are scoped to the authenticated owner.
- Step 5 adds no database migration. It builds on the authorization schema introduced in the earlier remediation steps.

## Local validation

| Area | Result |
| --- | --- |
| Backend full regression | **1,686 tests passed across 173 files** |
| Web full regression | **501 tests passed across 53 files** |
| Mobile full regression | **120 tests passed across 14 suites** |
| Backend and web production builds | Passed |
| Mobile TypeScript | Passed |
| Android and iOS JavaScript/Hermes export | Passed; these are bundles, not APK/IPA builds or device execution |

New regression coverage includes real API session revocation, legacy logout, expiry, immediate password-reset invalidation, pending account recovery/cancellation, effective administrator restrictions, export ownership/status, API 401 handling, token-storage races, transient startup/refresh errors, late-response identity races, role handoffs, password journeys, native export downloads/cleanup, and independent account sections. The existing lazy-loading test now allows five seconds for concurrent-suite scheduling. Some existing jsdom XMLHttpRequest stderr remains in the passing web suite.

Browser previews used isolated mocked API data; no real account mutations were made. Reviewed phone widths of 360/390 pixels, a 768-pixel tablet layout, and the desktop web recovery screen. Verified saved-session recovery without another login on both clients, role selection, typed deletion confirmation, pending restrictions, and cancellation restoring workspace navigation. Screenshots are in `output/playwright/`:

- `step5-workspaces-phone390.png`, `step5-workspaces-tablet768.png`
- `step5-account-phone360.png`, `step5-account-phone390.png`, `step5-account-pending-tablet768.png`
- `step5-native-recovery-phone390.png`
- `step5-web-recovery-desktop.png`, `step5-web-recovery-phone360.png`

The mobile browser preview emits a React Native Web shadow-style deprecation warning. Simulated 503 responses also appear in its console as expected. Native secure storage, external browser handoff, keyboard behavior, and OS sharing still require physical-device acceptance.

## Release and device acceptance

1. Deploy/rebuild API and web through the normal server process, including prior remediation changes. No additional schema migration is introduced by this step.
2. Set the correct public API and web origins for each mobile build. Create new native Android/iOS builds; JavaScript bundle validation does not produce an installable release.
3. Test student-only, unsupported-role, multi-role, revoked-role, and empty-workspace accounts. Verify native landing/tab access and that web handoffs contain no credentials. Sign in separately in the browser and check its effective workspace.
4. Start with a saved session while offline, during a timeout, and during a server 5xx response. Reconnect and retry. Background/foreground after role changes and token revocation. Confirm 401 signs out the matching session, 403 preserves it, and old responses cannot revive an earlier identity.
5. Test native persistence failure feedback, offline logout, restart after logout, current/other session revocation, and server-side revocation of a legacy token. Confirm password reset immediately invalidates previously issued tokens.
6. Follow a real reset email on both platforms. Check pasted-link recovery and the custom scheme in an installed build, keyboard visibility, password validation, and return to sign-in. Universal links are not configured by this change.
7. Request an export, restart while it is pending, refresh until ready, and download/share on Android and iOS. Verify private authorization and cancellation/error cleanup, and deny another user's export ID.
8. Request deletion on a test account, restart during the grace period, confirm learning is restricted while management/export remains accessible, then cancel and verify learning returns. Check administrator self-deletion is denied.

Push notifications, universal-link configuration, and durable offline content/progress remain separate roadmap work. The app remains on Expo SDK 54 with no dependency or SDK change in this step. The mobile AGENTS instruction to read the exact SDK 56 documentation was followed; compatibility was checked against the installed SDK 54 declarations and completed bundle exports.
