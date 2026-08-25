# Development Workflow — TODO List

**Date:** 2026-08-25
**Plan:** `2026-08-25-development-workflow-plan.md`

---

| ID | Priority | Objective | Classification | Status |
|----|----------|-----------|----------------|--------|
| TODO-001 | P0 | Assess LMS repo state | Read-only | VERIFIED |
| TODO-002 | P0 | Assess AmmaWallet repo state | Read-only | VERIFIED |
| TODO-003 | P0 | Inspect Docker volumes and mounts | Read-only | VERIFIED |
| TODO-004 | P0 | Inspect backup scripts and schedules | Read-only | VERIFIED |
| TODO-005 | P0 | Brainstorm workflow design | Read-only | VERIFIED |
| TODO-006 | P0 | Create workflow specification | Mutating (docs) | VERIFIED |
| TODO-007 | P0 | Create loop design specification | Mutating (docs) | VERIFIED |
| TODO-008 | P0 | Create test strategy specification | Mutating (docs) | IN PROGRESS |
| TODO-009 | P0 | Create review process specification | Mutating (docs) | IN PROGRESS |
| TODO-010 | P0 | Create worktree strategy specification | Mutating (docs) | IN PROGRESS |
| TODO-011 | P0 | Create implementation plan | Mutating (docs) | VERIFIED |
| TODO-012 | P0 | Create TODO list | Mutating (docs) | VERIFIED |
| TODO-013 | P1 | Create test matrix | Mutating (docs) | IN PROGRESS |
| TODO-014 | P1 | Create decision log | Mutating (docs) | IN PROGRESS |
| TODO-015 | P1 | Create approval gates document | Mutating (docs) | IN PROGRESS |
| TODO-016 | P1 | Create Mermaid diagrams (7) | Mutating (docs) | IN PROGRESS |
| TODO-017 | P1 | Create loop plan | Mutating (docs) | IN PROGRESS |
| TODO-018 | P1 | Independent review | Read-only | NOT STARTED |
| TODO-019 | P0 | Verification before completion | Read-only | NOT STARTED |
| TODO-020 | P0 | Present approval matrix | Read-only | NOT STARTED |

---

## Detailed TODO Items

### TODO-001: Assess LMS Repo State
- **Preconditions:** None
- **Commands:** `cd /home/webadmin/web-stack/html/LMS-AmmaWallet && git status --short && git branch --show-current && git log --oneline -10`
- **Target:** LMS-AmmaWallet repo
- **Expected Evidence:** Branch=main, HEAD=ab44dae, synced with remote, 17 untracked doc files
- **Owner:** Coordinator
- **Status:** VERIFIED
- **Completion Criteria:** Git state documented

### TODO-002: Assess AmmaWallet Repo State
- **Preconditions:** None
- **Commands:** `cd /home/webadmin/web-stack/html/amma-wallet && git status --short && git branch --show-current && git log --oneline -10`
- **Target:** AmmaWallet repo
- **Expected Evidence:** Branch=main, HEAD=87b8c2c, synced with remote, clean tree, 1 stale worktree
- **Owner:** Coordinator
- **Status:** VERIFIED
- **Completion Criteria:** Git state documented

### TODO-003: Inspect Docker Volumes
- **Preconditions:** None
- **Commands:** `docker ps`, `docker volume inspect lms-ammawallet_lms-data`, `docker inspect lms-api --format '{{json .Mounts}}'`
- **Target:** Docker engine (read-only)
- **Expected Evidence:** LMS DB at `/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db`, WAL mode active (-shm/-wal files present)
- **Owner:** Coordinator
- **Status:** VERIFIED
- **Completion Criteria:** Volume paths and WAL mode confirmed

### TODO-004: Inspect Backup Scripts
- **Preconditions:** None
- **Commands:** `cat /home/webadmin/web-stack/backup_lms_db.sh`, `crontab -l`, `ls -la /home/webadmin/backups/`
- **Target:** Backup infrastructure (read-only)
- **Expected Evidence:** LMS backup uses SQLite .backup API, runs daily 03:00, 7-day retention, integrity checks pass
- **Owner:** Coordinator
- **Status:** VERIFIED
- **Completion Criteria:** Backup method, schedule, retention, and integrity documented

### TODO-005: Brainstorm Workflow Design
- **Preconditions:** TODO-001 through TODO-004
- **Target:** Decision log
- **Expected Evidence:** Option A+C selected, rationale documented
- **Owner:** Coordinator
- **Status:** VERIFIED
- **Completion Criteria:** Decision log entry created

### TODO-006–010: Create Specifications
- **See:** Task 3 in implementation plan
- **Target:** `docs/superpowers/specs/`
- **Owner:** Documentation workstream

### TODO-011–017: Create Plans, TODOs, Diagrams
- **See:** Tasks 4-6 in implementation plan
- **Target:** `docs/superpowers/plans/` and `docs/superpowers/diagrams/`
- **Owner:** Documentation workstream

### TODO-018: Independent Review
- **Preconditions:** TODO-006 through TODO-017
- **Classification:** Read-only
- **Target:** All created artifacts
- **Expected Evidence:** Review report
- **Owner:** Review workstream
- **Status:** NOT STARTED

### TODO-019: Verification Before Completion
- **Preconditions:** TODO-018
- **Classification:** Read-only
- **Target:** All artifacts + production state
- **Expected Evidence:** Every item classified VERIFIED/LIKELY/UNKNOWN/BLOCKED/NOT AVAILABLE
- **Owner:** Coordinator
- **Status:** NOT STARTED

### TODO-020: Present Approval Matrix
- **Preconditions:** TODO-019
- **Classification:** Read-only
- **Target:** Final response
- **Expected Evidence:** Approval matrix with all gates
- **Owner:** Coordinator
- **Status:** NOT STARTED
