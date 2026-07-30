# Wave 2 Security Remediation — Summary

**Date:** 2026-07-30
**Branch:** `fix/wave2-2026-07-29`
**Commits:** 36 (on top of 35 Wave 1 commits)

## Findings Addressed

| Category | Count | Details |
|----------|-------|---------|
| Code fixes | 35 | Across Batches A (14), B (10), C (11), D (2) |
| Accepted risks | 5 | LMS-AUTH-002/003/004, LMS-WALLET-002, LMS-MINT-003 |
| **Total addressed** | **40** | |

### By Severity (code fixes)
| Severity | Fixed |
|----------|-------|
| CRITICAL | 1 (LMS-AUTH-001) |
| HIGH | 8 (INPUT-001/002/003/005/007, ERR-004/005, XSS-003) |
| MEDIUM | 14 (EMAIL-001, SQLI-002, INVITE-002, RATE-002/003/004/005, AUTH-009, SSO-002, J1-001/005, USER-001, MINT-J2-006, AUTH-005) |
| LOW | 12 (MINT-001/002/004/005/006, MINT-J2-001/003/004, DB-001/002/007, ADM-001/006/007, PAGINATION-001, ERR-001/002/003) |

### Accepted Risks (no code change)
| Finding | Rationale |
|---------|-----------|
| LMS-AUTH-002 | bcrypt rounds=10 is OWASP-acceptable; upgrade to 12 deferred to avoid perf regression |
| LMS-AUTH-003 | Timing side-channel on login is low-risk with rate limiting in place |
| LMS-AUTH-004 | Account enumeration on login — standard tradeoff; rate limiting mitigates |
| LMS-WALLET-002 | AmmaWallet API key in env var — standard secret management; no code fix needed |
| LMS-MINT-003 | Mint retry with no backoff — admin-only, low-frequency; exponential backoff deferred |

## Test Suite
| Metric | Before | After |
|--------|--------|-------|
| Tests | 312 | 389 |
| Test files | 28 | 63 |
| tsc --noEmit | Clean | Clean |

## Production Migration Follow-up

**LMS-DB-001 (quizzes.course_id FK)** requires a **manual production migration** that is NOT applied automatically:

The `ensureQuizzesCourseIdFK()` function in `database.ts` performs a SQLite table rebuild (RENAME → CREATE → INSERT → DROP) to add the foreign key constraint. This runs automatically on server startup for new databases and the test DB, but for the production database (`/app/data/student_ms.db` inside the `lms-api` container):

1. **Back up** the production DB before deploying
2. The migration will run on first server restart after deploy
3. Verify with: `sqlite3 /app/data/student_ms.db "SELECT sql FROM sqlite_master WHERE name='quizzes';"` — should show `REFERENCES courses(id)`
4. **Rollback SQL** (if needed):
```sql
PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;
BEGIN;
ALTER TABLE quizzes RENAME TO _quizzes_rollback;
CREATE TABLE quizzes (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, information TEXT,
  course_id TEXT, passing_score INTEGER NOT NULL DEFAULT 70,
  questions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO quizzes SELECT * FROM _quizzes_rollback;
DROP TABLE _quizzes_rollback;
CREATE INDEX IF NOT EXISTS idx_quizzes_course ON quizzes(course_id);
COMMIT;
PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
```

**LMS-DB-002 (nft_credentials.application_id FK):** Schema.sql only — existing `ALTER TABLE` already runs; no table rebuild needed. Production DB already has the column; FK enforcement is schema-level only.

## Merge Readiness

- All 389 tests passing
- TypeScript compilation clean
- Wave 1 regression tests verified (10/10)
- No breaking API changes
- Git worktree is clean (no uncommitted changes)

**Ready for merge** pending manual review. Do NOT force-push or merge without explicit approval.
