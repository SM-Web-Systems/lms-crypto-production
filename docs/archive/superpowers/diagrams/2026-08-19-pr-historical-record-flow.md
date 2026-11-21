# PR Historical Record Flow

**Date:** 2026-08-19
**Status:** READY FOR DECISION

## Mermaid

```mermaid
flowchart TD
    A[PR #1 Body Contains Stale Counts] --> B{What correction method?}
    B -->|Option 1| C[Leave PR body unchanged]
    B -->|Option 2| D[Update PR body]
    B -->|Option 3| E[Add PR comment]

    C --> F[Rely on repo docs for truth]
    D --> G{Approval granted?}
    E --> H{Approval granted?}

    G -->|Yes| I[gh pr edit --body]
    G -->|No| F
    H -->|Yes| J[gh pr comment]
    H -->|No| F

    I --> K[Verify updated body]
    J --> L[Verify comment posted]

    F --> M[Document decision in plans]
    K --> M
    L --> M

    style E fill:#90EE90,stroke:#333
```

## Stale Values

| Field | PR Body | Actual |
|-------|---------|--------|
| Mint tests | 24/24 | 67/67 |
| Backend (main) | 1091/1091 | 1108/1108 |
