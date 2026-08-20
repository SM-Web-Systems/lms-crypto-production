# Durable Idempotency Specification

**Date:** 2026-08-20
**Status:** BLOCKED (requires migration approval)

## Problem

An in-process lock (Map keyed on `userId:courseId`) is not sufficient for multi-process or restart-safe idempotency. If the process restarts mid-mint, the lock is lost, and a duplicate submission may occur.

## Options Evaluated

### Option A: `mint_operation_key` Column (SELECTED, BLOCKED)

Add a `mint_operation_key TEXT` column to `nft_credentials`. Before minting, compute a deterministic key (e.g., `sha256(userId:courseId:timestamp_bucket)`). Insert with `ON CONFLICT(mint_operation_key) DO NOTHING`. If the row already exists with the same payload, replay the result. If a different payload, return 409.

- **Pros:** Atomic, restart-safe, single-table.
- **Cons:** Requires schema migration (ALTER TABLE + UNIQUE INDEX).

### Option B: Separate `idempotency_operations` Table

Create a dedicated table tracking operation keys, status, and payloads.

- **Pros:** Clean separation, no schema change to existing table.
- **Cons:** Two-table coordination, more complex queries, still requires migration.

### Option C: Existing Schema Only

Rely on `mint_status` and `tx_hash` columns already present.

- **Pros:** No migration needed.
- **Cons:** Cannot distinguish "never attempted" from "attempted and lost track." Race window between status check and submission.

## Selected Approach

**Option A** (`mint_operation_key`) is the correct long-term solution but is **BLOCKED on migration approval**.

## Current Approach (Interim)

- In-process `Map<string, Promise>` lock keyed on `userId:courseId`.
- DB status checks (`mint_status`, `tx_hash`) before submission.
- `tx_hash` overwrite protection via `WHERE tx_hash IS NULL`.

## Documented Limitations

- **Not restart-safe:** If the process crashes between Soroban submission and status update, the lock is lost. The credential may be in an unknown state.
- **Not multi-process safe:** If multiple Node.js processes serve the same SQLite database, the in-process lock provides no cross-process coordination.
- **Acceptable for current deployment:** Single-process, single-server, SQLite-backed. These limitations are documented, not ignored.

Activation is not authorized by implementation readiness. Migration files may be prepared, but execution requires separate approval.
