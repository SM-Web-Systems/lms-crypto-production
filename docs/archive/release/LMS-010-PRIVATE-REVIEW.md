# Private RBAC inventory and owner review

Run `LMS-Server/scripts/rbac-inventory.mjs` offline against a finalized consistent
SQLite snapshot. Do not import application startup code to inspect a live
database. Record the captured deployment revision, snapshot SHA-256 and schema
fingerprint independently, and restrict the snapshot, details and worksheet to
the authorized operator.

From `LMS-Server`, create a new private worksheet with the exact captured values:

```sh
node scripts/rbac-inventory.mjs --snapshot \
  --database "$PRIVATE_FINALIZED_SNAPSHOT" \
  --deployed-sha "$CAPTURED_APPLICATION_SHA" \
  --expected-snapshot-sha "$RECORDED_SNAPSHOT_SHA256" \
  --review-output "$PRIVATE_REVIEW_DIR/new-review.json"
```

Review every account, learner-profile and integrity finding against the real
records. Preserve the generated finding rows and order. Record each decision
and rationale, the reviewer, private review reference, and UTC review timestamp
with milliseconds. Accept current explicit RBAC grants as authoritative only
after reviewing them; a legacy label cannot restore a revoked or absent grant.

Record `installedClientEvidence` and `legacyEndpointUsageEvidence` as private
references. Include source, observation period, known builds and distribution
channels, malformed/missing coverage and any outstanding compatibility or
retirement decision. Zero observed requests do not prove that no legacy client
exists. A bounded inventory review can retain the compatibility bridge while
leaving minimum-build, installed-compatibility and endpoint-retirement decisions
open.

Once complete, set the worksheet status to `reviewed` and verify it against the
unchanged snapshot:

```sh
node scripts/rbac-inventory.mjs --snapshot \
  --database "$PRIVATE_FINALIZED_SNAPSHOT" \
  --deployed-sha "$CAPTURED_APPLICATION_SHA" \
  --expected-snapshot-sha "$RECORDED_SNAPSHOT_SHA256" \
  --verify-review "$PRIVATE_REVIEW_DIR/completed-review.json"
```

The `REVIEW_RECORD_VERIFIED` summary confirms completeness and snapshot binding;
it explicitly does not establish migration readiness. Keep the original
worksheets and private findings intact. Review fresh live-state drift and
rehearse approved corrections, migration and recovery before any live change.
Do not place actual identities, account decisions, snapshots or secret values
in this public procedure. See the [integrated release sequence](LMS-INTEGRATED-CANDIDATE.md).
