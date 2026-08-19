# Secret Handling and Reporting Policy

**Date:** 2026-08-19
**Scope:** All sessions, automation tools, scripts, and reports on SM Web Systems infrastructure
**Status:** ACTIVE — applies immediately

---

## 1. Purpose

This policy defines explicit rules for handling secret values (passphrases, private keys, seed phrases, API keys, passwords) during automated sessions, scripting, and reporting. It was established following the incident INC-2026-08-19-001, in which a GPG passphrase was exposed in session output via a `cat` command on a temporary file.

The goal is to ensure that no secret value ever appears in session output, tool output, reports, commits, issues, pull requests, or documentation — regardless of how briefly or incidentally.

---

## 2. Definitions

| Term | Definition |
|---|---|
| Secret value | Any passphrase, private key, seed phrase, mnemonic, API key, password, HMAC key, JWT secret, or similar sensitive string |
| Session output | Any text produced by a tool call, command execution, or automation step that is captured in a session transcript |
| Metadata | Non-sensitive descriptive information about a file or resource: path, permissions, size, type, owner, modification time |
| Public address | A blockchain account identifier that is safe to share publicly (e.g. Stellar public key starting with G) |

---

## 3. Prohibited Actions

The following actions are PROHIBITED under all circumstances in automated sessions and reporting.

### 3.1 Printing secret values to terminal or tool output

PROHIBITED:
```bash
# These commands MUST NEVER be run on files containing secrets
cat ~/.stellar-testnet-secrets.gpg
cat /dev/shm/.gpg-passphrase-tmp
echo "$PASSPHRASE"
printf "%s\n" "$MY_SECRET_KEY"
```

Any `cat`, `echo`, `printf`, `head`, `tail`, `less`, `more`, or equivalent command on a file whose contents include a secret value is prohibited in an automated session.

### 3.2 Displaying private keys in tool output

PROHIBITED:
```bash
stellar keys secret
stellar keys secret --name my-key
gpg --decrypt ~/.stellar-testnet-secrets.gpg
gpg --decrypt ~/.stellar-testnet-secrets.gpg | cat
```

These commands produce private key material on stdout. They must never be run via an automation tool. If key verification is needed, verify by metadata or by a silent decryption check with output redirected to /dev/null.

### 3.3 Including secret values in reports, issues, PRs, or documentation

PROHIBITED:
- Writing a passphrase in any specification, incident report, closeout document, or plan
- Including a private key in any commit message, PR body, issue comment, or documentation file
- Quoting or redacting-but-guessable secret values ("the passphrase was: xxxxxx1234")
- Logging secret values in structured log output

### 3.4 Passing secrets as command-line arguments

PROHIBITED:
```bash
gpg --passphrase "mysecretpassword" --decrypt file.gpg
gpg --passphrase-fd 0 <<< "mysecretpassword"
openssl ... -passin pass:mysecretpassword
```

Command-line arguments are visible in process listings (`ps aux`), shell history, and automation logs. Passphrases must be entered via interactive prompts only.

### 3.5 Storing secrets in environment variables accessible to tools

PROHIBITED:
```bash
export PASSPHRASE="mysecretpassword"
GPG_PASSPHRASE="abc123" gpg --decrypt ...
```

Environment variables set in an automated session context may be logged or inspected by tooling. Use interactive prompts instead.

### 3.6 Committing secrets to git

PROHIBITED:
- Committing any file that contains a secret value
- Committing `.env` files that include live secret values
- Committing key files, encrypted or otherwise, that are intended to remain private

If a secret is accidentally committed, treat it as compromised immediately and rotate.

### 3.7 Reading secret file contents through automation tools

PROHIBITED:
- Using a Read tool, Bash tool, or any automation mechanism to read the contents of a file that contains a secret value
- This includes encrypted files: do not read the binary contents of `~/.stellar-testnet-secrets.gpg` via any tool

---

## 4. Required Practices

### 4.1 Interactive terminal entry for passphrases

Passphrases must always be entered by the user in their own interactive terminal session. GPG's default pinentry mechanism or a direct terminal prompt (`read -s`) is acceptable. No automation tool may receive, capture, or relay the passphrase.

```bash
# Correct: gpg prompts interactively
gpg --decrypt ~/.stellar-testnet-secrets.gpg > /dev/null
# User types passphrase at the prompt; it is not visible in output
```

### 4.2 Pipe-based secret handling

When a private key or other secret must be transformed (e.g. generated and encrypted), use pipes so the secret value is only present in kernel pipe buffers and is never written to any file or terminal:

