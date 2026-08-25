# Development Workflow Specification

**Status:** ACTIVE
**Date:** 2026-08-25
**Applies to:** All SM-Web-Systems repositories (LMS-AmmaWallet, AmmaWallet, SM-Web-Systems-Website)

```
No production migration is authorized by this workflow.
No enhanced-provider activation is authorized by this workflow.
No blockchain operation is part of this workflow.
```

---

## Problem

Development across SM-Web-Systems repos has been effective but ad-hoc — each session re-discovers patterns, skills, and safety boundaries. There is no repeatable loop that can run with minimal intervention while maintaining spec-driven, test-backed quality guarantees.

## Goals

1. Establish a repeatable, spec-driven development loop that reduces human intervention
2. Enforce TDD (RED-GREEN-REFACTOR) for all implementation work
3. Use isolated git worktrees per workstream to prevent conflicts
4. Gate all production-affecting changes behind explicit approval
5. Produce Mermaid diagrams that clarify architecture and flows
6. Integrate independent code review before completion
7. Generate actionable, iterative TODO lists with clear statuses

## Non-Goals

- Changing production database schemas
- Activating enhanced NFT providers
- Modifying production `.env` files or container configurations
- Automating deployment without human approval
- Replacing existing backup infrastructure

## Scope

### In Scope
- Workflow documentation and specifications
- Loop design and implementation
- Test strategy across repos
- Review process definition
- Worktree isolation strategy
- Approval gate framework
- Mermaid diagram creation

### Out of Scope
- Production migrations
- Service restarts
- Blockchain operations
- Credential management
- Provider activation

---

## Workflow Steps

### Phase 1: Discovery
1. Read all applicable skills (`using-superpowers` → skill check)
2. Assess repository state (git status, branch, HEAD, remote sync)
3. Inspect Docker volumes and database targets (read-only)
4. Inspect backup scripts and schedules
5. Identify working tree cleanliness

### Phase 2: Brainstorming
1. Invoke `brainstorming` skill before any creative work
2. Compare approaches (spec-first vs ad-hoc vs subagent-driven)
3. Document selected method and rejected alternatives
4. Record decision rationale in decision log

### Phase 3: Specification
1. Invoke `writing-plans` skill
2. Create dated spec files in `docs/superpowers/specs/`
3. Include: status, date, problem, goals, non-goals, scope, acceptance criteria
4. State authorization boundaries prominently

### Phase 4: Planning
1. Create implementation plan in `docs/superpowers/plans/`
2. Create TODO list with IDs, priorities, preconditions, exact files/commands
3. Create test matrix
4. Create approval gates document
5. Each TODO classified as read-only or mutating

### Phase 5: TDD Implementation
1. Invoke `test-driven-development` skill
2. Write failing tests FIRST
3. Implement minimal code to pass tests
4. Run tests to verify GREEN
5. Refactor while keeping GREEN
6. Commit at each GREEN state

### Phase 6: Worktree Isolation
1. Invoke `using-git-worktrees` skill
2. Create isolated worktree per workstream
3. Non-overlapping file ownership between workstreams
4. Clean up worktrees after merge

### Phase 7: Loop Execution
1. Run the `/loop` — spec → test → implement → verify cycle
2. Stop at approval gates
3. Stop on any failure
4. Log non-secret output
5. Resume from last checkpoint

### Phase 8: Review
1. Invoke `requesting-code-review` skill
2. Independent reviewer examines all changes
3. Record findings with severity and disposition
4. Address Critical/Important findings before completion

### Phase 9: Verification
1. Invoke `verification-before-completion` skill
2. Run all tests, static analysis, secret scans
3. Verify production untouched
4. Classify every result: VERIFIED / LIKELY / UNKNOWN / BLOCKED / NOT AVAILABLE
5. Prepare approval request

### Phase 10: Approval & Stop
1. Present approval matrix
2. Wait for explicit authorization before any production-affecting action
3. Never commit/push without separate approval

---

## Loop Structure

