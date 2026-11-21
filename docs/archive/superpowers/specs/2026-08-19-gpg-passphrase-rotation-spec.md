# GPG Passphrase Rotation — Procedure Specification

**Date:** 2026-08-19
**Status:** AWAITING USER EXECUTION
**Related Incident:** INC-2026-08-19-001
**Encrypted file:** `~/.stellar-testnet-secrets.gpg`

---

## 1. Problem Statement

The GPG symmetric passphrase protecting `~/.stellar-testnet-secrets.gpg` was exposed in session output on 2026-08-19. The passphrase must be rotated to restore confidentiality of the encryption layer. The underlying private key was not exposed and does not need to be regenerated.

The rotation must be performed without:
- Printing any passphrase or private key to any terminal output
- Writing plaintext to persistent disk storage
- Passing passphrases as command-line arguments
- Storing passphrases in environment variables accessible to automation tools

---

## 2. Rotation Method

**Manual interactive script:** `~/scripts/rotate-testnet-gpg-passphrase.sh`

This script must be run by the user directly in their own terminal session. It must NOT be invoked via any automation tool, agent, or remote execution layer. All passphrase prompts are interactive and are entered by the user at the keyboard.

---

## 3. Script Flow

The rotation script performs the following steps in order:

```
1. Confirm that ~/.stellar-testnet-secrets.gpg exists and is mode 600

2. Create working directory in /dev/shm (RAM only, never persisted to disk)
   - Working path: /dev/shm/gpg-rotate-<random>/

3. Prompt user to enter OLD passphrase (interactive pinentry / terminal prompt)

4. Decrypt ~/.stellar-testnet-secrets.gpg to /dev/shm/gpg-rotate-<random>/plaintext.tmp
   - Command: gpg --decrypt --output <plaintext.tmp> ~/.stellar-testnet-secrets.gpg
   - If decryption fails: abort, shred working directory, exit non-zero

5. Prompt user to enter NEW passphrase (interactive pinentry / terminal prompt, confirmed twice)

6. Re-encrypt plaintext to /dev/shm/gpg-rotate-<random>/rotated.gpg
   - Command: gpg --symmetric --cipher-algo AES256 --output <rotated.gpg> <plaintext.tmp>
   - Passphrase sourced from interactive prompt only

7. Shred plaintext immediately:
   - Command: shred -u /dev/shm/gpg-rotate-<random>/plaintext.tmp

8. Verify the new encrypted file:
   - Confirm file type: file <rotated.gpg> contains "GPG symmetrically encrypted data"
   - Confirm decryption succeeds with new passphrase (without printing output)
   - Command: gpg --decrypt <rotated.gpg> > /dev/null

9. Preserve old file as backup:
   - cp ~/.stellar-testnet-secrets.gpg ~/.stellar-testnet-secrets.gpg.bak-2026-08-19
   - chmod 600 ~/.stellar-testnet-secrets.gpg.bak-2026-08-19

10. Atomic replace:
    - mv /dev/shm/gpg-rotate-<random>/rotated.gpg ~/.stellar-testnet-secrets.gpg
    - chmod 600 ~/.stellar-testnet-secrets.gpg

11. Clean up /dev/shm working directory:
    - shred -u all remaining files
    - rmdir /dev/shm/gpg-rotate-<random>/

12. Print completion message (file path and permissions only, no secret values)
```

---

## 4. Security Controls

| Control | Implementation |
|---|---|
| RAM-only temp storage | All plaintext written to /dev/shm only |
| No command-line secrets | Passphrases entered via interactive prompt, never as arguments |
| No environment variable secrets | No `PASSPHRASE=...` exports |
| No automation capture | Script must be run manually in user's own terminal |
| Immediate plaintext shred | `shred -u` called immediately after re-encryption (step 7) |
| Mode 600 enforced | Enforced on both the rotated file and backup |
| Old file preserved | Backup kept until replacement is confirmed working |
| Verification before replace | New file verified decrpytable before overwriting original |
| Pinentry prompt | GPG interactive prompt, not captured by any tool |

---

## 5. Pre-Rotation Checklist

Before executing the script, confirm the following:

- [ ] User is logged in directly to the server terminal (SSH session or local console)
- [ ] No automation tools, agents, or remote execution layers are active in the same shell
- [ ] `~/.stellar-testnet-secrets.gpg` exists: `ls -la ~/.stellar-testnet-secrets.gpg`
- [ ] File is mode 600 and owned by webadmin
- [ ] `gpg` is available: `which gpg`
- [ ] `shred` is available: `which shred`
- [ ] `/dev/shm` is writable: `ls -la /dev/shm`
- [ ] Old passphrase is known and available (will be entered interactively)
- [ ] New passphrase has been chosen and is strong (minimum 20 characters, random)
- [ ] New passphrase is stored securely outside this server (password manager, written record)

---

## 6. Post-Rotation Verification

After the script completes, perform these checks manually:

### 6.1 File Metadata Check
```bash
ls -la ~/.stellar-testnet-secrets.gpg
file ~/.stellar-testnet-secrets.gpg
```
Expected: mode 600, owner webadmin, file type "GPG symmetrically encrypted data (AES256 cipher)"

### 6.2 Old Passphrase Rejection
```bash
gpg --decrypt ~/.stellar-testnet-secrets.gpg
```
Enter the OLD passphrase when prompted. Expected result: decryption FAILS with "bad passphrase" or equivalent error.

### 6.3 New Passphrase Acceptance
```bash
gpg --decrypt ~/.stellar-testnet-secrets.gpg > /dev/null
```
Enter the NEW passphrase when prompted. Expected result: decryption SUCCEEDS (exit code 0, no output to terminal).

### 6.4 Backup File
```bash
ls -la ~/.stellar-testnet-secrets.gpg.bak-2026-08-19
```
Expected: file exists, mode 600.

---

## 7. Rollback Procedure

If rotation fails at any step before the atomic replace (step 10), the original file is unchanged and no rollback is needed.

If rotation completes but the new file is later found to be unreadable or corrupted:

```bash
# Restore from backup
cp ~/.stellar-testnet-secrets.gpg.bak-2026-08-19 ~/.stellar-testnet-secrets.gpg
chmod 600 ~/.stellar-testnet-secrets.gpg
```

The backup file decrypts with the OLD passphrase. If the old passphrase is no longer known, the account must be treated as unrecoverable and the abandonment procedure (see `2026-08-19-testnet-account-abandonment-spec.md`) applies.

---

## 8. Cleanup After Verification

Once post-rotation verification passes and the new passphrase is confirmed working:

```bash
# Remove backup
shred -u ~/.stellar-testnet-secrets.gpg.bak-2026-08-19
```

---

## 9. Acceptance Criteria

- [ ] Script executed in user's own interactive terminal session
- [ ] No passphrase value appears in any terminal output, log file, or session transcript
- [ ] `~/.stellar-testnet-secrets.gpg` decrypts successfully with new passphrase
- [ ] `~/.stellar-testnet-secrets.gpg` rejects old passphrase
- [ ] File permissions remain 600 after rotation
- [ ] Plaintext temp file confirmed shredded (`ls /dev/shm/gpg-rotate-*` returns nothing)
- [ ] Backup file removed after verification
- [ ] New passphrase stored securely in password manager or secure written record

---

*Authored: 2026-08-19 | Status: Awaiting user execution*
