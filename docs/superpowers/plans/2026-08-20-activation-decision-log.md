# Activation Blocker Decision Log

**Date:** 2026-08-20

## Decisions

### 1. DECIDED: Structured Error Code Prefixes

Use `[RECONCILIATION_REQUIRED]` and `[CONFIRMED_FAILED]` prefixes in the `error` column instead of adding a new `mint_status` enum value. Avoids CHECK constraint migration. Operators filter on error prefix.

**Rationale:** Achieves the same operational goal as a `SUBMISSION_UNKNOWN` status without schema changes.

### 2. DECIDED: In-Process Map Lock

Use a `Map<string, Promise>` keyed on `userId:courseId` for concurrency control within a single process.

**Rationale:** Acceptable for current single-process, single-server SQLite deployment. Documented limitation: not restart-safe, not multi-process safe.

### 3. DECIDED: Bounded Polling (3 Attempts)

Poll Soroban for transaction status with 3 attempts and exponential backoff (1s, 2s, 4s).

**Rationale:** Sufficient for Soroban finality times (~5s ledger close). Avoids unbounded polling that could hang requests.

### 4. DECIDED: tx_hash Overwrite Protection

Use `WHERE tx_hash IS NULL` guard when persisting transaction hashes.

**Rationale:** Prevents a retry or race condition from overwriting a valid tx_hash with a different one, which would make reconciliation impossible.

### 5. BLOCKED: Durable Idempotency via mint_operation_key

Add `mint_operation_key TEXT` column to `nft_credentials` with a partial unique index. Provides restart-safe, atomic idempotency.

**Status:** Migration SQL prepared but not executed. Migration files may be prepared, but execution requires separate approval.

### 6. BLOCKED: SUBMISSION_UNKNOWN Enum Value

Adding a new value to the `mint_status` CHECK constraint requires a full table rebuild in SQLite.

**Status:** Solved via structured error code prefixes (Decision 1). Migration deferred indefinitely.

### 7. REJECTED: Automatic Retry After Unknown Submission

Automatically retrying a mint after an unknown submission outcome risks double-minting (issuing two NFTs for one credential).

**Rationale:** Too risky. Manual reconciliation via admin endpoint is the safe path.

### 8. REJECTED: Distributed Lock

Using Redis or an external lock service for cross-process coordination.

**Rationale:** Overengineering for current deployment (single Node.js process, single server, SQLite). Would add infrastructure dependency without proportional benefit.
