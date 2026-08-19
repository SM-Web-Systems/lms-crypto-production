# Testnet Keypair Storage — Test Matrix
**Date:** 2026-08-19
**Phase:** Testnet Infrastructure — Keypair Generation & Secure Storage Design
**Status:** DESIGN ONLY — No source code changes; all tests NOT RUN

> **Note on TDD cycle:** The TDD implementation cycle is not applicable to this phase. This phase produces an operational security design (runbooks, approval gates, a storage architecture decision) and does not alter runtime behavior of the LMS application. There are no new functions, modules, routes, or database tables introduced. The test matrix below defines what must be verified when the operational steps in TKS-009–TKS-016 and TNS-009–TNS-014 are executed by a human operator. Tests will be marked PASS or FAIL at that time with execution evidence.
>
> **Current test suite baseline:** 1108/1108 passing (`cd LMS-Server && npx vitest run`). This phase must not regress that count.

---

## Test Matrix

| Test ID | Category | Test | Expected Result | Status | Evidence |
|---------|----------|------|----------------|--------|----------|
| SM-001 | SECRET-MGMT | `gpg --symmetric --cipher-algo AES256 -o ~/.stellar-testnet-secrets.gpg` completes without error | Exit code 0; encrypted file created at target path | NOT RUN | — |
| SM-002 | SECRET-MGMT | `gpg --decrypt ~/.stellar-testnet-secrets.gpg` prompts for passphrase and decrypts successfully | Decrypted output is a valid 56-character Stellar secret key starting with `S` | NOT RUN | — |
| SM-003 | SECRET-MGMT | Encrypted file survives a new shell session (gpg-agent cache flushed) and still decrypts with correct passphrase | Same decrypted output as SM-002 | NOT RUN | — |
| SM-004 | SECRET-MGMT | Wrong passphrase returns non-zero exit code and no plaintext output | `gpg: decryption failed: Bad session key`; exit code != 0 | NOT RUN | — |
| SM-005 | SECRET-MGMT | Re-encryption (overwrite) with `gpg --symmetric ... -o ~/.stellar-testnet-secrets.gpg` produces a valid new file | New file decrypts to same secret key | NOT RUN | — |
| PE-001 | PERMISSIONS | `ls -la ~/.stellar-testnet-secrets.gpg` shows mode `-rw-------` | Mode `600`; no group or other read/write bits | NOT RUN | — |
| PE-002 | PERMISSIONS | Owner of `~/.stellar-testnet-secrets.gpg` is `webadmin` | `webadmin webadmin` in `ls -la` output | NOT RUN | — |
| PE-003 | PERMISSIONS | No group or other read access on encrypted file | `stat --format=%a ~/.stellar-testnet-secrets.gpg` returns `600` | NOT RUN | — |
| PE-004 | PERMISSIONS | After `chmod 600 ~/.stellar-testnet-secrets.gpg`, mode is preserved across gpg operations | Mode remains `600` after a decrypt-and-rewrite cycle | NOT RUN | — |
| IS-001 | ISOLATION | `stellar keys list` does not contain `lms-testnet-minter` after deletion step | No `lms-testnet-minter` entry in output | NOT RUN | — |
| IS-002 | ISOLATION | Testnet `NFT_MINTER_SECRET` is not present in production `.env` (`/home/webadmin/amma-wallet-docker/app.env` or equivalent) | `grep NFT_MINTER_SECRET /home/webadmin/amma-wallet-docker/app.env` returns no match | NOT RUN | — |
| IS-003 | ISOLATION | Testnet contract ID is not present in production `.env` | `grep NFT_CONTRACT_ID /home/webadmin/amma-wallet-docker/app.env` returns production value, not testnet value | NOT RUN | — |
| IS-004 | ISOLATION | Testnet `.env` file (if created) is mode 600 and not tracked by git | `git status` in LMS repo shows testnet `.env` as untracked (or listed in `.gitignore`) | NOT RUN | — |
| IS-005 | ISOLATION | Public key recorded in TKS-012 is a testnet-only address (not an existing mainnet wallet) | Address does not appear in any production config or AmmaWallet mainnet records | NOT RUN | — |
| RD-001 | REDACTION | Shell history does not contain `stellar keys secret` output (plaintext secret) after `set +o history` session | `grep -i 'S[A-Z0-9]\{55\}' ~/.bash_history` returns no matches | NOT RUN | — |
| RD-002 | REDACTION | No plaintext Stellar secret key appears in this document or any plan file | `grep -r 'S[A-Z0-9]\{55\}' docs/superpowers/plans/` returns no matches | NOT RUN | — |
| RD-003 | REDACTION | No plaintext Stellar secret key appears in git log or committed files | `git log -p | grep -i 'S[A-Z0-9]\{55\}'` returns no matches | NOT RUN | — |
| RD-004 | REDACTION | No plaintext Stellar secret key appears in docker logs or application logs | `docker logs lms-api 2>&1 | grep -i 'S[A-Z0-9]\{55\}'` returns no matches | NOT RUN | — |
| RD-005 | REDACTION | `NFT_MINTER_SECRET` is not echoed in any LMS log output at INFO level or below | Application logs show `NFT_MINTER_SECRET=[REDACTED]` or do not log it at all | NOT RUN | — |
| RT-001 | ROTATION | Old encrypted file can be decrypted before rotation | Decrypt succeeds with original passphrase | NOT RUN | — |
| RT-002 | ROTATION | New GPG file can replace old file via overwrite | `gpg --symmetric ... -o ~/.stellar-testnet-secrets.gpg` (new passphrase) succeeds; old passphrase no longer works | NOT RUN | — |
| RT-003 | ROTATION | Passphrase change cycle: decrypt → re-encrypt with new passphrase → verify | New passphrase decrypts successfully; old passphrase rejected | NOT RUN | — |
| RT-004 | ROTATION | After rotation, testnet `.env` updated with new secret | Application restart with new `NFT_MINTER_SECRET` completes without auth error | NOT RUN | — |
| RV-001 | REVOCATION | `rm -f ~/.stellar-testnet-secrets.gpg` deletes the file | `ls ~/.stellar-testnet-secrets.gpg` returns "No such file or directory" | NOT RUN | — |
| RV-002 | REVOCATION | After file deletion, testnet account is inaccessible (no plaintext backup) | Cannot sign testnet transactions without re-generating and re-funding | NOT RUN | — |
| RV-003 | REVOCATION | Testnet account abandonment has no production impact | Production `NFT_STELLAR_NETWORK=public` container unaffected; `NFT_AUTO_MINT_ENABLED` remains false | NOT RUN | — |
| TL-001 | TOOLING | `~/.local/bin/stellar --version` returns `stellar 27.1.0` | Exact string match `stellar 27.1.0` | NOT RUN | — |
| TL-002 | TOOLING | `stellar keys generate lms-testnet-minter --network testnet` creates a key entry in CLI store | `stellar keys list` shows `lms-testnet-minter` | NOT RUN | — |
| TL-003 | TOOLING | `stellar keys public-key lms-testnet-minter` returns a 56-character G-address | Output starts with `G`, length 56, valid base32 characters only | NOT RUN | — |
| TL-004 | TOOLING | `stellar keys secret lms-testnet-minter` returns a 56-character S-key (verified visually, not logged) | Output starts with `S`, length 56 — visual confirm only, not stored | NOT RUN | — |
| TL-005 | TOOLING | `stellar keys rm lms-testnet-minter` removes the key from CLI store | `stellar keys list` no longer shows `lms-testnet-minter` | NOT RUN | — |
| TL-006 | TOOLING | `gpg --symmetric --cipher-algo AES256` is available in installed gpg version | `gpg --help` or `gpg --version` shows AES256 in list of available ciphers | NOT RUN | — |
| TL-007 | TOOLING | Pipe from `stellar keys secret` to `gpg --symmetric` works end-to-end without tee or intermediate file | Encrypted file created; no temp file in /tmp | NOT RUN | — |
| IN-001 | INTEGRATION | `mintService.ts` reads `NFT_MINTER_SECRET` from environment variable, not from a hardcoded value | Code audit: `process.env.NFT_MINTER_SECRET` or equivalent env access pattern | NOT RUN | — |
| IN-002 | INTEGRATION | Testnet `.env` with `NFT_STELLAR_NETWORK=testnet` causes mintService to use testnet Horizon endpoint | Log output or network capture shows `horizon-testnet.stellar.org` during test mint | NOT RUN | — |
| IN-003 | INTEGRATION | `NFT_AUTO_MINT_ENABLED=false` in testnet `.env` prevents automatic minting | Submitting a completed course does not trigger automatic mint; only manual admin action triggers mint | NOT RUN | — |
| IN-004 | INTEGRATION | Injecting `NFT_MINTER_SECRET` via `docker compose --env-file .env.testnet up` makes value available inside container | `docker exec lms-api printenv NFT_MINTER_SECRET` returns the secret value (one-time verification only; not logged) | NOT RUN | — |
| IN-005 | INTEGRATION | Full test suite (`cd LMS-Server && npx vitest run`) still passes 1108/1108 after testnet `.env` is in place | `1108 passed` in vitest output | NOT RUN | — |
| IN-006 | INTEGRATION | E2E tests (`cd e2e && npx playwright test`) pass after testnet config applied | All 14 E2E tests pass | NOT RUN | — |

