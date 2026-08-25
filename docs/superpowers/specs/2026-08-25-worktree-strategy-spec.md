# Worktree Strategy Specification

**Status:** Draft
**Date:** 2026-08-25

---

## Authorization Boundary

```
No production migration is authorized by this workflow.
No enhanced-provider activation is authorized by this workflow.
No blockchain operation is part of this workflow.
```

---

## Problem

Parallel workstreams operating on the same repository can conflict when they modify the same files concurrently. Without a defined strategy for worktree usage, naming, file ownership, and cleanup, concurrent development risks merge conflicts, lost work, and inconsistent repository state.

## Goals

1. Define worktree naming conventions that are predictable and self-documenting.
2. Establish file ownership boundaries so that each workstream has exclusive write access to specific file sets, preventing conflicts.
3. Define cleanup protocol for worktree lifecycle management (creation, completion, removal).
4. Integrate the strategy with the using-git-worktrees skill.
5. Define six workstream types with non-overlapping file ownership.

## Non-Goals

- Changing the git branching strategy (main, feature branches, etc.).
- Implementing automated conflict detection tooling.
- Defining CI behavior for worktree branches.
- Modifying the repository directory structure to accommodate worktrees.

## Scope

### Worktree Location

All worktrees are created under `.claude/worktrees/` within the repository root, following the convention established by the using-git-worktrees skill.

### Worktree Naming Convention

```
<workstream-type>-<date>-<short-description>
```

Examples:
- `impl-2026-08-25-payment-refund`
- `tests-2026-08-25-payment-refund`
- `review-2026-08-25-payment-refund`
- `docs-2026-08-25-phase28-closeout`

The workstream type prefix must be one of the six defined types below.

### Six Workstream Definitions

#### 1. Discovery (`disc-`)

- **Purpose:** Research, investigation, feasibility analysis. Read-only exploration of the codebase.
- **Owned files (write access):**
  - `docs/superpowers/specs/*.md` (new spec files only)
  - `docs/superpowers/plans/*.md` (new plan files only)
- **Forbidden files:** All source code, tests, configuration files.
- **Lifecycle:** Short-lived. Created at project kickoff, removed after spec approval.

#### 2. Implementation (`impl-`)

- **Purpose:** Writing production source code that implements a specification.
- **Owned files (write access):**
  - `src/**/*.ts` / `packages/*/src/**/*.ts`
  - `package.json`, `tsconfig.json` (dependency additions only)
  - Database migration files
  - Docker and build configuration files
- **Forbidden files:** Test files (`*.test.ts`, `*.spec.ts`), documentation (`docs/`), review files.
- **Lifecycle:** One per implementation phase. Created when implementation begins, merged and removed on phase completion.

#### 3. Tests (`tests-`)

- **Purpose:** Writing and updating test suites for implemented features.
- **Owned files (write access):**
  - `**/*.test.ts` (unit and integration tests)
  - `e2e/**/*.spec.ts` (E2E tests)
  - Test fixtures and test utilities (`__tests__/`, `test/`, `fixtures/`)
  - `vitest.config.ts`, `playwright.config.ts` (test configuration)
- **Forbidden files:** Production source code (`src/`), documentation, review files.
- **Lifecycle:** Created after implementation phase begins (can run in parallel once interfaces are defined). Merged after all tests pass.

#### 4. Readiness (`ready-`)

- **Purpose:** Pre-deployment verification, smoke testing, environment validation.
- **Owned files (write access):**
  - `scripts/deploy.sh`, `scripts/smoke-test.sh`, `scripts/rollback.sh`
  - `.env.example` (environment documentation)
  - `docker-compose*.yml` (deployment configuration)
- **Forbidden files:** Production source code, tests, documentation, review files.
- **Lifecycle:** Created before deployment milestones. Removed after successful deployment verification.

#### 5. Documentation (`docs-`)

- **Purpose:** Writing closeout documents, updating specs, maintaining project documentation.
- **Owned files (write access):**
  - `docs/**/*.md`
  - `README.md`
  - `CHANGELOG.md`
- **Forbidden files:** All source code, tests, configuration files, review files.
- **Lifecycle:** Created at phase completion for closeout documentation. Can run in parallel with any other workstream.

#### 6. Review (`review-`)

- **Purpose:** Code review, security audit, quality assessment. Produces review findings.
- **Owned files (write access):**
  - `docs/superpowers/reviews/*.md` (review finding files only)
