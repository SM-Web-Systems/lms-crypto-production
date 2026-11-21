# Testnet Account Abandonment — Decision Record

**Date:** 2026-08-19
**Decision:** ACCOUNT RETAINED
**Related Incident:** INC-2026-08-19-001
**Public Address:** GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3

---

## 1. Decision Summary

Following the passphrase exposure incident on 2026-08-19, the testnet Stellar account is **RETAINED**. The account will remain in use after the GPG passphrase is rotated. Abandonment is not required at this time.

---

## 2. Rationale

The decision to retain rather than abandon the account is based on the following analysis:

### 2.1 What was compromised
Only the **GPG passphrase** was exposed. This passphrase protects the encrypted file `~/.stellar-testnet-secrets.gpg` via AES-256 symmetric encryption. An attacker who obtained both the encrypted file AND the passphrase could decrypt the file to obtain the private key.

### 2.2 What was not compromised
The **Stellar private key** was not exposed. The key was generated and immediately piped into GPG encryption:

```
stellar keys secret | gpg --symmetric --cipher-algo AES256 ...
```

The stdout of `stellar keys secret` went directly to GPg's stdin via the kernel pipe. The private key was never written to a terminal, never written to a file in plaintext, and was never captured in any session output. Its only plaintext existence was transiently in kernel pipe buffers, which are inaccessible to the session transcript.

No automation tool read the plaintext contents of the encrypted file at any point.

### 2.3 Current attack surface
For an attacker to compromise the private key using only the exposed passphrase, they would also need:
- Physical or remote access to the server as the webadmin user (or root), AND
- A copy of `~/.stellar-testnet-secrets.gpg`

The file is mode 600, owned by webadmin. The server is production-hardened. No external copy of the encrypted file is known to exist in any attacker-accessible location.

### 2.4 Account operational status
- The account has never been funded (0 XLM balance)
- No transactions have ever been submitted from this account
- No smart contracts have been deployed from this account
- No NFTs have been minted from this account
- The account exists on Stellar testnet only (public network operations: none)

Given the above, the risk from the passphrase exposure is low and contained. Passphrase rotation restores the security of the encryption layer without requiring private key regeneration.

---

## 3. Conditions for Abandonment

The account MUST be abandoned immediately if any of the following conditions are later discovered:

| Condition | Required Action |
|---|---|
| Private key text found in any session output, log, or document | Abandon immediately |
| `gpg --decrypt` output was captured by any tool | Abandon immediately |
| Encrypted file was copied to an attacker-accessible location before rotation | Abandon immediately |
| Evidence of unauthorized transaction from this address on any network | Abandon immediately |
| Private key was passed as a command argument in any form | Abandon immediately |

If any condition above is discovered, proceed immediately to the abandonment procedure in Section 5.

---

## 4. Current Account Status

| Property | Value |
|---|---|
| Public address | GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3 |
| Network | Stellar testnet (TESTNET) |
| XLM balance | 0 (never funded) |
| Transaction count | 0 |
| Encrypted key file | `~/.stellar-testnet-secrets.gpg` (mode 600, AES-256) |
| Key file owner | webadmin |
| Passphrase status | COMPROMISED — rotation pending |
| Funding status | BLOCKED until rotation verified |
| Deployment status | BLOCKED until rotation verified |

---

## 5. Abandonment Procedure (Conditional — Execute Only If Required)

This procedure is to be followed ONLY if one of the conditions in Section 3 is met.

### Step 1: Cease all operations
Stop any pending operations involving this account immediately.

### Step 2: Destroy the encrypted key file
```bash
shred -u ~/.stellar-testnet-secrets.gpg
shred -u ~/.stellar-testnet-secrets.gpg.bak-* 2>/dev/null || true
```

### Step 3: Record the abandonment
Create a record documenting:
- Date and time of abandonment
- Reason for abandonment (which condition from Section 3 was met)
- Public address being abandoned: GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3
- Confirmation that encrypted file was shredded

Do NOT include the private key, passphrase, or any secret value in this record.

### Step 4: Mark address as abandoned
Add the public address to a local ledger of abandoned/burned addresses so it is not reused or referenced in future configurations:
```
# Abandoned testnet addresses
# GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3 — abandoned 2026-08-19, INC-2026-08-19-001
```

### Step 5: Generate a replacement keypair
Follow the secure keypair generation procedure:
- Generate new keypair using `stellar keys generate`
- Immediately pipe output to GPG encryption
- Enter passphrase interactively (never via automation)
- Store encrypted file at `~/.stellar-testnet-secrets.gpg` (mode 600)
- Never display or capture any secret values

### Step 6: Verify replacement
Verify the replacement keypair using metadata checks only (file existence, permissions, file type). Do not decrypt or display the private key during verification.

---

## 6. Post-Rotation Unblock Criteria

The account is cleared for funding and use when ALL of the following are confirmed:

- [ ] GPG passphrase rotation completed successfully (see `2026-08-19-gpg-passphrase-rotation-spec.md`)
- [ ] Old passphrase rejected by decryption attempt
- [ ] New passphrase successfully decrypts the file (without printing output)
- [ ] No new evidence of private key exposure has been discovered
- [ ] None of the abandonment conditions in Section 3 have been triggered

---

## 7. Acceptance Criteria

- [ ] Decision documented and rationale reviewed
- [ ] Passphrase rotation completed before any funding or deployment operations
- [ ] Abandonment conditions actively monitored during rotation process
- [ ] If any abandonment condition is discovered, abandonment procedure executed immediately

---

*Authored: 2026-08-19 | Decision: RETAIN, pending passphrase rotation*
