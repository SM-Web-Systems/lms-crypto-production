Continue LMS production-release preparation on this server. This is an assessment and isolated-rehearsal task, not authorization to deploy.

Repository: SM-Web-Systems/lms-crypto-production.
Candidate verified on GitHub from the laptop: e2c71e292c2be2683a4ee87008817ed34cc16023.
PR #143 merged 2026-11-01T16:50:58Z; final PR head b0749414533edac00e4495ad85d6ddeb44de3bb1 includes account isolation.
PR CI 41327753824 at b074941 and push CI 41328420175 at e2c71e2 each completed with four successful jobs.
Planning branch codex/staged-rollout-plan was verified at f0dacea150380a529c4570eb47cffe568eddf765: INDEX and EVIDENCE record the merge, but TASKS still says #143 pending CI and 700 tests. Correct figures are eight new W09-R7/isolation tests and 702 total frontend tests.

Reported production baseline, not yet reverified:
- Source dfb988ec4a553f61b110c0e483c1b176312f7906.
- API local image ID sha256:b92d9447d14e97b9b6d41beb486e0dc295d23b36f9612c0125e1a0b10e573b02.
- Web local image ID sha256:5f7d4d1ee649cac09d27b1e42afe220b2fa58827dad95fc844d24cf661b5bc39.
- Possible checkout /home/webadmin/web-stack/html/LMS-AmmaWallet, containers lms-api/lms-web, volume lms-ammawallet_lms-data, DB /app/data/student_ms.db, policy /home/webadmin/auth13-validation/candidate-recovery-policy.json. Discover actual values; none are assumptions to enforce.

Boundaries:
- Start with read-only inspection of the live service, repository, Docker state, configuration, database and backups. Preserve existing work.
- Do not deploy, restart/stop/recreate live containers, apply migrations to the live DB, checkpoint/vacuum/change production data, modify live env/compose/policy/cron/proxy, enable funding, dispatch workflows (including execute=false), prune images, or run git pull/checkout/reset in the active checkout.
- You may create new private assessment/rehearsal artifacts outside active checkouts and production volumes; take a SQLite-consistent backup from a read-only source into a new private destination; apply migration to disposable copies; and run isolated rehearsal containers with no production mounts, credentials, network access, Docker socket, or public ports.
- Check resources before building a candidate on the host. If isolation or resource safety cannot be established, report precisely what is needed. Do not publish images or upload private backups.
- Never expose env values, credentials, raw docker inspect/compose output, system_config contents, customer rows, emails or payment/funding references. Report names/presence, hashes, counts and status only. Keep detailed private evidence mode 0600 in private directories.
- No automatic approval, “reviewed” label, or compatibility claim may be inferred merely from a CLI acceptance flag or matching hash.

Local supplementary evidence already completed:
- Candidate TypeScript build passed.
- W03 migration suite: 98/98 passed.
- Python release suite: 134 cases; 130 passed, three POSIX-only checks skipped, one Git Bash sandbox failure; the failed entrypoint case separately passed outside the sandbox.
- Synthetic WAL backup/restore passed.
- Synthetic dfb988ec database startup → candidate refusal without writes → W03 apply on disposable copy preserving three ledger rows → candidate compiled database startup/restart → previous-source database startup on a separate migrated copy → source-backup restore passed.
- No Docker/runtime or production-data rehearsal occurred. Prior database modules were transpiled from exact Git blobs; this is not proof about actual old images. Reused local dependencies included follow-redirects 1.16.1 instead of locked 1.16.2. Use clean locked dependencies for server candidates.

Proceed:

1. Reverify current GitHub main, #143, CI and planning head. Inventory active checkout HEAD, dirty/untracked work, origin identity (redact embedded credentials), actual compose project/files/overlays, container/mount/volume identities, runtime DB path, image IDs/RepoDigests and both OCI revision labels. Compare API buildSha with image provenance. Inspect only selected nonsecret Docker fields. Record host/topology, TLS/edge health, API/web health, monitor expected SHA/bundle and freshness, backup freshness/checksums/retention/off-site status and uploads recovery. A healthy endpoint does not prove image provenance, recoverability or database compatibility.

2. Read the exact candidate deploy.yml, scripts/deploy.sh, release_preflight.py, release_recovery.py and migration implementation before invoking any wrapper. Trace gates and side effects:
   - workflow execute=false runs preparation, creates a WAL-safe DB backup, tags old images, writes capture/recovery metadata, and validates an existing policy. It is not read-only and can fail after writing artifacts.
   - DEPLOY_DRY_RUN=1 with DEPLOY_EXECUTE=0 is validation-only. Its output is a small status object, not the claimed hash evidence package; the workflow has no corresponding dry-run input or forwarding.
   - Use the reviewed validate_target metadata path, if its context gates pass, to collect only sanitized identities/schema/FK/financial hashes. Do not dump resolved compose/env. If active checkout/provenance gates prevent it, report that and use explicitly reviewed read-only inspection; do not bypass or relabel the checkout.
   - Nonhistorical recovery needs matching valid OCI revision labels on both old images. API buildSha alone is insufficient. Both unlabeled images may qualify only for historical transition, which does not support ordinary automated rollback.

