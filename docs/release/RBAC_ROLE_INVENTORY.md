# RBAC retirement: Step 1 operator handoff

This step inventories existing assignments and records target behavior. It does not migrate users, grant/revoke roles, change application authorization, or certify production readiness.

## Prepare a separate snapshot on the server

Use the established SQLite backup procedure or SQLite backup API to make a consistent, private standalone snapshot. Keep the original database, WAL/SHM/journal files and deployed services untouched. Copying only the main file of a live WAL database is not a valid snapshot procedure.

Finalize **the separate snapshot** in rollback-journal mode (`journal_mode=DELETE`) and close its writers/readers that could leave sidecars. Do not change journal mode or delete sidecars on the live database. The tool rejects WAL-mode headers and any WAL/SHM/journal sidecar, even an empty one, rather than risk creating shared-memory files or ignoring committed WAL content with immutable mode.

Run from an inventory checkout with Node 22 and locked LMS-Server dependencies installed. The tool imports only Node built-ins and better-sqlite3. It does not load .env or application modules and does not start the API, run database startup migrations, seed roles, or use network services. Do not run a normal application/container startup entrypoint to obtain the report. If using a disposable container, explicitly override its entrypoint and mount only the separate snapshot read-only; do not mount the live application data volume.

Determine the deployed application's full 40-character Git SHA from the deployed image/build evidence. This is distinct from the commit containing the inventory tool. The report labels this SHA as operator-supplied; it cannot verify a running server from an offline snapshot.

## Run the report

Create a private, operator-controlled report directory first. POSIX should use a directory mode of 0700 and umask 077. On Windows restrict the directory ACL to the operator; Node's 0600 file mode alone does not establish Windows ACL privacy.

From `LMS-Server`:

```bash
node scripts/rbac-inventory.mjs \
  --snapshot \
  --database /private/rbac-review/finalized-snapshot.db \
  --deployed-sha FULL_40_CHARACTER_DEPLOYED_SHA \
  --details-output /private/rbac-review/new-exceptions.json
```

Replace both paths and the SHA placeholder with verified values. The details file must not already exist. The tool never overwrites it. Use a fresh name per run. It writes an aggregate JSON summary to stdout only after successful inspection and private-file creation. Omit `--details-output` for aggregate output without creating an account-level report.

`--snapshot` is an operator assertion of provenance, not proof that a supplied path is separate from live storage. The tool cannot determine snapshot provenance; pass only the independent finalized copy.

On success exit code is 0, even if findings exist. Exit code 2 means refusal, including unsupported schema, missing input, WAL/sidecar presence, invalid SHA, non-regular/symlink input, output collision, or inspection error. Treat refusal as an evidence gap: never initialize, reset, or upgrade the input to make the report pass.

## Interpret the output

The summary includes the snapshot SHA-256, schema fingerprint, SQLite engine/user_version, supplied deployment SHA, account/grant counts, canonical administrator grants, deletion-state counts, and aggregate findings. `applicationMigrationVersion` is null: SQLite user_version and a schema fingerprint do not prove the application's migration level. Verify the deployed schema contract separately.

The optional details contain account/resource identifiers, legacy value, current role IDs, authorization version, deletion status, and findings/scope counts. They exclude names, emails, passwords, tokens, Wallet addresses, and credential history. Keep them private and outside Git. The repository ignores `.rbac-inventory/` directories for local synthetic evidence; that does not enforce filesystem privacy or make production exports safe to commit elsewhere.

| Finding | Interpretation/action |
| --- | --- |
| legacy_mapping_absent_from_rbac | Often a legitimate stale label after additive RBAC grants. Current RBAC is authoritative; do not union the legacy role back into the account |
| startup_legacy_regrant_risk | Authorization version zero and the legacy-mapped grant absent. Current startup bridge may re-add that grant; review before cutover, without running startup on the snapshot |
| managed_account_without_grants | Can be deliberate revocation. Preserve it; confirm the intended outcome with the operator |
| unmanaged_account_without_grants | Needs an explicit account decision. Do not default it to student/admin automatically |
| learner_profile_missing / multiple_learner_profiles | Review learner-profile availability/uniqueness for accounts with course.submit |
| explicit_administrator | Canonical system role ID and name match, with is_system=1; this is an inventory item, not a defect |
| assignment_without_capability / cohort_owner_without_capability | Stored scope no longer matches current capabilities. Review; assignments alone must not confer capability |
| catalog issues / dangling assignments / foreign-key violations / orphan course codes | Schema/data inconsistency requiring review; inventory performs no repairs |
| scopeObservations | Missing course/cohort/group links may be legitimate for new or currently unassigned roles. These observations do not mandate a grant or new relationship |

