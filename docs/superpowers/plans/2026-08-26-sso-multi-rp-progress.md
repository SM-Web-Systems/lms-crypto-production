# SSO Multi-RP Core — Progress Ledger

**Plan:** `docs/superpowers/plans/2026-08-26-sso-multi-rp-core.md`
**Branch:** `feature/sso-multi-rp-core`
**Worktree:** `/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core`
**Main checkout:** `/home/webadmin/web-stack/html/amma-wallet` (DO NOT commit here)

---

## CRITICAL: Worktree Isolation Rule

**Every subagent MUST work and commit exclusively inside the worktree directory:**
```
/home/webadmin/web-stack/html/amma-wallet/.claude/worktrees/sso-multi-rp-core
```

**NEVER `cd` to or commit in the main checkout** (`/home/webadmin/web-stack/html/amma-wallet`).
Commits made in the main checkout land on `main`, not the feature branch — this
pollutes the production branch with in-progress implementation code.

### Incident: Stray Commit on Main (2026-08-26, Session 1)

During the first session, a subagent committed the Task 1 schema changes directly
to `main` instead of the worktree's `feature/sso-multi-rp-core` branch. The commit
had to be identified and the situation diagnosed in Session 2 before work could
resume. Root cause: the subagent was given the repo path but not explicitly told
to work inside the worktree directory. Resolution: commit was re-done correctly
in the worktree (9cc15b1). Main was found clean at 2d03ba3 (docs only).

**Prevention for Tasks 2–7:** Each subagent prompt MUST include:
1. The exact worktree path as `cd` target
2. An explicit instruction: "Work and commit ONLY in this directory"
3. Never reference the main checkout path

---

## Task Status

| Task | Description | Status | Commit | Tests |
|---|---|---|---|---|
| 1 | Schema — oauth_clients, token_registry, consent_records | DONE | `9cc15b1` | 3/3 PASS |
| 2 | ES256 Signing Service + JWKS Output | DONE | `075a6ba` | 7/7 PASS |
| 3 | OAuth Client Service (RP Registry) | DONE | `bf29f6d` | 11/11 PASS |
| 4 | Token Registry Service (JTI Lifecycle) | DONE | `70622b1` | 10/10 PASS |
| 5 | Consent Service with Audit Trail | DONE | `7fdd87a` | 7/7 PASS |
| 6 | OAuth Routes (/authorize, /token, JWKS) | DONE | `e1c9201` | 11/11 PASS |
| 7 | Legacy Regression Verification | DONE | `90c64ae` | 6/6 PASS |

**Full suite after Task 1:** 495/495 PASS (492 existing + 3 new)
**Full suite after Task 2:** 502/502 PASS (+7 ES256 signing tests)
**Full suite after Tasks 3-5:** 530/530 PASS (+11 client + 10 registry + 7 consent)
**Full suite after Task 6:** 541/541 PASS (+11 OAuth route tests)
**Full suite FINAL (all 7 tasks):** 547/547 PASS (492 original + 55 new OAuth tests)

---

## Session Log

### Session 2 — 2026-08-26

- Verified main at `2d03ba3` (clean, docs only)
- Verified feature branch at `9cc15b1` (Task 1 schema commit, correct location)
- Confirmed worktree exists at `.claude/worktrees/sso-multi-rp-core`
- Ran Task 1 tests: 3/3 PASS
- Ran full suite: 495/495 PASS
- Created this progress ledger with worktree isolation rule
- Proceeding to Task 2
- Task 2 complete: `075a6ba` — ES256 signing + JWKS (7 tests)
- Task 3 complete: `bf29f6d` — RP registry service (11 tests)
- Tasks 4+5 dispatched in parallel (no file overlap)
- Task 4 complete: `70622b1` — Token registry (10 tests)
- Task 5 complete: `7fdd87a` — Consent service (7 tests)
- Verified 530/530 pass after Tasks 3-5
- Task 6 complete: `e1c9201` — OAuth routes (11 tests, largest task)
- Task 7 complete: `90c64ae` — Legacy regression (6 tests)
- **ALL 7 TASKS COMPLETE: 547/547 tests, 7 commits, main clean at 2d03ba3**

### Session 3 — 2026-08-26 (cont.)

- Independent security review completed: 14 findings (0 BLOCKER, 2 HIGH, 5 MEDIUM, 4 LOW, 3 NOTE)
- SR-001 (HIGH): Fixed TOCTOU race in markTokenUsed with atomic UPDATE...RETURNING
- SR-002 (HIGH): Added clearKeyCache() + JSDoc documenting restart requirement
- SR-003 (MEDIUM): Added 20/min rate limit on POST /token
- SR-007 (MEDIUM): Fixed redirect URL construction to use new URL()
- SR-011 (LOW): Added grantTypes validation on /token
- Security fixes committed: `33889f5`
- Full suite: 547/547 PASS after fixes
- Legacy SSO: 12/12 PASS unchanged
- Security review document: `docs/superpowers/plans/2026-08-26-sso-multi-rp-security-review.md`