3. Safely inspect the live DB in a consistent read-only snapshot; create and verify a new private SQLite backup if needed. Do not copy only the live main DB after a checkpoint while writers run. Check actual source/target/unknown classification, integrity, exact FK count/evidence, dependency inventory, aggregate duplicate funding-reference groups, reward balances/transactions/outbox and lesson_completions layout. Do not print financial identifiers. W03 apply rejects ANY pre-existing FK violation even though generic release preflight permits an exact reviewed unchanged FK baseline. Unknown schema/dependencies, duplicates or violations require a documented reconciliation decision, not deletion or silent repairs.

4. Rehearse on disposable copies using exact candidate code and actual retained old API image IDs. From LMS-Server, the supported source invocation is:
     npm run db:migrate-reward-txn-check -- --plan /absolute/private/copy.sqlite3
   With a verified compiled candidate:
     node dist/scripts/migrateRewardTxnCheck.js --plan /absolute/private/copy.sqlite3
   An apply command uses the same explicit private-copy path and --apply; execute it ONLY on disposable rehearsal copies here.
   Verify all rows/balances/transaction history, indexes, receipt, integrity and FK evidence. Read only:
     SELECT key,value FROM system_config WHERE key='migration_002_reward_txn_check';
   Test candidate startup/restart, previous-image startup against a separate migrated copy, active-WAL backup/restore and recovery-refusal cases. Start with database-only image entrypoints; any HTTP rehearsal must remain isolated with synthetic config and blocked provider access. Record exact candidate/old IDs, labels and exit results; do not call a source-only test an image rehearsal.

5. Assess PR #93 accurately: it CAN reconstruct a legacy lesson-completion table and tighten migration FK-drift checks. Inspect completed_at nullability and rehearse authenticated progress/completion behavior with synthetic identities on a safe copy. Decide from evidence whether it is needed for the limited LMS release. Mobile, Wallet and planned RBAC cutover are deferred unless a concrete current requirement proves otherwise. Do not merge open PRs during this task. Keep funding unavailable.

6. Prepare, but do not activate, a complete recovery-policy draft. verify_policy requires:
   version, review_reference, source_sha, target_sha, project, repository,
   database {volume_name,volume_source,host_path,container_path},
   compose_sha256, schema_sha256, financial_state_sha256,
   foreign_key_violation_count, foreign_key_violations_sha256,
   images {api,web}; historical_transition=false only when provenance permits.
   Mark it UNREVIEWED and leave future live-baseline fields unresolved. A policy from a rehearsal DB must never be presented as a valid live policy. Financial hashing covers payments/webhook_events, not the reward ledger. Plan final post-migration evidence and a genuine compatibility review before activation.

7. Produce a feasible later maintenance procedure. Identify ALL writers: API, jobs, scheduled work, callbacks and external tools. Explain how writer admission can be held while healthy containers and active WAL sidecars still satisfy preflight; stopping the API early may make preflight refuse. The release lock does not freeze application writes. Account for capture/build-time hash drift. Preserve old images by immutable ID before any build, not latest tags after deployment. Document pre-migration backup, post-migration release baseline, exact-SHA checkout preparation compatible with cron/compose path/overlay identity, final policy review, execution, smoke tests and monitor transition. Do not guarantee a 60-second outage. Automatic rollback can refuse and leave services stopped when contracts change. Do not downgrade the CHECK after release_unused writes or restore stale financial data; define forward recovery/reconciliation.

   Known candidate writers include the reward outbox/expiry scheduler (default 60 seconds), email retry worker and account-deletion finalization, which also runs immediately on server startup. Funding being unavailable does not stop these. Inventory due work and include it in exact-image rehearsal. For configuration, verify presence/validity without values of JWT_SECRET, DATABASE_PATH/mounts, FRONTEND_URL/CORS/proxy settings, frontend build arguments, current Wallet/SSO settings (including AMMA_WALLET_URL/API-key provisioning expectations), SMTP and payment keys for the accepted scope. Existing integrations may be required even though new Wallet PRs are deferred.

8. Prepare the narrow TASKS ledger correction at the verified planning head: #143 merged at e2c71e2, isolation b074941, both CI receipts, eight new tests, 702 total. Save a patch for review outside the active checkout; do not push or alter live scripts. Preserve unrelated historical entries.

Deliver a concise evidence-backed readiness report, private artifact paths, exact candidate/image IDs where verified, policy draft with unresolved fields, rehearsal results, confirmed blockers versus independent follow-ups, ordered deployment/verification/recovery steps, and the single next action or access/decision needed. Stop before any live-service change. If repairs require a new candidate, name the required implementation and fresh CI/rehearsal gates rather than calling e2c71e2 deployable.


