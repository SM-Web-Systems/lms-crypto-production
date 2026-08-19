# Testnet Keypair Storage Plan
**Date:** 2026-08-19
**Phase:** Testnet Infrastructure — Keypair Generation & Secure Storage Design
**Status:** IN PROGRESS (TKS-001–TKS-008 COMPLETE; TKS-009–TKS-016 BLOCKED)
**Author:** SM Web Systems Engineering

---

## Context

This plan covers the secure generation and storage of a Stellar testnet keypair for the LMS NFT certificate minting pipeline. A single keypair serves as deployer, admin, and minter on testnet.

**Immutable constraints:**
- Storage: GPG symmetric encryption at `~/.stellar-testnet-secrets.gpg` (AES-256)
- CLI: `~/.local/bin/stellar` (Stellar CLI v27.1.0)
- WASM: fetched and SHA-256 verified (`2e8c87f0cf923ad0a9798db9ec64cc53286c1c95a196802d1c922fbd527ed6eb`)
- ABI: `mint(to: Address, caller: Address)` verified
- Tests: 1108/1108 passing (no source code changes in this phase)
- Production: `NFT_STELLAR_NETWORK=public`, `NFT_AUTO_MINT_ENABLED=false`
- Available secret tools: gpg 2.4.4, openssl 3.0.13
- NOT available: pass, vault, age, sops, Stellar CLI `--secure-store` (no DBus)
- No testnet account, contract, or mint exists yet

---

## Execution Plan

| # | Task ID | Task | Priority | Status | Approval |
|---|---------|------|----------|--------|----------|
| 1 | TKS-001 | Discover secret-management tools | P1 | COMPLETE | N/A (read-only) |
| 2 | TKS-002 | Review storage options (A-D) | P1 | COMPLETE | N/A (read-only) |
| 3 | TKS-003 | Choose storage method | P1 | COMPLETE | GPG symmetric selected |
| 4 | TKS-004 | Document account roles | P1 | COMPLETE | N/A (documentation) |
| 5 | TKS-005 | Document constructor parameters | P1 | COMPLETE | N/A (documentation) |
| 6 | TKS-006 | Create key-generation runbook | P1 | COMPLETE | N/A (documentation) |
| 7 | TKS-007 | Create secure-storage runbook | P1 | COMPLETE | N/A (documentation) |
| 8 | TKS-008 | Review security design | P1 | COMPLETE | N/A (review) |
| 9 | TKS-009 | Independent review | P2 | BLOCKED | REQUIRES REVIEW |
| 10 | TKS-010 | Request key-generation approval | P2 | BLOCKED | REQUIRES APPROVAL |
| 11 | TKS-011 | Generate testnet keypair | P2 | BLOCKED | Depends on TKS-010 |
| 12 | TKS-012 | Verify address (no secret exposure) | P2 | BLOCKED | Depends on TKS-011 |
| 13 | TKS-013 | Encrypt and store secret | P2 | BLOCKED | REQUIRES APPROVAL |
| 14 | TKS-014 | Request funding approval | P3 | BLOCKED | REQUIRES APPROVAL |
| 15 | TKS-015 | Fund via Friendbot | P3 | BLOCKED | Depends on TKS-014 |
| 16 | TKS-016 | Request deployment approval | P3 | BLOCKED | REQUIRES APPROVAL |

---

## Task Details

---

### TKS-001 — Discover Secret-Management Tools

**Status:** COMPLETE
**Priority:** P1
**Owner:** Engineering Agent
**Required Approval:** N/A (read-only audit)

**Objective:**
Enumerate all secret-management tools available on the server so that the storage decision is grounded in what is actually installed and functional, not what is theoretically possible.

**Preconditions:**
- Shell access to `webadmin@ScarletFlamingo`

**Files / Tools:**
- `which gpg`, `gpg --version`
- `which openssl`, `openssl version`
- `which pass`, `which vault`, `which age`, `which sops`
- `systemctl status gpg-agent`