```
LOOP:
  1. Check TODO list for next IN PROGRESS or NOT STARTED item
  2. If item is mutating and requires approval → STOP
  3. Write failing test for the item
  4. Implement minimal fix
  5. Run tests
  6. If tests FAIL → invoke systematic-debugging, then retry
  7. If tests PASS → mark item READY FOR REVIEW
  8. Run review subagent
  9. If review finds Critical issues → fix and re-review
  10. Mark item VERIFIED
  11. GOTO 1

STOP CONDITIONS:
  - STOP_ON_WRONG_WORKFLOW
  - STOP_ON_LOOP_FAILURE
  - STOP_ON_RESTORE_FAILURE
  - STOP_ON_PRODUCTION_CHANGE
  - STOP_ON_SECRET_LEAK
  - STOP_ON_BLOCKCHAIN_ACTIVITY
  - STOP_ON_SERVICE_RESTART
  - STOP_ON_TEST_FAILURE (after debug attempt)
  - STOP_ON_UNAUTHORIZED_WRITE
  - STOP_BEFORE_PRODUCTION_MIGRATION
  - STOP_BEFORE_PROVIDER_ACTIVATION
  - STOP_ON_CONTRACT_INVOCATION
  - STOP_ON_MINT
```

---

## Test Strategy

### Unit Tests
- All new code must have corresponding unit tests
- Tests written BEFORE implementation (TDD)
- LMS: vitest (`cd LMS-Server && npx vitest run` / `cd LMS-Frontend && npx vitest run`)
- AmmaWallet: vitest (packages/backend + packages/web-app)

### Integration Tests
- E2E tests for critical paths (LMS: Playwright `cd e2e && npx playwright test`)
- API endpoint tests for new routes

### Workflow Tests
- Verify documentation completeness
- Verify loop stop conditions
- Verify approval gates are in place
- Verify worktree isolation

---

## Review Process

1. **Self-review:** Implementer checks own work against spec
2. **Task review:** Reviewer subagent checks spec compliance + code quality
3. **Broad review:** Final code reviewer examines entire branch
4. **Independence:** Reviewer must not have written the implementation

---

## Worktree Strategy

| Workstream | Owns | Worktree Name |
|------------|------|---------------|
| A: Discovery | Workflow, loop, approval verification | `worktree-workflow-specs` |
| B: Implementation | Workflow script/API, retention | `worktree-workflow-impl` |
| C: Tests | TDD, integrity, permissions tests | `worktree-workflow-tests` |
| D: Readiness | Updated plan, approval gates | `worktree-workflow-readiness` |
| E: Documentation | Specs, plans, TODOs, diagrams | `worktree-workflow-docs` |
| F: Review | Independent review (read-only) | `worktree-review` |

**Rules:**
- No overlapping file ownership
- No production migration from any worktree
- No service restart without approval
- No commit/push without approval

---

## Approval Gates

| Gate | Trigger | Approval Required |
|------|---------|-------------------|
| G1 | Workflow script activation | Yes — if changes production scheduling |
| G2 | Production service restart | Always |
| G3 | Production migration | Always |
| G4 | Enhanced provider activation | Always |
| G5 | Commit/push | Always (unless pre-authorized) |
| G6 | Production restore | Always |
| G7 | Blockchain operation | Always |

---

## Acceptance Criteria

- [ ] All mandatory skills located, read, and used with evidence
- [ ] Repository and deployment state assessed
- [ ] Brainstorming decisions documented
- [ ] Specifications created for workflow, loop, tests, review, worktrees
- [ ] Plans and TODOs created with full metadata
- [ ] Mermaid diagrams created and validated
- [ ] Loop designed with stop conditions
- [ ] Worktree strategy defined with non-overlapping ownership
- [ ] Independent review recorded
- [ ] Verification-before-completion executed
- [ ] Approval matrix presented
- [ ] Production untouched

## Required Approvals

- Workflow activation: explicit approval
- Commit/push: explicit approval
- Any production change: explicit approval
