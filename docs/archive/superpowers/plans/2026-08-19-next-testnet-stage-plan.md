# Next Testnet Stage Implementation Plan

**Date:** 2026-08-19
**Phase:** 16 (Repository Assessment)
**Status:** PROPOSED

## Recommended Progression

### Stage A: Contract State Read-Only Verification
**Risk:** NONE | **Approval:** Required

1. Use `stellar contract read` to inspect on-chain storage
2. Verify constructor values (admin, minter, uri) match deployment
3. Verify token counter = 0 (no mints yet)
4. Document results with evidence

**Commands:**
```bash
stellar contract read \
  --id CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

**Success criteria:** All constructor values match expected. Token counter = 0.

### Stage B: Simulation-Only Mint
**Risk:** NONE | **Approval:** Required

1. Use `stellar contract invoke --sim-only` to simulate a mint
2. Verify ABI compatibility with live contract
3. Capture resource footprint and estimated fees
4. No transaction submitted, no state change

**Commands:**
```bash
stellar contract invoke --sim-only \
  --id CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  --source GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3 \
  -- mint \
  --to GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3 \
  --caller GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3
```

**Success criteria:** Simulation returns success with resource estimates. No errors.

### Stage C: One Controlled Testnet Mint
**Risk:** LOW (testnet only) | **Approval:** Required (separate from A/B)

1. Decrypt testnet secret from GPG
2. Execute one mint via CLI or isolated API
3. Capture tx_hash and token_id
4. Verify on Horizon and via contract read
5. Check balance delta

**Prerequisite:** Stages A and B both PASS.

### Stage D: Full Integration Test (Deferred)
**Risk:** LOW | **Approval:** Required (separate)

Full Docker-compose testnet stack. Deferred until Stage C proves the mint works.

## Decision Matrix

| Criteria | Option A | Option B | Option C | Option D |
|----------|----------|----------|----------|----------|
| Risk | None | None | Low | Low |
| Blockchain cost | None | None | ~0.01 XLM | ~0.05 XLM |
| Constructor verification | YES | No | Indirect | Indirect |
| ABI verification | No | YES | YES | YES |
| End-to-end proof | No | No | YES | YES |
| Source changes needed | No | No | No | Maybe |
| Requires secret | No | No | YES | YES |

## NOT Authorized by This Plan
- Any execution without explicit per-stage approval
- Production changes of any kind
- Auto-mint enablement
- More than one mint per approval
