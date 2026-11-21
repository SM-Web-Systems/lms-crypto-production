# Testnet Account Funding Flow

**Date:** 2026-08-19
**Status:** BLOCKED — Requires approval

```
┌──────────────────────┐
│ Generate Keypair     │
│                      │
│ stellar keys         │
│   generate           │
│                      │
│ Output:              │
│   Public: G...       │
│   Secret: S...       │
│                      │
│ APPROVAL REQ'D       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ Fund via Friendbot                            │
│                                              │
│ curl https://friendbot.stellar.org           │
│   ?addr=<PUBLIC_KEY>                         │
│                                              │
│ Result: 10,000 testnet XLM                   │
│   - Free, no monetary value                  │
│   - Network may reset periodically           │
│                                              │
│ APPROVAL REQ'D                               │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ Store Testnet Credentials                     │
│                                              │
│ Separate from production:                     │
│   - Different env file or section            │
│   - Clear "TESTNET" labeling                 │
│   - Never mixed with mainnet secrets         │
│                                              │
│ Production keys:                              │
│   ✗ MUST NOT appear in testnet config        │
│                                              │
│ Testnet keys:                                 │
│   ✗ MUST NOT appear in production config     │
└──────────────────────────────────────────────┘
```
