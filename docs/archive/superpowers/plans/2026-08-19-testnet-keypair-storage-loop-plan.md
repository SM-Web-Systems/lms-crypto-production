# Testnet Keypair Storage — Loop Plan
**Date:** 2026-08-19
**Phase:** Testnet Infrastructure — Keypair Generation & Secure Storage Design
**Purpose:** Define what an engineering agent may and may not do autonomously in the /loop context for this phase

---

## Purpose

This document defines the guardrails for autonomous engineering agent activity during the testnet keypair storage phase. It answers the question: "What can the agent do without asking, and what requires explicit human approval?"

The core principle: **this phase is a security-sensitive operational milestone.** Any action that creates, reads, transmits, or destroys cryptographic material — or any action that touches blockchain state — requires explicit human approval before execution.

---

## Allowed in /loop

The following actions may be taken autonomously by an engineering agent without prior approval:

### Read-Only Git and Worktree Checks
- `git status` — check working tree state
- `git log --oneline -20` — review recent commits
- `git diff` — inspect unstaged changes
- `git branch` — list branches
- `git tag` — list tags
- `git stash list` — review stash state
- `git show <hash>` — inspect a specific commit
- Reading any file in the repository using read tools

### CLI Version and Help Inspection
- `~/.local/bin/stellar --version` — confirm CLI version
- `~/.local/bin/stellar --help` — inspect available subcommands
- `~/.local/bin/stellar keys --help` — inspect key management help (no key operations)
- `~/.local/bin/stellar contract --help` — inspect contract help (no deploy or invoke operations)
- `gpg --version` — confirm GPG version
- `gpg --help` — inspect available options

### GPG Availability Checks (Read-Only)
- `gpg --version` — verify GPG is installed and version
- `gpg-agent --version` — verify agent availability
- `ls -la ~/.gnupg/` — inspect GPG home directory permissions (not contents of key material)
- Checking if `~/.stellar-testnet-secrets.gpg` exists via `ls -la` (not reading or decrypting it)

### File Permission Checks
- `ls -la <path>` — inspect file mode and ownership
- `stat --format="%a %U %G" <path>` — inspect permissions in numeric format
- These checks may be run on any file EXCEPT: reading the contents of `.env` files, `*.gpg` files, `*.secrets*` files, or any file that contains or may contain private keys

### Running the Test Suite
- `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run` — run backend tests
- `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Web && npx vitest run` — run frontend tests
- `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/e2e && npx playwright test` — run E2E tests
- These must not modify any `.env` file before running

### Health Checks (Read-Only)
- `docker ps` — list running containers
- `docker logs lms-api --tail 50` — inspect recent logs (no secret patterns expected; abort if secret material appears)
- `docker exec lms-api wget -qO- http://localhost:3001/health` or equivalent — health endpoint check
- `curl -s http://localhost:3001/health` or `https://lms.smwebsystems.com/health` — health check
- These must not inject environment variables or modify container state

### Document and Diagram Validation
- Reading and verifying plan files, test matrix, and todo files
- Cross-checking that task IDs are consistent across documents
- Verifying that runbook command shapes are syntactically valid (no execution)
- Checking that file paths referenced in documents exist (using `ls` or glob tools)

### Updating TODO Statuses with Evidence
- Marking a task COMPLETE in the TODO file when evidence is available (e.g., a test passed, a file was verified to exist)
- Adding evidence strings to the Evidence column of the test matrix
- Updating status fields in the plan document
- These updates must accurately reflect actual observed state, not anticipated state

---

## Forbidden in /loop

The following actions are strictly forbidden without explicit human approval. An engineering agent that encounters a situation where one of these actions seems necessary MUST stop, report the situation to the operator, and await explicit approval.

### Key Generation
- `stellar keys generate` — FORBIDDEN until TKS-010 approved
- Any command that creates a new Stellar keypair
- Any command that derives a Stellar keypair from a seed phrase or passphrase
- Any use of Python `stellar_sdk.Keypair.random()` or equivalent

