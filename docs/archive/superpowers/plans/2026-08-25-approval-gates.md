# Development Workflow — Approval Gates

**Date:** 2026-08-25

---

## Gate Matrix

| Gate ID | Action | Default | Can Be Pre-Authorized | Notes |
|---------|--------|---------|-----------------------|-------|
| G1 | Workflow script activation | Requires approval | Yes — if read-only | Only if changes cron/systemd |
| G2 | Production service restart | NOT APPROVED | No | Always requires explicit approval |
| G3 | Production migration | NOT APPROVED | No | Always requires explicit approval |
| G4 | Enhanced provider activation | NOT APPROVED | No | `NFT_PROVIDER=enhanced` |
| G5 | Commit/push | Requires approval | Yes — per session | Can be authorized for a session |
| G6 | Production restore | NOT APPROVED | No | Always requires explicit approval |
| G7 | Blockchain operation | NOT APPROVED | No | Mint, sign, submit, invoke |
| G8 | Production .env change | NOT APPROVED | No | Always requires explicit approval |
| G9 | Auto-mint enablement | NOT APPROVED | No | `NFT_AUTO_MINT_ENABLED` |
| G10 | Credential decryption | NOT APPROVED | No | Never in workflow |

---

## Action Classification

### Always Allowed (No Gate)
- Read files in any repo
- Run `git status`, `git log`, `git diff`, `git branch`
- Run tests (`vitest`, `playwright`)
- Run `tsc --noEmit`, `eslint`
- Docker read-only: `docker ps`, `docker inspect`, `docker volume inspect`
- Create/edit documentation files
- Write source code in worktrees
- Dispatch subagents
- Secret scans (pattern matching, NOT decryption)

### Gate G1: Script Activation
- Modifying `crontab`
- Adding/removing systemd units
- Changing backup schedules
- Activating monitoring scripts

### Gate G2: Service Restart
- `docker compose restart`
- `docker compose up -d --no-deps`
- `docker compose build && up`
- `systemctl restart`
- Any process signal to production containers

### Gate G3: Migration
- `ALTER TABLE` on production database
- Schema changes via application migration
- Data backfill scripts

### Gate G5: Commit/Push
- `git commit`
- `git push`
- `git tag` (annotated)
- PR creation via `gh pr create`

---

## Gate Enforcement

When the loop encounters an action that requires a gate:

```
STOP — requires explicit approval

Gate: G{n} — {gate name}
Action: {description of what would be done}
Impact: {what changes in production}
Reversibility: {how to undo}
Evidence: {why this action is needed}

Awaiting approval to proceed.
```

The loop does NOT proceed past a gate without explicit human confirmation.

---

## Current Session Authorization State

```
Workflow discovery/rehearsal:     ALLOWED
Documentation creation:          ALLOWED
Test execution:                  ALLOWED
Static analysis:                 ALLOWED
Docker read-only inspection:     ALLOWED
Backup verification (read-only): ALLOWED

Workflow script activation:      Requires explicit approval (G1)
Commit/push:                     Requires explicit approval (G5)
Production service restart:      NOT APPROVED (G2)
Production migration:            NOT APPROVED (G3)
Enhanced provider activation:    NOT APPROVED (G4)
Production restore:              NOT APPROVED (G6)
Blockchain operation:            NOT APPROVED (G7)
Production .env change:          NOT APPROVED (G8)
Auto-mint enablement:            NOT APPROVED (G9)
Credential decryption:           NOT APPROVED (G10)
```
