# LMS-051 durable offline learning

**In progress.** The server issues course packages and accepts replay-safe lesson updates. The native app can save a package, reopen it after restart and sync a durable queue. Owner policy, signed-device acceptance, LMS-012 and LMS-030 remain open.

## Policy and authorization

The owner approves the courses and lease duration before rollout. The server requires `OFFLINE_LEARNING_ENABLED=true`, a nonempty comma-separated `OFFLINE_LEARNING_COURSE_IDS` list, and `OFFLINE_LEARNING_TTL_SECONDS` between 60 and 86,400. The example environment keeps issuance disabled. The course policy currently covers authored inline text in the lesson's `information` field. It excludes external readings, assessment data, documents, streaming media and download URLs.

Each lease belongs to one learner, durable login session, course and content version. The server requires current course-view permission and a direct course code assignment for an approved or published course. A lease expires at the earliest of the configured deadline, JWT expiry or active-session expiry. Removing or changing the learner's course code invalidates the lease. Unpublishing a course or changing its course code also invalidates it. Regranting access requires a new lease. The server rechecks these conditions inside the same transaction that accepts progress.

## API contract

Both endpoints use the current JWT under `/api/v1/courses/:courseId` and send `Cache-Control: no-store`.

| Endpoint | Request and result |
| --- | --- |
| `POST /offline-lease` | Returns `leaseId`, `contentVersion`, `issuedAt`, `serverTime`, `expiresAt`, the text-only course projection and its current progress. Packages are capped at 512 KiB. |
| `GET /offline-lease/:leaseId` | Checks the current session, access and course version. Returns `leaseId`, `contentVersion`, `serverTime` and the current expiry. The app uses this check on reconnect even with an empty queue. |
| `PUT /offline-progress` | Accepts `leaseId`, `contentVersion`, `idempotencyKey`, `itemId` and `kind`. A `progress` update also supplies integer `positionSeconds` and `progressPercent`. A `complete` update uses the existing self-completion rules. The response returns the server's current lesson progress. |

Replay of an accepted operation returns authoritative progress while the lease and access are valid. Reusing an operation ID with a changed payload returns a conflict. A stale content revision or expired lease also returns a conflict. Offline percentage and playback position merge by taking the maximum. The existing online position endpoint continues to allow rewinds. Only an acknowledged completion carries a server completion timestamp.

The mutation, replay receipt and any course completion reward event commit together. A failed write rolls them back. Completion replay suppresses duplicate teacher notifications. Issuing a lease removes expired leases and receipts eligible for cleanup.

## Native behavior

The Android and iOS builds use Expo SDK 54's SQLite package with SQLCipher. A device-only SecureStore record holds the random database key and the session fingerprint. The app checks `PRAGMA cipher_version` before creating any tables. The vault is scoped to the LMS API and the verified login session. Sign-out and account changes erase the key before attempting file cleanup. A release build must include the SQLCipher native module. [Expo SQLite documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/#sqlcipher) · [SDK 54 plugin source](https://github.com/expo/expo/blob/sdk-54/packages/expo-sqlite/plugin/src/withSQLite.ts)

The course screen offers to save approved text lessons. If the app launches without a connection, the session recovery screen can open packages saved under the same token. The offline reader remains separate from protected online screens. A conservative deadline uses the remaining lease duration returned by the server and includes the time spent in transit. A persisted clock check detects backward device-clock changes between reads. Lease expiry removes the saved package and any unacknowledged operations for that lease.

Progress and completion stay pending until the server acknowledges them. Each local operation includes its lease, content version and stable operation ID. Automatic sync follows a successful session refresh, and the reader also offers manual sync. A lost response leaves the operation queued for replay. Current server denial removes stale content and pending work and records a message in the vault. Storage errors leave the prior progress and queue intact.

Replacing an expired package that has pending work commits the replacement and the discard notice in one SQLite transaction. A failed write leaves the prior record intact and the expiry check still prevents opening it. The regression test injects a storage-full error before retrying the replacement.

## Remaining device acceptance

Check both signed Android and iOS builds in airplane mode. Exercise cold restore, expiry, enrollment and session revocation, course replacement, lost acknowledgements, low storage and shared-device sign-out. During disconnection a device can enforce the lease it holds. The server applies current revocation when the device reconnects.

The receipts cover the server contract, compiled migration, mobile queue and reader, and the native build configuration. Signed-device encryption and behavior under airplane mode still require physical acceptance. [Server validation](evidence/lms-051-server-validation.json) · [Native validation](evidence/lms-051-native-validation.json)
