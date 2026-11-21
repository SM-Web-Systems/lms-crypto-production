# Testnet Secret Rotation and Revocation Specification

**Date:** 2026-08-19
**Status:** Approved
**Author:** SM Web Systems Engineering
**Phase:** Testnet NFT Deployment Prerequisite

---

## 1. Problem Statement

A testnet Stellar keypair is stored in `~/.stellar-testnet-secrets.gpg` (GPG AES-256 symmetric encryption). This specification defines the procedures for:

- Rotating the testnet keypair (replacing the key while maintaining access)
- Rotating the GPG passphrase (changing the encryption credential without changing the Stellar key)
- Revoking access entirely (emergency or end-of-life deletion)
- Verifying the encrypted file remains healthy after any operation

Unlike production key rotation, testnet rotation carries no risk of fund loss and requires no on-chain coordination beyond redeploying a testnet contract. This simplicity allows straightforward, low-ceremony procedures.

---

## 2. Goals

- Provide unambiguous, step-by-step rotation procedures
- Ensure no plaintext is written to disk at any point during rotation
- Ensure the production secret store (`~/.env.secrets`) is never touched
- Provide a passphrase rotation procedure independent of keypair rotation
- Provide an emergency deletion procedure that is safe to execute
- Define post-operation verification steps for each procedure

---

## 3. Non-Goals

- Production key rotation (separate procedure, out of scope here)
- Multi-party approval or change management for testnet operations
- On-chain key migration (testnet contracts are abandoned and redeployed on keypair rotation)
- Automated rotation (all testnet rotation is manual operator-driven)

---

## 4. Rotation Triggers

The following conditions should trigger a rotation:

| Trigger | Rotation Type | Priority |
|---|---|---|
| Passphrase suspected compromised | Passphrase rotation (Section 6) or full rotation (Section 5) | Immediate |
| Encrypted file copied to an untrusted location | Passphrase rotation at minimum; full rotation preferred | High |
| Operator who knows the passphrase leaves the team | Passphrase rotation | High |
| Testnet keypair exposed in logs, shell history, or committed to git | Full keypair rotation | Immediate |
| Periodic hygiene (optional) | Passphrase rotation | Low (operator discretion) |
| End of testnet phase | Revocation (Section 7) | Scheduled |

---

## 5. Full Keypair Rotation Procedure

Full keypair rotation replaces both the Stellar keypair and, optionally, the GPG passphrase. It requires redeploying the testnet contract because the admin and minter addresses change.

### 5.1 Generate a New Testnet Keypair

```bash
~/.local/bin/stellar keys generate testnet-new --network testnet --no-fund
```

This command creates a new keypair. Record the public key from the CLI output. Do not pass `--secure-store` (DBus not available).

If the CLI does not print the secret key directly, retrieve it:

```bash
~/.local/bin/stellar keys show testnet-new --show-secret
```

Have both values (public and secret) ready in your terminal before proceeding. Do not copy them to a text file.

### 5.2 Fund the New Testnet Account via Friendbot

```bash
curl -s "https://friendbot.stellar.org/?addr=<NEW_PUBLIC_KEY>" | python3 -m json.tool
```

Confirm the response contains `"successful": true` or equivalent. The new account must have test XLM before it can submit transactions.

### 5.3 Re-encrypt the Secret File with the New Keys

Pipe the new plaintext directly into GPG without writing to disk:

```bash
printf 'TESTNET_PUBLIC_KEY=<NEW_PUBLIC_KEY>\nTESTNET_SECRET_KEY=<NEW_SECRET_KEY>\nTESTNET_NETWORK=testnet\nTESTNET_CREATED=%s\n' "$(date +%F)" \
  | gpg --symmetric --cipher-algo AES256 --armor \
        --output ~/.stellar-testnet-secrets.gpg
```

GPG will prompt for the passphrase (use the same existing passphrase, or set a new one if doing a simultaneous passphrase rotation). The `--output` flag overwrites the existing file in place.

### 5.4 Verify the New Encrypted File

```bash
gpg --decrypt --dry-run ~/.stellar-testnet-secrets.gpg
```

Exit code 0 confirms the file is decryptable and the passphrase is correct. If this fails, do not proceed — the file may be corrupt or the passphrase was mistyped.

Optionally, do a full decrypt to inspect the values:

```bash
gpg --decrypt --quiet ~/.stellar-testnet-secrets.gpg
```

Confirm `TESTNET_PUBLIC_KEY` shows the new key, not the old one.

### 5.5 Verify File Permissions

