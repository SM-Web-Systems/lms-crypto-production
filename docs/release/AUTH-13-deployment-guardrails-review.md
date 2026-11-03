# AUTH-13 deployment guardrails â€” laptop evidence

Assessed/implemented 2026-10-24 from main `47fe4f92e09e9c949ae80e6c22d1cd600898126b` plus assessment `841ae56`. This is Phase 1 only. No SSH, server inspection, Docker daemon, customer database, workflow dispatch, deployment, initialization or restoration was used.

## Result and boundaries

`scripts/deploy.sh` now delegates to standard-library Python. There is **no container replacement path** in this phase: real preparation creates a verified private backup and exits `RECOVERY_GATE_REQUIRED` (2). Dry run validates read-only prerequisites and exits zero with `DRY_RUN_VALIDATED`, `recovery_eligible: false`. Neither result means release authorization or production readiness. Old rollback pointers/manifests are never updated. Automatic restore and image pruning are absent.

The manual-only workflow no longer defaults to a historical path or updates a live checkout. Its trusted inline bootstrap validates the absolute physical repository root, approved repository, full workflow SHA, clean status, tracked executable files and actual executable Git blob content before it executes checkout code. This matters when an old server directory still contains the old, unsafe deploy script. Failed Git reads stop the bootstrap; subprocess output is suppressed. SHA and target values pass via action environment variables, with no expression interpolation into the remote shell script.

The owner must separately prepare the exact approved clean checkout. The following settings are mandatory; there are no target defaults:

| Environment | Meaning |
| --- | --- |
| `DEPLOY_DIR` | Absolute canonical prepared repository root |
| `DEPLOY_REPOSITORY` | Exactly `SM-Web-Systems/lms-crypto-production` |
| `DEPLOY_SHA` | Full lowercase approved 40-character commit SHA; workflow derives this from `github.sha` |
| `DEPLOY_PROJECT` | Explicit existing Compose project |
| `DEPLOY_API_CONTAINER`, `DEPLOY_WEB_CONTAINER` | Explicit existing service container names |
| `DEPLOY_DB_VOLUME` | Explicit existing named data volume |
| `DEPLOY_BACKUP_DIR` | Explicit private backup directory outside checkout/data volume, with an existing parent |
| `DEPLOY_DRY_RUN=1` | Read-only validation; creates no backup/state directories or artifacts |

The workflow forwards these settings from repository/environment variables and refuses incomplete configuration. Existing SSH credentials remain configured through the existing action; no credentials were accessed or changed here. Operators must not dispatch this workflow as a release while the Phase 2 recovery gate is absent.

## Verified identity and backup rules

The helper compares Git root/origin/full SHA/clean status and critical file blobs. Git optional index refresh writes are disabled. Structured Compose/container inspection must agree on project, service, container name/ID, Compose working directory/config file and running image ID. Docker image inspection must return that exact image ID. Missing historical OCI revision labels are represented as null; they do not fabricate recovery eligibility.

Both the desired Compose configuration and the running API must use the expected database path and must not enable `VITEST`. The desired and actual `/app/data` mount must be writable and use the explicit named volume. Volume name, project/logical-volume labels and actual mountpoint must all agree. Missing, inaccessible, empty, corrupt or incomplete source databases refuse preparation; the script never initializes a database or treats missing data as a first deployment.

The source is opened with SQLite `mode=ro` and `query_only`. A single read transaction computes integrity, required table counts, schema/user-version and a private deterministic financial-state hash. Only aggregate counts/hashes leave the helper; payment/webhook values and configuration output are never printed. Existing foreign-key violations are counted, not silently repaired or declared resolved. Source reads have a bounded query deadline.

`backup_database` uses SQLite's online backup API, including committed WAL rows. Its private completed copy is converted to DELETE journal mode, integrity/table/schema checked, hashed and flushed. A separate unique mode-0600 JSON evidence artifact records checksum/context; directory mode is 0700 on POSIX. Disk free space must exceed both 512 MiB and three times main-plus-WAL size. UUID collisions cannot overwrite or delete previous artifacts. Partial artifacts created by this invocation are removed on failure; prior recovery evidence is preserved.

SQLite read-only mode can create missing WAL/SHM sidecars. To preserve the dry-run no-write guarantee, a WAL-mode source without both existing readable sidecars is refused. `immutable=1` is never used to bypass this, because it can omit committed WAL content. The owner needs a separately reviewed access/maintenance procedure for that state. No automatic chmod, sudo, checkpoint or sidecar creation repairs the source.

## Red â†’ green evidence

Tests were written before the helper/entrypoint changes. Initial command:

`python -m unittest discover -s scripts/tests -p test_release_preflight.py -v`

Baseline result: **two failures and one setup error**, exit 1: the old shell did not delegate, workflow still contained unrestricted pull/fallback, and the required helper did not exist. Subsequent tests exercise real fake-command subprocesses and the actual inline Bash bootstrap, rather than trusting grep-only proof. Fixture portability errors were corrected before green results; no failed sandbox run is counted as passing validation.

Focused final run: **32 tests, 31 passed and one POSIX-permission test skipped on Windows**. Cases include stale checkout sentinel protection, failed Git status, hidden script changes, wrong repository/SHA/dirty tree, desired/current database-path mismatch, wrong Compose/container/image/volume identity, missing/corrupt/incomplete DB, WAL preservation, financial-state change detection, unique/private backup evidence, collision preservation, insufficient disk, safe error output and no replacement/state publication.

Additional offline checks executed:

- `bash scripts/test-scripts.sh`: deployment/rollback/smoke syntax plus actual missing-identity wrapper refusal passed. This replaces obsolete assertions that required the old deployment success path.
- `bash scripts/test-monitoring.sh`: 14 passed.
- `bash scripts/smoke-test-verify.sh`: 12 passed, all HTTP intercepted by the existing fixture harness.
- The complete `python -m unittest discover -s scripts/tests -v` suite is also required before final handoff; its final result is recorded in the continuation handoff.

Windows test subprocess/temp cleanup required the approved local sandbox bypass. Inputs stayed synthetic and commands stayed intercepted. The POSIX permission branch and actual Docker/Compose behavior remain CI/operator acceptance gates.

## Phase 2 integration contract

`validate_target(config, runner)` returns sanitized `checkout`, `repository`, `approved_sha`, `project`, `compose_file`, `services`, `database` and `source_database`. Each service includes exact `container_id`, `container_name`, `image_id` and optional `revision`. Database identity contains named volume, host mountpoint, host source path and expected container path.

`backup_database(target, backup_root)` returns the immutable artifact path, checksum, size, schema hash, user version, required-table counts, financial-state hash, foreign-key violation count and evidence-file path. `readonly_database(path)` and `database_metadata(connection)` support a fresh consistent snapshot for recovery checks. `CommandRunner.text/json` captures subprocess output privately and raises static `ReleaseError` codes. No API returns secrets or customer rows.

Phase 2 must retain and verify recovery image tags before publishing a complete immutable manifest/pointer, bind explicit reviewed compatibility to exact old/new image/SHA/context and baseline schema/financial hashes, and revalidate immediately before replacement/recovery. Unknown historical revisions remain NO-GO. It must extend both `REQUIRED_FILES` and the workflow's trusted blob-validation loop to every additional executable helper/wrapper it imports or executes. It must set approved build SHA explicitly and bind/revalidate the resolved Compose context before any eventual build/up. No recovery gate should be inferred from this phase's successful dry run or backup.
