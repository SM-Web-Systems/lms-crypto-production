# GPG Passphrase Rotation — User TODO

**Date:** 2026-08-19
**Status:** AWAITING USER ACTION
**Blocking:** SIR-007 (and all downstream SIR tasks)

---

## Context

The GPG passphrase protecting `~/.stellar-testnet-secrets.gpg` was exposed in
session output. The private key was NOT exposed. The rotation script is ready.
You must run it in an interactive terminal — Claude Code cannot handle
interactive passphrase prompts.

**Public address (safe to reference):**
`GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3`

---

## Steps

### Before you start

Save your NEW passphrase in your password manager BEFORE running the script.
Choose a strong passphrase (20+ characters, mixed character classes). Do not
reuse the compromised passphrase.

---

### Step 1 — Open a terminal SSH session to ScarletFlamingo

Open a new terminal window and SSH into the server. Do not use the Claude Code
terminal for this — the script requires interactive passphrase input.

```bash
ssh webadmin@<your-server>
```

---

### Step 2 — Run the rotation script

```bash
bash ~/scripts/rotate-testnet-gpg-passphrase.sh
```

---

### Step 3 — Enter OLD passphrase when prompted

The script will prompt:

```
Enter OLD passphrase (to decrypt current file):
```

Type the compromised passphrase. It will not echo.

---

### Step 4 — Enter NEW passphrase when prompted

The script will prompt:

```
Enter NEW passphrase (to re-encrypt):
Confirm NEW passphrase:
```

Type your new passphrase (which you saved in step 0). It will not echo.

---

### Step 5 — Confirm replacement when prompted

The script will show metadata of the newly encrypted file and ask:

```
Replace ~/.stellar-testnet-secrets.gpg with new file? [y/N]:
```

Type `y` and press Enter only if the file metadata looks correct (GPG symmetric
AES-256 encrypted data).

---

### Step 6 — Verify file metadata

After the script exits, run:

```bash
stat --format='mode=%a owner=%U' ~/.stellar-testnet-secrets.gpg
```

Expected output:

```
mode=600 owner=webadmin
```

---

### Step 7 — Verify file type

```bash
file ~/.stellar-testnet-secrets.gpg
```

Expected output contains: `PGP symmetric AES-256 encrypted data`

---

### Step 8 — Test decryption with NEW passphrase

```bash
gpg --decrypt --dry-run ~/.stellar-testnet-secrets.gpg
```

Enter your NEW passphrase when prompted.

Expected: exits with code 0 (success). You do not need to see the decrypted
contents — dry-run mode confirms decryption succeeds without printing anything.

---

### Step 9 — Return to Claude Code and confirm completion

Come back to this session and tell me:

- Script exit code (0 = success)
- Output of `stat` (step 6)
- Output of `file` (step 7)
- Whether dry-run decryption succeeded (step 8)

Claude Code will then update all task statuses and proceed with post-rotation
verification (SIR-008, SIR-009).

---

## What to do if the script fails

| Failure point | Action |
|---------------|--------|
| Old passphrase rejected | You entered the wrong passphrase — try again. The original file is unchanged. |
| New file not valid GPG | Do not confirm replacement. Report the error. |
| Script errors before prompt | Check that `~/scripts/rotate-testnet-gpg-passphrase.sh` exists and is executable. |
| shred not found | Install with `sudo apt-get install -y coreutils` |

---

## Security reminders

- Do not paste the passphrase into this chat.
- Do not run the script with the passphrase as a command-line argument.
- Do not store the passphrase in a file on disk (use your password manager).
- The plaintext keypair is written only to `/dev/shm` (RAM) and shredded
  immediately after re-encryption.
