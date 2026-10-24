# AUTH-13 payment, monitoring and recovery evidence

Development/review only. No server, cron, provider, mail or production-data operations were performed.

## Payment findings and resolution

The original E2E suite mostly acknowledged unknown references. Stronger tests using actual disposable payment rows reproduced eight failures: reference-only deduplication suppressed a later refund or successful retry; event markers survived failed payment writes; storage failures were mislabeled duplicates; mismatched amount/currency could consume a later valid retry; a success event could reconfirm a refunded payment.

Processing now commits the event marker and payment/application updates in one immediate transaction. Only an actual event-ID conflict is a duplicate; database failures roll back and return an error so delivery can retry. Keys separate provider/event/reference, and refund keys also include the refund reference. Historical reference-only records remain; a historical marker suppresses only an already-applied transition, so pending rows can recover from old non-atomic failures. No existing events or payments are rewritten by migration.

Independent review checked the provider contract: refund notifications use `transaction_reference`, `refund_reference`, and may encode amount as a decimal string. Synthetic fixtures now follow that shape. See [Paystack refunds](https://paystack.com/docs/payments/refunds/) and [webhook verification/retry guidance](https://paystack.com/docs/payments/webhooks/). Raw-body HMAC validation precedes all parsing/writes. Charge amounts remain numeric; refund strings are parsed as safe integers. Invalid evidence cannot mutate financial state.

Full refunds update confirmed payments. Out-of-order refunds return a retryable response without consuming the event key. Partial refunds are recorded durably in webhook evidence and logged for **manual reconciliation** while retaining confirmed status. Multiple partial refunds are **not automatically aggregated** into a full refund. This is an explicit product/ledger limitation, not evidence that funds were not returned. The server owner must reconcile historical suppressed refunds and partial refunds against provider records before rollout; this task does not inspect or modify customer records or move funds.

Executed local evidence: 46 payment tests across three files passed after fixes; five new real HTTP/SQLite E2E cases passed; the full browser suite passed 73/73. Full integrated API/CI evidence is recorded in the readiness report.

## Issue #67 and merge gates

CI/local E2E generate a fresh `auth13-fixture-<random hex>` HMAC shared by only the disposable API and harness. Tests reject any other format and never fall back to an empty key. The workflow no longer reads `secrets.E2E_PAYSTACK_SECRET_KEY`. No repository secret was inspected, changed or removed. The test API blocks external HTTP(S), clears SMTP/Wallet credentials, targets a disabled loopback Wallet URL, and fixture writes require a `lms-e2e-*` file inside the OS temp directory. Existing SQLite CLI shell interpolation was replaced with parameterized direct fixture writes.

Three transport-guard tests passed. Positive, negative, tampered, duplicate, failed-then-successful, refund and retry-after-database-failure behavior is exercised. Repository-setting acceptance in #67 remains separate: read-only requests on 2026-10-23 returned `[]` for applicable main branch rules and HTTP 404 for branch protection. An enforced required E2E merge check **could not be verified**. An administrator must verify/enforce required Backend, Frontend, E2E and Offline Monitoring/Restore checks; no settings were changed here.

## Monitoring evidence workflow

The historical `auth12-24h-stability-check.sh` is now an **offline** wrapper for `verify-stability.py`. It has no production URLs, Docker calls or automatic observation closure. It requires explicit evidence, expected full commit SHA and observation start. Exit codes: 0 PASS for supplied evidence, 1 FAIL, 2 PENDING/incomplete evidence. `pipefail` preserves those codes when saving a report with tee.

The verifier requires a complete 24-hour window, monitor coverage with no gap above seven minutes, dead-man coverage with no gap above twenty minutes, freshness, expected SHA, healthy API/DB/frontend/containers, zero restarts/5xx, disk below 75%, non-root/read-only API evidence, a recent healthy heartbeat, backup integrity/digest/verified restore, actual confirmed mail-probe receipt and rollback image references. Bad/unreadable observations fail. Missing evidence, gaps and unconfirmed receipt cannot pass. Future and duplicate timestamps are rejected. Out-of-window history is not treated as this window's evidence.

The monitor writes UTC timestamps and a v2 CSV containing these fields. Its default is a **separate** `lms-health-monitor-v2.csv`; an incompatible existing CSV header is refused rather than overwriting historical AUTH-12 data. Read failures, unknown counters, root/writable-root evidence, invalid SHA and alert conditions exit nonzero. Heartbeat means the monitor ran; it does not assert health. Dead-man accepts a configurable log path, rejects invalid/future/unreadable timestamps, and logs `MAIL_SUBMITTED` or `MAIL_SUBMISSION_FAILED`. Submitted mail is always labeled receipt unconfirmed.

The owner can collect protected copies and build an evidence file offline:

```bash
python3 scripts/build-stability-evidence.py \
  --csv /protected-copy/monitor-v2.csv --deadman-log /protected-copy/deadman.log \
  --heartbeat /protected-copy/heartbeat --attestations /protected-copy/owner-evidence.json \
  --output /review/evidence.json
python3 scripts/verify-stability.py --evidence /review/evidence.json \
  --expected-sha <full-reviewed-deployment-sha> --started-at <timestamp-with-offset>
```

Owner evidence has `backup` (timestamp, SHA-256, integrity=`ok`, foreign_keys_ok=true, restore_verified=true), `mail_probe` (timestamp, submitted=true, receipt_confirmed=true), and `rollback` (api_image, web_image). These are evidence claims requiring actual checks; the converter does not invent them. The timestamped sample schema is exercised by `scripts/tests/test_stability.py`. Historical CSVs lacking the security/SHA fields cannot establish a complete PASS. Do not rewrite historical evidence to fill gaps.

Executed: 25 offline/verifier/intercepted-command/converter tests, 14 existing syntax/inventory checks. Commands that could contact Docker, HTTP or mail were intercepted by local stubs. No script was installed into live cron or run against the deployment.

## Backup and retention assessment

`npm run test:restore-drill` accepts **no source database path**. It creates synthetic identities/history, leaves committed rows in WAL, takes an online SQLite backup, restores a separate copy, checks integrity/foreign keys/exact rows, verifies source rows remain unchanged and rejects a corrupt snapshot. The drill passed. It proves the procedure on synthetic data, not production recoverability.

Historical reports/runbooks describe daily backups/seven-day retention and off-host copies, while the AUTH-10 assessment did not demonstrate automated rotation. Current cron implementation, retention continuity, off-host availability and a post-hardening production restore remain **NEEDS VERIFICATION** by the server owner. Preserve the main database and sidecars together when investigating corruption; use SQLite online backup for a live database, not an isolated copy of the main file.

The infrastructure smoke verifier was also found to call the default production URL despite its offline description. Its curl transport is now a private rejecting fixture; 12 smoke-verifier checks and 10 deployment/rollback syntax checks passed without deployment requests. Both are included in offline CI.
