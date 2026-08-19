# Timeout Reconciliation Spec

**Date:** 2026-08-19
**Status:** PROPOSED
**Scope:** Design for reconciling DB-failed credentials that succeeded on-chain
**Authorization:** Requires separate approval for implementation

---

## Problem Statement

The `mintService.ts` poll loop has finite timeouts:
- Quiz-triggered mint: 10 polls x 3 seconds = 30 seconds max
- Admin-triggered mint: 15 polls x 4 seconds = 60 seconds max

If the Soroban transaction lands on-chain after the poll timeout expires, the following mismatch occurs:

| Location | State |
|---|---|
| On-chain (Stellar) | Token minted, exists, owned by recipient |
| Database (`nft_credentials`) | `status = 'failed'`, no `soroban_token_id` |

This is the "timeout-then-success" gap.

**Statement:** No reconciliation process may submit or retry a transaction.

---

## Current Behavior

1. `mintCredentialForQuiz()` or `mintCredential()` submits a Soroban transaction
2. Poll loop checks transaction status at intervals
3. If poll exhausts all retries without confirmation:
   - DB record is marked `status = 'failed'`
   - Error is logged
   - Function returns/throws
4. The transaction may still be in the Stellar mempool or pending ledger close
5. Transaction lands on-chain after the DB has already been marked failed

---

## Risk

If a user or admin sees a "failed" credential and triggers a remint:
- A second `mint()` call is submitted to the contract
- A new token ID is allocated (TokenIdCounter increments)
- The recipient ends up with two on-chain tokens for the same course
- The DB may record the second token, leaving the first orphaned

This is a **data integrity** issue, not a security issue. No funds are at risk beyond the additional mint fee.

---

## Proposed Reconciliation

### Design

A reconciliation function that:

1. Queries the `nft_credentials` table for records with `status = 'failed'` and a non-null `tx_hash`
2. For each, queries Horizon API: `GET /transactions/{tx_hash}`
3. If Horizon returns the transaction with `successful = true`:
   - Updates the DB record: `status = 'minted'`, populates `soroban_token_id` from the transaction result
   - Logs the reconciliation
4. If Horizon returns 404 (tx never landed) or `successful = false`:
   - No action (record stays `failed`)
   - Logs the check result

### Components

| Component | Description |
|---|---|
| `reconcileFailedCredentials()` | Function in mintService or a new reconciliation module |
| Horizon query | `GET /transactions/{tx_hash}` — read-only, no authentication needed |
| DB update | `UPDATE nft_credentials SET status = 'minted', soroban_token_id = ? WHERE id = ? AND status = 'failed'` |
| Trigger | Manual admin endpoint or cron job (e.g., every 15 minutes) |
| Logging | Structured log for each reconciled or confirmed-failed record |

### Constraints

- **Read-only on-chain:** The reconciliation function MUST NOT submit any transaction to Stellar
- **Idempotent:** Running reconciliation multiple times produces the same result
- **No retry:** If a tx_hash is not found on Horizon, the record stays failed — no new mint is attempted
- **No automatic remint:** Reconciliation only updates DB status, never creates new tokens

---

## Edge Cases

| Scenario | Handling |
|---|---|
| `tx_hash` is null (submission failed before broadcast) | Skip — no on-chain data to check |
| Transaction pending (in mempool) | Horizon returns 404 — no action, check again later |
| Transaction failed on-chain | Horizon returns `successful = false` — log, no action |
| Multiple failed records for same user+course | Each checked independently by tx_hash |
| Network error querying Horizon | Log error, skip record, retry on next run |

---

## API Endpoint (Proposed)

```
POST /admin/credentials/reconcile
```

- Requires `system.manage` or equivalent admin permission
- Returns: count of records checked, count reconciled, count still failed
- Rate limited to prevent Horizon API abuse

---

## Cron Alternative

```
# Every 15 minutes, check failed credentials
*/15 * * * * curl -s -X POST http://localhost:3001/admin/credentials/reconcile -H "Authorization: Bearer $ADMIN_TOKEN"
```

Or integrated into the application as a background interval.

---

## Scope Boundary

This spec covers DB reconciliation only. The following are explicitly out of scope:

- Automatic retry of failed mints
- Submitting new transactions
- Modifying contract state
- Production deployment of reconciliation
- Changes to the mint flow itself
