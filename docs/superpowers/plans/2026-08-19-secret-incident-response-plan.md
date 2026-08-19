# Secret Incident Response Plan

**Date:** 2026-08-19
**Incident:** GPG passphrase exposed in session output
**Status:** SIR-006 REQUESTING — rotation approval pending

## Summary

During a terminal session, the GPG passphrase protecting the testnet keypair file
(`~/.stellar-testnet-secrets.gpg`) was displayed in shell output. The private key
itself was NOT exposed — it was piped directly to `gpg` via stdin and never printed.
The decision is to rotate the passphrase only and retain the account.

**Public address:** `GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3`
**Account status:** NOT funded — no blockchain operations have been performed.
**Current test count:** 1108/1108

---

## Task Table

| # | Task ID | Task | Priority | Status |
|---|---------|------|----------|--------|
| 1 | SIR-001 | Contain exposure (do not repeat passphrase) | P0 | COMPLETE |
| 2 | SIR-002 | Inspect safe metadata | P0 | COMPLETE |
| 3 | SIR-003 | Determine exposure scope | P0 | COMPLETE — passphrase only |
| 4 | SIR-004 | Decide rotate vs abandon | P1 | COMPLETE — rotate passphrase |
| 5 | SIR-005 | Prepare rotation script | P1 | COMPLETE — ~/scripts/rotate-testnet-gpg-passphrase.sh |
| 6 | SIR-006 | Obtain rotation approval | P1 | REQUESTING |
| 7 | SIR-007 | User executes rotation script | P1 | BLOCKED — awaiting user |
| 8 | SIR-008 | Verify storage and permissions post-rotation | P1 | BLOCKED — depends on SIR-007 |
| 9 | SIR-009 | Confirm old passphrase rejected | P1 | BLOCKED — depends on SIR-007 |
| 10 | SIR-010 | Update documentation | P2 | IN PROGRESS |
| 11 | SIR-011 | Independent security review | P2 | BLOCKED |
| 12 | SIR-012 | Request funding approval (only if safe) | P3 | BLOCKED |

---

## Task Details

### SIR-001 — Contain exposure (do not repeat passphrase)

**Priority:** P0
**Status:** COMPLETE

The passphrase must not appear in any further session output, log file, command
argument, git commit, or documentation file. Claude Code will not output, echo,
or reference the passphrase value in any form. This constraint is permanent.

**Verification:** This document contains no passphrase value.

---

### SIR-002 — Inspect safe metadata

**Priority:** P0
**Status:** COMPLETE

Safe metadata was inspected without decrypting the file:

- `stat --format='mode=%a owner=%U' ~/.stellar-testnet-secrets.gpg` — confirmed mode=600, owner=webadmin
- `file ~/.stellar-testnet-secrets.gpg` — confirmed PGP symmetric AES-256 encrypted data
- No decryption was performed during this inspection step.

---

### SIR-003 — Determine exposure scope

**Priority:** P0
**Status:** COMPLETE — passphrase only

Assessment:

- **Passphrase:** EXPOSED in session output.
- **Private key:** NOT EXPOSED. The private key (S... secret) was piped via stdin to
  `gpg --symmetric`, never assigned to a shell variable, never printed, never echoed.
- **Encrypted file contents:** NOT EXPOSED. The `.gpg` file was not decrypted during
  any step visible in output.
- **Network exposure:** None — no network calls were made with the keypair.
- **Blockchain exposure:** None — the account has never been funded.

**Conclusion:** Scope is limited to the passphrase. Private key integrity is intact.

---

### SIR-004 — Decide rotate vs abandon

**Priority:** P1
**Status:** COMPLETE — rotate passphrase

Decision rationale:

| Factor | Assessment |
|--------|------------|
| Private key exposed? | No |
| Account funded? | No |
| Blockchain ops performed? | No |
| Private key on-chain risk? | None |
| Recommendation | Rotate passphrase only |

If the private key had been exposed (printed to stdout, assigned to a variable
visible in output, or logged), the decision would be to abandon the account,
delete the encrypted file, and generate a replacement keypair.

---

### SIR-005 — Prepare rotation script

**Priority:** P1
**Status:** COMPLETE

Script location: `~/scripts/rotate-testnet-gpg-passphrase.sh`