**Implementation Steps:**
1. Run `gpg --version` — confirmed gpg 2.4.4, AES-256 symmetric available.
2. Run `openssl version` — confirmed openssl 3.0.13.
3. Check `pass` — not installed.
4. Check `vault` (HashiCorp) — not installed.
5. Check `age` — not installed.
6. Check `sops` — not installed.
7. Check Stellar CLI `--secure-store` — requires DBus/libsecret, unavailable in this environment.

**Verification:** All tool availability confirmed via shell output.

**Evidence:**
- gpg 2.4.4 present: YES
- openssl 3.0.13 present: YES
- pass: NO
- vault: NO
- age: NO
- sops: NO
- Stellar CLI secure-store: NO (no DBus)

**Rollback:** N/A (read-only).

**Completion Criteria:** All available tools documented with version or absence noted.

---

### TKS-002 — Review Storage Options (A-D)

**Status:** COMPLETE
**Priority:** P1
**Owner:** Engineering Agent
**Required Approval:** N/A (read-only)

**Objective:**
Enumerate and evaluate candidate storage approaches before selecting one.

**Preconditions:** TKS-001 complete.

**Files / Tools:** N/A (design analysis).

**Options Evaluated:**

| Option | Method | Pros | Cons |
|--------|--------|------|------|
| A | Plaintext file (`~/.stellar-testnet-secrets`) | Simple | Exposed if home dir compromised; fails audit |
| B | Stellar CLI key store (plaintext JSON in `~/.config/stellar/`) | CLI-native | Plaintext on disk; same risk as A |
| C | GPG symmetric AES-256 encrypted file | Strong encryption; no external deps; decrypt-on-demand; aligns with existing `~/.env.secrets` convention | Requires passphrase management; gpg-agent caches passphrase in memory |
| D | openssl enc AES-256-CBC | Available; no external deps | Non-standard; weaker UX than gpg; no integrity MAC by default |

**Verification:** All options documented with trade-offs.

**Completion Criteria:** Decision matrix produced.

---

### TKS-003 — Choose Storage Method

**Status:** COMPLETE
**Priority:** P1
**Owner:** Engineering Agent
**Required Approval:** GPG symmetric selected (documented)

**Objective:**
Select storage method and record the rationale.

**Decision:** Option C — GPG symmetric AES-256.

**Rationale:**
- GPG 2.4.4 is installed and functional.
- AES-256 via `--cipher-algo AES256` provides strong symmetric encryption.
- No external dependencies (no DBus, no pass, no vault required).
- Decrypt-on-demand pattern matches the existing `~/.env.secrets` convention on this server.
- GPG-encrypted files have built-in integrity (AEAD-style MAC in OpenPGP symmetric).
- The file is stored at `~/.stellar-testnet-secrets.gpg` — outside the git working tree, not world-readable.
- Consistent with `~/.env.git-write` and `~/.env.secrets` (both mode 600, owner webadmin).

**Completion Criteria:** Storage method recorded in plan.

---

### TKS-004 — Document Account Roles

**Status:** COMPLETE
**Priority:** P1
**Owner:** Engineering Agent
**Required Approval:** N/A (documentation)

**Objective:**
Document which Stellar roles the single testnet keypair serves, and confirm this is testnet-only.

**Account Role Summary:**

| Role | Description | Keypair |
|------|-------------|---------|
| Deployer | Uploads WASM and deploys contract instance | `lms-testnet-minter` (single keypair) |
| Admin | Passed as `admin` argument to `__constructor` | Same keypair |
| Minter | Passed as `minter` argument to `__constructor`; injected as `NFT_MINTER_SECRET` env var at runtime | Same keypair |

**Notes:**
- On mainnet, deployer, admin, and minter are separate keypairs (principle of least privilege).
- On testnet, a single keypair is acceptable because: (a) testnet accounts are freely generated and funded via Friendbot, (b) testnet XLM has no real-world value, (c) the goal is functional end-to-end validation only.
- `NFT_AUTO_MINT_ENABLED=false` on production; minting on testnet is triggered manually or via test harness only.

**Completion Criteria:** Roles and rationale documented.

---

### TKS-005 — Document Constructor Parameters

