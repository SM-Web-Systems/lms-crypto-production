# LMS-050 — Push notifications

Status: **in progress**. The server installation lifecycle, durable outbox and Expo transport are implemented and tested. Native permission/registration UI, secure installation persistence, foreground/background response handling, native configuration and physical Android/iOS acceptance remain outstanding. LMS-012 and LMS-023 closure dependencies are still open. This server preparation is independent work while their external acceptance prerequisites are pending.

## Server behavior

`PUSH_NOTIFICATIONS_ENABLED=true`, a valid `EXPO_PUSH_PROJECT_ID` and a server-only `EXPO_PUSH_ACCESS_TOKEN` are all required. Defaults keep delivery and registration unavailable. These variables have not been changed on staging. Configure Expo enhanced push security for the matching project before enabling the worker. Existing in-app notifications continue to operate independently.

An installation supplies a random UUID, a 256-bit hexadecimal credential and a monotonically increasing safe-integer generation. The credential is stored as a SHA-256 hash. Registration requires an authenticated, durable, unrevoked session, current authorization version and password-change validity. It pins the session hash, user, project, platform and Expo token. Its lease cannot exceed either the JWT/session expiry or 24 hours. Another installation cannot claim an already-bound token. Tokens and credentials are confidential; responses never echo them.

Logout cleanup authenticates with the installation credential, so it remains usable after JWT revocation. It persists a disabled generation tombstone even if registration has not arrived yet. Older registrations and unregisters cannot overwrite a newer generation. Account switches require a new generation; they cancel pending work for the previous binding in the same SQLite transaction. A new binding cannot silently reuse the generation of a different user, session or token. Explicit cleanup clears personal binding fields and the Expo token while retaining the credential hash and generation fence.

An additive SQLite trigger captures each newly inserted notification and its then-active installations in `push_outbox`, including notifications inserted by existing SQL callers. The notification and outbox records commit or roll back together. Historical notifications are not backfilled. Per-type preferences are checked at enqueue and again before delivery.

The worker claims each due row using an immediate transaction and a durable 60-second lease. It rechecks the installation generation, session existence/revocation/expiry, authorization version, password change, deletion status, project, installation expiry, notification ownership/read state and preference before submitting. Pending-deletion/finalized accounts cannot receive pushes; legal-hold behavior matches authentication policy. Revoked or changed bindings cancel queued work. The writer hold prevents claims and submissions; if it appears during a provider request, results remain unapplied and the lease permits later recovery. This point-in-time hold still requires the release procedure to drain in-flight requests.

Expo calls use fixed HTTPS send/receipt endpoints, reject redirects, bound response bodies to 48 KiB and time out after 10 seconds. Only generic text plus notification ID, installation ID and generation leave the LMS. Course titles, message bodies, email addresses and resource links are excluded. After ticket acceptance, receipts are checked after 15 minutes. Transient send errors retry with backoff up to five attempts; receipt absence retries within the 24-hour delivery lifetime. Permanent failures stop. `DeviceNotRegistered` clears the matching binding and cancels remaining work without disabling a newer generation. Unknown provider messages/bodies are not persisted or logged.

Provider acceptance is not a device-delivery guarantee. A crash or timeout after provider submission can repeat a generic alert: the transport is at least once under an ambiguous outcome, not exactly once. The native client must deduplicate notification responses. Already submitted generic alerts cannot be recalled after logout. Notification details and destination resources must still be authorized on the server when opened.

## API and native integration contract

All paths are under `/api/v1`:

| Method/path | Authentication | Behavior |
| --- | --- | --- |
| `GET /notifications/push/config` | Current JWT | Public project ID and availability; no access token |
| `PUT /notifications/push/installation` | Current JWT and installation credential | Bind `{installationId, credential, generation, projectId, platform, expoToken}` |
| `POST /notifications/push/unregister` | Installation credential, rate limited | Disable `{installationId, credential, generation}` after logout or offline cleanup |
| `GET /notifications/:id` | Current JWT | Details for the current notification owner only; others receive 404 |

The existing list, preferences and mark-read paths remain compatible. A caller-supplied user ID cannot change installation ownership.

Remaining native work must:

1. Read SDK-version-compatible Expo APIs and add native notification configuration without an incidental SDK upgrade. Keep the existing SDK 54 application aligned with its installed React Native version.
2. Store installation credentials, monotonic generation and pending cleanup durably in SecureStore; serialize updates and never send a registration whose captured session has been superseded. A failed local persistence write must not send a state the device cannot later revoke.
3. Request OS permission only from an explicit enable action, create the Android channel before token acquisition, verify the matching Expo project, handle denied permission/token rotation, and renew an enabled binding on foreground while its session remains valid.
4. Advance the generation and invalidate in-flight work immediately at logout, account switch or session expiry. Persist offline cleanup and retry it before newer registration. Stale cleanup must not disable a newer account.
5. Validate response IDs and match the current installation/generation before navigating. Fetch details with the captured current JWT, recheck identity after awaits and authorize destination resources separately. Handle cold start, foreground and background taps; deduplicate repeated responses and clear stale OS responses on logout.
6. Provide enable/disable/retry feedback and an authorized notification destination. Exercise process death, storage failure, offline logout, account switch, permission changes and token rotation in native tests and then on actual devices.

## Evidence and acceptance

See [server validation](evidence/lms-050-server-validation.json). Local unit/HTTP/schema checks and existing notification/writer-hold regressions passed. The compiled runtime harness uses real SQLite and three competing processes; a deliberately terminated worker's lease survives and is recovered by a fresh process. Receipt processing, restart, account switching and revocation are verified with synthetic transport. All real network calls are forbidden in that harness.

Source-free compiled initialization/restart passed. The full hosted candidate still requires its own CI result after publication. No real push was sent, no Expo project or APNs/FCM credential was provisioned, no signed native build was produced and no staging service or database was changed. Foreground/background behavior, OS permission and notification-center behavior, physical receipt and authorized navigation must be accepted on physical Android/iOS before closure.

Transport design follows the official [Expo push delivery documentation](https://docs.expo.dev/push-notifications/sending-notifications/). The repository-required [SDK 56 reference](https://docs.expo.dev/versions/v56.0.0/) was read; it does not authorize upgrading this SDK 54 app. The attempted version-54 notifications URL currently redirects to latest, so native implementation must check the installed SDK-compatible package's API rather than copy current-latest examples blindly.
