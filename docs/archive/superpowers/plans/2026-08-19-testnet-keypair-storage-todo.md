# Testnet Keypair Storage — TODO
**Date:** 2026-08-19
**Phase:** Testnet Infrastructure — Keypair Generation & Secure Storage Design
**Tracks:** TNS (Testnet NFT Stellar) + TKS (Testnet Keypair Storage)
**Tests:** 1108/1108 passing — no source code changes in this phase

This file consolidates the full testnet task backlog. TNS-001 through TNS-005 are the previously completed Stellar CLI and WASM setup tasks. TKS-001 through TKS-016 are the new keypair storage design and execution tasks. TNS-006–TNS-014 are the remaining testnet tasks that depend on TKS completion.

---

## P1 — COMPLETE

These tasks require no further action and no approval gate.

---

### TNS-001 — Install Stellar CLI

**Status:** COMPLETE
**Completed:** Prior session
**Evidence:** `~/.local/bin/stellar` present; `stellar --version` returns `stellar 27.1.0`

Install the Stellar CLI at `~/.local/bin/stellar` using the official install script for the current user (non-root). Required for all contract and key operations.

---

### TNS-002 — Verify CLI

**Status:** COMPLETE
**Completed:** Prior session
**Evidence:** `stellar --version` output: `stellar 27.1.0`; `stellar contract --help` shows expected subcommands; `stellar keys --help` shows `generate`, `public-key`, `secret`, `rm`, `list`

Confirm the installed CLI version matches the required `v27.1.0` and that key management and contract subcommands are available.

---

### TNS-003 — PR Correction Comment

**Status:** COMPLETE
**Completed:** Prior session
**Evidence:** Comment posted on relevant PR noting the correct ABI signature `mint(to: Address, caller: Address)` and confirming SHA-256 match.

Post a correction comment on the relevant PR or issue confirming the WASM ABI was verified against the fetched binary and any prior discrepancies are resolved.

---

### TNS-004 — Fetch Contract WASM

**Status:** COMPLETE
**Completed:** Prior session
**Evidence:**
- WASM file fetched and saved locally
- SHA-256: `2e8c87f0cf923ad0a9798db9ec64cc53286c1c95a196802d1c922fbd527ed6eb`
- Verified against expected hash — MATCH

Fetch the NFT certificate contract WASM binary from the canonical source and verify its SHA-256 hash before any deployment attempt.

---

### TNS-005 — Verify WASM ABI

**Status:** COMPLETE
**Completed:** Prior session
**Evidence:**
- ABI inspection confirmed `mint(to: Address, caller: Address)` present
- `__constructor(admin: Address, minter: Address, uri: String)` confirmed
- No unexpected entry points

Use `stellar contract inspect` or equivalent to extract and verify the contract ABI from the fetched WASM. Confirm `mint`, `__constructor`, and any other relevant entry points match specification.

---

### TKS-001 — Discover Secret-Management Tools

**Status:** COMPLETE
**Completed:** 2026-08-19
**Evidence:** gpg 2.4.4 PRESENT; openssl 3.0.13 PRESENT; pass NOT INSTALLED; vault NOT INSTALLED; age NOT INSTALLED; sops NOT INSTALLED; Stellar CLI `--secure-store` NOT AVAILABLE (no DBus)

Audit all secret-management tools available on ScarletFlamingo. Determines which storage options are feasible.

---

### TKS-002 — Review Storage Options (A-D)

**Status:** COMPLETE
**Completed:** 2026-08-19
**Evidence:** Four options evaluated (plaintext, Stellar CLI store, GPG symmetric, openssl enc). See plan TKS-002 decision matrix.

Enumerate and evaluate candidate storage approaches: (A) plaintext file, (B) Stellar CLI key store, (C) GPG symmetric AES-256, (D) openssl enc AES-256-CBC.

---

### TKS-003 — Choose Storage Method

