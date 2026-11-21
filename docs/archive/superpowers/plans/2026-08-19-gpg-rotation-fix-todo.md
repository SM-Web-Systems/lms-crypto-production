# GPG Rotation Fix TODO

**Date:** 2026-08-19

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Diagnose GPG agent/pinentry failure | COMPLETE |
| 2 | Read and inspect rotation script | COMPLETE |
| 3 | Reproduce failure with minimal GPG test | COMPLETE |
| 4 | Fix script (loopback + read -s + verification) | COMPLETE |
| 5 | Syntax check | COMPLETE |
| 6 | User runs fixed script in SSH terminal | COMPLETE |
| 7 | Verify rotation metadata | COMPLETE |
| 8 | Update incident documentation | COMPLETE |
| 9 | Commit and push | COMPLETE |

## Root Cause Summary
Script used pinentry-curses (requires TTY) instead of `--pinentry-mode loopback` with `--passphrase-fd`.

## Fix Summary
- `read -s` collects passphrases silently from terminal
- `--passphrase-fd 3` with `3<<<` delivers passphrases to GPG via file descriptor
- Confirmation prompt prevents typos
- Automated verification tests both old and new passphrase after replacement
