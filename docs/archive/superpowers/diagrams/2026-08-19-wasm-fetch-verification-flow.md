# WASM Fetch & Verification Flow

**Date:** 2026-08-19
**Status:** COMPLETE

```mermaid
flowchart TD
    A[Verify Contract ID] --> B{ID matches .env?}
    B -->|No| C[ABORT — wrong contract]
    B -->|Yes| D["stellar contract fetch --rpc-url mainnet"]
    D --> E{Fetch success?}
    E -->|No| F[Check RPC URL / network]
    E -->|Yes| G[Verify artifact]

    G --> H["file: WebAssembly binary ✓"]
    G --> I["Size: 32,110 bytes ✓"]
    G --> J["SHA-256: 2e8c87f0...ed6eb ✓"]
    G --> K["Magic: \\0asm ✓"]

    H & I & J & K --> L[Fetch ABI]
    L --> M["stellar contract info interface"]
    M --> N{mint(to, caller) matches?}
    N -->|No| O[ABORT — ABI mismatch]
    N -->|Yes| P[VERIFIED — ready for testnet deploy]

    P --> Q{Deploy approved?}
    Q -->|No| R[BLOCKED — awaiting approval]
    Q -->|Yes| S[Deploy to testnet]

    style C fill:#FFB6C1
    style O fill:#FFB6C1
    style P fill:#90EE90
    style R fill:#FFD700
    style S fill:#FFB6C1
```
