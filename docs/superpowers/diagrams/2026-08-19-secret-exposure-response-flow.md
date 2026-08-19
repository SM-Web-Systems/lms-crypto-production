# Secret Exposure Response Flow

**Date:** 2026-08-19
**Incident:** GPG passphrase exposed in session output

```mermaid
flowchart TD
    A["Passphrase exposed in output"] --> B{Private key exposed?}
    B -->|"NO — piped via stdin"| C[Rotate GPG passphrase only]
    B -->|"YES or UNKNOWN"| D[Abandon account]
    C --> E["User runs rotation script"]
    E --> F{Script succeeds?}
    F -->|Yes| G[Verify file metadata]
    F -->|No| H[Investigate and retry]
    G --> I{Old passphrase rejected?}
    I -->|Yes| J[ROTATION COMPLETE]
    I -->|No| K[ROTATION FAILED]
    D --> L[Delete encrypted file]
    L --> M[Generate replacement keypair]
    M --> N[New account + new passphrase]

    style A fill:#FFB6C1
    style J fill:#90EE90
    style K fill:#FFB6C1
    style D fill:#FFB6C1
```

## Decision Basis

- Private key was piped directly to `gpg --symmetric` via stdin.
- It was never assigned to a shell variable or printed to stdout.
- Exposure is therefore limited to the passphrase only.
- Decision: rotate passphrase, retain account.

## Current Position

The flow is at node **E** ("User runs rotation script") — awaiting SIR-007.
