# GPG Rotation Script Fix — Diagnosis

**Date:** 2026-08-19
**Status:** FIXED
**Incident:** SIR-012 (passphrase exposure) — rotation script failed on first attempt

## Symptoms
- `gpg: problem with the agent: Permission denied`
- `gpg: decryption failed: Bad session key`

## Root Cause
The rotation script (lines 80, 103) used `gpg --batch --yes --decrypt` and `gpg --symmetric` without `--pinentry-mode loopback`. GPG agent attempted pinentry-curses, which requires a TTY. The user's terminal session did not provide TTY access to the gpg-agent subprocess.

## Diagnostic Evidence
| Test | Command | Result |
|------|---------|--------|
| Encrypt with loopback | `gpg --pinentry-mode loopback --passphrase "test" --symmetric` | OK |
| Encrypt without loopback | `gpg --batch --symmetric` | OK (cached agent session) |
| Decrypt with loopback | `gpg --pinentry-mode loopback --passphrase "test" --decrypt` | OK |
| Decrypt without loopback | `gpg --batch --decrypt` | FAILED — "Inappropriate ioctl for device" |

## Fix Applied
1. Replaced pinentry-based passphrase prompting with bash `read -s` (silent terminal input)
2. Added `--pinentry-mode loopback --passphrase-fd 3` with `3<<<` here-strings to both GPG commands
3. Added passphrase confirmation (enter twice) and minimum length check (8 chars)
4. Added automated post-replacement verification (tests both new and old passphrase)
5. Added passphrase variable cleanup in trap handler and after verification

## Files Changed
- `~/scripts/rotate-testnet-gpg-passphrase.sh` — lines 80-84 (decrypt), 99-122 (encrypt), 43-46 (cleanup), 163-183 (verification)

## Encrypted File Status
- `~/.stellar-testnet-secrets.gpg` — INTACT, not modified (rotation not yet re-attempted)
- Type: PGP symmetric key encrypted data - AES with 256-bit key salted & iterated - SHA512
- Mode: 600, Owner: webadmin, Size: 127 bytes