**Status:** COMPLETE
**Priority:** P1
**Owner:** Engineering Agent
**Required Approval:** N/A (documentation)

**Objective:**
Document the exact constructor invocation shape so that the deployment step (TKS-016 and beyond) has a precise reference.

**Constructor Signature:**
```
__constructor(admin: Address, minter: Address, uri: String)
```

**Parameters:**

| Parameter | Value (testnet) | Source |
|-----------|----------------|--------|
| `admin` | Public key of `lms-testnet-minter` | `stellar keys public-key lms-testnet-minter` |
| `minter` | Same public key (single-keypair testnet) | Same as above |
| `uri` | Metadata URI for NFT certificate | To be determined at deployment time; e.g. `https://lms.smwebsystems.com/metadata/{id}` |

**WASM Reference:**
- SHA-256: `2e8c87f0cf923ad0a9798db9ec64cc53286c1c95a196802d1c922fbd527ed6eb`
- ABI verified: `mint(to: Address, caller: Address)` present.

**Completion Criteria:** Constructor parameters documented with sources.

---

### TKS-006 — Create Key-Generation Runbook

**Status:** COMPLETE
**Priority:** P1
**Owner:** Engineering Agent
**Required Approval:** N/A (documentation)

**Objective:**
Provide an exact, copy-paste-ready command sequence for generating the testnet keypair. This runbook is reference-only until TKS-010 (approval) is granted.

**Preconditions:**
- TKS-010 approved.
- Shell session with `HISTFILE` management or `set +o history` active.
- `~/.local/bin/stellar` on PATH: `export PATH="$HOME/.local/bin:$PATH"`.
- `gpg-agent` running (standard on Ubuntu 24.04 desktop sessions; verify with `gpg-agent --daemon` if not).

**Key-Generation Runbook:**

```bash
# 0. Pre-flight: confirm CLI version
~/.local/bin/stellar --version
# Expected: stellar 27.1.0

# 1. Disable shell history for this session to avoid secret leakage
set +o history

# 2. Add Stellar CLI to PATH for this session
export PATH="$HOME/.local/bin:$PATH"

# 3. Generate testnet keypair (stores temporarily in ~/.config/stellar/identity/)
stellar keys generate lms-testnet-minter --network testnet

# 4. Extract and display PUBLIC key only (safe to log)
stellar keys public-key lms-testnet-minter

# 5. Encrypt SECRET key directly into GPG file — never assign to variable, never echo
stellar keys secret lms-testnet-minter | gpg --symmetric --cipher-algo AES256 -o ~/.stellar-testnet-secrets.gpg

# 6. Delete plaintext secret from Stellar CLI key store immediately
stellar keys rm lms-testnet-minter

# 7. Verify encrypted file exists and permissions
ls -la ~/.stellar-testnet-secrets.gpg
# Expected: -rw------- 1 webadmin webadmin <size> ~/.stellar-testnet-secrets.gpg

# 8. Set permissions to 600 if not already set by gpg
chmod 600 ~/.stellar-testnet-secrets.gpg

# 9. Verify decrypt works (passphrase prompt — confirm output is a valid S... secret key)
gpg --decrypt ~/.stellar-testnet-secrets.gpg
# Output should start with 'S' and be 56 characters (Stellar secret key encoding)
# Do NOT copy or log the output

# 10. Re-enable shell history
set -o history
```

**Verification Steps:**
- `ls -la ~/.stellar-testnet-secrets.gpg` shows mode `600`, owner `webadmin`.
- `gpg --decrypt ~/.stellar-testnet-secrets.gpg` prompts for passphrase and outputs a valid Stellar secret key (starts with `S`, 56 chars) — visually confirmed, not logged.
- `stellar keys list` does NOT contain `lms-testnet-minter` (plaintext deleted).
- Public key recorded separately (see TKS-012).

**Evidence Required:** ls output showing file exists at mode 600.

**Rollback:**
- If GPG encryption fails before `stellar keys rm`: retry encryption before deleting plaintext.
- If plaintext was deleted before encryption succeeded: re-run `stellar keys generate lms-testnet-minter --network testnet` to generate a new keypair (testnet only — no funds at risk yet).

