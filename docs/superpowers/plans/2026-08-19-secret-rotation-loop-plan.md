# Secret Rotation Loop Plan

**Date:** 2026-08-19
**Phase:** Post-Incident Response — Passphrase Rotation Gate
**Current gate:** SIR-006 REQUESTING (rotation approval)

---

## Purpose

This document defines the allowed and forbidden actions for Claude Code during
the post-rotation verification loop. It serves as the operational boundary for
each iteration of the loop until all SIR tasks are COMPLETE.

---

## Current State

```
KEYPAIR GENERATED (GBNOP73...UE3)
         |
         v
[ROTATION GATE] <-- CURRENT POSITION
         |
         v
FUND (BLOCKED — do not proceed until rotation confirmed)
```

The account exists on the Stellar testnet keypair level but has NOT been funded.
No blockchain operations have been performed. The rotation gate must be cleared
before any funding or deployment steps.

---

## Loop Iterations

### Iteration 1 — Awaiting SIR-007 (User runs rotation script)

**Trigger:** User returns to session after running `~/scripts/rotate-testnet-gpg-passphrase.sh`

**Claude Code actions (allowed):**
- Accept the user's report of rotation results (exit code, stat output, file type)
- Update SIR-007 status to COMPLETE or FAILED
- Run ROT-001 through ROT-012 verification checks (via Bash tool, non-secret commands only)
- Update test matrix statuses

**Claude Code actions (forbidden):**
- Decrypt or attempt to read `~/.stellar-testnet-secrets.gpg`
- Output, echo, or reference any passphrase value
- Run Friendbot or any blockchain funding command
- Deploy any contract
- Advance past the rotation gate without user confirmation that ROT-005 and ROT-006 both pass

---

### Iteration 2 — Post-rotation verification

**Trigger:** User confirms rotation script completed

**Claude Code actions (allowed):**
- Run safe metadata checks: `stat`, `file` on `.gpg` file
- Check `/dev/shm` for residual plaintext
- Check `stellar keys ls` for cached identities
- Run `npx vitest run` in LMS-Server
- Update all SIR and ROT statuses
- Update dependency map and approval gates diagrams

**Claude Code actions (forbidden):**
- Run `gpg --decrypt` (even dry-run) — the user must perform passphrase-entry steps
- Assume ROT-005 (old passphrase rejected) passed without user confirmation
- Proceed to SIR-012 until ROT-001 through ROT-012 are all confirmed PASS

---

### Iteration 3 — Gate clearance and next-step planning

**Trigger:** All 12 ROT tests confirmed PASS by user

**Claude Code actions (allowed):**
- Mark rotation gate CLEARED in all diagrams
- Update dependency map: ROTATION node turns green
- Draft SIR-012 funding approval request
- Present summary of cleared gate to user

**Claude Code actions (forbidden):**
- Request Friendbot funding without explicit user approval (SIR-012 gate)
- Begin contract deployment planning until SIR-012 is approved
- Skip independent security review (SIR-011)

---

## Allowed Actions (Any Iteration)

| Action | Tool | Notes |
|--------|------|-------|
| Read documentation files | Read | Any .md file |
| Write/update documentation | Write, Edit | Plans, diagrams, test matrices |
| Check file metadata | Bash | `stat`, `file`, `ls -la` — never `gpg --decrypt` |
| Run vitest | Bash | LMS-Server only; `cd LMS-Server && npx vitest run` |
| Check /dev/shm | Bash | `ls /dev/shm/` |
| Check stellar keys | Bash | `stellar keys ls` |
| Update git (documentation only) | Bash | No secrets in commits |
| Report safe metadata | Output | Public address, stat output, file type, test counts |

---

## Forbidden Actions (All Iterations Until Gate Cleared)

| Action | Reason |
|--------|--------|
| Output any passphrase value | Incident containment (SIR-001, permanent) |
| Decrypt `~/.stellar-testnet-secrets.gpg` | Requires passphrase — user-only action |
| Run Friendbot | Account must be behind cleared rotation gate |
| Deploy Soroban contract | Requires funded account |
| Configure testnet env vars for live use | Requires deployed contract address |
| Execute test mint | Requires configured testnet env |
| Print or log the private key (S...) | Permanent — any context |
| Pass passphrase as CLI argument | Would appear in `ps` output |
| Store passphrase in a shell variable | Risk of history/log leakage |

---

## Gate Progression

```
[SIR-006] Rotation approval    <-- CURRENT (REQUESTING)
    |
    v (user approves + runs script)
[SIR-007] Rotation executed    <-- NEXT
    |
    v (ROT-001 through ROT-012 all PASS)
[SIR-008] Storage verified     <-- THEN
[SIR-009] Old passphrase rejected
    |
    v (SIR-011 independent review)
[SIR-012] Funding approval     <-- GATE: explicit user approval required
    |
    v
[FUND via Friendbot]
    |
    v
[CONTRACT DEPLOY GATE]
```

Each gate requires explicit user approval before Claude Code may proceed.
Claude Code will not self-advance through gates.

---

## Exit Criteria

This loop plan is retired when:

1. All SIR tasks (SIR-001 through SIR-012) are COMPLETE.
2. All ROT tests (ROT-001 through ROT-012) are PASS.
3. The dependency map shows ROTATION node in green.
4. The approval gates diagram shows the rotation gate cleared.
5. User has explicitly approved SIR-012 (Friendbot funding).

At that point, the normal testnet deployment loop plan resumes.