The script:
1. Verifies the encrypted file exists with mode 600.
2. Prompts for the OLD passphrase interactively (not via argument).
3. Decrypts to a RAM-backed tmpdir (`/dev/shm`) — never touches disk.
4. Prompts for the NEW passphrase interactively.
5. Re-encrypts to a temporary file in `/dev/shm`.
6. Verifies the new file is valid GPG-encrypted data.
7. Prompts for explicit user confirmation before replacing the original.
8. Atomically replaces the original file (`mv`).
9. Sets mode 600 on the new file.
10. Shreds the plaintext from RAM (`shred -u`).

The passphrase is never passed as a command-line argument (would appear in `ps`
output) and never stored in a shell variable that could leak to history.

---

### SIR-006 — Obtain rotation approval

**Priority:** P1
**Status:** REQUESTING

Requesting user confirmation to proceed with passphrase rotation. The rotation
script is ready and has been reviewed. No action will be taken until the user
explicitly approves and runs the script.

**Required from user:** "Run the rotation script" or equivalent confirmation.

---

### SIR-007 — User executes rotation script

**Priority:** P1
**Status:** BLOCKED — awaiting user

The user must run the rotation script in an interactive terminal SSH session
(not via Claude Code, which cannot handle interactive passphrase prompts).

See: `docs/superpowers/plans/2026-08-19-gpg-rotation-todo.md`

---

### SIR-008 — Verify storage and permissions post-rotation

**Priority:** P1
**Status:** BLOCKED — depends on SIR-007

After the script completes, verify:

```bash
stat --format='mode=%a owner=%U' ~/.stellar-testnet-secrets.gpg
file ~/.stellar-testnet-secrets.gpg
```

Expected:
- mode: `600`
- owner: `webadmin`
- file type: `PGP symmetric AES-256 encrypted data`

---

### SIR-009 — Confirm old passphrase rejected

**Priority:** P1
**Status:** BLOCKED — depends on SIR-007

After rotation, confirm the old passphrase no longer decrypts the file:

```bash
gpg --decrypt --dry-run ~/.stellar-testnet-secrets.gpg
# Enter OLD passphrase — expected: BAD_PASSPHRASE or decryption failure
```

Then confirm the new passphrase succeeds:

```bash
gpg --decrypt --dry-run ~/.stellar-testnet-secrets.gpg
# Enter NEW passphrase — expected: success (exit code 0)
```

---

### SIR-010 — Update documentation

**Priority:** P2
**Status:** IN PROGRESS

Documentation being updated:
- This incident response plan (current file)
- `2026-08-19-gpg-rotation-todo.md` — step-by-step user instructions
- `2026-08-19-secret-rotation-test-matrix.md` — verification test matrix
- `2026-08-19-secret-rotation-loop-plan.md` — post-rotation loop plan
- Mermaid diagrams updated to reflect rotation gate

Remaining: Update status fields after SIR-007 completes.

---

### SIR-011 — Independent security review

**Priority:** P2
**Status:** BLOCKED

After rotation is confirmed complete, an independent review of the rotation
script and the full incident timeline is recommended before proceeding to
account funding (SIR-012).

---

### SIR-012 — Request funding approval (only if safe)

**Priority:** P3
**Status:** BLOCKED

Funding the account via Friendbot is deferred until all prior SIR tasks are
complete and independently reviewed. Funding while the passphrase rotation is
unconfirmed would create a funded account protected by a known-compromised
passphrase.

**Gate:** SIR-007 through SIR-011 must all be COMPLETE before requesting
funding approval.

---

## Incident Timeline

| Time | Event |
|------|-------|
| 2026-08-19 | Keypair generated; passphrase exposed in session output |
| 2026-08-19 | Exposure contained (SIR-001) |
| 2026-08-19 | Scope assessed: passphrase only, private key intact (SIR-002, SIR-003) |
| 2026-08-19 | Decision: rotate passphrase (SIR-004) |
| 2026-08-19 | Rotation script prepared (SIR-005) |
| 2026-08-19 | Documentation updated (SIR-010, this file) |
| PENDING | User executes rotation script (SIR-007) |
| PENDING | Post-rotation verification (SIR-008, SIR-009) |
| PENDING | Funding approval requested (SIR-012) |

---

## Key Constraints

1. Claude Code MUST NOT attempt to read, decrypt, or output any contents of
   `~/.stellar-testnet-secrets.gpg`.
2. The passphrase value MUST NOT appear in any file, log, argument, or output.
3. The private key (S... secret) MUST NOT be printed or logged under any circumstances.
4. No blockchain operations (Friendbot, contract deployment, minting) may proceed
   until SIR-007 through SIR-009 are confirmed COMPLETE.
