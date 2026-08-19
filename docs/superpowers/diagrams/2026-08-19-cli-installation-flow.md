# CLI Installation Flow

**Date:** 2026-08-19
**Status:** COMPLETE

```mermaid
flowchart TD
    A[Download installer to temp file] --> B[SHA-256 hash]
    B --> C[Review full 837-line script]
    C --> D{Security review OK?}
    D -->|Yes| E{User approval?}
    D -->|No| F[BLOCKED - Review failed]
    E -->|"Yes, --user"| G["sh install.sh --user"]
    E -->|No| H[BLOCKED - Not approved]
    G --> I[Binary installed to ~/.local/bin/stellar]
    I --> J[stellar --version = 27.1.0]
    J --> K[stellar contract --help OK]
    K --> L[stellar network --help OK]
    L --> M[VERIFIED]

    style M fill:#90EE90
    style F fill:#FFB6C1
    style H fill:#FFB6C1
```

## Evidence
- Installer SHA-256: fc0dde4effffcd2859c1ec640967c398cc47e208dc1f55baf8aa1fc7cedcb12d
- Version: 27.1.0
- Path: /home/webadmin/.local/bin/stellar
