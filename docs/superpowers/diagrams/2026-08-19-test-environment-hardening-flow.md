# Test Environment Hardening Flow

**Date:** 2026-08-19

```
┌─────────────────────────────────────────────────────────────┐
│                    vitest.config.ts                          │
│                                                             │
│  defineConfig({                                             │
│    test: {                                                  │
│      env: {                                                 │
│        JWT_SECRET: 'test-only-...',         ← existing      │
│        PAYSTACK_SECRET_KEY: 'test-only-...', ← NEW FIX     │
│        AMMA_SSO_STATE_SECRET: 'test-only-...', ← NEW FIX   │
│      }                                                      │
│    }                                                        │
│  })                                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│         Vitest Process Startup                    │
│                                                  │
│  1. Parse vitest.config.ts                       │
│  2. Set process.env from config.test.env         │
│  3. Import test files                            │
│  4. Module-level code executes                   │
│     (captures env vars at import time)           │
└──────────────────────┬───────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
┌──────────────────┐    ┌──────────────────────┐
│ paystackService  │    │ ammaWalletSSOService │
│                  │    │                      │
│ Line 10:         │    │ Line 17:             │
│ const KEY =      │    │ const STATE_SECRET = │
│ process.env      │    │ process.env          │
│ .PAYSTACK_       │    │ .AMMA_SSO_STATE_     │
│  SECRET_KEY      │    │  SECRET              │
│                  │    │                      │
│ ✓ Now has value  │    │ ✓ Now has value      │
│ at import time   │    │ at import time       │
└──────────────────┘    └──────────────────────┘
          │                         │
          ▼                         ▼
┌──────────────────┐    ┌──────────────────────┐
│ PAY-B14/B16/B17  │    │ SSO-RL-001           │
│ Webhook HMAC     │    │ Rate-limit exempt     │
│ signature tests  │    │ SSO redirect test     │
│                  │    │                      │
│ ✓ PASS           │    │ ✓ PASS               │
│ (key available   │    │ (secret available    │
│  for HMAC calc)  │    │  for state signing)  │
└──────────────────┘    └──────────────────────┘

Root Cause: Module-level process.env capture
─────────────────────────────────────────────
  Before fix: env vars empty at import → tests fail
  After fix:  vitest.config.ts sets vars before import → tests pass

Result: 1108/1108 (both worktrees)
```