### Reading or Printing Private Keys
- `stellar keys secret <name>` — FORBIDDEN (reads plaintext secret from CLI store)
- `gpg --decrypt <file>` — FORBIDDEN (decrypts stored secret)
- `cat ~/.stellar-testnet-secrets.gpg` — FORBIDDEN
- Any command that outputs, logs, or transmits a Stellar secret key (S... prefixed string)
- Any assignment of a secret key to a shell variable for inspection purposes

### Funding Accounts
- `stellar keys fund` or equivalent — FORBIDDEN until TKS-014 approved
- `curl https://friendbot.stellar.org?addr=...` — FORBIDDEN until TKS-014 approved
- Any interaction with the Stellar testnet faucet

### Deploying Contracts
- `stellar contract deploy` — FORBIDDEN until TKS-016 approved and a separate deployment plan exists
- `stellar contract invoke` — FORBIDDEN until after successful deployment
- Any upload of WASM to testnet or mainnet

### Modifying .env Files
- Writing, appending, or overwriting any `.env`, `.env.testnet`, `.env.production`, `app.env`, or similar environment file
- Injecting `NFT_MINTER_SECRET`, `NFT_CONTRACT_ID`, or any testnet-specific value into any environment configuration
- These changes require explicit operator approval and should be performed by the operator or under direct supervision

### Enabling NFT Auto-Mint
- Setting `NFT_AUTO_MINT_ENABLED=true` in any environment file — FORBIDDEN
- Restarting any container with an environment that enables auto-mint — FORBIDDEN

### Minting NFTs
- Any action that triggers `mint(to, caller)` on any contract, on any network — FORBIDDEN without explicit approval
- This includes both automated and manual mint triggers via the LMS admin interface

### Submitting Blockchain Transactions
- Any `stellar contract invoke`, `stellar payment`, `stellar transaction sign`, or similar transaction submission — FORBIDDEN
- Any HTTP request to `horizon.stellar.org` (mainnet) that modifies chain state — FORBIDDEN
- Any HTTP request to `horizon-testnet.stellar.org` that modifies chain state — FORBIDDEN (read-only Horizon queries permitted)

### Financial Operations
- Any action involving real currency, Paystack webhooks, or production XLM — FORBIDDEN
- Top-up of platform ops wallet — FORBIDDEN without explicit operator approval

### Secret Rotation (Actual Execution)
- Generating a new GPG-encrypted file to replace `~/.stellar-testnet-secrets.gpg` — FORBIDDEN without explicit approval
- Changing the GPG passphrase — FORBIDDEN without explicit approval

### Automatic Commits, Pushes, and Merges
- `git commit` — FORBIDDEN unless explicitly requested by the operator with "please commit"
- `git push` — FORBIDDEN unless explicitly requested
- `git merge` — FORBIDDEN unless explicitly requested
- `git rebase` — FORBIDDEN unless explicitly requested
- Creating or deleting branches without explicit instruction

### Worktree Deletion
- Deleting, archiving, or abandoning a worktree without explicit operator instruction

### Marking Tasks Complete Without Evidence
- Updating a task status to COMPLETE in the TODO file without actual evidence of completion
- Marking a test as PASS in the test matrix without having run the test and observed the expected output
- Updating "Evidence" fields with anticipated or assumed values rather than observed values

---

## Loop Iteration Template

Use the following template for each loop iteration. Fill in the iteration number, what was checked, what was found, and what (if anything) was updated. Never skip the verification checklist.

---

```
## Loop Iteration N
**Date:** 2026-MM-DD HH:MM UTC
**Agent:** Engineering Agent (Claude Sonnet 4.6)
**Iteration goal:** <one sentence description>

### Actions Taken
1. <action> → <result>
2. <action> → <result>
...

### Findings
- <finding 1>
- <finding 2>
...

### Verification Checklist
- [ ] No keys were generated
- [ ] No private keys were read or printed
- [ ] No accounts were funded
- [ ] No contracts were deployed or invoked
- [ ] No .env files were modified
- [ ] NFT_AUTO_MINT_ENABLED was not set to true anywhere
- [ ] No blockchain transactions were submitted
- [ ] No git commits were created without explicit operator request
- [ ] No task was marked COMPLETE without observed evidence
- [ ] No test was marked PASS without having been executed

### TODO Updates (if any)
- <task ID>: <old status> → <new status> (evidence: <string>)

### Test Matrix Updates (if any)
- <test ID>: NOT RUN → <PASS|FAIL> (evidence: <string>)

### Blocked on
- <what is blocking forward progress, if anything>

### Recommended next action for operator
- <one sentence: what the operator should do next>
```

