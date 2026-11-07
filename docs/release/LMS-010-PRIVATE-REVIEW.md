# LMS-010 — private staging account review

The read-only inventory succeeded in [run 42247323277](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/42247323277). The snapshot was captured on 6 November 2026 at **17:32 SAST** and inventoried at **17:54 SAST**. Both observed LMS image revisions were `f5a64e8ac92aca6b33ae54bda70617d475893e3e`.

The private report is `rbac-inventory-501d67b5bac94487861a23b4e2571915/exceptions.json` beneath the configured `DEPLOY_BACKUP_DIR` on the staging server. Keep account identifiers and decision records in that private server directory. The report excludes names, emails and credentials; an authorized operator can use the corresponding finalized snapshot or existing account-management tools to identify the affected accounts privately.

Public binding evidence:

- Snapshot SHA-256: `19768caf93be07a7dd9681b4bfb96dd12215cade3b0f2d53783fda64f5f98a79`.
- Schema fingerprint: `31506217ed4e9f1cf7bc446a91954fd1b9cb54f88be76560043de490d9d7b53c`.
- 19 accounts, 22 role assignments, two multi-role accounts, two explicit administrators, three missing learner profiles and one `students` foreign-key violation.
- No custom roles, catalog issues, dangling assignments or orphan course codes were reported. Installed builds and legacy endpoint usage were not collected.

## Private review coverage update

The initial inventory counted multi-role accounts even when an account had no other findings or scope observations. Such an account could be absent from the private exception list. The updated inventory lists all accounts with multiple grants or an assigned custom role in the private file. The public summary retains counts and omits account identifiers. The change passed a disposable-snapshot regression that verified the source file stayed byte-identical.

Before recording decisions, an authorized reviewer can run the updated read-only inventory against the existing finalized copy and save the expanded details to a new file. Use the captured deployment SHA and confirm the resulting snapshot hash matches the binding evidence above. Run from `LMS-Server` in a checkout with the updated tool:

```bash
npm run rbac:inventory -- --snapshot --database "$PRIVATE_FINALIZED_SNAPSHOT" \
  --deployed-sha f5a64e8ac92aca6b33ae54bda70617d475893e3e \
  --details-output "$PRIVATE_REVIEW_DIR/exceptions-review.json"
```

Keep the original report and the new file private. This local fix does not establish which accounts were in the original server file or record the owner's decisions.

## Decisions required

1. Review current administrator/multiple grants and confirm the intended authoritative RBAC assignments. A legacy label does not supply a missing grant, and multiple grants may be legitimate.
2. Review each missing learner profile against the account's intended learning access. Record the intended correction or reason for deferral; do not infer enrollment from a legacy role label.
3. Resolve the `students` foreign-key exception through an explicitly reviewed data-repair decision. Identify the affected private row and intended parent/history. The current cutover tool refuses even planning while integrity exceptions remain; it performs no automatic repair or deletion.
4. Record the installed/supported mobile build inventory and legacy endpoint usage evidence, including source, observation period and any minimum-build/upgrade decision. Source exports and JavaScript bundles do not establish installed-binary compatibility.

An operator can create a private `review-decisions.json` next to the report using this worksheet structure, filling account/row references only in the private copy:

```json
{
  "version": 1,
  "status": "pending",
  "snapshotSha256": "19768caf93be07a7dd9681b4bfb96dd12215cade3b0f2d53783fda64f5f98a79",
  "deployedSha": "f5a64e8ac92aca6b33ae54bda70617d475893e3e",
  "reviewReference": null,
  "reviewer": null,
  "reviewedAt": null,
  "acceptCurrentRbacAsAuthoritative": false,
  "accountDecisions": [],
  "learnerProfileDecisions": [],
  "integrityDecisions": [],
  "installedClientEvidence": null,
  "legacyEndpointUsageEvidence": null
}
```

This is an operator worksheet, not an implemented automatic approval format. Completing it records decisions; any data correction, cutover, image replacement or recovery-policy change still requires its own concrete reviewed action. After approved corrections, capture and validate fresh binding evidence before rehearsal or execution. Preserve existing private evidence and financial history.

Recovery remains **UNVERIFIED** because the configured policy did not match the captured state. Inventory did not change that policy, publish a recovery pointer, modify grants/profiles/live database contents, update checkout, restart services or change SSH settings.
