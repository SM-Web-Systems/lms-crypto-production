## 2026-09-03 — LMS E2E cold-start database initialization fix

### Status

Post-closure production follow-up. This change is separate from the original
`audit-closure-2026-09-03` remediation scope.

### Problem

A fresh file-based LMS database could start without the required schema bootstrap.
This caused cold-start E2E failures involving the `role_permissions` table.
The payments table CREATE definition was also missing four columns
(`paystack_reference`, `paystack_access_code`, `stellar_tx_hash`, `stellar_memo`)
and two status values (`failed`, `refunded`). A payments migration used
`SELECT *`, which could fail when source and destination column counts diverged.

### Change

Commit `ba8ff13` updated `LMS-Server/src/config/database.ts` to:

- bootstrap `schema.sql` for fresh file-based databases (guarded by
  `DB_PATH !== ':memory:'` to preserve test compatibility);
- include all 17 columns and 5 status values in the payments CREATE TABLE;
- use column-explicit INSERT with runtime column detection in the payments
  migration instead of `SELECT *`.

1 file changed, 30 insertions, 2 deletions.

### Verification

- LMS backend: 1270/1270 passing.
- LMS frontend: 227/227 passing.
- LMS E2E: 14/14 passing on a fresh cold start (database deleted, fresh server).
- Deployed build SHA: `ba8ff133547294cd62da607b7949c1043a42675e`.
- Repository HEAD: `ba8ff133547294cd62da607b7949c1043a42675e`.
- Build match: YES.
- Deployment status: DEPLOYMENT_VERIFIED.

### Scope

- LMS only.
- CRM unchanged.
- AmmaWallet unchanged.
- Original four audit findings (48 total, 45 resolved, 3 INFO) remain unchanged.
- No new audit finding created.
