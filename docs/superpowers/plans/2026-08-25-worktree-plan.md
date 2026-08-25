# Development Workflow — Worktree Plan

**Date:** 2026-08-25

---

## When to Use Worktrees

Worktrees are required when:
1. Multiple workstreams modify code in the same repo simultaneously
2. Implementation and review happen in parallel
3. Feature isolation is needed during development

Worktrees are NOT needed when:
- All changes are documentation-only (this session)
- Single workstream with sequential tasks
- Changes are in different repos

## Worktree Naming Convention

```
<workstream-type>-<date>-<short-description>
```

Examples:
- `disc-2026-08-25-workflow-specs`
- `impl-2026-08-26-auth-feature`

## File Ownership Rules

| Workstream | Owned Paths | Cannot Touch |
|------------|-------------|--------------|
| Specs | `docs/superpowers/specs/` | `src/`, `test/` |
| Plans | `docs/superpowers/plans/` | `src/`, `test/` |
| Diagrams | `docs/superpowers/diagrams/` | `src/`, `test/` |
| Implementation | `src/`, `LMS-Server/src/` | `docs/superpowers/specs/` |
| Tests | `test/`, `__tests__/`, `e2e/` | `docs/superpowers/specs/` |
| Review | ALL (read-only) | ALL (no writes) |

## Cleanup Protocol

1. After all tasks in a worktree are VERIFIED:
   - Run `git diff main...{worktree-branch}` to verify changes
   - Merge into main (or create PR)
   - Remove worktree: `git worktree remove {path}`
   - Delete branch if fully merged

2. On session end without completion:
   - Worktree persists for next session
   - Status recorded in TODO

## This Session

No worktrees created — all changes are documentation-only in the main working tree of the LMS repo. The untracked files from the 2026-08-20 production migration work are left untouched.
