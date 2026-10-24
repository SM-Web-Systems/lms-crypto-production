# Step 4 — Native learning parity (A10–A12)

Date: 2026-10-22

Scope: implementation-order step 4 from `2026-10-22-platform-audit.md`. Work was performed locally. No server access, deployment, commit, or push was performed. Existing steps 1–3 changes were preserved.

## A10 — Content types and assessment associations

- Native lesson types now import the web authoring contract through type-only imports. The API mapper validates nested collections, keeps all eight authored types, and represents unknown or malformed items with a visible unsupported fallback.
- Added text reading, direct audio playback, downloads, inline quizzes, and assignment uploads. Missing resources and open/download failures have visible states.
- Quizzes use the exact linked quiz ID and verify its course association. They submit answers to the existing grading API and refresh server completion.
- Assignment uploads retain course, week, and item IDs. The lesson viewer lists only the learner's submissions for that assignment, shows review status/feedback, and enforces file hints before upload. The server validates enrollment, assignment association, week, file size, and MIME constraints.
- Android PDFs use authenticated download and the native share sheet, since Android WebView does not provide an inline PDF renderer. iOS retains authenticated inline preview. No document bearer token is sent to a third-party preview service.
- The web inline assignment form now sends a nonempty description required by the API.

## A11 — Course weeks

- The native mapper preserves week IDs, names, order values, section objectives/outcomes, and sorted lesson items.
- Authored weeks take precedence over the server's flattened sections; legacy section-only courses retain the synthetic Week 1 fallback.
- Course selection uses IDs so refreshed content replaces stale objects. Selecting a course no longer causes another course-list fetch. The learner course list requests enrolled scope explicitly.
- Week tabs and lesson controls expose native accessibility roles and selection state.

## A12 — Completion, progress, and resume

- Added authenticated personal completion reads (`view=own`), playback progress writes, and completion writes using the web API paths.
- Direct audio/video restore saved position, save periodically and on pause/exit/background, and complete at playback end. YouTube lessons use the IFrame API bridge for position, pause, end, and resume. Other hosted resources retain explicit completion controls.
- Writes are serialized and coalesced. A failed write remains queued for retry; the UI marks completion only after API acknowledgement. Completion-read errors block playback initialization until retry, avoiding a silent restart at zero.
- The reader refreshes assessment completion periodically and when the app becomes active. Reads that race newer acknowledged writes cannot overwrite those writes.
- Self-write authorization now uses effective permissions and course scope. A stale legacy admin role no longer bypasses learning access checks. Staff may still record their own learning within their authorized course scope.
- Quiz and assignment items reject manual self-completion and playback writes. Their existing grading/approval handlers now upgrade progress-only records instead of ignoring them.
- A late playback write preserves completed status and 100% progress. Incomplete lessons retain the furthest percentage while allowing the resume cursor to move backward.
- Web synchronization now checks `completedAt`, removes stale local assessment checks, and displays server assessment results. Opening an assessment no longer marks it complete locally.

## Local validation

- Backend learning and existing lesson routes: **59 tests passed**.
- Full backend regression suite: **1,677 tests passed across 172 files**.
- Mobile: **74 tests passed across 9 suites**; TypeScript check passed.
- Web: **485 tests passed across 51 files**; production build passed.
- Backend TypeScript production build passed.
- Android and iOS JavaScript/Hermes bundles exported successfully. These are bundle checks, not APK/IPA builds or device execution.
- Phone-size browser preview (390 × 844) used isolated mocked API data. Verified authored week switching, partial progress labels, reading completion acknowledgement, a simulated sync failure and automatic retry, inline quiz controls, and the lesson assignment form. Reviewed screenshots: `step4-course-phone.png`, `step4-completed-reading-phone.png`, `step4-quiz-phone.png`, and `step4-assignment-phone.png` in `output/playwright/`. Native playback and document behavior require device checks below.

The server integration fixture covers both new weeks and all eight item types, personal resume reads, idempotency, stale-role denial, assessment guards, real multipart lesson association, quiz pass, assignment approval, progress-only record upgrades, and shared certificate prerequisite calculation.

## Release and device acceptance

1. Deploy/rebuild the API and web app through the normal server process. This step adds no database migration.
2. Install mobile dependencies from the updated lockfile and create a new native build. The app remains on SDK 54; `expo-audio` and its `expo-asset` peer are pinned to compatible versions. Audio recording permissions are disabled.
3. On Android and iOS, open a test enrollment with multiple reordered weeks and a legacy section-only course. Verify names, order, switching, and every lesson type.
4. Play direct video/audio and YouTube, pause, background/foreground, and reopen the app. Verify the saved cursor reloads. Verify non-YouTube hosted resources can be acknowledged explicitly.
5. Open an authenticated PDF, download/share it, and exercise a missing file or failed link. Verify error states and retry.
6. Fail then retry a progress/completion request. Confirm the lesson remains incomplete until acknowledgement. The queue is in memory while the reader is mounted; unsent writes are not persisted across force termination. Acknowledged progress reloads from the API.
7. Submit a failing and passing quiz. Upload an assignment; verify it remains pending until approved. Check the same learner on web and verify the matching lesson status, course progress, and certificate prerequisites.

Step 5 remains separate: mobile role handoffs/account journeys and resilient session restoration (A13, A14).

## API references checked

The mobile AGENTS instruction to read the exact SDK 56 documentation was followed. Implementation compatibility was checked against the installed SDK 54 dependency map and TypeScript declarations; no SDK upgrade was performed.

- [Expo SDK 56 documentation](https://docs.expo.dev/versions/v56.0.0/)
- [Expo audio API](https://docs.expo.dev/versions/v56.0.0/sdk/audio/)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