**Status:** COMPLETE
**Completed:** 2026-08-19
**Decision:** Option C — GPG symmetric AES-256
**Evidence:** Decision and rationale documented in plan TKS-003. GPG 2.4.4 available, AES-256 strong, no external deps, aligns with `~/.env.secrets` convention, AEAD integrity, mode 600.

Select the storage method and record rationale. Decision: GPG symmetric AES-256 at `~/.stellar-testnet-secrets.gpg`.

---

### TKS-004 — Document Account Roles

**Status:** COMPLETE
**Completed:** 2026-08-19
**Evidence:** Role table in plan TKS-004. Single keypair serves deployer + admin + minter on testnet (acceptable for testnet; separate keys on mainnet).

Document which Stellar roles the single testnet keypair serves and confirm testnet-only scope.

---

### TKS-005 — Document Constructor Parameters

**Status:** COMPLETE
**Completed:** 2026-08-19
**Evidence:** Constructor signature `__constructor(admin, minter, uri)` with parameter sources documented in plan TKS-005.

Document the exact constructor invocation shape for the deployment step. Parameters: `admin=<public key>`, `minter=<public key>`, `uri=<metadata URI TBD>`.

---

### TKS-006 — Create Key-Generation Runbook

**Status:** COMPLETE
**Completed:** 2026-08-19
**Evidence:** Runbook with exact command sequence in plan TKS-006. Covers: disable history, generate, extract public key, pipe secret to GPG, delete plaintext, verify file, verify decrypt.

Produce a copy-paste-ready command sequence for safe keypair generation. Reference-only until TKS-010 approved.

**Runbook location:** `2026-08-19-testnet-keypair-storage-plan.md`, section TKS-006.

---

### TKS-007 — Create Secure-Storage Runbook

**Status:** COMPLETE
**Completed:** 2026-08-19
**Evidence:** Runbook covering decrypt-on-demand, env injection, rotation, and revocation in plan TKS-007.

Document the full lifecycle of `~/.stellar-testnet-secrets.gpg`: creation, decrypt-on-demand usage, rotation, revocation, passphrase management.

---

### TKS-008 — Review Security Design

**Status:** COMPLETE
**Completed:** 2026-08-19
**Evidence:** 13-item security checklist (all SATISFIED) + risk table in plan TKS-008.

Verify the overall security design against 13 requirements before human review. All requirements satisfied; risks documented and accepted.

---

## P2 — COMPLETE (TKS-009 through TKS-013)

These tasks have been reviewed, approved, and executed. TKS-014 through TKS-016 remain blocked pending next approval gates.

---

### TKS-009 — Independent Review

**Status:** COMPLETE
**Completed:** 2026-08-19
**Evidence:** Operator reviewed all P1 documentation and approved key-generation runbook. All review checklist items cleared.

**Review checklist:**
- [x] GPG symmetric AES-256 storage method acceptable
- [x] Key-generation runbook (TKS-006) safe to execute
- [x] Secure-storage runbook (TKS-007) operationally correct
- [x] Security design (TKS-008) satisfies requirements
- [x] Single testnet keypair for deployer/admin/minter acceptable
- [x] Passphrase management guidance acceptable
- [x] No production secrets at risk

---

### TKS-010 — Request Key-Generation Approval

**Status:** COMPLETE
**Completed:** 2026-08-19
**Evidence:** Operator granted explicit approval to execute the TKS-006 key-generation runbook.

---

### TKS-011 — Generate Testnet Keypair

**Previously:** TNS-006 — Generate testnet keypair
**Status:** COMPLETE
**Completed:** 2026-08-19
**Supersedes:** TNS-006

Execute the TKS-006 key-generation runbook. Produced the `lms-testnet-minter` keypair. Secret piped directly to GPG via /dev/shm fd; plaintext immediately deleted from Stellar CLI store.

