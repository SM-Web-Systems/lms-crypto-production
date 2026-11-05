# LMS-003 — writer-hold portability

The regression run reproduced five failing assertions on Windows: the invalid parent-file case, a missing hold directory, failed parent inspection, an HTTP mutation admitted while the directory was missing, and worker startup admitted in that state. These are filesystem guard failures, separate from LMS-002's SQL fixture problems.

## Change

The guard now treats any existing marker (including a dangling symlink) as held. An `ENOENT` is considered a legitimate absent marker only after the containing directory is verified to exist as a directory. Parent inspection errors and unknown filesystem errors remain held. A final marker check catches a marker created during directory inspection.

This remains a point-in-time check, not a mutual-exclusion primitive or a drain for in-flight requests. The release procedure still stops old writers before engaging the candidate's hold. Production hold location remains derived from the configured database location; the override remains test-only.

Unit HTTP tests use an actual isolated temporary directory for the in-memory database's absent marker. They no longer implicitly rely on a nonexistent `./data` directory counting as unheld. The writer-hold/worker tests override that fixture explicitly to exercise invalid and held states.

## Validation

- Windows focused guard/worker/authorization/health run: **44/44 passed**.
- Existing hold/release, anonymous health/probe, request refusal and exactly-once worker behavior remain covered.
- New coverage includes missing/non-directory parent, permission failure, marker creation during inspection, HTTP refusal and delayed worker resumption.
- The Ubuntu/Windows CI fixture matrix runs the guard/worker suites once per OS.
- Linux focused checks, compiler/bootstrap and broader backend regression receipts are recorded before final task closure.

Commands from `LMS-Server`:

```text
npx vitest run src/__tests__/writer-hold.test.ts src/__tests__/writer-hold-workers.test.ts src/__tests__/auth13-authorization.test.ts src/__tests__/health-check-enhanced.test.ts
npm run build
npm run test:compiled-bootstrap
```

No deployment, live hold-file manipulation, writer-control bypass or production data changes were made by this implementation.
