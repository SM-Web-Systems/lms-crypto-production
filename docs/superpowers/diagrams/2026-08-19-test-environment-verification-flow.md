# Test Environment Verification Flow

**Date:** 2026-08-19
**Status:** VERIFIED

## Mermaid

```mermaid
flowchart TD
    A[vitest.config.ts] -->|sets env before import| B[process.env populated]
    B --> C[Module imports execute]
    C --> D[paystackService.ts line 10]
    C --> E[ammaWalletSSOService.ts line 17]
    D -->|PAYSTACK_SECRET_KEY captured| F[PAY-B14/B16/B17 PASS]
    E -->|AMMA_SSO_STATE_SECRET captured| G[SSO-RL-001 PASS]
    F --> H[1108/1108 ALL PASS]
    G --> H

    style H fill:#90EE90
```

## Root Cause
Module-level `process.env` capture reads env vars at import time, before test setup blocks run.

## Fix
Added 2 env vars to vitest.config.ts `test.env` block (commit 94a7d4d). Follows existing JWT_SECRET pattern.