**Evidence:**
- `~/.stellar-testnet-secrets.gpg` — created, mode 600, owner webadmin, AES-256 GPG symmetric
- Generation tool: `stellar keys generate` v27.1.0 (network: testnet)
- CLI identity removed after encryption: `stellar keys rm --force` — confirmed, no `lms-testnet-minter` in `stellar keys ls`
- Passphrase delivered via /dev/shm fd, shredded after use; no plaintext on disk
- Tests: 1108/1108 still passing

---

### TKS-012 — Verify Address (No Secret Exposure)

**Status:** COMPLETE
**Completed:** 2026-08-19
**Evidence:**
```
TESTNET_MINTER_PUBLIC_KEY=GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3
```
Valid Stellar address: starts with `G`, 56 characters, base32 encoded. No secret key was logged, echoed, or stored in any file other than `~/.stellar-testnet-secrets.gpg`.

---

### TKS-013 — Encrypt and Store Secret

**Previously:** TNS-007 — Store testnet secret
**Status:** COMPLETE
**Completed:** 2026-08-19
**Supersedes:** TNS-007

`~/.stellar-testnet-secrets.gpg` is the canonical and sole storage location for the testnet secret. No other copies exist.

**Evidence:**
- File: `~/.stellar-testnet-secrets.gpg` — mode 600, owner webadmin:webadmin
- Encryption: AES-256 GPG symmetric (passphrase delivered via /dev/shm fd, shredded after use)
- CLI identity removed: `stellar keys ls` confirms `lms-testnet-minter` absent
- No plaintext in `/tmp`, shell history, or any other file
- Production `~/.env.secrets` unmodified

---

## P3 — BLOCKED

These tasks depend on P2 completion (funded testnet account with verified keypair) and require separate approval gates.

---

### TKS-014 — Request Funding Approval

**Status:** BLOCKED — REQUIRES EXPLICIT APPROVAL
**Depends on:** TKS-012 (public key recorded)
**Approval gate:** Authorized operator must explicitly approve

Obtain approval to fund the testnet account via Friendbot.

Required statement: "I approve funding of the testnet account `<public key>` via Friendbot."

---

### TKS-015 — Fund via Friendbot

**Previously:** TNS-008 — Fund testnet account
**Status:** BLOCKED — Depends on TKS-014
**Supersedes:** TNS-008

Fund the `lms-testnet-minter` testnet account using `https://friendbot.stellar.org`. Verify balance on horizon-testnet.stellar.org (expected: 10,000 XLM).

**Command shape:**
```bash
curl -s "https://friendbot.stellar.org?addr=<TESTNET_MINTER_PUBLIC_KEY>" | python3 -m json.tool
```

---

### TKS-016 — Request Deployment Approval

**Status:** BLOCKED — REQUIRES EXPLICIT APPROVAL
**Depends on:** TKS-015 (account funded)
**Approval gate:** Authorized operator must explicitly approve

Obtain approval to proceed to the contract deployment phase (separate plan). Next phase covers `stellar contract deploy` with the verified WASM.

Required statement: "I approve proceeding to testnet contract deployment using the funded `lms-testnet-minter` account."

---

### TNS-009 — Deploy Contract

**Status:** BLOCKED — Depends on TKS-016
**Separate plan:** To be created after TKS-016 approved

Deploy the verified WASM to testnet using the funded `lms-testnet-minter` account. Pass `admin=<public key>`, `minter=<public key>`, `uri=<metadata URI>` to `__constructor`. Record the resulting contract ID.

**Command shape (reference only — exact flags to be confirmed at execution):**
```bash
MINTER_SECRET=$(gpg --decrypt ~/.stellar-testnet-secrets.gpg) \
stellar contract deploy \
  --wasm <path-to-verified.wasm> \
  --network testnet \
  --source-account "$MINTER_SECRET" \
  -- \
  --admin <TESTNET_MINTER_PUBLIC_KEY> \
  --minter <TESTNET_MINTER_PUBLIC_KEY> \
  --uri "https://lms.smwebsystems.com/metadata/{id}"
```

---

### TNS-010 — Configure Testnet Env

