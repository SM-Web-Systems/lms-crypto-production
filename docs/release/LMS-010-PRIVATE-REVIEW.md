# LMS-010 — private staging account review

The read-only inventory succeeded in [run 42247323277](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42247323277). The snapshot was captured on 6 November 2026 at **17:32 SAST** and inventoried at **17:54 SAST**. Both observed LMS image revisions were `f5a64e8ac92aca6b33ae54bda70617d475893e3e`.

The private report is `rbac-inventory-501d67b5bac94487861a23b4e2571915/exceptions.json` beneath the configured `DEPLOY_BACKUP_DIR` on the staging server. Keep account identifiers and decision records in that private server directory. The report excludes names, emails and credentials; an authorized operator can use the corresponding finalized snapshot or existing account-management tools to identify the affected accounts privately.

In a private staging SSH session with `DEPLOY_BACKUP_DIR` set from the authorized server configuration, open the retained report with:

```bash
less -- "${DEPLOY_BACKUP_DIR:?set the authorized backup directory}/rbac-inventory-501d67b5bac94487861a23b4e2571915/exceptions.json"
```

Public binding evidence:

- Snapshot SHA-256: `19768caf93be07a7dd9681b4bfb96dd12215cade3b0f2d53783fda64f5f98a79`.
- Schema fingerprint: `31506217ed4e9f1cf7bc446a91954fd1b9cb54f88be76560043de490d9d7b53c`.
- 19 accounts, 22 role assignments, two multi-role accounts, two explicit administrators, three missing learner profiles and one `students` foreign-key violation.
- No custom roles, catalog issues, dangling assignments or orphan course codes were reported. The original inventory did not collect installed builds or legacy endpoint usage.

A later 24-hour staging log sample found zero legacy role PATCH requests among 6,009 recognized requests. It crossed an API container start. Continuous coverage and installed builds still need separate evidence. [Staging usage sample](evidence/lms-013-staging-legacy-role-usage.json)

## Private review coverage update

The initial inventory counted multi-role accounts even when an account had no other findings or scope observations. Such an account could be absent from the private exception list. The updated inventory lists all accounts with multiple grants or an assigned custom role in the private file. The public summary retains counts and omits account identifiers. The change passed a disposable-snapshot regression that verified the source file stayed byte-identical.

Before recording decisions, an authorized reviewer can run the updated read-only inventory against the existing finalized copy and save the expanded details to a new file. Use the captured deployment SHA and confirm the resulting snapshot hash matches the binding evidence above. Run from `LMS-Server` in a checkout with the updated tool:

```bash
npm run rbac:inventory -- --snapshot --database "$PRIVATE_FINALIZED_SNAPSHOT" \
  --deployed-sha f5a64e8ac92aca6b33ae54bda70617d475893e3e \
  --details-output "$PRIVATE_REVIEW_DIR/exceptions-review.json"
```

Keep the original report and the new file private. This local fix does not establish which accounts were in the original server file or record the owner's decisions.

## Prepared private worksheet

The pending worksheet is `review-decisions.json` next to the original report in the private staging backup directory. It contains four account decision rows, three learner-profile decision rows and one integrity decision row. The retained snapshot matched its recorded digest before and after generation. The worksheet passed the private file permission check. These are rows to review and may refer to the same account across groups. [Worksheet preparation evidence](evidence/lms-010-private-review-preparation.json)

Open it from the private staging shell:

```bash
less -- "${DEPLOY_BACKUP_DIR:?set the authorized backup directory}/rbac-inventory-501d67b5bac94487861a23b4e2571915/review-decisions.json"
```

## Decisions required

1. Review current administrator/multiple grants and confirm the intended authoritative RBAC assignments. A legacy label does not supply a missing grant, and multiple grants may be legitimate.
2. Review each missing learner profile against the account's intended learning access. Record the intended correction or reason for deferral; do not infer enrollment from a legacy role label.
3. Resolve the `students` foreign-key exception through an explicitly reviewed data-repair decision. Identify the affected private row and intended parent/history. The current cutover tool refuses even planning while integrity exceptions remain; it performs no automatic repair or deletion.
4. Record the installed/supported mobile build inventory and legacy endpoint usage evidence, including source, observation period and any minimum-build/upgrade decision. Source exports and JavaScript bundles do not establish installed-binary compatibility.

Use the prepared worksheet above. If another reviewer needs an independent worksheet, run the updated tool from `LMS-Server` against the same finalized snapshot with a new private destination:

```bash
npm run rbac:inventory -- --snapshot --database "$PRIVATE_FINALIZED_SNAPSHOT" \
  --deployed-sha f5a64e8ac92aca6b33ae54bda70617d475893e3e \
  --expected-snapshot-sha 19768caf93be07a7dd9681b4bfb96dd12215cade3b0f2d53783fda64f5f98a79 \
  --review-output "$PRIVATE_REVIEW_DIR/review-decisions.json"
```

The tool refuses a different snapshot or an existing destination. It creates the worksheet with owner-only permissions on POSIX. On Windows, use a directory restricted by an operator-controlled ACL. The worksheet binds the snapshot, schema fingerprint and supplied deployment revision. Complete the reviewer, private review reference and `reviewedAt` in UTC with milliseconds, such as `2026-11-08T10:30:00.000Z`. Record a decision and rationale for every finding, keeping the generated finding rows and order. Fill `installedClientEvidence` and `legacyEndpointUsageEvidence` with private references. Set `status` to `reviewed` and confirm `acceptCurrentRbacAsAuthoritative` after agreeing that current RBAC grants are the authority for reconciliation.

Verify the completed worksheet privately against the finalized copy:

```bash
npm run rbac:inventory -- --snapshot --database "$PRIVATE_FINALIZED_SNAPSHOT" \
  --deployed-sha f5a64e8ac92aca6b33ae54bda70617d475893e3e \
  --expected-snapshot-sha 19768caf93be07a7dd9681b4bfb96dd12215cade3b0f2d53783fda64f5f98a79 \
  --verify-review "$PRIVATE_REVIEW_DIR/review-decisions.json"
```

Share the `REVIEW_RECORD_VERIFIED` summary if needed. It includes the worksheet digest and finding counts. Keep the worksheet, identities, rationales and evidence references in the private directory. Verification checks the completeness and snapshot binding of the worksheet. The owner still checks the underlying client evidence and approves any repairs separately.

Completing the worksheet records the review. Data corrections, cutover, image replacement and recovery-policy changes each require a separately reviewed action. After approved corrections, capture and validate fresh binding evidence before rehearsal or execution. Preserve existing private evidence and financial history.

Recovery remains **UNVERIFIED** because the configured policy did not match the captured state. Inventory did not change that policy, publish a recovery pointer, modify grants/profiles/live database contents, update checkout, restart services or change SSH settings.
