# Testnet Keypair Storage Specification

**Date:** 2026-08-19
**Status:** Approved
**Author:** SM Web Systems Engineering
**Phase:** Testnet NFT Deployment Prerequisite

---

## 1. Problem Statement

The LMS NFT certificate system requires a dedicated Stellar testnet keypair for isolated testing of contract deployment, minting, and administration. No testnet account currently exists. Production operations use `NFT_MINTER_SECRET` loaded directly from `~/.env.secrets` into the application environment at runtime.

Before any testnet contract can be deployed or minted against, a keypair must be generated and stored in a manner that:

- Prevents exposure if the home directory is enumerated
- Is isolated from all production credentials
- Can be loaded on demand by scripts and the application
- Is recoverable by an authorized operator without depending on running system services

---

## 2. Goals

- Store a testnet-only Stellar keypair encrypted at rest on the server
- Apply least-privilege file permissions (owner read-only, 600)
- Isolate the testnet secret from all production environment files (`~/.env.secrets`, `~/.env.git-write`)
- Support decrypt-on-demand access via GPG without leaving plaintext on disk
- Enable safe rotation and revocation procedures
- Provide a documented, reproducible access procedure for operators

---

## 3. Non-Goals

- Production key management (production uses `~/.env.secrets` and `docker compose` env injection; that convention is unchanged)
- Hardware security module (HSM) or multi-party custody
- Key escrow or recovery by third parties
- Automated secret distribution or secrets manager integration
- Any operation on Stellar mainnet (`public` network)

---

## 4. Current State

| Item | State |
|---|---|
| Testnet account | Does not exist |
| Testnet keypair | Not generated |
| Production minter key | `NFT_MINTER_SECRET` in `~/.env.secrets`, injected into `lms-api` container at runtime |
| Production contract | `CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524` (mainnet) |
| Production WASM SHA-256 | `2e8c87f0cf923ad0a9798db9ec64cc53286c1c95a196802d1c922fbd527ed6eb` |

The production flow is not modified by this specification. All testnet secrets are stored separately from and never merged with production environment files.

---

## 5. Proposed State

A single GPG-symmetric-encrypted file at `~/.stellar-testnet-secrets.gpg` stores the testnet keypair as a shell-sourceable key=value format.

The file:

- Is encrypted with AES-256 symmetric passphrase (no GPG key required)
- Has permissions `600 webadmin:webadmin`
- Contains only testnet credentials — no production values
- Is decrypted in-memory by operator scripts when needed; the plaintext is never written to disk
- Follows the existing home-directory secret file convention (`~/.env.secrets`, `~/.env.git-write`)

---

## 6. Storage Options Evaluated

### Option A: Plain `.env` file (e.g., `~/.env.testnet`)

| Attribute | Assessment |
|---|---|
| Encryption at rest | None — plaintext on disk |
| Access control | File permissions only (600) |
| Tool dependency | None |
| Server compatibility | Full |
| Risk if home dir exposed | Private key immediately readable |

**Decision: Rejected.** No encryption at rest. Violates minimum security bar even for testnet credentials.

### Option B: Stellar CLI `--secure-store` (keychain)

| Attribute | Assessment |
|---|---|
| Encryption at rest | Yes — OS keyring |
| Access control | OS keyring ACL |
| Tool dependency | DBus Secret Service daemon |
| Server compatibility | Incompatible — Ubuntu 24.04 LTS headless, no GUI/keyring daemon running |
| Risk if home dir exposed | Keys stored in keyring, not in home dir files |

**Decision: Rejected.** DBus Secret Service is not available on this headless server. `stellar keys generate --secure-store` would fail at runtime.

### Option C: `secret-tool` (libsecret CLI)

| Attribute | Assessment |
|---|---|
| Encryption at rest | Yes — OS keyring |
| Access control | OS keyring ACL |
| Tool dependency | DBus Secret Service daemon |
| Server compatibility | Incompatible — same DBus constraint as Option B |
| Risk if home dir exposed | Keys stored in keyring, not in home dir files |

**Decision: Rejected.** `secret-tool` requires a running DBus Secret Service. Confirmed not available on this server.

### Option D: GPG symmetric encrypted file (Selected)

| Attribute | Assessment |
|---|---|
| Encryption at rest | Yes — AES-256 symmetric passphrase |
| Access control | File permissions 600 + passphrase |
| Tool dependency | `gpg` 2.4.4 (confirmed installed) |
| Server compatibility | Full — no daemon required |
| Risk if home dir exposed | Ciphertext only; key material requires passphrase to recover |
| Operational overhead | Operator must supply passphrase on each decrypt |
| Testnet suitability | Appropriate — low operational frequency |

**Decision: Selected.** GPG is available, requires no running daemon, provides encryption at rest with a known-good algorithm (AES-256), and fits the existing home-directory secret file convention.

