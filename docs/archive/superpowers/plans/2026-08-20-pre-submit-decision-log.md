# Pre-Submit Reservation Decision Log

- **Date:** 2026-08-20
- **Author:** Claude Code

## Decisions

### D1: Reserve BEFORE simulate, not after submit

- **Context:** The current implementation sets `mint_operation_key` atomically with `tx_hash` after submission. This leaves a race window where two processes both simulate and submit.
- **Decision:** Move reservation to before simulation. The UNIQUE partial index prevents two processes from both reserving.
- **Rationale:** The database is the source of truth. Reserving early closes the race window at the earliest possible point.
- **Trade-off:** Simulation failure now requires cleanup (clearing the reservation). Accepted — cleanup is a single UPDATE with a `WHERE tx_hash IS NULL` guard.

### D2: Clear reservation on simulation failure

- **Context:** If simulation fails after reservation, the key blocks future retries.
- **Decision:** Clear `mint_operation_key` on simulation failure, guarded by `WHERE tx_hash IS NULL`.
- **Rationale:** The `tx_hash IS NULL` guard ensures we never clear a reservation that has progressed to submission. If tx_hash is set, the transaction was submitted and the reservation must persist for reconciliation.
- **Alternative considered:** Leave the reservation and require manual clearing. Rejected — too operationally burdensome.

### D3: No new migration

- **Context:** The `mint_operation_key` column and UNIQUE partial index already exist from `001-add-mint-operation-key.sql`.
- **Decision:** Reuse the existing schema. No new migration file.
- **Rationale:** The schema supports both the current (post-submit) and hardened (pre-submit) reservation patterns. The change is behavioral, not structural.

### D4: 15-minute recovery sweep threshold

- **Context:** Orphaned reservations (process crash after reserve, before submit) need a recovery mechanism.
- **Decision:** Recovery sweep clears reservations older than 15 minutes with no `tx_hash` and `mint_status = 'pending'`.
- **Rationale:** Simulation + submission typically completes in under 30 seconds. 15 minutes is a generous margin. Shorter would risk clearing active operations on very slow networks.
- **Alternative considered:** 5 minutes (too aggressive for slow Horizon responses), 1 hour (too long to wait for recovery).

### D5: In-process mutex is optimization only

- **Context:** The existing `_mintLocks` Map serializes concurrent calls within a single Node.js process.
- **Decision:** Keep the mutex as an optimization but document that the database reservation is the source of truth.
- **Rationale:** The mutex reduces database contention and avoids unnecessary UNIQUE constraint violations. But it cannot protect against cross-process races, so the database must be the definitive guard.
- **A process-local mutex is an optimization, not the source of truth. The database reservation is the source of truth.**

### D6: Deterministic operation key (no random component)

- **Context:** Operation keys could include a random nonce for uniqueness.
- **Decision:** Keys are deterministic: `mint:{userId}:{courseId}:{walletAddress}:{contractId}:{network}`.
- **Rationale:** Deterministic keys enable idempotent replay — same inputs always produce the same key. A random component would prevent replay detection and make recovery harder.
- **Alternative considered:** HMAC-based key with a server secret. Rejected — adds complexity without security benefit (the key is not a secret, just a dedup marker).

### D7: UNIQUE constraint catch by string matching

- **Context:** SQLite reports UNIQUE violations via error message, not a dedicated error code.
- **Decision:** Catch block checks `e.message?.includes('UNIQUE constraint')`.
- **Rationale:** This is the standard pattern used throughout the codebase (see existing catch in `_doMint`). better-sqlite3 throws `SqliteError` with the constraint message.
- **Risk:** Message format could change in future SQLite versions. Accepted — better-sqlite3 wraps the native error consistently.

### D8: Feature-flagged via NFT_PROVIDER

- **Context:** The enhanced provider is already behind `NFT_PROVIDER` feature flag (default: `legacy`).
- **Decision:** No new feature flag. The reservation hardening activates when `NFT_PROVIDER=enhanced` AND the migration is applied.
- **Rationale:** Adding another flag creates confusion. The existing flag + schema detection (`hasOperationKeyColumn`) is sufficient.
