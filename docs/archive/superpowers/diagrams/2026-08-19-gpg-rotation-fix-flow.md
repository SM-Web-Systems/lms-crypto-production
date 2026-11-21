# GPG Rotation Fix — Passphrase Flow

**Date:** 2026-08-19

## Before Fix (FAILED)
```mermaid
sequenceDiagram
    participant Script
    participant GPG
    participant Agent as gpg-agent
    participant Pinentry as pinentry-curses

    Script->>GPG: gpg --batch --decrypt file.gpg
    GPG->>Agent: Request passphrase
    Agent->>Pinentry: Launch curses UI
    Pinentry--xAgent: No TTY available!
    Agent-->>GPG: Permission denied
    GPG-->>Script: Bad session key (exit 2)
```

## After Fix (WORKING)
```mermaid
sequenceDiagram
    participant User
    participant Script
    participant GPG

    Script->>User: read -s "Enter passphrase:"
    User->>Script: [passphrase via stdin, not echoed]
    Script->>GPG: gpg --pinentry-mode loopback --passphrase-fd 3 --decrypt
    Note over Script,GPG: Passphrase delivered via fd 3 (here-string)
    GPG-->>Script: Decrypted content (to /dev/shm)
    Script->>Script: shred plaintext
    Script->>Script: Verify new + reject old
```

## Key Difference
| Aspect | Before | After |
|--------|--------|-------|
| Passphrase input | pinentry-curses (needs TTY) | bash `read -s` (works in any terminal) |
| GPG passphrase delivery | Agent → pinentry subprocess | `--passphrase-fd 3` (direct fd) |
| TTY requirement | YES (pinentry-curses) | NO (loopback mode) |
| Confirmation | None | Enter twice + match check |
| Post-rotation verify | Manual (user runs gpg --decrypt) | Automated (script tests both passphrases) |