---

## 7. Storage Specification

### 7.1 File Location and Name

```
~/.stellar-testnet-secrets.gpg
```

Absolute path: `/home/webadmin/.stellar-testnet-secrets.gpg`

The `.gpg` extension is conventional for GPG-encrypted files and signals to operators that the file is not directly readable.

### 7.2 Plaintext Format (before encryption)

The file contents before encryption are a shell-sourceable key=value block with no `export` statements, for clarity. Example shape (not real values):

```
TESTNET_PUBLIC_KEY=GABCDE...XXXXXX
TESTNET_SECRET_KEY=SABCDE...XXXXXX
TESTNET_NETWORK=testnet
TESTNET_CREATED=2026-08-19
```

Variables:

| Variable | Description |
|---|---|
| `TESTNET_PUBLIC_KEY` | Stellar G... public key for the testnet account |
| `TESTNET_SECRET_KEY` | Stellar S... secret key for the testnet account |
| `TESTNET_NETWORK` | Literal string `testnet` |
| `TESTNET_CREATED` | ISO date of key generation (for audit trail) |

### 7.3 Encryption Command

```bash
gpg --symmetric \
    --cipher-algo AES256 \
    --armor \
    --output ~/.stellar-testnet-secrets.gpg \
    /path/to/plaintext-temp-file
```

Or to encrypt from stdin without writing plaintext to disk:

```bash
printf 'TESTNET_PUBLIC_KEY=...\nTESTNET_SECRET_KEY=...\nTESTNET_NETWORK=testnet\nTESTNET_CREATED=2026-08-19\n' \
  | gpg --symmetric --cipher-algo AES256 --armor \
        --output ~/.stellar-testnet-secrets.gpg
```

GPG will prompt interactively for a passphrase. The passphrase must be stored separately by the operator (e.g., password manager). It must never be written into any file on this server.

### 7.4 File Permissions

After creation:

```bash
chmod 600 ~/.stellar-testnet-secrets.gpg
chown webadmin:webadmin ~/.stellar-testnet-secrets.gpg
```

Verify:

```bash
ls -la ~/.stellar-testnet-secrets.gpg
# Expected: -rw------- 1 webadmin webadmin ... .stellar-testnet-secrets.gpg
```

### 7.5 Decryption Procedure (On-Demand)

To read values into the current shell session only (values are not written to disk):

```bash
eval "$(gpg --decrypt --quiet ~/.stellar-testnet-secrets.gpg)"
echo "Public key: $TESTNET_PUBLIC_KEY"
# Use variables, then unset when done:
unset TESTNET_PUBLIC_KEY TESTNET_SECRET_KEY TESTNET_NETWORK TESTNET_CREATED
```

To pipe directly into a one-shot script without polluting the shell environment:

```bash
gpg --decrypt --quiet ~/.stellar-testnet-secrets.gpg \
  | env -S "$(cat)" ./testnet-deploy.sh
```

The plaintext is never written to a file at any point in either procedure.

### 7.6 Verification Without Exposing Secret

To confirm the encrypted file is decryptable (dry run):

```bash
gpg --decrypt --dry-run ~/.stellar-testnet-secrets.gpg
```

`--dry-run` causes GPG to verify the passphrase and MAC but discard the plaintext output. This is safe for routine checks.

---

## 8. Backup

The encrypted file may be backed up normally because:

- The ciphertext is safe to store anywhere that the passphrase is not also stored
- The passphrase must be stored out-of-band (operator password manager or printed and stored securely)
- Backup locations may include: off-host amber-pangolin backup (same rclone pipeline as DB backups), or a password manager attachment

**Never back up the plaintext or the passphrase to the same location as the encrypted file.**

---

## 9. Rotation Procedure

To rotate the testnet keypair (e.g., if passphrase is suspected compromised, or for periodic hygiene):

1. Generate a new testnet keypair using the Stellar CLI
2. Fund the new testnet account via Friendbot (`https://friendbot.stellar.org/?addr=<NEW_PUBLIC_KEY>`)
3. Decrypt the existing file to verify the current values:
   ```bash
   gpg --decrypt --quiet ~/.stellar-testnet-secrets.gpg
   ```
4. Prepare new plaintext content with updated key values and the current date
5. Re-encrypt to the same path:
   ```bash
   printf 'TESTNET_PUBLIC_KEY=<NEW>\nTESTNET_SECRET_KEY=<NEW_SECRET>\n...\n' \
     | gpg --symmetric --cipher-algo AES256 --armor \
           --output ~/.stellar-testnet-secrets.gpg
   ```
6. Verify the new file is decryptable:
   ```bash
   gpg --decrypt --dry-run ~/.stellar-testnet-secrets.gpg
   ```
