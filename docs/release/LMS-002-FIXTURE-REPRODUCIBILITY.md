# LMS-002 — migration fixture reproducibility

Implementation started on 5 November 2026 from `dfd90bc`. This record supersedes neither the historical audit nor the separate Windows writer-hold finding (LMS-003).

## Changes

- `scripts/export-audit-source.py` reads a full immutable commit SHA using `git ls-tree` and raw `git cat-file` blob bytes. It does not use checkout text conversion, archive attributes or uncommitted files. It refuses existing destinations, unsafe paths and symlinks/submodules, and writes a per-file SHA-256 manifest. A filesystem write failure leaves an unaccepted partial directory without a completed manifest; retry at a new destination.
- Pre-R3 index fixtures now load the canonical test schema and explicitly drop the actual unique index. They no longer depend on a regex matching a comment followed by a specific newline.
- Other schema mutations normalize only test-fixture line endings and refuse missing/no-op mutation patterns. Production DDL classification and migration validation are unchanged.
- `LMS_FIXTURE_LINE_ENDINGS=lf|crlf` controls the SQL passed to SQLite in the migration fixture suite. Additional cases verify real plan/apply behavior and refusal of weakened DDL with database bytes unchanged.
- CI has clean-install Ubuntu/Windows × LF/CRLF jobs using Node 22. Local Linux validation uses a separate Ubuntu runtime and native dependencies, not Windows `node_modules`.

## Reproduction

From the repository root:

```text
python -m unittest discover -s scripts/tests -p test_audit_source_export.py
python scripts/export-audit-source.py --sha FULL_COMMIT_SHA --output NEW_DIRECTORY
```

The export requires an existing destination parent and never overwrites an existing path. Run it against a committed candidate; it intentionally excludes uncommitted changes. It exports tracked regular files including those marked `export-ignore`, records their modes, and refuses nonportable paths rather than silently changing them.

In `LMS-Server`, use a clean `npm ci`, set `LMS_FIXTURE_LINE_ENDINGS` to `lf` or `crlf`, then run:

```text
npx vitest run src/__tests__/migration-fixture-line-endings.test.ts src/__tests__/reward-atomic-reference.test.ts src/__tests__/reward-txn-check-migration.test.ts
```

Run `npm run build` as the backend compiler check. The CI matrix exercises the same named suites on both OS families. Never resolve a fixture problem by allowing unsupported production DDL, weakening a financial CHECK/UNIQUE constraint, or suppressing drift assertions.

## Evidence and state

The pre-change Windows run reproduced three assertion failures plus the existing fixture module's setup failure. The first corrected CRLF run passed all 169 assertions, and the exporter passed 7 tests. Final LF/CRLF Linux and Windows receipts will be linked here before LMS-002 is marked complete. Local diagnostic logs are under the ignored `output/playwright/lms-audit-2026-11-05/` directory with the `lms-002-` prefix.

No runtime production schema/auth/payment changes are part of this task. Real production-copy acceptance remains part of the later migration/release gates.
