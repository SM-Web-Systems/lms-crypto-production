# AUTH-13: Monitoring Transition Plan

**Date:** 2026-10-23
**Reviewer:** Claude (independent automated review)
**PRs:** #80, #81

---

## 1. Logging Framework

**Status: No breaking changes**

The application uses `pino` (structured JSON logging) via `src/utils/logger.ts`. The PR stack does not change:
- Log format (JSON)
- Log levels
- Log output destination (stdout)
- Logger initialization

The only new log output is:
- FK violation warnings at startup: `console.warn("Database has N pre-existing foreign key violation(s): ...")`
- Payment mismatch warnings: `logger.warn({module:'paystack-webhook',...}, 'Payment amount/currency/method mismatch')`

These are additive and do not affect existing log parsing.

## 2. Health Check Endpoints

**Status: Unchanged**

The `/health` endpoint (port 3001 inside container) remains operational. No routes or middleware changes affect health monitoring.

## 3. CI Audit Gates (PR #81)

**Changed from advisory to blocking:**

| Gate | Before | After |
|------|--------|-------|
| Backend `npm audit` | `continue-on-error: true` | Fails CI on high-severity |
| Frontend production deps | `continue-on-error: true` | Fails CI on high-severity |
| Frontend all deps | N/A | Fails CI on critical-severity |

This is a **positive change** — dependency vulnerabilities will now block merges. The frontend build-tool gate uses `--audit-level=critical` to accommodate known Tailwind 3 moderate findings pending CSS migration.

## 4. Monitoring Scripts (PR #80)

New and updated scripts:
- `scripts/verify-stability.py` — automated stability verification
- `scripts/tests/test_stability.py` — stability script tests
- `scripts/tests/test_monitor_commands.py` — monitor command tests
- `scripts/smoke-test-verify.sh` — updated smoke test

These are operator-side scripts; they do not affect the running application.

## 5. Error Response Format

**Status: No breaking changes**

Error responses continue to use the standard format:
```json
{"success": false, "error": {"code": "ERROR_CODE", "message": "..."}}
```

The `errorHandler` middleware is unchanged. The `fails closed` tests verify that internal errors return structured responses without leaking internal details.

## 6. Container Configuration

**Status: Unchanged by PR stack**

Container security hardening (ReadonlyRootfs, UID 1000, tmpfs) was established in AUTH-10 and is not modified by these PRs.

## 7. Deployment Transition Checklist

For the operator deploying this PR stack:

- [ ] Verify health endpoint responds after deployment
- [ ] Check startup logs for FK violation warnings (expected: 1 orphaned record)
- [ ] Confirm CI passes with new audit gates before merge
- [ ] Monitor for any new log patterns in first 30 minutes
- [ ] Verify dead-man check continues to pass

## 8. Verdict

**PASS** — No monitoring regressions. CI audit gates strengthened. All changes are additive.
