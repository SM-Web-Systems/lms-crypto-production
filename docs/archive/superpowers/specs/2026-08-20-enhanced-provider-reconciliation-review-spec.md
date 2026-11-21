# Enhanced Stellar Provider — Reconciliation Review Spec

- **Status:** IN REVIEW
- **Date:** 2026-08-20
- **Scope:** `EnhancedStellarProvider.reconcile()` hardening

---

## Current Gaps

1. No validation that the stored credential's `network` matches the Horizon URL used for lookup.
2. No check of the `successful` boolean on the Horizon transaction response.
3. No guard against overwriting an existing non-null `tx_hash`.

## Proposed Hardening

### Network Validation

The stored `credential.network` must match the reconciliation target network.

- Horizon URL is already derived from the credential's network (testnet vs mainnet use different base URLs).
- Cross-network reconciliation is prevented by design: a testnet `tx_hash` queried against mainnet Horizon returns `not_found`, which is correct behavior.
- Explicit validation: if `credential.network` does not match the provider's configured network, return an error rather than attempting lookup.

### Horizon Response Validation

The Horizon transaction response includes a `successful` boolean field:

```json
{
  "id": "...",
  "hash": "abc123...",
  "successful": true,
  "ledger": 12345
}
```

Reconciliation must check `successful === true` before marking a credential as recovered. A transaction that was included in a ledger but failed should not result in a `minted` status.

### Contract/Source Validation — Not Required

The Horizon `/transactions/:hash` endpoint does **not** include Soroban invocation details (contract address, function name, source account). Validating these fields would require parsing the transaction XDR, which is:

- Complex and fragile
- Not necessary for reconciliation (the tx_hash is already tied to the credential record)
- Out of scope for this hardening pass

### tx_hash Preservation

Never overwrite an existing non-null `tx_hash`:

```sql
UPDATE nft_credentials SET tx_hash = ? WHERE id = ? AND tx_hash IS NULL
```

If `tx_hash` is already set, the UPDATE affects zero rows. The reconciliation should detect this and return the existing hash.

### Idempotent Re-Reconcile

Already works correctly: a credential with `status = 'minted'` returns `ineligible` on re-reconcile. No changes needed.

### No Cross-Network Reconciliation

| Scenario | Behavior |
|----------|----------|
| Testnet tx_hash on testnet Horizon | Normal lookup |
| Testnet tx_hash on mainnet Horizon | `not_found` (correct) |
| Mainnet tx_hash on mainnet Horizon | Normal lookup |
| Mainnet tx_hash on testnet Horizon | `not_found` (correct) |

The Horizon URL derivation from `credential.network` already prevents cross-network lookups. The explicit network match check is defense-in-depth.

## Test Approach

- **EP-H5:** Network isolation test — reconcile with mismatched network returns error.
- Mock Horizon responses with `successful: true` and `successful: false` cases.
- Verify tx_hash is not overwritten when already present.