```bash
# Correct: private key goes directly from stdout to gpg stdin
stellar keys secret | gpg --symmetric --cipher-algo AES256 --output ~/.stellar-testnet-secrets.gpg
```

### 4.3 /dev/shm for unavoidable temporary plaintext

If a brief plaintext intermediate is absolutely necessary (e.g. during a rotation script), use /dev/shm (RAM-backed, not persisted to disk). Shred the file immediately after use:

```bash
# Only in /dev/shm, mode 600, shred immediately after use
gpg --decrypt --output /dev/shm/tmp-secret.tmp ~/.stellar-testnet-secrets.gpg
# ... use /dev/shm/tmp-secret.tmp ...
shred -u /dev/shm/tmp-secret.tmp
```

This must only be done in a user's own interactive terminal session, not via any automation tool.

### 4.4 Metadata-only verification

When verifying that a secret file exists and is correctly configured, use metadata commands only:

```bash
# Correct: check existence, permissions, and file type without reading contents
ls -la ~/.stellar-testnet-secrets.gpg
file ~/.stellar-testnet-secrets.gpg
stat ~/.stellar-testnet-secrets.gpg
```

Expected output example (acceptable to capture in session output):
```
-rw------- 1 webadmin webadmin 512 2026-08-19 10:00 /home/webadmin/.stellar-testnet-secrets.gpg
/home/webadmin/.stellar-testnet-secrets.gpg: GPG symmetrically encrypted data (AES256 cipher)
```

None of this output contains any secret value.

### 4.5 Silent decryption for verification

When verifying that a file can be decrypted (without exposing contents), redirect output to /dev/null:

```bash
# Correct: verifies decryption succeeds without printing the secret
gpg --decrypt ~/.stellar-testnet-secrets.gpg > /dev/null
# Check exit code: 0 = success, non-zero = failure
```

This must be done in an interactive terminal session (not via automation), so the passphrase prompt is entered by the user.

### 4.6 Scripts involving secrets must be run manually

Any script that touches passphrase entry, private key handling, or secret file operations must be:
- Prepared by automation (the script file written to disk)
- Executed manually by the user in their own terminal session

The script file itself must not contain any secret values (passphrases, private keys). It may contain instructions for how to enter them interactively.

---

## 5. Reporting Rules

When writing incident reports, closeout documents, specifications, or session summaries:

| Item | Rule |
|---|---|
| Public blockchain addresses | ALLOWED — safe to include verbatim |
| File paths | ALLOWED — e.g. `~/.stellar-testnet-secrets.gpg` |
| File permissions and metadata | ALLOWED — e.g. "mode 600, AES-256, owner webadmin" |
| Encryption algorithm and cipher | ALLOWED — e.g. "AES-256 symmetric" |
| Command structures (without values) | ALLOWED — e.g. "piped via `stellar keys secret | gpg --symmetric`" |
| Passphrase values | NEVER — not even partial, redacted, or hinted |
| Private key values | NEVER — not even partial, redacted, or hinted |
| Seed phrases / mnemonics | NEVER |
| API keys, JWT secrets, HMAC keys | NEVER |
| Passwords | NEVER |

---

## 6. Incident Classification

| Exposure type | Severity | Required action |
|---|---|---|
| Passphrase only, private key not exposed | MEDIUM | Rotate passphrase; do not regenerate keypair unless conditions met |
| Private key text in session output | CRITICAL | Abandon account immediately; generate replacement |
| Private key text in committed code | CRITICAL | Abandon account; rotate; audit all systems with access |
| Passphrase in committed code | HIGH | Rotate passphrase; audit git history |
| Secret in PR/issue body | HIGH | Rotate; remove from PR/issue via platform tools |

---

## 7. Enforcement

- These rules apply to all automated sessions, agent operations, and scripting performed on SM Web Systems infrastructure
- No exception exists for "temporary" or "ephemeral" display of secret values
- If there is uncertainty about whether a command will expose a secret value, the command must NOT be run via automation — it must be run manually by the user in their own terminal
- Any detected violation must be treated as an exposure incident and documented immediately

---

## 8. Acceptance Criteria

- [ ] All team members and automation agents are aware of this policy
- [ ] No `cat`, `echo`, or display command is ever run on a file containing a secret value via any automation tool
- [ ] All passphrase entry for GPG and similar tools uses interactive terminal prompts only
- [ ] All incident reports, specs, and documentation are reviewed to confirm no secret values are present
- [ ] Future keypair generation uses the approved pipe-based pattern
- [ ] Secret handling violations are treated as incidents and documented

---

*Authored: 2026-08-19 | Triggered by: INC-2026-08-19-001 | Status: ACTIVE*
