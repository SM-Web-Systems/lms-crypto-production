# RBAC-STEP-02 — Server assessment handover: backend authorization and provisioning

| Field | Value |
| --- | --- |
| Section | RBAC retirement — Step 2: backend authorization and explicit provisioning |
| Date | 2026-10-26 |
| Repository / branch | SM-Web-Systems/lms-crypto-production / codex/rbac-backend-cutover |
| Review unit | Separate Step 2 PR, stacked on codex/rbac-role-inventory (Step 1 PR #98) |
| Prerequisite | Accepted [RBAC-STEP-01 assessment](SERVER-HANDOVER-RBAC-STEP-01-INVENTORY-AND-POLICY-TESTS.md), including real account exceptions and old endpoint usage |
| Requested server action | Assess the exact Step 2 PR head, rehearse the transition and return the section record below |
| Production status | Not deployed; real account decisions, protected-copy rehearsal and maintenance/recovery approval remain server-owned |
| Subsequent sections | Step 3: client/UI retirement; Step 4: legacy column/compatibility removal |

Use this exact section label when returning the assessment. See the [handover index](SERVER-HANDOVER-RBAC-RETIREMENT.md).

## Sections to assess

| Section | Delivered behavior | Assessment focus |
| --- | --- | --- |
| 2A — Authorization | Instructor eligibility uses course.manage; self-certificate application requires current capability and enrollment for all users; broadcast audiences use RBAC membership and deduplicate users | Staff/delegated teaching, enrolled/unenrolled applicants, sponsor audiences, tenant/course/cohort boundaries |
| 2B — Account and role lifecycle | Explicit transactional initial grants and learner profiles; atomic RBAC role replacement; consistent session invalidation for role grants/revocation, custom permission changes and custom role deletion | No ghost student grant on staff creation, no partial account/grants/profile state, no stale session privileges, existing Wallet identity/link/PKCE behavior |
| 2C — Schema transition | Explicit offline rbac-only-v1 ledger/trigger upgrade; startup backfill removed; non-grant rollback fence; existing sessions invalidated during cutover | Exact grant/data preservation, reviewed source checksum, restart behavior, previous image refusal and maintenance sequence |
| 2D — Compatibility and release safety | Temporary role response/JWT fields are derived from current RBAC; directories/rosters/search/forum/export labels use that adapter; API image advertises schema support and deploy/rollback checks reject a mismatched API image | Old client behavior, legacy mutation retirement, exact candidate image label, safe recovery image/schema pairing |

## Intended behavior changes

- Adding an RBAC instructor or delegated course manager no longer requires editing a legacy lecturer label.
- A legacy lecturer label with no current teaching grant cannot qualify someone as an instructor.
- Self-certificate application requires course.view, certificate.apply and actual course enrollment, including staff accounts. Approval/recommendation APIs remain separate scoped actions.
- Student broadcasts include student/super-student membership once each; lecturer audiences map to instructor and sponsor audiences use sponsor membership.
- Learner-profile lookup is independent of the old label. New accounts and newly granted learning capability receive a profile transactionally where appropriate. Existing deletion states and managed no-role accounts stay restricted.
- Public registration always selects role_student on the server. Verified Wallet first sign-in selects canonical initial grants from trusted provisioning configuration; repeated existing-user sign-in never reapplies the allowlists.
- New identities start at authorization version one. User, explicit grant and required profile are created in one transaction, with external Wallet calls outside the transaction.
- Role assignment/replacement and custom permission/deletion changes invalidate affected sessions. Idempotent repeats do not keep incrementing versions.
- PATCH /api/v1/users/:id/role returns 410 to permitted legacy callers. The current replacement API is PUT /api/v1/admin/users/:id/roles with `{ "roleIds": ["role_student", "role_sponsor"] }`; an empty array intentionally removes all roles. It requires user.assign_role and preserves self/equal/higher-tier and last-super-admin safeguards. Existing additive POST and DELETE RBAC endpoints remain.

The stored users.role column remains inert until Step 4. Response/JWT compatibility fields are computed from RBAC; they do not authorize actions. A default student display label for a no-role account grants no permissions/workspace. Step 3 still needs to replace single-label client views with actual role summaries and retire old installed-client dependencies.

## Explicit offline transition

Do not deploy this backend over an unupgraded database: it refuses startup before writing. Do not run ordinary application startup to upgrade or inspect the source.

1. Complete the Step 1 assessment and privately resolve every real account/grant exception. This tool preserves existing RBAC; it does not infer missing grants from legacy labels.
2. Prepare a separate consistent finalized snapshot using the established backup procedure. The CLI requires rollback-journal mode and no sidecars, exactly as the inventory tool does. Never delete live WAL/SHM files or change the live database's journal mode as a shortcut.
3. Keep the snapshot and output private. Record the deployed application SHA and exact source snapshot checksum.
4. From the reviewed Step 2 checkout's LMS-Server directory, plan against the separate snapshot:

```bash
node scripts/rbac-cutover.mjs --plan --snapshot \
  --database /private/rbac-review/finalized-snapshot.db \
  --deployed-sha FULL_40_CHARACTER_DEPLOYED_SHA
```

5. Review the plan, integrity/catalog/link findings, exact grants fingerprint, session impact and accepted Step 1 reference. The plan does not verify production approval.
6. Apply only to that private rehearsal copy, using the plan's snapshotSha256 and a non-secret reference to the accepted Step 1 decision record:

```bash
node scripts/rbac-cutover.mjs --apply --snapshot \
  --database /private/rbac-review/finalized-snapshot.db \
  --deployed-sha FULL_40_CHARACTER_DEPLOYED_SHA \
  --expected-snapshot-sha256 EXACT_64_CHARACTER_HASH_FROM_PLAN \
  --review-reference RBAC-STEP-01/accepted-assessment-reference \
  --accept-rbac-as-authoritative
```

Replace every placeholder with verified values. The acknowledgement is an operator assertion, not an automatic approval. Apply intentionally updates the rehearsal copy: it adds the migration record, replaces the grant trigger with a non-grant fence, increments authorization versions and revokes existing sessions. Every RBAC role, permission, mapping and user assignment must remain byte-for-byte equivalent at the row level. There is no automatic grant reconciliation.

Unknown/changed legacy trigger SQL, malformed inputs, source checksum drift, broken links/catalog/integrity, or missing review acknowledgement cause refusal. Failures during application roll the schema/session/version changes back together. Exit 0 means the requested operation succeeded (including an already-applied no-op on the current exact snapshot); exit 2 means refusal. Re-plan after any source change.

The historical trigger name trg_auto_assign_user_role is reserved as a rollback fence. Its new body is SELECT 1 only: it never reads NEW.role or writes user_roles. Supported older AUTH-13 backends compare canonical trigger SQL and abort their startup transaction against this fence. Removing/altering it is not a rollback procedure. The migration ledger and fence are required before the new backend can start; no startup backfill or silent trigger repair remains.

## Production transition and rollback gates

The laptop rehearsal is synthetic. Before production, the server must rehearse its actual protected database copy and exact previous/candidate images, with ownership of all writers established.

- Prove the candidate image label org.smwebsystems.lms.authorization-schema=rbac-only-v1, OCI revision and source all match the assessed PR head.
- Prove the previous image refuses the upgraded copy without persistent writes. The local evidence covers the earlier local backend, not the server's exact deployed image.
- Prove the candidate can start twice, preserve grants, enforce no-role restrictions and complete the supported Wallet/browser/native handoffs after forced sign-in.
- Validate data/integrity/FKs and scope/access matrices; retain explicit private exception decisions.
- Approve a maintenance sequence that quiesces API workers, scheduled jobs, payment/webhook writers and any other database writers. The final source must be current; never replace live storage with an older rehearsal copy.
- Rehearse the first schema transition separately. The ordinary release helper does not migrate databases. Existing recovery manifests from before cutover contain an incompatible schema/financial baseline; obtain a new reviewed baseline and compatible recovery images. A stopped old backend is expected to refuse the upgraded schema.
- Deploy and rollback checks reject an API image whose authorization-schema label differs from the database. Never bypass the check by editing a label, deleting the ledger/fence or forcing an old image.
- Keep a proven RBAC-only recovery image/schema pair available. A coordinated old-image/old-snapshot restore requires separate approval, quiescence and explicit reconciliation/data-loss analysis; it is not automatic recovery and must not discard later payments or user activity.
- Announce forced reauthentication. Cutover invalidates all existing sessions and pending mobile handoffs; it preserves Wallet identities, account data and grants.

## Local evidence and test commands

Run from LMS-Server after locked dependencies are installed:

```bash
npm run build
npm run test:compiled-bootstrap
npm run test:rbac-inventory
npm run test:rbac-runtime
npx vitest run
```

The 13 Step 1 expected-failure targets are now ordinary regressions, with no it.fails or enforcement flag. Added lifecycle tests cover strict no-trigger provisioning, role-set replacement, missing learner profiles, rollback on transaction failures, custom-role permission/deletion invalidation and compatibility labels. Historical version-zero rows in older regression suites use a clearly named test-only fixture trigger; it is absent from canonical schema/compiled initialization, and the strict retirement/lifecycle suites remove it. Production creation uses explicit grants at version one.

The runtime rehearsal creates only a temporary synthetic database and accepts no production database path. It demonstrates read-only refusal before cutover and no grant resurrection across two restarts. Optionally set RBAC_PREVIOUS_SERVER to a trusted, compiled previous local backend directory to test its real startup refusal. The server's exact immutable image rehearsal remains required.

Offline release checks: `python -m unittest discover -s scripts/tests`. All Docker/HTTP interfaces in that suite are fake. Test outcomes and hosted CI are recorded against the exact PR head in the PR description.

## Server assessment checklist and return record

- [ ] Assess sections 2A–2D against the exact PR head and record the base/Step 1 prerequisite.
- [ ] Attach the accepted Step 1 account, endpoint-usage and installed-client decisions privately.
- [ ] Rehearse plan/apply/refusal/repeat behavior on the protected copy and record source/grants/schema fingerprints.
- [ ] Prove candidate startup/access/session behavior and exact previous-image refusal with unchanged grants.
- [ ] Test password/Wallet sign-in, account linking, verified identity, browser/mobile PKCE and repeat sign-in after demotion.
- [ ] Verify tenant/course/cohort/family scope, zero-grant restrictions, administrator hierarchy and certificate enrollment.
- [ ] Verify the 410 retirement impact and current RBAC role-set API with all known callers.
- [ ] Approve a separate maintenance/cutover/recovery sequence and forced-sign-in communication.
- [ ] Return findings and a verdict for each subsection; do not merge/deploy merely because laptop tests pass.

```text
Section: RBAC-STEP-02 — Backend authorization and explicit provisioning
Assessed PR/head SHA / Step 1 prerequisite:
Deployed and candidate image SHAs/IDs:
2A Authorization verdict and evidence:
2B Provisioning/lifecycle verdict and evidence:
2C Protected-copy migration / fingerprints / previous-image refusal:
2D Client/endpoint compatibility and image/schema checks:
Maintenance/writer-quiescence and recovery plan reference:
Forced-sign-in communication:
Verdict: ACCEPTED / CHANGES REQUESTED / EVIDENCE INCOMPLETE
Remaining production conditions:
```