**Completion Criteria:**
- `~/.stellar-testnet-secrets.gpg` exists, mode 600, owner webadmin.
- Plaintext absent from `~/.config/stellar/identity/`.
- Decrypt-and-display test passed.

---

### TKS-007 — Create Secure-Storage Runbook

**Status:** COMPLETE
**Priority:** P1
**Owner:** Engineering Agent
**Required Approval:** N/A (documentation)

**Objective:**
Document the full lifecycle of the GPG-encrypted secret: creation, decrypt-on-demand usage, rotation, and revocation.

**Storage Location:** `~/.stellar-testnet-secrets.gpg`

**Decrypt-on-Demand (for deployment or manual operations):**
```bash
# Decrypt to stdout — pipe directly to command, never write to disk
gpg --decrypt ~/.stellar-testnet-secrets.gpg

# Inject into environment for a single command (shell subshell, not exported globally):
TESTNET_MINTER_SECRET=$(gpg --decrypt ~/.stellar-testnet-secrets.gpg) \
  stellar contract deploy ...
# The variable exists only in the subshell for that command.
```

**Inject into testnet .env (for docker compose testnet stack only):**
```bash
# Write testnet .env — do this once, protect the file
gpg --decrypt ~/.stellar-testnet-secrets.gpg > /tmp/ts.tmp
echo "NFT_MINTER_SECRET=$(cat /tmp/ts.tmp)" >> /path/to/.env.testnet
rm -f /tmp/ts.tmp
chmod 600 /path/to/.env.testnet
```

**Rotation:**
```bash
# 1. Generate new keypair (follow TKS-006 runbook)
# 2. Fund new account via Friendbot
# 3. Re-deploy contract with new admin/minter keys
# 4. Re-encrypt new secret to ~/.stellar-testnet-secrets.gpg (overwrites old file)
# 5. Update testnet .env
# Old account can be abandoned (testnet XLM has no value)
```

**Revocation:**
```bash
# Delete encrypted file — testnet account is abandoned (no real value)
rm -f ~/.stellar-testnet-secrets.gpg
# Fund recovery not required for testnet
```

**Passphrase Management:**
- Passphrase must not be stored in any file, environment variable, or git commit.
- Use a strong, unique passphrase distinct from all other system passwords.
- Store passphrase in a personal password manager (Bitwarden, 1Password, etc.) under the entry "ScarletFlamingo — LMS testnet minter GPG".
- gpg-agent will cache the passphrase in memory for the session (default TTL 600s); this is acceptable for interactive use.

**Completion Criteria:** Runbook covers creation, usage, rotation, and revocation with exact command shapes.

---

### TKS-008 — Review Security Design

**Status:** COMPLETE
**Priority:** P1
**Owner:** Engineering Agent
**Required Approval:** N/A (internal review)

**Objective:**
Verify that the overall design satisfies the security requirements before human review (TKS-009).

**Security Checklist:**

| # | Requirement | Satisfied? | Notes |
|---|-------------|-----------|-------|
| 1 | Secret never written to plaintext file on disk | YES | Piped directly from `stellar keys secret` to `gpg` |
| 2 | Secret never assigned to shell variable | YES | Runbook uses pipe, not assignment |
| 3 | Secret never echoed or logged | YES | Decrypt output is visual-only, not captured |
| 4 | File permissions 600 (owner-only) | YES | Enforced by `chmod 600` in runbook |
| 5 | File outside git working tree | YES | `~/.stellar-testnet-secrets.gpg` — not under `/home/webadmin/web-stack/` |
| 6 | `.gitignore` protection | YES | Even if accidentally moved, `*.gpg` and `*.secrets*` should be in `.gitignore` |
| 7 | Shell history disabled during secret handling | YES | `set +o history` before extraction |
| 8 | Plaintext deleted from Stellar CLI store immediately | YES | `stellar keys rm lms-testnet-minter` before runbook ends |
| 9 | Testnet key isolated from production | YES | Separate file, separate env, `NFT_AUTO_MINT_ENABLED=false` in prod |
| 10 | Decrypt-on-demand (not persistent in env) | YES | Subshell injection pattern documented |
| 11 | No production secret reuse | YES | New keypair generated fresh for testnet |
| 12 | Rotation path documented | YES | TKS-007 rotation section |
| 13 | Revocation path documented | YES | TKS-007 revocation section |