```bash
ls -la ~/.stellar-testnet-secrets.gpg
# Expected: -rw------- 1 webadmin webadmin
```

If permissions were reset during overwrite:

```bash
chmod 600 ~/.stellar-testnet-secrets.gpg
```

### 5.6 Clean Up Old CLI Identity

```bash
~/.local/bin/stellar keys remove testnet-new 2>/dev/null || true
```

The Stellar CLI generated an identity during key generation (`testnet-new`). Remove it so the secret is not duplicated in the CLI keystore. The only authoritative copy is `~/.stellar-testnet-secrets.gpg`.

### 5.7 Redeploy the Testnet Contract

Because the admin and minter addresses have changed, the existing testnet contract is no longer manageable with the new key. Redeploy per `2026-08-19-testnet-contract-constructor-spec.md`:

- Pass the new public key as both `admin` and `minter` constructor arguments
- Record the new contract ID
- Update `NFT_CONTRACT_ID` in the testnet environment file
- Update `NFT_MINTER_PUBLIC_KEY` and `NFT_MINTER_SECRET` in the testnet environment file

The old testnet contract is abandoned. No revocation transaction is needed on testnet.

### 5.8 Abandon the Old Testnet Account

The old testnet account is permanently inaccessible after its secret key is overwritten. No further action is needed. Testnet XLM has no real value.

---

## 6. GPG Passphrase-Only Rotation

Passphrase rotation changes the encryption credential without generating a new Stellar keypair. The contract does not need to be redeployed.

### 6.1 Decrypt with the Old Passphrase

Capture the plaintext in a shell variable (not written to disk):

```bash
PLAINTEXT="$(gpg --decrypt --quiet ~/.stellar-testnet-secrets.gpg)"
```

GPG will prompt for the old passphrase.

### 6.2 Re-encrypt with the New Passphrase

```bash
printf '%s\n' "$PLAINTEXT" \
  | gpg --symmetric --cipher-algo AES256 --armor \
        --output ~/.stellar-testnet-secrets.gpg
```

GPG will prompt for the new passphrase (twice, for confirmation). The `--output` flag overwrites the file.

### 6.3 Clear the Plaintext Variable

```bash
unset PLAINTEXT
```

### 6.4 Verify the File

```bash
gpg --decrypt --dry-run ~/.stellar-testnet-secrets.gpg
```

Supply the new passphrase when prompted. Exit code 0 confirms success.

### 6.5 Verify File Permissions

```bash
ls -la ~/.stellar-testnet-secrets.gpg
chmod 600 ~/.stellar-testnet-secrets.gpg  # if needed
```

### 6.6 Update Out-of-Band Passphrase Record

Update the operator's password manager or other out-of-band record with the new passphrase. The old passphrase record must be deleted or marked superseded.

No contract redeployment is needed. The Stellar keypair is unchanged.

---

## 7. Revocation and Emergency Deletion

### 7.1 Routine Revocation (End of Testnet Phase)

When the testnet phase is complete and the testnet keypair is no longer needed:

```bash
rm ~/.stellar-testnet-secrets.gpg
```

Post-deletion state:

| Item | State |
|---|---|
| Encrypted file | Deleted |
| Testnet private key | Unrecoverable from this server |
| Testnet account | Permanently inaccessible from this server |
| Testnet contract | Abandoned (admin/minter inaccessible); no further operations possible |
| Mainnet funds | Unaffected |
| Production services | Unaffected |
| Production `~/.env.secrets` | Unaffected |

No on-chain revocation transaction is needed. Testnet accounts are periodically pruned by Stellar Foundation infrastructure. No action is required to "close" the testnet account.

### 7.2 Emergency Revocation (Immediate Threat)

If there is reason to believe the testnet keypair has been exposed and an unauthorized party may attempt to use it:

```bash
rm ~/.stellar-testnet-secrets.gpg
```

Because the account holds only test XLM and controls only a testnet contract, there are no real assets at risk. The emergency procedure is identical to routine revocation. No escalation or incident response is required beyond the deletion.

If the testnet account had been granted any permissions or memberships outside the scope of this specification (not expected), those should be reviewed separately.

### 7.3 After Emergency Revocation

If testnet operations must continue after emergency revocation, repeat the full keypair rotation procedure (Section 5) from Step 5.1. The new keypair starts from a clean state with no connection to the exposed key.

---

## 8. Verification Procedures

### 8.1 Routine Health Check (Can Run Any Time)

Confirm the encrypted file is decryptable without exposing plaintext:

```bash
gpg --decrypt --dry-run ~/.stellar-testnet-secrets.gpg
echo "Exit code: $?"
```

Expected: exit code 0.

### 8.2 Full Integrity Check

Confirm the file contains expected fields:

```bash
gpg --decrypt --quiet ~/.stellar-testnet-secrets.gpg \
  | grep -E '^(TESTNET_PUBLIC_KEY|TESTNET_SECRET_KEY|TESTNET_NETWORK|TESTNET_CREATED)='
```

Expected output contains all four variable names. Values are printed to terminal only — not captured to a file.

```bash
# Verify public key format (56 chars, starts with G)
gpg --decrypt --quiet ~/.stellar-testnet-secrets.gpg \
  | awk -F= '/^TESTNET_PUBLIC_KEY/{print length($2), substr($2,1,1)}'
# Expected: 56 G
```

```bash
# Verify secret key format (56 chars, starts with S)
gpg --decrypt --quiet ~/.stellar-testnet-secrets.gpg \
  | awk -F= '/^TESTNET_SECRET_KEY/{print length($2), substr($2,1,1)}'
# Expected: 56 S
```

```bash
# Verify network field
gpg --decrypt --quiet ~/.stellar-testnet-secrets.gpg \
  | awk -F= '/^TESTNET_NETWORK/{print $2}'
# Expected: testnet
```

### 8.3 Permission Check

```bash
stat -c '%a %U:%G' ~/.stellar-testnet-secrets.gpg
# Expected: 600 webadmin:webadmin
```

### 8.4 Production File Integrity Check

After any rotation operation, confirm the production secret store was not modified:

```bash
stat ~/.env.secrets
# Confirm mtime matches the last known-good modification time
```

---

## 9. What Must Not Happen During Rotation

| Prohibited Action | Reason |
|---|---|
| Writing plaintext to a temp file (e.g., `/tmp/secrets.txt`) | Plaintext persists on disk after rotation; temp files may survive reboots or be readable by other processes |
| Pasting secret key into a shell command that logs to `~/.bash_history` | History files persist; secret key would be recoverable from disk |
| Committing the GPG passphrase or plaintext content to git | Git history is permanent and often synced offsite |
| Modifying `~/.env.secrets` as part of testnet rotation | Production and testnet are strictly separated |
| Running `gpg --output` to a path other than `~/.stellar-testnet-secrets.gpg` | Creates an untracked plaintext or encrypted copy |
| Using `--no-symkey-cache` bypass to avoid passphrase entry | Suggests passphrase is being passed via env or file, which violates the security model |

---

## 10. Rotation Decision Table

| Scenario | Rotate Keypair | Rotate Passphrase | Redeploy Contract |
|---|---|---|---|
| Passphrase suspected exposed | Optional (recommended) | Yes | Only if keypair also rotated |
| Private key (S...) exposed | Yes | Yes | Yes |
| Public key (G...) exposed | No | No | No (public keys are public) |
| Operator offboarding | No | Yes | No |
| Routine hygiene | No | Optional | No |
| File deleted accidentally | N/A — regenerate | N/A | Yes (new keypair needed) |
| End of testnet phase | Delete file | N/A | N/A (abandon contract) |

---

## 11. Acceptance Criteria

- [ ] Full keypair rotation procedure (Section 5) is executable from start to finish without writing any plaintext to disk
- [ ] After full keypair rotation, `gpg --decrypt --dry-run ~/.stellar-testnet-secrets.gpg` returns exit code 0
- [ ] After full keypair rotation, decrypted `TESTNET_PUBLIC_KEY` differs from the pre-rotation value
- [ ] After full keypair rotation, a new testnet contract is deployed with the new public key as both `admin` and `minter`
- [ ] After passphrase rotation (Section 6), `gpg --decrypt --dry-run` succeeds with the new passphrase and fails with the old passphrase
- [ ] After passphrase rotation, `TESTNET_PUBLIC_KEY` is unchanged
- [ ] After revocation (Section 7), `ls ~/.stellar-testnet-secrets.gpg` returns "No such file or directory"
- [ ] After revocation, production services (`lms-api`, `amma-api` containers) show no errors (they are unaffected by testnet deletion)
- [ ] File permissions remain `600 webadmin:webadmin` after every rotation operation
- [ ] The production `~/.env.secrets` file shows no modification timestamp change after any rotation procedure
- [ ] No passphrase, private key, or seed phrase value appears in any git-tracked file after rotation
- [ ] Shell history does not contain the testnet secret key value (verify or purge with `history -d` for relevant entries)