Counters can overlap. An account can have a stale legacy label, missing learner profile and explicit administrator grant at the same time. Do not add counters as a unique user total. Deleted/pending-deletion accounts retain their reported state; role inventory is not permission to restore them.

No report returns migration-ready=true. Production account decisions, legacy endpoint usage and installed-client compatibility require separate evidence.

## Production information to return

Return the aggregate summary and the deployed application SHA to this development task. Keep detailed identifiers on the server unless a specific account decision requires a private review.

Also record:

1. An operator decision for each account needing intervention, especially unmanaged/no-grant users and any staff identity disagreement. Preserve deliberate revocations. A stale display label by itself needs no additional grant.
2. Counts/last-seen evidence for `PATCH /api/v1/users/:id/role` in the available access/audit logs, plus the covered observation period and retention gaps. Redact credentials, query strings, tokens and account identifiers from shared logs. Current web/mobile source contains no caller, but older clients and operator scripts remain unverified.
3. The installed/supported mobile versions and any external API clients that consume the single `role` response property.
4. Confirmation that the private snapshot came from the current deployment and meets the current schema contract. Do not infer this from the inventory's SQLite user_version alone.

These are server-side review tasks only. Step 2 development can proceed with synthetic fixtures, but production migration approval depends on reviewing the real account exceptions first.

## Local tests and known gaps

```bash
npm run test:rbac-inventory
npx vitest run src/__tests__/rbac-retirement-policy.test.ts
```

The policy suite contains 21 ordinary passing checks (13 observation checks and 8 existing safeguards) and **13 known failing target contracts** marked with `it.fails`. They are not implemented fixes. Every known target has a separate ordinary observation check so a fixture error cannot silently stand in for the documented gap.

To reproduce the failing target contracts as ordinary tests:

```bash
RBAC_ENFORCE_TARGETS=1 npx vitest run src/__tests__/rbac-retirement-policy.test.ts
```

PowerShell equivalent:

```powershell
$env:RBAC_ENFORCE_TARGETS = '1'
npx vitest run src/__tests__/rbac-retirement-policy.test.ts
Remove-Item Env:RBAC_ENFORCE_TARGETS
```

That deliberate red run currently reports 13 failed, 21 passed. During Step 2, replace each expected-failure target with an ordinary passing regression and update its pre-cutover observation assertion. Do not leave the markers in place to conceal an implemented fix or future regression.

| Target group | Scenarios | Current observation |
| --- | --- | --- |
| Instructor assignment | 3 | RBAC instructor/custom teaching capability rejected with stale student label; legacy lecturer without grants accepted |
| Certificate self-application | 3 | Legacy admin/lecturer bypasses enrollment; enrolled zero-grant legacy lecturer can apply |
| Broadcast recipients | 3 | Sponsor missed; lecturer audience follows old labels; a multi-role enhanced learner with legacy admin label missed |
| Multi-role password login | 1 | Existing learner profile omitted from token when legacy label is admin |
| Direct initial grants | 3 | With the legacy insert trigger removed, Wallet student/instructor creation and public registration leave no RBAC grants |

Chosen target policy: self-certificate applications require current learning/certificate capability and enrollment for every applicant; staff approval is separate. Student broadcast audiences include current student and super-student members once each; instructor and sponsor audiences follow current RBAC membership. These defaults implement the migration plan and must be documented as behavior corrections during Step 2.

Already passing safeguards cover current authorization context despite conflicting labels, no-grant workspaces, signed obsolete role claims, explicit RBAC administration, managed revocation preservation, repeated existing-user Wallet sign-in, unverified provider rejection, and parent child creation without the trigger.
