# Branch and PR Workflow

## Branch Naming

| Prefix | Purpose |
|--------|---------|
| `feat/<feature>` | New feature or enhancement |
| `fix/<issue>` | Bug fix |
| `docs/<topic>` | Documentation-only change |
| `chore/<task>` | Maintenance, dependency updates, cleanup |

## Feature Lifecycle

1. Update local main: `git switch main && git pull --ff-only origin main`.
2. Create branch: `git switch -c feat/<feature>`.
3. Keep work scoped to one logical change.
4. Commit with meaningful messages. Use explicit file staging (`git add <file>`), never `git add .`.
5. Run focused tests before pushing.
6. Push feature branch: `git push -u origin feat/<feature>`.
7. Create PR to `main` via GitHub.
8. Review diff, CI status, and changed-file list.
9. Merge using a merge commit (default repository convention).
10. Verify production health if deployed.
11. Retire the branch only after merge-reachability checks pass (see `BRANCH_RETIREMENT_CHECKLIST.md`).

## Rules

- No direct push to `main`.
- No force-push on shared or review branches.
- No `git add .` or `git add -A` — stage files explicitly.
- No `git reset --hard` in active worktrees without explicit approval.
- No branch deletion until the branch has zero unique commits versus `main`, or its content is independently preserved.
- Local and remote branch deletion require separate verification steps.

## Pull Request Guidelines

- PR title: short imperative description (under 70 characters).
- PR body: summary, changed-file scope, test results, deployment notes.
- Confirm no secrets, `.env` content, database files, or user data appear in the diff.
- Record CI check status in the PR or merge notes.
- If CI status is not readable (PAT permissions), run local tests and record results in the PR description.

## Merge Rules

- Use merge commits (not squash or rebase) unless project policy changes.
- Verify the PR is mergeable with no conflicts before merging.
- After merge, verify the feature commit is reachable from `main`.
- Record the merge commit SHA for deployment traceability.

## Course-Content and Data-Migration Branches

- Treat versioned course content separately from application code.
- Use pinned content commits, not moving branch URLs.
- Keep source content SHA separate from application build SHA.
- Use dry-run-first, idempotent, scope-limited migration scripts.
- Back up before production data changes.
- Preserve stable course/section/item IDs.
- Preserve existing learner progress, quiz attempts, final quiz settings, and NFT credentials.
- Verify all content placement and order after migration.
- Do not claim content is live until browser and admin verification confirms it.
