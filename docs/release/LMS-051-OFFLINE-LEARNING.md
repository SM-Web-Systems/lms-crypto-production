# LMS-051 durable offline learning

**In progress.** The server issues course packages and accepts replay-safe lesson updates. Native encrypted storage, cold offline access, the on-device queue, and signed-device acceptance remain open. LMS-012 and LMS-030 are closure dependencies.

## Policy and authorization

The owner approves the courses and lease duration before rollout. The server requires `OFFLINE_LEARNING_ENABLED=true`, a nonempty comma-separated `OFFLINE_LEARNING_COURSE_IDS` list, and `OFFLINE_LEARNING_TTL_SECONDS` between 60 and 86,400. The example environment keeps issuance disabled. The course policy currently covers authored inline text in the lesson's `information` field. It excludes external readings, assessment data, documents, streaming media and download URLs.

Each lease belongs to one learner, durable login session, course and content version. The server requires current course-view permission and a direct course code assignment for an approved or published course. A lease expires at the earliest of the configured deadline, JWT expiry or active-session expiry. Removing or changing the learner's course code invalidates the lease. Unpublishing a course or changing its course code also invalidates it. Regranting access requires a new lease. The server rechecks these conditions inside the same transaction that accepts progress.

## API contract

Both endpoints use the current JWT under `/api/v1/courses/:courseId` and send `Cache-Control: no-store`.

| Endpoint | Request and result |
| --- | --- |
| `POST /offline-lease` | Returns `leaseId`, `contentVersion`, `issuedAt`, `serverTime`, `expiresAt`, the text-only course projection and its current progress. Packages are capped at 512 KiB. |
| `PUT /offline-progress` | Accepts `leaseId`, `contentVersion`, `idempotencyKey`, `itemId` and `kind`. A `progress` update also supplies integer `positionSeconds` and `progressPercent`. A `complete` update uses the existing self-completion rules. The response returns the server's current lesson progress. |

Replay of an accepted operation returns authoritative progress while the lease and access are valid. Reusing an operation ID with a changed payload returns a conflict. A stale content revision or expired lease also returns a conflict. Offline percentage and playback position merge by taking the maximum. The existing online position endpoint continues to allow rewinds. Only an acknowledged completion carries a server completion timestamp.

The mutation, replay receipt and any course completion reward event commit together. A failed write rolls them back. Completion replay suppresses duplicate teacher notifications. Issuing a lease removes expired leases and receipts eligible for cleanup.

## Remaining native and device work

Use platform-backed keys and a reviewed encrypted store for per-account packages and pending mutations. Persist the exact lease, content version and operation ID before showing pending status. Restore the queue and readable text after process death while the same verified session and lease are valid. Expiry, server denial and an account switch must close the reader and hide the previous account's data. Refresh or retry controls should explain whether a write is pending, acknowledged or rejected.

Check both signed Android and iOS builds in airplane mode. Exercise cold restore, expiry, enrollment and session revocation, course replacement, lost acknowledgements, low storage and shared-device sign-out. During disconnection a device can enforce the lease it holds. The server applies current revocation when the device reconnects.

The server receipt records HTTP regressions and the compiled migration drill against disposable databases. [Server validation](evidence/lms-051-server-validation.json)