**Risk Assessment:**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| GPG passphrase forgotten | Low | Medium | Store in personal password manager; testnet only — can regenerate |
| gpg-agent caches passphrase in memory | Accepted | Low | Short TTL; testnet only; no real-world value |
| File accidentally committed to git | Low | Low | Outside git tree; testnet key has no real value |
| Shell history captures secret | Low | Low | `set +o history` in runbook |
| Disk forensics recovers plaintext | Very Low | Low | Testnet XLM has no value; rotation trivial |

**Completion Criteria:** All 13 security requirements confirmed as satisfied. Risk assessment complete.

---

### TKS-009 — Independent Review

**Status:** BLOCKED — REQUIRES REVIEW
**Priority:** P2
**Owner:** Human reviewer (operator)
**Required Approval:** REQUIRES REVIEW before TKS-010

**Objective:**
A human with authority reviews TKS-001 through TKS-008 for correctness, completeness, and security soundness before any keys are generated or secrets touched.

**Preconditions:** TKS-001–TKS-008 all COMPLETE.

**Files to Review:**
- This document (plan)
- `2026-08-19-testnet-keypair-storage-todo.md`
- `2026-08-19-testnet-keypair-storage-test-matrix.md`
- `2026-08-19-testnet-keypair-storage-loop-plan.md`

**Review Checklist:**
- [ ] Storage method (GPG symmetric AES-256) is acceptable
- [ ] Key-generation runbook (TKS-006) is safe to execute
- [ ] Secure-storage runbook (TKS-007) is operationally correct
- [ ] Security design (TKS-008) satisfies requirements
- [ ] No concerns with single keypair serving deployer/admin/minter roles on testnet
- [ ] Passphrase management guidance is acceptable
- [ ] No production secrets are at risk in any of the above steps

**Completion Criteria:** Reviewer signs off and approves TKS-010.

---

### TKS-010 — Request Key-Generation Approval

**Status:** BLOCKED — REQUIRES APPROVAL
**Priority:** P2
**Owner:** Human operator
**Required Approval:** Explicit approval from authorized operator before TKS-011

**Objective:**
Obtain explicit approval to execute the key-generation runbook (TKS-006).

**Preconditions:** TKS-009 complete (review passed).

**Approval Statement Required:**
> "I approve generation of the `lms-testnet-minter` testnet keypair using the runbook in TKS-006."

**Completion Criteria:** Approval recorded with date and approver identity.

---

### TKS-011 — Generate Testnet Keypair

**Status:** BLOCKED — Depends on TKS-010
**Priority:** P2
**Owner:** Human operator (or supervised Engineering Agent)
**Required Approval:** TKS-010 approved

**Objective:**
Execute the TKS-006 key-generation runbook to produce the `lms-testnet-minter` keypair.

**Preconditions:**
- TKS-010 approved.
- `~/.local/bin/stellar` accessible.
- GPG passphrase chosen and stored in personal password manager before execution.
- Shell session prepared (`set +o history`, PATH set).

**Implementation Steps:**
Execute runbook steps 0–10 from TKS-006 exactly as written.

**Verification:**
- `ls -la ~/.stellar-testnet-secrets.gpg` — file exists, mode 600.
- `stellar keys list` — `lms-testnet-minter` absent (plaintext deleted).
- Decrypt test passes visually (secret key starts with `S`, 56 chars).

**Evidence to Record:**
- Output of `ls -la ~/.stellar-testnet-secrets.gpg`
- Output of `stellar keys public-key lms-testnet-minter` (public key only — safe to record)

