# PR Historical Record Correction Plan

**Date:** 2026-08-19
**Status:** READY FOR DECISION

## Current PR Body (Stale Values)

| Section | PR Body Value | Actual Value | Type |
|---------|--------------|--------------|------|
| Existing mint tests | 24/24 | 67/67 (11 files) | Scope error |
| Full backend (main) | 1091/1091 | 1108/1108 | Count changed after vitest fix |
| Full backend (worktree) | 1104/1108 | 1108/1108 | Fixed by vitest.config.ts |

## Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| Leave unchanged | Preserves historical record | May confuse future readers | |
| Update PR body | Accurate counts visible | Rewrites history on merged PR | |
| Add PR comment | Correction in context, history preserved | Requires scrolling to see | RECOMMENDED |

## Proposed Comment (if approved)

```
**Historical correction (2026-08-19):**

The PR body references "24/24" for mint tests. This counted only `mint.test.ts`. The full inventory:

| Scope | Count |
|-------|-------|
| mint.test.ts | 16/16 |
| mint-network-config.test.ts | 17/17 |
| All 11 mint-related files | 67/67 |
| Full backend (post vitest.config.ts fix) | 1108/1108 |

Verification: commits f3b23a9 and 51f337c.
```

## Approval Required
- Adding PR comment: REQUIRES APPROVAL
- Editing PR body: REQUIRES APPROVAL (not recommended)