---

## Category Summary

| Category | Total Tests | NOT RUN | PASS | FAIL |
|----------|------------|---------|------|------|
| SECRET-MGMT | 5 | 5 | 0 | 0 |
| PERMISSIONS | 4 | 4 | 0 | 0 |
| ISOLATION | 5 | 5 | 0 | 0 |
| REDACTION | 5 | 5 | 0 | 0 |
| ROTATION | 4 | 4 | 0 | 0 |
| REVOCATION | 3 | 3 | 0 | 0 |
| TOOLING | 7 | 7 | 0 | 0 |
| INTEGRATION | 6 | 6 | 0 | 0 |
| **TOTAL** | **39** | **39** | **0** | **0** |

---

## Execution Schedule

Tests in each category are expected to become executable as the following tasks complete:

| Category | Executable After | Approval Required |
|----------|-----------------|-------------------|
| TOOLING (TL-001) | Already runnable (CLI version check) | None |
| TOOLING (TL-002 through TL-007) | TKS-010 approved | YES — TKS-010 |
| SECRET-MGMT (SM-001 through SM-005) | TKS-011 complete | YES — TKS-010 |
| PERMISSIONS (PE-001 through PE-004) | TKS-011 complete | YES — TKS-010 |
| ISOLATION (IS-001 through IS-005) | TKS-013 complete | YES — TKS-013 |
| REDACTION (RD-001 through RD-005) | TKS-013 complete | YES — TKS-013 |
| ROTATION (RT-001 through RT-004) | TKS-013 complete | YES — separate rotation approval |
| REVOCATION (RV-001 through RV-003) | Any time after TKS-013 | YES — explicit revocation approval |
| INTEGRATION (IN-001 through IN-006) | TNS-010 complete | YES — TKS-016 |

---

## Evidence Template

When a test is executed, update the Status and Evidence columns as follows:

```
Status: PASS
Evidence: <command run> → <output or hash or observation>
Date: 2026-MM-DD
Executed by: <operator>
```

```
Status: FAIL
Evidence: <command run> → <actual output>
Failure reason: <description>
Date: 2026-MM-DD
Executed by: <operator>
Action taken: <remediation or deferral>
```

---

## Non-Goals

The following are explicitly out of scope for this test matrix:

- Unit tests for `mintService.ts` (covered by existing 1108 vitest tests)
- Integration tests for Paystack or Stellar mainnet (covered by existing test suite)
- Performance or load testing of the testnet deployment
- Security penetration testing (covered by the 2026-07-27 security audit for AmmaWallet; LMS security audit not yet scheduled)
- Tests for GPG asymmetric encryption (not selected as storage method)

---

*Last updated: 2026-08-19. All tests NOT RUN — this is a design-only phase.*