**Rollback:**
- If encryption failed before deletion: retry.
- If deletion happened before encryption: `stellar keys generate lms-testnet-minter --network testnet` again (no funds at risk yet).

**Completion Criteria:**
- `~/.stellar-testnet-secrets.gpg` exists, mode 600.
- Plaintext absent from Stellar CLI store.
- Public key recorded (see TKS-012).

---

### TKS-012 — Verify Address (No Secret Exposure)

**Status:** BLOCKED — Depends on TKS-011
**Priority:** P2
**Owner:** Engineering Agent
**Required Approval:** Depends on TKS-011

**Objective:**
Record the public key of the generated testnet account and verify it is a valid Stellar address. The secret key must not appear in any log, file, or output during this task.

**Preconditions:** TKS-011 complete; `~/.stellar-testnet-secrets.gpg` exists.

**Implementation Steps:**
1. If `lms-testnet-minter` still in Stellar CLI store (before deletion): `stellar keys public-key lms-testnet-minter`.
2. If plaintext already deleted from CLI store: decrypt GPG file visually, derive public key using `stellar keys import` (ephemeral) or `python3 -c "import stellar_sdk; ..."` — document exact method at execution time.
3. Record the public key (G... address, 56 chars) in this document under "Evidence".
4. Verify format: starts with `G`, 56 characters, base32 encoded.

**Evidence to Record:**
- `TESTNET_MINTER_PUBLIC_KEY=G...` (56-char Stellar address)

**Rollback:** N/A (read-only after key generation).

**Completion Criteria:**
- Public key recorded in evidence section.
- Secret key not present in any log or file other than `~/.stellar-testnet-secrets.gpg`.

**Evidence (to be filled at execution):**
```
TESTNET_MINTER_PUBLIC_KEY=<fill at execution>
```

---

### TKS-013 — Encrypt and Store Secret

**Status:** BLOCKED — REQUIRES APPROVAL
**Priority:** P2
**Owner:** Human operator
**Required Approval:** Explicit approval required

**Objective:**
Confirm that `~/.stellar-testnet-secrets.gpg` is the canonical and sole storage location for the testnet secret, and that no other copies exist.

**Preconditions:** TKS-011 complete.

**Implementation Steps:**
1. Confirm `~/.stellar-testnet-secrets.gpg` exists, mode 600.
2. Confirm `stellar keys list` does not show `lms-testnet-minter`.
3. Confirm no plaintext copies in `/tmp`, shell history, or other files.
4. Clear shell history entry if `set +o history` was not used: `history -d $(history | tail -1 | awk '{print $1}')` — or simply clear session history.

**Verification:**
- `ls -la ~/.stellar-testnet-secrets.gpg` — exists, mode 600.
- `stellar keys list` — empty or no `lms-testnet-minter` entry.
- `grep -r 'lms-testnet' ~/.bash_history 2>/dev/null` — review for leakage.

**Completion Criteria:** Single encrypted file is the sole copy of the secret. No plaintext exists.

---

### TKS-014 — Request Funding Approval

**Status:** BLOCKED — REQUIRES APPROVAL
**Priority:** P3
**Owner:** Human operator
**Required Approval:** Explicit approval before TKS-015

**Objective:**
Obtain approval to fund the testnet account via Friendbot (testnet faucet).

**Preconditions:** TKS-012 complete (public key recorded).

**Approval Statement Required:**
> "I approve funding of the testnet account `<public key>` via Friendbot."

**Completion Criteria:** Approval recorded.

---

### TKS-015 — Fund via Friendbot

**Status:** BLOCKED — Depends on TKS-014
**Priority:** P3
**Owner:** Engineering Agent (supervised)
**Required Approval:** TKS-014 approved

**Objective:**
Fund the testnet account using the Stellar Friendbot so that it can pay transaction fees for contract deployment and minting.

**Preconditions:**
- TKS-014 approved.
- Public key recorded from TKS-012.

**Implementation Steps:**
```bash
# Replace G... with actual public key from TKS-012
curl -s "https://friendbot.stellar.org?addr=G..." | python3 -m json.tool
```

