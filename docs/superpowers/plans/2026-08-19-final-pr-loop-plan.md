# Final PR Loop Plan

**Date:** 2026-08-19
**Status:** COMPLETE

## Purpose

Safe, repeatable verification loop for the PR release pipeline.

## Trigger

Manual invocation only. No automatic scheduling.

## Allowed Actions

| Action | Command |
|--------|---------|
| Repository status | `git status --short && git log --oneline -5` |
| Branch state | `git branch --show-current && git worktree list` |
| PR state | `gh pr view 1 --repo SM-Web-Systems/lms-crypto-production --json state,mergeable` |
| Remote SHAs | `git ls-remote origin refs/heads/main` |
| NFT tests | `cd LMS-Server && npx vitest run src/__tests__/mint-network-config.test.ts` |
| Mint tests | `cd LMS-Server && npx vitest run src/__tests__/*mint*` |
| Full suite | `cd LMS-Server && npx vitest run` |
| TS build | `cd LMS-Server && npx tsc --noEmit` |
| Health check | `curl -s http://localhost:3001/healthz` |
| Container status | `docker ps --filter name=lms` |

## Forbidden Actions

- Automatic commits, pushes, merges
- Production .env changes
- Deployment
- Contract/account/mint/blockchain operations
- Destructive database operations
- Secret rotation
- Worktree deletion

## Stop Conditions

- Any new test failure not previously documented
- Merge conflict detected
- PR state changed unexpectedly
- Secret leak detected

## Escalation

Stop and request approval for any action not listed as allowed.

## Files This Loop May Update

- `docs/superpowers/plans/2026-08-19-final-pr-todo.md` (status updates with evidence)

## Files This Loop Must Never Modify

- `.env`, `.env.*` (except `.env.example` if separately approved)
- Source code
- Database files
- Docker compose files
- Production configuration
