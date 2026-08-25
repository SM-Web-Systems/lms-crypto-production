# Development Workflow — Test Matrix

**Date:** 2026-08-25

---

## Current Test Baseline

| Repo | Suite | Count | Command | Status |
|------|-------|-------|---------|--------|
| LMS | Backend (vitest) | 1149 | `cd LMS-Server && npx vitest run` | PASS |
| LMS | Frontend (vitest) | 206 | `cd LMS-Frontend && npx vitest run` | PASS |
| LMS | E2E (Playwright) | 14 | `cd e2e && npx playwright test` | PASS |
| AmmaWallet | Backend (vitest) | 492 | `cd packages/backend && npx vitest run` | PASS |
| AmmaWallet | Web App (vitest) | 23 | `cd packages/web-app && npx vitest run` | PASS |

**Total: 1884 tests across 5 suites**

---

## Workflow Test Categories

### WF: Workflow Documentation Tests

| ID | Test | Verifies | Status |
|----|------|----------|--------|
| WF-1 | Workflow steps documented | Spec file exists and contains all phases | VERIFIED |
| WF-2 | Loop structure documented | Loop spec defines cycle, stops, resumption | VERIFIED |
| WF-3 | Test strategy documented | Test strategy spec covers all repos/suites | IN PROGRESS |
| WF-4 | Review process documented | Review spec defines roles, independence, severity | IN PROGRESS |
| WF-5 | Worktree strategy documented | Worktree spec defines naming, ownership, cleanup | IN PROGRESS |
| WF-6 | Approval gates documented | Approval gates doc lists all gates | VERIFIED |

### LOOP: Loop Mechanism Tests

| ID | Test | Verifies | Status |
|----|------|----------|--------|
| LOOP-1 | Loop processes tasks in order | Tasks executed by ID ascending | NOT STARTED |
| LOOP-2 | Loop stops at approval gates | Mutating tasks with approval trigger STOP | NOT STARTED |
| LOOP-3 | Loop stops on test failure | After debug attempts, BLOCKED | NOT STARTED |
| LOOP-4 | Loop skips completed tasks | VERIFIED tasks skipped on resume | NOT STARTED |
| LOOP-5 | Loop re-evaluates blocked | BLOCKED tasks checked for resolved deps | NOT STARTED |
| LOOP-6 | Loop output secret-free | No credentials in log output | NOT STARTED |
| LOOP-7 | Loop dispatches reviewer | Task reviewer called after each GREEN | NOT STARTED |
| LOOP-8 | Loop runs VBC at end | verification-before-completion invoked | NOT STARTED |

### REV: Review Tests

| ID | Test | Verifies | Status |
|----|------|----------|--------|
| REV-1 | Review process documented | Spec exists with roles and severity | IN PROGRESS |
| REV-2 | Reviewer is independent | Reviewer ≠ implementer | NOT STARTED |
| REV-3 | Findings are recorded | Review report with findings, severity | NOT STARTED |
| REV-4 | Disposition is clear | Each finding has accept/fix/defer | NOT STARTED |

### WT: Worktree Tests

| ID | Test | Verifies | Status |
|----|------|----------|--------|
| WT-1 | Worktrees are isolated | Separate directories, separate branches | NOT STARTED |
| WT-2 | No file overlap | Each workstream owns distinct paths | NOT STARTED |
| WT-3 | Cleanup works | Worktrees removed after merge | NOT STARTED |

### BK: Backup Verification Tests

| ID | Test | Verifies | Status |
|----|------|----------|--------|
| BK-1 | LMS backup targets Docker volume | Source = `/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db` | VERIFIED |
| BK-2 | Backup uses SQLite .backup API | Not raw cp | VERIFIED |
| BK-3 | Backup integrity check passes | `PRAGMA integrity_check = ok` | VERIFIED |
| BK-4 | Retention policy enforced | 7 backups retained | VERIFIED |
| BK-5 | Backup permissions restrictive | 600 owner-only | VERIFIED |
| BK-6 | AmmaWallet backup runs | Daily 03:30 | VERIFIED |
| BK-7 | SM Web DB backup runs | Daily 03:15, WAL-safe, sha256 sidecar | VERIFIED |
