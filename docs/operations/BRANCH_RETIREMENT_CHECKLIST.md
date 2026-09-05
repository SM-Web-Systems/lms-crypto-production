# Branch Retirement Checklist

## Read-Only Gate

Before proposing deletion, verify all conditions:

- [ ] Working tree is clean (no staged or modified tracked files).
- [ ] Current branch is **not** the deletion target.
- [ ] Target branch is **not** checked out by any Git worktree.
- [ ] Target branch has zero commits unique to `origin/main`:
  ```bash
  git rev-list --count origin/main..<branch>
  # Must return 0
  ```
- [ ] Target branch is an ancestor of `origin/main`:
  ```bash
  git merge-base --is-ancestor <branch> origin/main
  # Must exit 0
  ```
- [ ] Feature/merge commits remain reachable from `main`.
- [ ] For cherry-picked content: verify the content is independently preserved even if Git ancestry differs.
- [ ] Exact local and remote target names are verified (no wildcards).

## Deletion Procedure

### Remote

1. Delete the exact remote branch:
   ```bash
   git push origin --delete <branch>
   ```
2. Fetch and prune:
   ```bash
   git fetch --prune origin
   ```
3. Verify remote reference is absent:
   ```bash
   git branch -r --list 'origin/<branch>'
   # Must produce no output
   ```

### Local

4. Delete the local branch with safe mode:
   ```bash
   git branch -d <branch>
   ```
5. **Do not** use `git branch -D` unless:
   - Content-equivalent cherry-picks prevent safe ancestry deletion.
   - Explicit separate approval is given for force deletion.
   - The reason is documented.

### Verification

6. Confirm both references are absent:
   ```bash
   git branch --list '<branch>'
   git branch -r --list 'origin/<branch>'
   ```
7. Confirm merge/feature history remains in main:
   ```bash
   git merge-base --is-ancestor <feature-commit-sha> origin/main
   ```

## Rules

- Never delete `main`.
- Never use wildcard deletion commands.
- Never use `git push --force` for branch deletion.
- Revalidate each branch independently before deletion, even in bulk operations.
- If a branch fails any gate check, skip it and continue with other candidates.
- Record the SHA of every deleted branch for audit purposes.
