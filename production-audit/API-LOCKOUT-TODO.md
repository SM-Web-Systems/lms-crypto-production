# API Lockout — TODO Tracker

| ID | System | Description | Priority | Status | Spec | Test | Evidence |
|---|---|---|---|---|---|---|---|
| LOCKOUT-001 | LMS | Scope readLimiter to /verify/* only | CRITICAL | PENDING | API-LOCKOUT-01 | LOCKOUT-AW-001–003 | nginx logs 11:31 UTC |
| LOCKOUT-002 | LMS | Update ogPages.ts route path | CRITICAL | PENDING | API-LOCKOUT-01 | LOCKOUT-AW-001 | — |
| LOCKOUT-003 | LMS | Add regression test: API routes not affected by readLimiter | HIGH | PENDING | API-LOCKOUT-01 | LOCKOUT-LMS-001 | — |
| LOCKOUT-004 | LMS | Verify ogPages still rate-limited after fix | MEDIUM | PENDING | API-LOCKOUT-01 | LOCKOUT-LMS-002 | — |
| LOCKOUT-005 | LMS | Deploy and verify production behavior | MEDIUM | PENDING | API-LOCKOUT-01 | — | — |
