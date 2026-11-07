# LMS-050 — Push notifications

**In progress.** The server delivery pipeline and native installation lifecycle are implemented. Signed builds, provider setup, physical Android and iOS acceptance, and closure of LMS-012 and LMS-023 remain open.

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

## Native behavior

Account and security includes push controls on a supported Android or iOS build linked to an Expo project. Setup checks the server project before asking permission and creates the Android channel before acquiring the token. The app only asks permission after the user selects Turn on push notifications. It checks permission again on foreground and uses token rotation events to refresh the binding. The SDK 54 dependency is pinned to expo-notifications 0.32.17. [Expo SDK 54 notifications source](https://github.com/expo/expo/tree/sdk-54/packages/expo-notifications)

SecureStore keeps the installation credential, generation, session and token fingerprints, pending cleanup, and the 12 most recent opened notification IDs. The storage key is scoped to the LMS API base URL. Registration starts after the local record is saved. Logout, account switch and session expiry invalidate in-flight work and queue a credential-only disable. The app retries offline cleanup before another account can register. A new session on a shared device needs its own opt-in. Foreground checks refresh valid bindings and retry cleanup. An active app also retries pending cleanup once a minute.

The native bridge checks the notification ID and current installation generation before showing a foreground alert or opening a tap. A cold tap waits for session restoration and router readiness. Duplicate taps are suppressed using the saved IDs. Notification details are fetched with the captured JWT and discarded if the session changed. The details page can open the native course or submissions screen only when the current workspace permits it. Each destination continues to use the authenticated LMS APIs.

## Build and device acceptance

Use an EAS project ID matching the server. Set the Android build file variable `GOOGLE_SERVICES_JSON` to the matching Firebase configuration and provision FCM v1 credentials in the Expo project. Provision APNs for the signed iOS app. Confirm the application IDs, notification entitlement, Android channel `lms-updates`, and staging API in the final signed builds. Configure the server's Expo push access token only in the server environment and enable delivery for the approved staging test. [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)

On a physical Android phone and a physical iPhone, record build identity and device OS. Test permission allow, deny and settings recovery, then send an ordinary LMS notification and match the provider receipt to its arrival. Test foreground presentation, background and terminated taps, duplicate taps, token rotation and delivery on two devices. Exercise online and offline logout, restart, account switch, revoked sessions and an unauthorized notification ID. Confirm settings persist and stale responses cannot open account data. Record provider retry and unavailable-device behavior separately from device observations.

## Evidence and acceptance

Local server checks covered unit, HTTP, schema, existing notification and writer-hold behavior. The compiled runtime harness uses SQLite and three competing processes. A replacement process recovered a claim after the original worker was terminated. The harness also exercised receipt processing, account switches and revocation with synthetic transport. [Server validation](evidence/lms-050-server-validation.json)

Hosted candidate `98e10e0` passed all eight CI jobs and mobile acceptance. The jobs logged 2,502 API passes with one existing protected-copy skip, 722 web passes, 92 Chromium cases and 163 mobile passes. This candidate includes the server and predates the native integration. [Hosted CI](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42332439281) · [Hosted mobile](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42332439279)

The native receipt records the final local suite, platform bundle exports, config inspection and dependency audit. Native tests use synthetic provider responses, and signed device delivery remains open. The audit counts an additional path through expo-notifications to the existing low-severity deepmerge advisory. [Native validation](evidence/lms-050-native-validation.json)
