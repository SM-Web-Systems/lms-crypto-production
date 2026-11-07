# LMS-061 recovery rehearsal

**In progress.** A read-only verifier for a retrieved backup passed a local rehearsal. Protected off-host retrieval and restoration with the exact reviewed images still require platform acceptance.

## Verify the retrieved backup

The release preflight writes a finalized SQLite backup and a companion JSON receipt. The operator records the receipt’s SHA-256 in a separate restricted record when the backup is captured. The recovery operator retrieves both files from the approved off-host backup location into an isolated, private directory on the recovery host. Retain the independent digest and evidence of the source and retrieval in the private operator record.

```bash
python3 -I -S scripts/verify_retrieved_backup.py \
  --database "$RETRIEVED_DB_ABSOLUTE_PATH" \
  --evidence "$RETRIEVED_JSON_ABSOLUTE_PATH" \
  --expected-evidence-sha256 "$RECORDED_BACKUP_RECEIPT_SHA256"
```

On success the command prints `RETRIEVED_BACKUP_VERIFIED` and the two digests. It independently recomputes the SQLite integrity, schema, row counts, financial and protected data fingerprints, and foreign-key findings. Existing findings must match the receipt exactly. A known matching finding still needs its independent review before migration. The verifier leaves the copy byte-identical and prints fixed refusal codes for failed checks. On Windows, restrict both files and their directory using filesystem ACLs.

## Finish the protected rehearsal

Use a separate disposable volume for runtime restoration. Record the exact candidate and recovery API and web image IDs, the writer hold, the migration results, the final schema and foreign-key checks, and the reconciled data fingerprints. Exercise the supported image/schema combinations and recovery procedure on the protected copies. Keep the operator’s retrieval provenance and exact-image results together for review. The verifier checks the bytes and receipt presented to it. The separate operator record establishes the off-host retrieval and runtime restoration. [RBAC schema retirement handover](SERVER-HANDOVER-RBAC-STEP-04-SCHEMA-AND-COMPATIBILITY-REMOVAL.md)

The local tests used SQLite online backup against a synthetic source with a committed WAL row. They exercised retrieval to a separate directory, refusal of the original file, a changed digest, tampering, sidecars and a metadata mismatch. Exact images and a protected staging copy were outside this local rehearsal.

Ubuntu WSL passed 297 release-tooling tests. The final five focused verifier tests passed separately on both Windows and Ubuntu. The broader Windows run hit a Git Bash startup restriction in the sandbox.

## Hosted synthetic image rehearsal

The CI job builds the API and web Dockerfiles from a Git archive of the checked-out revision and records both resulting image IDs and their revision label. The API image runs the writer-hold command and RBAC migration and startup harness using disposable SQLite files. The web image checks its Nginx configuration, serves the built entry page on container loopback, and verifies the embedded revision. Both containers run with Docker's `none` network. The job does not transfer its images into a deployment. The protected rehearsal still requires the exact image IDs selected for release and recovery. [Docker none network](https://docs.docker.com/engine/network/drivers/none/)