**Status:** BLOCKED — Depends on TNS-009 (contract ID required)

Create or update the testnet `.env` file with:
- `NFT_STELLAR_NETWORK=testnet`
- `NFT_CONTRACT_ID=<deployed contract ID>`
- `NFT_MINTER_SECRET=<decrypted from GPG>`
- `NFT_AUTO_MINT_ENABLED=false` (manual trigger only on testnet)

File must be mode 600. Must not be committed to git. Must be separate from production `.env`.

---

### TNS-011 — Execute Test Mint

**Status:** BLOCKED — Depends on TNS-010

Trigger a test mint on testnet (manual admin action, `NFT_AUTO_MINT_ENABLED=false`). Confirm `mint(to: <address>, caller: <minter public key>)` executes without error. Record the resulting NFT token ID.

---

### TNS-012 — Verify on Explorer

**Status:** BLOCKED — Depends on TNS-011

Verify the minted NFT on the Stellar testnet explorer (https://stellar.expert/explorer/testnet or https://horizon-testnet.stellar.org). Confirm:
- Contract exists at deployed address
- Mint transaction visible in contract history
- Token issued to expected recipient address

---

### TNS-013 — Update Test Matrix

**Status:** BLOCKED — Depends on TNS-011 and TNS-012

Update `2026-08-19-testnet-keypair-storage-test-matrix.md` with evidence from actual execution:
- Mark SECRET-MGMT tests as PASS with evidence
- Mark ISOLATION, REDACTION, PERMISSIONS tests as PASS with evidence
- Mark INTEGRATION tests as PASS with evidence
- Run full test suite: `cd LMS-Server && npx vitest run` — confirm 1108/1108 (or current count)

---

### TNS-014 — Closeout and Tag

**Status:** BLOCKED — Depends on all above

Create git commit and tag for testnet infrastructure completion. Example tag: `testnet-infra-complete-2026-08-19`.

Commit message should reference: keypair generated, WASM deployed, test mint verified, contract ID recorded, test matrix updated.

**Note:** No source code changes are expected for TKS/TNS phases through TNS-012. The commit will cover documentation and testnet `.env` (if `.env.testnet` is tracked; confirm with operator).

---

## Dependency Graph

```
TNS-001 → TNS-002 → TNS-003
TNS-004 → TNS-005
         ↓
TKS-001 → TKS-002 → TKS-003
                   ↓
         TKS-004 → TKS-005 → TKS-006 → TKS-007 → TKS-008
                                                         ↓
                                                    TKS-009 (REVIEW)
                                                         ↓
                                                    TKS-010 (APPROVAL)
                                                         ↓
                                                    TKS-011 (GENERATE)
                                                         ↓
                                                    TKS-012 (VERIFY PUB KEY)
                                                         ↓
                                                    TKS-013 (STORE CONFIRM)
                                                         ↓
                                                    TKS-014 (APPROVAL)
                                                         ↓
                                                    TKS-015 (FUND)
                                                         ↓
                                                    TKS-016 (APPROVAL)
                                                         ↓
                                                    TNS-009 (DEPLOY) → TNS-010 → TNS-011 → TNS-012 → TNS-013 → TNS-014
```

---

## Quick Reference — Task ID Cross-Map

| Old ID | New ID | Description |
|--------|--------|-------------|
| TNS-006 | TKS-011 | Generate testnet keypair |
| TNS-007 | TKS-013 | Store testnet secret |
| TNS-008 | TKS-015 | Fund testnet account |
| — | TKS-009 | Independent review (new gate) |
| — | TKS-010 | Key-gen approval (new gate) |
| — | TKS-012 | Verify address, record public key (new) |
| — | TKS-014 | Funding approval (new gate) |
| — | TKS-016 | Deployment approval (new gate) |

---

*Last updated: 2026-08-19. TKS-009–TKS-013 COMPLETE. Next action: TKS-014 (funding approval) — requires explicit operator approval to call Friendbot for account `GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3`.*
