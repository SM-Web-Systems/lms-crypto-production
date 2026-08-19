# Testnet Preflight Flow (Read-Only)

**Date:** 2026-08-19
**Status:** COMPLETE — All checks performed, all BLOCKED

```
┌─────────────────────────────────────────────┐
│          Testnet Preflight Checks            │
│          (Read-Only — No Side Effects)       │
└──────────────────────┬──────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│ Soroban CLI  │ │ Contract │ │ Testnet      │
│ Check        │ │ WASM     │ │ Contract ID  │
│              │ │ Check    │ │ Check        │
│ which        │ │ find     │ │ grep -r      │
│ stellar      │ │ *.wasm   │ │ testnet      │
│              │ │          │ │ contract     │
│ ✗ NOT FOUND  │ │ ✗ NONE   │ │ ✗ NONE       │
└──────┬───────┘ └────┬─────┘ └──────┬───────┘
       │              │              │
       ▼              ▼              ▼
┌──────────────────────────────────────────────┐
│            ALL BLOCKED                        │
│                                              │
│  Required before testnet operations:          │
│                                              │
│  1. Install Stellar CLI    → REQUIRES APPROVAL│
│  2. Obtain contract WASM   → REQUIRES APPROVAL│
│  3. Generate testnet keypair→ REQUIRES APPROVAL│
│  4. Fund via Friendbot     → REQUIRES APPROVAL│
│  5. Deploy contract        → REQUIRES APPROVAL│
│  6. Configure testnet env  → REQUIRES APPROVAL│
│  7. Execute test mint      → REQUIRES APPROVAL│
│                                              │
│  Each step requires separate explicit approval│
└──────────────────────────────────────────────┘

Production status (confirmed):
  NFT_STELLAR_NETWORK=public    ✓ Set
  NFT_CONTRACT_ID=CDPKSO...     ✓ Set (mainnet)
  NFT_MINTER_SECRET=***         ✓ Set (mainnet)
  NFT_AUTO_MINT_ENABLED=false   ✓ Admin-triggered only
```
