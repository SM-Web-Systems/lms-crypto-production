# Approved File Commit Specification

**Date:** 2026-08-19
**Status:** READY FOR REVIEW

## Problem Statement

The PR review produced documentation files that need to be committed to the repository. This specification defines the criteria for what constitutes an "approved" file and the process for committing only approved files.

## What "Approved" Means

A file is APPROVED for commit when ALL of the following hold:

1. **Scope**: It belongs to the intended scope (documentation for PR review, or source/test changes in the PR).
2. **No secrets**: Contains no secrets, credentials, tokens, private keys, or production env values.
3. **Review**: Has been reviewed for accuracy and consistency.
4. **Validation**: Passes formatting/syntax validation (Markdown well-formed, Mermaid valid).
5. **Consistency**: Is consistent with the current implementation and test results.
6. **Not blocked**: Has no unresolved CRITICAL or IMPORTANT finding.
7. **Rollback**: Has a clear rollback path (git revert for docs).

## Files Allowed to Be Committed

### Documentation (new, created by this review):
- `docs/superpowers/specs/2026-08-19-*.md`
- `docs/superpowers/plans/2026-08-19-*.md`
- `docs/superpowers/diagrams/2026-08-19-*.md`

### Source/Test (from PR branch — already committed on feature branch):
- These are already committed on the feature branch. No additional source commits needed on main.

## Files Forbidden from Being Committed

- `.env`, `.env.*` containing secrets
- `*.db`, `*.sqlite` database files
- `*.log` log files
- `node_modules/`, `dist/`, `build/` directories
- Credentials, private keys, tokens
- Unrelated source changes
- Temporary files
- Unreviewed generated files

## Secret Scanning

Before staging, scan all candidate files for patterns:
- Stellar secret keys (`S[A-Z0-9]{55}`)
- API keys / tokens
- Passwords
- Database connection strings
- JWT secrets

## Staged-Diff Validation

After `git add`, verify with:
```bash
git diff --cached --check    # Whitespace errors
git diff --cached --stat     # File summary
git diff --cached --name-only  # File list
```

## Commit Grouping

Separate commits for:
1. Specifications (`docs/superpowers/specs/`)
2. Plans and TODOs (`docs/superpowers/plans/`)
3. Diagrams (`docs/superpowers/diagrams/`)

Or a single commit if all are documentation only.

## Rollback

All documentation commits can be reverted with `git revert <commit>`.

## Required User Approval

The user has authorized committing approved files. Push and merge require separate approval.

## Required Final Evidence

Before committing, report a table:

| File | Scope | Review | Validation | Secret Scan | Status |
|------|-------|--------|------------|-------------|--------|
| ... | ... | ... | ... | ... | APPROVED/BLOCKED |
