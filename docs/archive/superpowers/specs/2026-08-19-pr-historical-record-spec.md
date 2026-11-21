# PR Historical Record Specification

**Date:** 2026-08-19
**Status:** READY FOR DECISION

## Problem Statement
PR #1's body contains stale test counts from an intermediate development state:
- "Existing mint tests | 24/24 PASS" → actual across 11 files: 67/67
- "Full backend (main) | 1091/1091 PASS" → actual after vitest.config.ts fix: 1108/1108

## Goals
- Document the correct test counts
- Decide whether to update the merged PR body or preserve the historical record
- Prevent future confusion

## Non-Goals
- Reopen the PR
- Alter merge status, commits, base, or head
- Change any source code

## Current State
- PR #1: MERGED, merge commit b6cc879
- PR body references "24/24" for mint tests (was accurate for mint.test.ts alone at time of writing)
- The "24/24" was a scope error, not a runtime failure — only counted one of 11 mint-related test files
- Repository documentation (committed in 51f337c) records the corrected 67/67 result

## Options
1. **Leave PR body unchanged** — rely on repository docs for accurate counts (RECOMMENDED)
2. **Update PR body** — correct the stale section with current counts
3. **Add PR comment** — append a correction note without rewriting history

## Recommended Option
Option 3 (PR comment) — preserves the original historical record while providing the correction in context. A merged PR body represents the state at merge time; rewriting it could confuse audit trails.

## Proposed Comment
```
**Historical correction (2026-08-19):**

The PR body references "24/24" for mint tests. This counted only `mint.test.ts`. The full mint test inventory across 11 files is 67/67:

| Scope | Count |
|-------|-------|
| mint.test.ts | 16/16 |
| mint-network-config.test.ts | 17/17 |
| All 11 mint-related files | 67/67 |
| Full backend (after vitest.config.ts fix) | 1108/1108 |

Verification committed in 51f337c and f3b23a9.
```

## Actors and Boundaries
- Actor: Repository maintainer
- Boundary: PR metadata only

## Security
- No secrets exposed
- No code changes

## Amma Wallet Integration
- Not affected

## Acceptance Criteria
- [ ] Decision made on correction method
- [ ] Correction applied (comment or body update)
- [ ] Repository documentation remains the source of truth

## Explicit Approval Gates
- Editing merged PR body: REQUIRES APPROVAL
- Adding PR comment: REQUIRES APPROVAL