7. Confirm permissions are still 600:
   ```bash
   ls -la ~/.stellar-testnet-secrets.gpg
   ```
8. If the passphrase itself is being rotated, use the old passphrase to decrypt, then re-encrypt with the new passphrase. The re-encrypt step overwrites the file in place.

---

## 10. Deletion and Revocation

Testnet accounts hold no real funds and no real value. Revocation is simple:

```bash
rm ~/.stellar-testnet-secrets.gpg
```

After deletion:

- The testnet private key is unrecoverable from this server
- The testnet Stellar account becomes permanently inaccessible
- Any testnet contract deployed by the key retains the key as admin; no further admin operations will be possible from this server
- No mainnet funds are at risk
- No production services are affected

If the testnet account or contract should be formally abandoned, no additional on-chain operation is needed for testnet (the network will eventually prune inactive testnet accounts).

---

## 11. What Must Never Be Logged or Committed

The following values must never appear in:

- Git commits or diffs
- Log files (`/home/webadmin/logs/`)
- Application stdout or stderr
- CI/CD pipeline output
- Any markdown documentation file
- Shell history (`~/.bash_history` or `~/.zsh_history`)

| Item | Must Not Be Logged/Committed |
|---|---|
| `TESTNET_SECRET_KEY` (S... value) | Never |
| GPG passphrase | Never |
| Seed phrase (if generated from mnemonic) | Never |
| Production `NFT_MINTER_SECRET` | Never (existing rule, unchanged) |
| Decrypted plaintext content | Never |

To reduce shell history exposure when working with the secret, prefix decrypt commands with a space (disables history in most shells with `HISTCONTROL=ignorespace`) or use `history -d` to remove specific entries after the session.

---

## 12. Security Requirements

| Requirement | Implementation |
|---|---|
| Encryption at rest | AES-256 symmetric via GPG |
| Passphrase-based access | Operator must supply passphrase interactively; no passphrase on disk |
| File access control | 600 permissions, webadmin:webadmin ownership |
| No plaintext on disk | Decrypt via pipe or eval only; no intermediate plaintext file |
| Isolation from production | Separate file; no co-mingling with `~/.env.secrets` |
| Network isolation | Key flagged `TESTNET_NETWORK=testnet`; application env var `NFT_STELLAR_NETWORK` must be `testnet` when loaded |
| Auditability | `TESTNET_CREATED` field records generation date |
| Revocability | Simple `rm` revokes access |

---

## 13. Relationship to Production

| Aspect | Production | Testnet |
|---|---|---|
| Secret storage | `~/.env.secrets` (plaintext, 600) | `~/.stellar-testnet-secrets.gpg` (AES-256 encrypted, 600) |
| Secret injection | Docker compose `env_file:` + `environment:` block | Decrypt-on-demand by operator script |
| Network | `public` (mainnet) | `testnet` |
| Contract | `CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524` | New contract deployed during testnet phase |
| Key reuse | Not permitted on testnet | Not permitted on mainnet |
| Application env var | `NFT_MINTER_SECRET` | `NFT_MINTER_SECRET` (with testnet value when in testnet mode) |

Production files are not read, modified, or referenced during any testnet operation.

---

## 14. Acceptance Criteria

- [ ] `~/.stellar-testnet-secrets.gpg` exists after keypair generation
- [ ] File permissions are exactly `600` and owner is `webadmin:webadmin`
- [ ] `gpg --decrypt --dry-run ~/.stellar-testnet-secrets.gpg` returns exit code 0 without prompting for passphrase when called with the correct passphrase
- [ ] Decrypted content contains `TESTNET_PUBLIC_KEY`, `TESTNET_SECRET_KEY`, `TESTNET_NETWORK=testnet`, and `TESTNET_CREATED`
- [ ] `TESTNET_NETWORK` value is `testnet` (not `public`)
- [ ] `TESTNET_PUBLIC_KEY` starts with `G` and is 56 characters
- [ ] `TESTNET_SECRET_KEY` starts with `S` and is 56 characters
- [ ] The production `~/.env.secrets` file is unmodified (verify via `md5sum` or `stat` timestamp before/after)
- [ ] No testnet secret value appears in any git-tracked file
- [ ] No testnet secret value appears in `~/.bash_history` (verify or purge relevant lines)
- [ ] File is not readable by other users: `sudo -u nobody cat ~/.stellar-testnet-secrets.gpg` returns permission denied

---

## 15. Approval Gates

Before proceeding to keypair generation:

- [ ] This specification has been reviewed and accepted by the operator
- [ ] The operator has a password manager or secure out-of-band store ready to record the GPG passphrase
- [ ] The production `~/.env.secrets` has been confirmed to contain only production values (no testnet contamination)
- [ ] The operator understands that the testnet keypair public address must be used in all testnet contract constructor calls (not the production minter address)
