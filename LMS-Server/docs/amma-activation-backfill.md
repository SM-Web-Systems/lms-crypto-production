# Backfill: the 14 activations sent straight to AmmaWallet

**Status:** plan and reviewed script only. Nothing has been run against any database.

## What happened
On 19 Nov 2026, 14 accounts (2 sponsors, 12 teacher and admin demo accounts) were activated on mainnet by
calling AmmaWallet's partner activation API directly, not through the LMS queue. AmmaWallet recorded them as
completions 21 to 34 (3.1 XLM each). The LMS table `amma_activations` has no rows for them.

## Why it matters
- **Second charge risk (the real one).** `queueSponsorOnboarding` (PR #244, off unless `AMMA_SPONSOR_ACTIVATION=on`)
  queues completion `sponsor-onboarded-<sponsor id>` for a sponsor whose cohort becomes active. With no row for
  the two sponsors, turning that switch on would send a new activation request. Whether AmmaWallet charges again
  depends on whether the direct send used the same completion id and idempotency key. If it did not, only
  AmmaWallet's per-task `ALREADY_COMPLETED` check stands between us and another 3.1 XLM.
- **Wrong status.** `activationStatusFor` reports `none` for these 14 users.
- **Reports.** Any count of activations from the LMS side is 14 short of AmmaWallet's ledger.

Until the backfill is done: **keep `AMMA_SPONSOR_ACTIVATION` off.**

## The script
`LMS-Server/scripts/backfill-amma-activations.mjs` (tests: `npm run test:backfill-activations`).
- Dry run by default and opens the database read-only.
- Writes only with `--apply --confirm "BACKFILL <n>"`, in one `BEGIN IMMEDIATE` transaction.
- Inserts rows with `status='confirmed'` and `remote_state='backfilled_direct_send'`. The worker only picks up
  `queued`, `submitted` and `blocked` rows, so these are never sent. It contacts nothing on the network.
- Refuses (and writes nothing) if: an email matches no user or more than one; `amma_user_id` disagrees with
  `amma_wallet_links`; a completion id or idempotency key is already used by a different row; or the user has a
  live (`queued`/`submitted`/`blocked`) row for the same task, which the queue would still send.
- Rerunning is safe: rows already recorded the same way are skipped.

## Input needed (not in the repo on purpose)
A CSV with one row per activation:
`email,amma_user_id,completion_id,idempotency_key,task_key,completed_at,remote_activation_id,tx_hash`
Take `completion_id`, `idempotency_key` and `task_key` **exactly as they were sent** (from the send log on the
laptop, or AmmaWallet's reconciliation of completions 21 to 34). For the two sponsors, if the sent completion id
was not `sponsor-onboarded-<sponsor LMS id>`, add that question for AmmaWallet before deciding which id to record.

## Steps (each needs the owner's go; production and laptop work is paused)
1. Build the CSV and check it has 14 rows and matches AmmaWallet's 14 completions and 43.4 XLM.
2. Take a WAL-consistent backup of the LMS database with the SQLite backup API and restore it to a disposable copy.
3. Dry run against the copy, then `--apply` against the copy, and check 14 new `confirmed` rows.
4. Dry run against the live database (read-only). It must say "14 row(s) to record" and list no problems.
5. With the owner's typed go: `--apply --confirm "BACKFILL 14"` against the live database.
6. Check: `SELECT count(*) FROM amma_activations WHERE remote_state = 'backfilled_direct_send'` returns 14.

Rollback: `DELETE FROM amma_activations WHERE remote_state = 'backfilled_direct_send'` (only these rows carry that state).
