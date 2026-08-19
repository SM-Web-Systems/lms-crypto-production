# Testnet Secret Exposure — Incident Report

**Date:** 2026-08-19
**Severity:** MEDIUM
**Status:** ROTATION VERIFIED
**Incident ID:** INC-2026-08-19-001

---

## 1. Summary

During a session on 2026-08-19, a GPG passphrase used to encrypt a Stellar testnet secret key was displayed in session output via the command `cat /dev/shm/.gpg-passphrase-tmp`. The passphrase appeared in tool output visible to the session transcript. The underlying Stellar private key was NOT exposed at any point. The GPG encryption layer is considered compromised; the private key remains secure.

---

## 2. Incident Timeline

| Time (UTC+2) | Event |
|---|---|
| Session start | Testnet keypair generation initiated |
| During session | `stellar keys secret` piped to `gpg --symmetric` — private key NOT printed |
| During session | `cat /dev/shm/.gpg-passphrase-tmp` executed — **passphrase displayed in session output** |
| Post-detection | Passphrase file shredded from /dev/shm |
| Post-detection | CLI identity removed from Stellar CLI keystore |
| Post-detection | Incident documented; rotation script prepared |
| 2026-08-19 | Rotation script failed: pinentry-curses cannot access TTY |
| 2026-08-19 | Root cause identified: missing `--pinentry-mode loopback` |
| 2026-08-19 | Script fixed: `read -s` + `--passphrase-fd 3` + atomic same-fs mv |
| 2026-08-19 | User executed rotation script successfully via SSH terminal |
| 2026-08-19 | **Rotation VERIFIED**: new passphrase accepted, old rejected, file intact |

---

## 3. Exposure Scope

| Asset | Status | Evidence |
|---|---|---|
| GPG passphrase | **COMPROMISED** | Displayed in session output via `cat /dev/shm/.gpg-passphrase-tmp` |
| Stellar private key | **NOT EXPOSED** | Piped via `stellar keys secret \| gpg --symmetric`; stdout went to gpg stdin, never to terminal |
| Seed phrase / mnemonic | **NOT EXPOSED** | Not generated or handled in this session |
| Public address (GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3) | **SAFE** | Public by design; no operational risk |
| Encrypted file (~/.stellar-testnet-secrets.gpg) | **ROTATED** | File present, mode 600, AES-256+SHA512; passphrase rotated and verified |

---

## 4. Root Cause

The passphrase was written to a temporary file on /dev/shm (`/dev/shm/.gpg-passphrase-tmp`) during the session. A subsequent `cat` command read that file's contents and the output was captured in session output visible to the session transcript. The passphrase was therefore exposed at the output layer, even though it was never passed as a command-line argument.

The root cause is the use of an automation tool to display the contents of a file that contained a secret, rather than keeping all passphrase handling off-screen and interactive.

---

## 5. Evidence: Private Key Non-Exposure

The private key was handled via the following pipe:

```
stellar keys secret | gpg --symmetric --cipher-algo AES256 ...
```

In this pattern:
- `stellar keys secret` writes the private key to its **stdout**
- The shell pipe (`|`) connects that stdout directly to **gpg's stdin**
- The private key was never written to a file on disk in plaintext
- The private key was never written to the terminal
- The private key was never captured in session output

No tool call read the contents of the encrypted file. The private key's only plaintext existence was transiently in kernel pipe buffers, which are not accessible to the session transcript.

---

## 6. Containment Actions

- [x] Passphrase file shredded: `shred -u /dev/shm/.gpg-passphrase-tmp`
- [x] Stellar CLI identity removed from local keystore
- [x] No funding operations were performed on the testnet account
- [x] No deployment or minting operations were performed
- [x] Rotation script prepared at `~/scripts/rotate-testnet-gpg-passphrase.sh`
- [x] Rotation script fixed (pinentry → loopback + atomic same-fs mv)
- [x] Manual passphrase rotation executed by user (VERIFIED 2026-08-19)

---

## 7. Impact Assessment

- **Blockchain impact:** None. The account (GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3) has never been funded. No XLM balance. No transactions. No smart contract deployments. No NFT minting.
- **Cryptographic impact:** The GPG symmetric encryption layer protecting the stored private key is considered compromised until the passphrase is rotated. An attacker with both the encrypted file and the exposed passphrase could decrypt it. The file is stored at `~/.stellar-testnet-secrets.gpg` on a server accessible only to the webadmin user (mode 600).
- **Private key impact:** None detected. The private key itself remains protected inside the encrypted file.

---

## 8. Response Plan

### Immediate (PENDING)
- User executes `~/scripts/rotate-testnet-gpg-passphrase.sh` interactively in their own terminal session
- Script decrypts with old passphrase and re-encrypts with a new user-chosen passphrase
- Plaintext is handled only in /dev/shm and shredded immediately
- No passphrase values are captured, logged, or displayed by any automation

### Short-term
- Verify rotation: old passphrase rejected, new passphrase accepted
- Resume testnet funding only after rotation is verified
- Apply lessons learned to all future secret handling procedures

---

## 9. Lessons Learned

1. **Never display passphrases in session output.** Any `cat`, `echo`, or `printf` of a file containing a secret is a disclosure event, even if the file was intended to be ephemeral.
2. **Passphrase prompts must be interactive.** GPG pinentry or equivalent interactive prompts must be used so that the passphrase is entered by the user in their terminal and is never captured by any automation layer.
3. **Treat /dev/shm files as secrets.** Files placed in /dev/shm may be RAM-backed but are not automatically protected from being read by tools operating in the same session. Any file in /dev/shm that contains a secret must never be passed to a read or display tool.
4. **Manual execution for sensitive operations.** Scripts involving passphrases or private keys must be executed manually by the user in their own terminal, not run via automation.

---

## 10. Prevention

- Future passphrases must be entered via interactive terminal only (GPG pinentry, terminal prompt)
- Automation tools must never be instructed to read, display, or report the contents of files that contain or may contain secret values
- Session reports and incident reports must reference file paths and metadata only — never secret values
- The secret handling policy (see `2026-08-19-secret-handling-and-reporting-spec.md`) defines the full set of prohibited and required practices

---

## 11. Acceptance Criteria

- [x] `~/scripts/rotate-testnet-gpg-passphrase.sh` executed successfully by user
- [x] Old passphrase is rejected by `gpg --decrypt ~/.stellar-testnet-secrets.gpg`
- [x] New passphrase successfully decrypts the file
- [x] Decrypted content is confirmed to be the original private key material
- [x] `~/.stellar-testnet-secrets.gpg` remains mode 600 after rotation
- [x] No passphrase value appears in any session output, commit, issue, or document
- [ ] Testnet account funding is unblocked after rotation verified — BLOCKED pending separate approval

---

*Authored: 2026-08-19 | Incident phase: ROTATION VERIFIED — funding still BLOCKED pending separate approval*