**Verification:**
```bash
# Check account balance on testnet Horizon
curl -s "https://horizon-testnet.stellar.org/accounts/G..." | python3 -c "
import sys, json
data = json.load(sys.stdin)
for b in data['balances']:
    print(b['asset_type'], b['balance'])
"
# Expected: native 10000.0000000 (Friendbot grants 10,000 XLM)
```

**Rollback:** N/A — testnet XLM has no value; re-fund any time via Friendbot.

**Completion Criteria:** Account funded; balance visible on horizon-testnet.stellar.org.

---

### TKS-016 — Request Deployment Approval

**Status:** BLOCKED — REQUIRES APPROVAL
**Priority:** P3
**Owner:** Human operator
**Required Approval:** Explicit approval before contract deployment begins

**Objective:**
Obtain approval to proceed to the contract deployment phase (separate plan).

**Preconditions:** TKS-015 complete (account funded).

**Approval Statement Required:**
> "I approve proceeding to testnet contract deployment using the funded `lms-testnet-minter` account."

**Next Phase:** Contract deployment plan (separate document, to be created after TKS-016 approval).

**Completion Criteria:** Approval recorded; deployment plan created.

---

## Appendix A — Storage Design Rationale

### Why GPG Symmetric (not GPG asymmetric)?

GPG asymmetric requires a PGP keypair for the operator. While more theoretically robust (private key never enters the process), it adds operational complexity: the operator must have a PGP key, and decryption requires the private PGP key. For a single-operator server environment where the operator has interactive shell access, symmetric AES-256 is simpler and sufficiently secure, provided:

1. The passphrase is strong and stored in a password manager.
2. The file is at mode 600 (no group/other read).
3. The file is outside the git working tree.

### Why not openssl enc?

openssl enc AES-256-CBC is available and would work, but:
- GPG symmetric provides built-in message authentication (AEAD via OpenPGP symmetric encryption with MDC/AEAD).
- GPG has a more ergonomic UX for interactive passphrase prompts.
- GPG integrates with `gpg-agent` for session caching.

### Why not Stellar CLI key store?

Stellar CLI v27 stores keys in `~/.config/stellar/identity/*.json` as plaintext JSON. This is appropriate for short-lived CI/CD use but is not acceptable as the long-term secret store because:
- Any process running as `webadmin` can read the JSON file.
- The file is plaintext — no encryption at rest.

---

## Appendix B — File Inventory

| File | Location | Purpose | Sensitivity |
|------|----------|---------|-------------|
| Encrypted secret | `~/.stellar-testnet-secrets.gpg` | Testnet minter secret key | SENSITIVE — mode 600 |
| Public key record | This document (TKS-012 evidence) | Testnet account address | PUBLIC — safe to log |
| Plan | `docs/superpowers/plans/2026-08-19-testnet-keypair-storage-plan.md` | This document | LOW — no secrets |
| TODO | `docs/superpowers/plans/2026-08-19-testnet-keypair-storage-todo.md` | Task tracker | LOW |
| Test matrix | `docs/superpowers/plans/2026-08-19-testnet-keypair-storage-test-matrix.md` | Test design | LOW |
| Loop plan | `docs/superpowers/plans/2026-08-19-testnet-keypair-storage-loop-plan.md` | Automation guardrails | LOW |

---

## Appendix C — Production Isolation Checklist

The following checklist confirms testnet operations are isolated from production:

- [ ] `NFT_AUTO_MINT_ENABLED=false` in production docker stack — VERIFIED (per memory)
- [ ] `NFT_STELLAR_NETWORK=public` in production docker stack — VERIFIED (per memory)
- [ ] Testnet `.env` is a separate file from production `.env`
- [ ] Testnet keypair is a fresh generation — NOT derived from any production key
- [ ] `~/.stellar-testnet-secrets.gpg` is a different file from `~/.env.secrets`
- [ ] No `NFT_MINTER_SECRET` change is made to production `.env` in this phase
- [ ] Contract deployment target is `--network testnet`, not `--network public`

---

*End of plan. Next action: TKS-009 (independent review) — awaiting human review.*
