# Secret Rotation Test Matrix

**Date:** 2026-08-19
**Scope:** GPG passphrase rotation verification
**Status:** NOT RUN — awaiting user execution of rotation script (SIR-007)

---

## TDD Note

TDD not applicable: operational credential rotation, no runtime code changes.

This matrix documents manual verification steps to be run after the user
executes `~/scripts/rotate-testnet-gpg-passphrase.sh`. All tests are currently
NOT RUN and will be updated to PASS or FAIL after SIR-007 completes.

---

## Test Matrix

| Test ID | Category | Test | Expected | Status |
|---------|----------|------|----------|--------|
| ROT-001 | ROTATION | Script exits code 0 | Success | NOT RUN |
| ROT-002 | ROTATION | New file is GPG encrypted | PGP symmetric AES-256 | NOT RUN |
| ROT-003 | ROTATION | File mode is 600 | stat returns 600 | NOT RUN |
| ROT-004 | ROTATION | File owner is webadmin | stat returns webadmin | NOT RUN |
| ROT-005 | ROTATION | Old passphrase rejected | gpg decrypt fails | NOT RUN |
| ROT-006 | ROTATION | New passphrase accepted | gpg decrypt succeeds | NOT RUN |
| ROT-007 | CLEANUP | No plaintext in /dev/shm | ls returns empty | NOT RUN |
| ROT-008 | CLEANUP | No CLI identities | stellar keys ls empty | NOT RUN |
| ROT-009 | CLEANUP | No passphrase in git | grep returns empty | NOT RUN |
| ROT-010 | ISOLATION | Production .env unchanged | stat timestamp same | NOT RUN |
| ROT-011 | ISOLATION | NFT_AUTO_MINT_ENABLED=false | grep confirms | NOT RUN |
| ROT-012 | TESTS | Backend 1108/1108 | vitest passes | NOT RUN |

---

## Test Commands

### ROT-001 — Script exit code

```bash
bash ~/scripts/rotate-testnet-gpg-passphrase.sh
echo "Exit code: $?"
```

Expected: `Exit code: 0`

---

### ROT-002 — New file is GPG encrypted

```bash
file ~/.stellar-testnet-secrets.gpg
```

Expected output contains: `PGP symmetric AES-256 encrypted data`

---

### ROT-003 — File mode is 600

```bash
stat --format='mode=%a' ~/.stellar-testnet-secrets.gpg
```

Expected: `600`

---

### ROT-004 — File owner is webadmin

```bash
stat --format='owner=%U' ~/.stellar-testnet-secrets.gpg
```

Expected: `owner=webadmin`

---

### ROT-005 — Old passphrase rejected

```bash
gpg --decrypt --dry-run ~/.stellar-testnet-secrets.gpg
# Enter OLD (compromised) passphrase when prompted
```

Expected: non-zero exit code, `BAD_PASSPHRASE` or similar error.

Do not paste the passphrase into this chat — run this command in your terminal
and report only the exit code and error message (not the passphrase itself).

---

### ROT-006 — New passphrase accepted

```bash
gpg --decrypt --dry-run ~/.stellar-testnet-secrets.gpg
# Enter NEW passphrase when prompted
```

Expected: exit code 0, no output (dry-run suppresses plaintext).

---

### ROT-007 — No plaintext in /dev/shm

```bash
ls /dev/shm/
```

Expected: empty (the rotation script shreds and removes all temp files).

If any `gpg-*` or `stellar-*` files remain, shred them immediately:

```bash
find /dev/shm -name 'stellar*' -o -name 'gpg*' | xargs shred -u 2>/dev/null
```

---

### ROT-008 — No CLI identities cached

```bash
stellar keys ls 2>/dev/null || echo "stellar CLI not in path or no keys"
```

Expected: empty list or "no keys" — no plaintext identity stored in the Stellar
CLI keystore.

---

### ROT-009 — No passphrase in git history

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git log --all --oneline --diff-filter=A -- '*.sh' '*.md' '*.env' | head -20
```

Then check that no commit contains the passphrase value. This is a manual
review step — report only "clean" or "found in commit <hash>".

---

### ROT-010 — Production .env unchanged

```bash
stat --format='%y' /home/webadmin/amma-wallet-docker/app.env
```

Verify the modification timestamp is prior to 2026-08-19 (unchanged during
this incident). The testnet keypair rotation must have zero effect on the
production AmmaWallet environment.

---

### ROT-011 — NFT_AUTO_MINT_ENABLED=false

```bash
grep 'NFT_AUTO_MINT_ENABLED' /home/webadmin/amma-wallet-docker/app.env
```

Expected: `NFT_AUTO_MINT_ENABLED=false`

Confirms that mainnet NFT auto-minting is still disabled regardless of this
incident.

---

### ROT-012 — Backend tests 1108/1108

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run
```

Expected: all 1108 tests pass. No runtime code was changed during credential
rotation, so all tests should continue to pass.

---

## Pass Criteria

Rotation is considered complete and safe when:

- ROT-001 through ROT-006: ALL PASS
- ROT-007: PASS (no plaintext residue)
- ROT-008: PASS (no cached CLI identity)
- ROT-009: PASS (no passphrase in git)
- ROT-010 and ROT-011: PASS (production isolation confirmed)
- ROT-012: PASS (1108/1108 tests)

Only after all 12 tests pass may the next gate (SIR-012, Friendbot funding
approval) be requested.