- **Forbidden files:** All source code, tests, specs, plans, configuration files. The review workstream is read-only for everything except its own review output files.
- **Lifecycle:** Created after implementation and test phases complete. Removed after findings are dispositioned.

### Non-Overlapping File Ownership Rules

The file ownership boundaries are designed so that no two concurrent workstreams can write to the same file. The rules are:

1. **Exclusive write:** Each file type is owned by exactly one workstream type. No file should appear in the "owned files" list of more than one workstream.
2. **Read access:** All workstreams have read access to all files in the repository.
3. **Conflict resolution:** If a workstream needs to modify a file outside its ownership boundary, it must:
   a. Document the need in its workstream notes.
   b. Wait for the owning workstream to complete and merge.
   c. Rebase onto the updated main branch before proceeding.
4. **Shared file exceptions:** `package.json` and `package-lock.json` are shared between Implementation and Readiness. When both are active, Implementation has priority. Readiness must rebase after Implementation merges.

### Ownership Matrix

| File Pattern | disc | impl | tests | ready | docs | review |
|-------------|------|------|-------|-------|------|--------|
| `src/**/*.ts` | - | WRITE | - | - | - | - |
| `**/*.test.ts` | - | - | WRITE | - | - | - |
| `e2e/**/*.spec.ts` | - | - | WRITE | - | - | - |
| `docs/superpowers/specs/*.md` | WRITE | - | - | - | - | - |
| `docs/superpowers/plans/*.md` | WRITE | - | - | - | - | - |
| `docs/superpowers/reviews/*.md` | - | - | - | - | - | WRITE |
| `docs/**/*.md` (other) | - | - | - | - | WRITE | - |
| `scripts/*.sh` | - | - | - | WRITE | - | - |
| `docker-compose*.yml` | - | - | - | WRITE | - | - |
| `package.json` | - | WRITE* | - | WRITE* | - | - |
| Migration files | - | WRITE | - | - | - | - |
| Test config files | - | - | WRITE | - | - | - |

*`package.json` shared with priority to Implementation (see Shared file exceptions above).

### Cleanup Protocol

#### Creation

1. Use the using-git-worktrees skill or `git worktree add` with the naming convention above.
2. Branch name matches worktree name.
3. Base branch is always the current `HEAD` of `main` (or the relevant integration branch).

#### During Work

1. Commit frequently within the worktree.
2. Do not modify files outside the ownership boundary.
3. If the base branch advances, rebase the worktree branch before merging.

#### Completion

1. Ensure all tests pass in the worktree (if applicable to the workstream type).
2. Merge the worktree branch into the base branch (fast-forward preferred, merge commit acceptable).
3. Remove the worktree: `git worktree remove <path>`.
4. Delete the worktree branch if fully merged: `git branch -d <branch-name>`.
5. Verify `.claude/worktrees/` does not contain stale entries.

#### Abandoned Worktrees

1. If a worktree is abandoned (work cancelled, approach changed), remove it without merging.
2. Use `git worktree remove --force <path>` if the worktree has uncommitted changes.
3. Delete the associated branch: `git branch -D <branch-name>`.
4. Document the abandonment reason in the phase notes.

### Integration with Using-Git-Worktrees Skill

The using-git-worktrees skill automates worktree creation and cleanup. This specification extends its behavior:

1. The skill should use the naming convention defined above when creating worktrees.
2. On session exit, the skill prompts to keep or remove the worktree — this aligns with the cleanup protocol.
3. The skill creates worktrees under `.claude/worktrees/`, consistent with this specification.
4. Workstream type should be passed as the worktree name parameter to the skill.

## Acceptance Criteria

1. Worktree naming convention is defined with a `<type>-<date>-<description>` format and six valid type prefixes.
2. Six workstream types (Discovery, Implementation, Tests, Readiness, Documentation, Review) are defined with purpose, owned files, and forbidden files.
3. File ownership boundaries are non-overlapping — no file pattern appears as writable by more than one workstream type (with the documented `package.json` exception and its priority rule).
4. The ownership matrix provides a quick-reference table mapping file patterns to workstream write access.
5. Cleanup protocol covers creation, active work, completion, and abandonment scenarios.
6. Integration with the using-git-worktrees skill is documented, including naming, lifecycle, and session behavior.
7. Conflict resolution rules are defined for cases where a workstream needs to modify files outside its boundary.
