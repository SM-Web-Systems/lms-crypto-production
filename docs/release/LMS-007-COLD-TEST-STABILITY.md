# LMS-007 — cold native session and browser fixture stability

The native failure came from React Native's lazy getters: the first render triggered uncached Babel transformations for primitives used by Testing Library's host-name discovery. Preloading those getters in shared Jest setup removes that tool initialization from the first interaction's deadline. Session tests also reset individual mock implementations and unused once-results between cases while preserving the unauthorized-listener factory. Auth/session assertions and the five-second test deadline are retained.

Browser authentication now places the token in exact-origin storage state before the first requested page. Fixtures no longer navigate to an unrelated landing page simply to populate storage. Contexts close in `finally`; service workers are blocked; browser traffic is limited to the two disposable fixture origins. Local runs serve the built app to avoid first-navigation Vite transformations. Login still runs against the real local auth endpoint, and API fixtures retain their bearer headers.

## Validation — 6 November 2026

- **Three consecutive fresh native processes:** 18/18 session tests each, `--runInBand --no-cache`, standard deadlines and no retries.
- **Three consecutive complete browser processes:** 76/76 tests each, one worker, `--retries=0`, new disposable database/server startup per run. Admin login/navigation and student/sponsor assertions remain enabled.
- **Full native suite:** 159/159 with `--no-cache`; TypeScript passes.
- E2E TypeScript passes. Frontend production build and 703 frontend assertions pass as recorded in LMS-006.

Initial unsuccessful experiments remain in raw receipts: preloading only some primitives still timed out, and the first full run exposed another screen's cold transform cost. Shared setup fixes both; no deadline increase or retry masks those results. These tests do not measure signed-app startup performance on physical devices.

The broader backend run also exposed a separate fixture timeout: deep object traversal of SQLite buffers. Commit `214daa0` batches fixture DDL and uses native `Buffer.equals` for identical-byte assertions. Focused migration cases fall from 8–14 seconds to approximately 60–111ms without changing migration code or its strict schema checks. Full backend receipts belong to LMS-003.

See [validation receipt](evidence/lms-007-validation.json). This task closes test reliability only. Known RBAC target gaps and the misleading sponsor revocation scenario remain in their implementation tasks.
