# Development Workflow — Decision Log

**Date:** 2026-08-25

---

## Decision 1: Workflow Method

**Question:** Which development workflow approach to adopt?

### Options Considered

| Option | Description | Advantages | Risks |
|--------|-------------|------------|-------|
| **A: Spec-first, test-driven, looped** | Create specs → write failing tests → implement → verify → loop | Clear requirements, tests guard correctness, loop reduces intervention | Requires discipline to keep specs current |
| **B: Ad-hoc, prompt-driven** | Implement as prompted, document later | Fast for small changes | Inconsistent, hard to review, more intervention |
| **C: Subagent-driven, parallel workstreams** | Use subagents for specs, tests, impl, review | Parallel progress, separation of concerns | Requires coordination, risk of file overlap |

### Decision: Option A + C Hybrid

**Rationale:** Option A provides the safety and quality guarantees (specs, TDD, verification gates). Option C provides the parallelism and context isolation (fresh subagent per task, no context pollution). Combined, they give spec-driven quality with subagent-driven speed.

Option B was rejected because it doesn't scale — each session reinvents patterns and there's no repeatable loop. The "fast for small changes" advantage doesn't justify the accumulated technical debt and inconsistency.

### How This Reduces Intervention

1. **Specs** define work upfront — no back-and-forth clarification
2. **TDD** catches errors immediately — no manual testing cycles
3. **Loop** processes tasks autonomously — pauses only at approval gates
4. **Subagents** have fresh context — no confusion from accumulated state
5. **Review** happens automatically — no manual review requests
6. **Stop conditions** prevent runaway — safe to leave running

---

## Decision 2: Backup Target Discovery

**Question:** Is the LMS backup targeting the correct database?

### Finding

The LMS backup script (`backup_lms_db.sh`) was already remediated on 2026-08-20:
- **Source:** `/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db` (Docker volume)
- **Method:** SQLite `.backup` API (WAL-safe)
- **Schedule:** Daily at 03:00
- **Retention:** 7 backups
- **Integrity:** `PRAGMA integrity_check` on both source and backup
- **Old path:** `/home/webadmin/web-stack/html/LMS-Server/data/student_ms.db` was the wrong target (old bind mount) — already fixed

### Decision: No remediation needed

The backup is correct. The old `lms-db` backups (356KB files from the wrong target) exist at `/home/webadmin/backups/lms-db/` but are no longer written to.

---

## Decision 3: Worktree Strategy

**Question:** How to isolate parallel workstreams?

### Decision: Functional isolation with file ownership

Each workstream owns specific directories:
- **Specs workstream** → `docs/superpowers/specs/`
- **Plans workstream** → `docs/superpowers/plans/`
- **Diagrams workstream** → `docs/superpowers/diagrams/`
- **Implementation** → `src/` (when implementing features)
- **Tests** → `test/` or `__tests__/` (when writing tests)
- **Review** → read-only access to all

For this initial workflow setup, worktrees are not needed because all changes are documentation-only with no file ownership conflicts. Worktrees become essential when implementing code across workstreams.

---

## Decision 4: Loop Resumption

**Question:** How does the loop resume after interruption?

### Decision: TODO-driven state

The loop reads the TODO document to determine current state. Each task has a status field (`NOT STARTED`, `IN PROGRESS`, `BLOCKED`, `READY FOR REVIEW`, `VERIFIED`, `COMPLETE`). On resume:
- `COMPLETE`/`VERIFIED` tasks are skipped
- `IN PROGRESS` tasks restart from the beginning of their TDD cycle
- `BLOCKED` tasks are re-evaluated
- `NOT STARTED` tasks proceed normally

This is simpler and more transparent than checkpoint files or database state.