---

## Approval Gate Summary

The following table summarizes all approval gates in this phase and what they unlock:

| Gate | Required For | Who Approves | Current Status |
|------|-------------|-------------|----------------|
| TKS-009 (review) | All P2 tasks | Human reviewer | BLOCKED |
| TKS-010 (keygen approval) | TKS-011 (key generation) | Authorized operator | BLOCKED |
| TKS-013 (storage confirm) | P3 start | Authorized operator | BLOCKED |
| TKS-014 (funding approval) | TKS-015 (Friendbot) | Authorized operator | BLOCKED |
| TKS-016 (deployment approval) | TNS-009 (contract deploy) | Authorized operator | BLOCKED |
| Separate deployment plan | TNS-009 through TNS-014 | Engineering agent creates; operator approves | NOT CREATED |

---

## Emergency Stop Procedure

If at any point during loop execution an engineering agent observes or produces output that appears to contain a Stellar secret key (a 56-character string starting with `S` composed of uppercase letters and digits), the agent must:

1. STOP all further processing immediately.
2. DO NOT log, write, commit, or transmit the string.
3. Report to the operator: "STOP — possible secret key in output. Do not scroll up or share this terminal session. Awaiting instructions."
4. The operator must assess whether the secret was exposed and, if so, initiate key rotation.

This procedure applies regardless of whether the secret is testnet or mainnet. Testnet secrets have no financial value but exposure sets a bad precedent and should be treated seriously.

---

## Context Snapshot (for loop continuity)

The following facts are stable across loop iterations and do not need to be re-verified each time:

| Fact | Value |
|------|-------|
| Stellar CLI path | `~/.local/bin/stellar` |
| Stellar CLI version | 27.1.0 |
| GPG version | 2.4.4 |
| Secret file target | `~/.stellar-testnet-secrets.gpg` |
| WASM SHA-256 | `2e8c87f0cf923ad0a9798db9ec64cc53286c1c95a196802d1c922fbd527ed6eb` |
| ABI: mint | `mint(to: Address, caller: Address)` |
| ABI: constructor | `__constructor(admin: Address, minter: Address, uri: String)` |
| Test count baseline | 1108/1108 |
| Production network | `NFT_STELLAR_NETWORK=public` |
| Auto-mint production | `NFT_AUTO_MINT_ENABLED=false` |
| Testnet network name | `testnet` (Stellar testnet, Horizon: horizon-testnet.stellar.org) |
| LMS path | `/home/webadmin/web-stack/html/LMS-AmmaWallet/` |
| LMS backend test command | `cd LMS-Server && npx vitest run` |
| LMS E2E test command | `cd e2e && npx playwright test` |

---

## File Inventory for This Phase

| File | Path | Purpose |
|------|------|---------|
| Plan | `docs/superpowers/plans/2026-08-19-testnet-keypair-storage-plan.md` | Full task descriptions, runbooks, security review |
| TODO | `docs/superpowers/plans/2026-08-19-testnet-keypair-storage-todo.md` | Consolidated task tracker (TNS + TKS) |
| Test Matrix | `docs/superpowers/plans/2026-08-19-testnet-keypair-storage-test-matrix.md` | 39 tests across 8 categories |
| Loop Plan | `docs/superpowers/plans/2026-08-19-testnet-keypair-storage-loop-plan.md` | This file — guardrails and iteration template |

---

*Last updated: 2026-08-19. All P2 and P3 tasks BLOCKED pending TKS-009 review.*
