# Loop Design Specification

**Status:** ACTIVE
**Date:** 2026-08-25

```
No production migration is authorized by this workflow.
No enhanced-provider activation is authorized by this workflow.
No blockchain operation is part of this workflow.
```

---

## Problem

Development sessions require constant prompting to proceed through the spec → test → implement → verify cycle. A safe, repeatable `/loop` would allow autonomous progress on well-defined work items while stopping at safety boundaries.

## Goals

1. Define a `/loop` mechanism that runs without constant prompting
2. Enumerate all safe (allowed) and unsafe (blocked) actions
3. Define clear stop conditions with named constants
4. Enable loop resumption from last checkpoint
5. Ensure no production state is modified without explicit approval

## Non-Goals

- Fully autonomous deployment
- Unsupervised production changes
- Infinite loops without human checkpoints

---

## Loop Architecture

### Entry Point
```
/loop [plan-file] [--from=TASK_ID] [--dry-run]
```

- `plan-file`: Path to the implementation plan (default: most recent in `docs/superpowers/plans/`)
- `--from`: Resume from a specific task ID
- `--dry-run`: Report what would be done without executing

### Loop Cycle

```
FOR each task in plan (ordered by ID):
  IF task.status == COMPLETE or VERIFIED:
    SKIP

  IF task.preconditions not met:
    IF resolvable: resolve
    ELSE: mark BLOCKED, continue to next

  IF task.classification == MUTATING and task.requires_approval:
    STOP — "Approval required for: {task.subject}"

  SET task.status = IN_PROGRESS

  # TDD Phase
  WRITE failing test for task
  RUN test → confirm RED
  IMPLEMENT minimal code
  RUN test → confirm GREEN
  IF test FAILS after implementation:
    INVOKE systematic-debugging
    IF still FAILS after 2 attempts:
      SET task.status = BLOCKED
      CONTINUE to next task

  # Review Phase
  DISPATCH task-reviewer subagent
  IF Critical findings:
    FIX findings
    RE-REVIEW (max 2 cycles)
    IF still Critical:
      SET task.status = BLOCKED
      CONTINUE

  SET task.status = VERIFIED
  UPDATE progress ledger

END FOR

# Final Review
DISPATCH broad code-reviewer subagent
INVOKE verification-before-completion
PRESENT approval matrix
STOP — "All tasks complete. Awaiting approval."
```

### Stop Conditions

| Constant | Trigger |
|----------|---------|
| `STOP_ON_WRONG_WORKFLOW` | Target mismatch detected |
| `STOP_ON_LOOP_FAILURE` | Loop mechanism itself fails |
| `STOP_ON_RESTORE_FAILURE` | Restore rehearsal fails |
| `STOP_ON_PRODUCTION_CHANGE` | Production state modification attempted |
| `STOP_ON_SECRET_LEAK` | Credential in output detected |
| `STOP_ON_BLOCKCHAIN_ACTIVITY` | Any chain operation attempted |
| `STOP_ON_SERVICE_RESTART` | Container/service restart attempted |
| `STOP_ON_TEST_FAILURE` | Tests fail after debug attempts exhausted |
| `STOP_ON_UNAUTHORIZED_WRITE` | Write to unauthorized path |
| `STOP_BEFORE_PRODUCTION_MIGRATION` | Migration gate reached |
| `STOP_BEFORE_PROVIDER_ACTIVATION` | Provider activation gate reached |

### Allowed Actions (Safe — No Approval Needed)

- Git status, log, diff, branch checks
- Read files (any repo)
- Run tests (vitest, playwright)
- Static analysis (tsc --noEmit, eslint)
- Write/edit source code in worktrees
- Create specifications, plans, TODOs
- Create/update Mermaid diagrams
- Docker read-only inspection (ps, inspect, volume inspect)
- Backup verification (read-only)
- Schema/row-count comparisons on disposable copies
- Secret scans (grep for patterns, NOT decryption)

### Blocked Actions (Require Approval)

- `git commit` / `git push`
- Production migration execution
- Production service restart/rebuild
- Production `.env` modification
- Enhanced provider activation (`NFT_PROVIDER=enhanced`)
- Auto-mint enablement (`NFT_AUTO_MINT_ENABLED=true`)
- Contract invocation / NFT minting
- Database restore over production
- Credential decryption
- cron schedule modification

### Resumption

The loop tracks progress in the TODO document:
- Each task has a status field
- On resume, the loop reads the TODO and skips COMPLETE/VERIFIED tasks
- BLOCKED tasks are re-evaluated (preconditions may have changed)
- IN_PROGRESS tasks are restarted from the beginning of the TDD cycle

---

## Test Strategy for the Loop

| Test | Verifies |
|------|----------|
| LOOP-1 | Loop processes tasks in order |
| LOOP-2 | Loop stops at approval gates |
| LOOP-3 | Loop stops on test failure after debug |
| LOOP-4 | Loop skips completed tasks on resume |
| LOOP-5 | Loop re-evaluates blocked tasks |
| LOOP-6 | Loop logs output without secrets |
| LOOP-7 | Loop dispatches reviewer after each task |
| LOOP-8 | Loop runs verification-before-completion at end |

---

## Review Process

| Step | Actor | Scope |
|------|-------|-------|
| Self-review | Implementer subagent | Own code against spec |
| Task review | Reviewer subagent | Spec compliance + quality |
| Broad review | Code reviewer subagent | Entire branch diff |
| Independence | Guaranteed | Reviewer ≠ implementer |

---

## Worktree Integration

When the loop creates a worktree:
1. Branch from current HEAD
2. Name: `worktree-{feature}-{date}`
3. Isolated file ownership per workstream
4. Cleanup: after merge or on explicit request

---

## Acceptance Criteria

- [ ] Loop can process a plan file from start to finish
- [ ] Loop stops at every approval gate
- [ ] Loop stops on production-affecting actions
- [ ] Loop resumes from last checkpoint
- [ ] Loop logs are free of secrets
- [ ] Loop invokes TDD cycle for each task
- [ ] Loop dispatches independent reviewer
- [ ] Loop runs verification-before-completion

## Required Approvals

- Loop activation on production plans: explicit approval
- Any commit/push from loop: explicit approval
