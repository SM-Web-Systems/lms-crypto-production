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

The export requires an existing destination parent and never overwrites an existing path. Run it against a committed candidate; it intentionally excludes uncommitted changes. It exports tracked regular files including those marked `export-ignore`, records their modes, and refuses nonportable paths rather than silently changing them. The repository has identical `XLM.png`/`xlm.png` aliases: these preserve both logical paths and their shared blob identity in the manifest. Case-sensitive filesystems receive both files; case-insensitive filesystems share an existing file only after same-file and byte verification. Case aliases with different contents/modes are refused before output creation.

In `LMS-Server`, use a clean `npm ci`, set `LMS_FIXTURE_LINE_ENDINGS` to `lf` or `crlf`, then run:

```text
npx vitest run src/__tests__/migration-fixture-line-endings.test.ts src/__tests__/reward-atomic-reference.test.ts src/__tests__/reward-txn-check-migration.test.ts
```

Run `npm run build` as the backend compiler check. The CI matrix exercises the same named suites on both OS families. Never resolve a fixture problem by allowing unsupported production DDL, weakening a financial CHECK/UNIQUE constraint, or suppressing drift assertions.

## Evidence and state

LMS-002 was completed on 6 November 2026. The pre-change Windows run reproduced three assertion failures plus the existing fixture module's setup failure. Corrected LF and CRLF runs each passed **169/169 assertions on Windows and Ubuntu**; exporter tests passed **9/9 on both OS families**. Both native clean locked installs and backend builds passed. The pinned Linux candidate was `ab74bdd2a138b06fbecf84f33c6b5a22c3ac1fd1` (Node 22.18.0/Linux x64).

The complete 2,578-file Windows and Linux source exports produced an identical manifest SHA-256, including the two logical icon aliases. Linux source bytes remained unchanged after tests. [Validation receipt](evidence/lms-002-validation.json) records the matrix outcomes, candidate, raw receipt hashes and export identity. Local diagnostic logs remain under the ignored `output/playwright/lms-audit-2026-11-05/` directory with the `lms-002-` prefix. The receipt notes the initial corrected Windows CRLF working-tree run separately from the later pinned Linux runs.

No runtime production schema/auth/payment changes are part of this task. Real production-copy acceptance remains part of the later migration/release gates.
