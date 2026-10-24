# AUTH-13 laptop monitoring transition

Baseline `47fe4f9`; scope is local code/tests/bundle preparation only. No cron, server, mail provider or production data access is authorized. The shared release-safety assessment records the initial hazards. Monitoring is separately reviewable from deployment and recovery scripts.

Design: require the expected full application SHA, retain the v2 CSV header, require a recent explicit backup-status attestation, count only recognized structured reconciliation messages without copying payload fields, and reserve an atomic alert cooldown before mail attempts (including failed attempts). All failures stay nonzero/logged while notification volume is bounded. Submission remains distinct from receipt. Recent-log signal counts are not a durable ledger, refund total, resolved backlog or proof of provider reconciliation.

An offline bundle builder will create a new immutable SHA/digest-pinned directory from clean committed script sources and never install cron. Owner transition must stage/verify it while old monitoring remains active, configure expected currently deployed SHA and backup evidence, test the new paths, then explicitly switch both cron entries together under separate authorization. Preserve the old CSV, logs and bundle for investigation. Do not git pull the live cron checkout as a deployment mechanism.

TDD and final commands/results, independent review and CI will be appended after execution. Docker is unavailable locally; command fixtures intercept all Docker/HTTP/mail interactions.

## Executed TDD evidence

- Initial command-fixture run: 15 tests, eight failures (including backup subcases) reproduced missing SHA/backup/reconciliation behavior. No external command escaped the fixture PATH.
- Evidence helper initially failed import because implementation did not exist; implementation then passed four tests. A malformed `msg` object reproduced a TypeError and was corrected with strict string recognition.
- Bundle tests initially had two failures because the builder did not exist. A later new destination test reproduced unsafe creation inside a mutable checkout; the guard now refuses that location.
- Before the final destination guard, the complete offline suite passed 38 tests; the added guard and fourth bundle test require a final combined run.
- Final combined run: `python -m unittest discover -s scripts/tests` passed **39 tests** in 74.622s, including four bundle and four privacy/cooldown/backup helper tests. No cases skipped. Independent review and exact-head CI remain required.
- Existing Bash monitor inventory/syntax checks passed 14/14; intercepted HTTP smoke verification passed 12/12. These inventory checks complement behavioral tests, not replace them.

## Owner-only transition requirements

1. Use a clean reviewed checkout at the exact monitoring-source SHA. Run `python3 scripts/build-monitor-bundle.py --source <reviewed-checkout> --sha <full-monitoring-source-SHA> --output <new-directory-outside-checkout>`. This produces files and digests only; it never installs cron. Existing destinations are refused. Keep bundles private and owner-controlled; scripts are invoked explicitly with Bash/Python.
2. Verify with `python3 scripts/build-monitor-bundle.py --verify <bundle-directory> --sha <full-monitoring-source-SHA>`. The manifest identifies source code, not the deployed application SHA. Do not confuse those two values.
3. Prepare a private configuration supplying `LMS_EXPECTED_SHA` (the currently deployed application), `LMS_BACKUP_STATUS_FILE`, alert/log/v2 CSV/heartbeat paths and optional cooldown. The backup file must be genuinely emitted after a verified independent backup, with `status: ok`, a UTC `timestamp` and actual `sha256`; defaults reject missing/failed/unreadable/future or >=27h old evidence. This attestation is not itself a restore drill or retention proof. Connect the actual daily backup job under separate owner authorization; never fabricate a successful status to silence an alert.
4. While old cron remains active, validate the new immutable bundle and configuration on protected/synthetic inputs first. Preserve the old AUTH-12 CSV/logs; choose a separate v2 CSV. Under separate authorization, switch both health-monitor and dead-man entries to the same verified bundle/configuration, avoiding concurrent writers or an unmonitored interval. This repository does not modify cron.
5. Confirm actual scheduled invocations, UTC evidence, correct API SHA/readiness, current backups, restart counters and fresh heartbeat. Verify SMTP submission and independently confirm inbox receipt. The default aggregate health-mail cooldown is 900s (minimum 300s), reserving before failed attempts too; collection/ALERT logging continues every run. Corrupt/future/locked alert state blocks sending and logs failure, requiring operator investigation rather than silent reset. Dead-man mail retains its existing separate cadence.
6. Only after release authorization and successful application identity checks, update `LMS_EXPECTED_SHA` to the exact newly deployed application SHA. Preserve old bundle and evidence for rollback analysis; no automatic rollback or database restore is implied by monitoring.

Reconciliation monitoring counts recognized structured warnings in a bounded recent-log sample. It never includes customer payloads/amounts/references in alert content, never resolves payments, and cannot replace durable provider-led reconciliation. A late or truncated log collection failure remains an alert. Existing readonly/root-UID and stability-verifier gates remain intact.
