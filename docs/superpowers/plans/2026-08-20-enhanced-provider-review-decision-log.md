# Enhanced Stellar Provider — Decision Log

- **Date:** 2026-08-20
- **Spec:** `docs/superpowers/specs/2026-08-20-enhanced-provider-review-spec.md`

---

## Accepted Decisions

### D1: In-Process Lock (Not Distributed)

**Decision:** Use an in-process `Map<string, Promise>` for concurrency control.

**Rationale:** The LMS runs as a single Node.js process with SQLite (single-writer). A distributed lock (Redis, advisory lock) is unnecessary complexity. The in-process lock prevents application-level races within the same event loop.

**Limitation:** Does not guard across process restarts or multiple instances. Documented as a known constraint.

### D2: Bounded Polling (3 Attempts, Not Background Worker)

**Decision:** Poll `getTransaction` up to 3 times with exponential backoff `[1000, 2000, 4000]` ms.

**Rationale:** A background worker adds operational complexity (queue, persistence, scheduling) that is disproportionate to the LMS's transaction volume. Bounded polling covers the common case where Soroban inclusion takes 5-10 seconds.

**Trade-off:** Transactions taking longer than ~7 seconds total may be missed. Reconciliation service handles recovery.

### D3: No New DB Enum Values

**Decision:** Use existing `failed` status with a descriptive error message containing `SUBMISSION_UNKNOWN` prefix, rather than adding a new enum value.

**Rationale:** Adding a new status value (e.g., `submission_unknown`) requires a migration that touches the `nft_credentials` table. This requires separate migration approval and carries deployment risk. The descriptive error message achieves the same signaling — code can check `error LIKE 'SUBMISSION_UNKNOWN%'` if needed.

### D4: Reconciliation Network Isolation via Horizon URL

**Decision:** Network isolation is correct by design — Horizon URLs differ by network. Add explicit network match check as defense-in-depth.

**Rationale:** Testnet tx_hash queried against mainnet Horizon returns `not_found`. This is the correct behavior and prevents cross-network reconciliation naturally. The explicit check is belt-and-suspenders.

### D5: tx_hash Overwrite Protection via WHERE Clause

**Decision:** Add `AND tx_hash IS NULL` to the UPDATE statement that sets tx_hash.

**Rationale:** Prevents accidental overwrite of a valid tx_hash during retry or reconciliation. If tx_hash is already set, the UPDATE affects zero rows, which is detectable and non-destructive.

---

## Rejected Decisions

### R1: Automatic Retry After Unknown Submission

**Rejected:** Automatically retrying a mint after SUBMISSION_UNKNOWN status.

**Reason:** Too risky without human review. An unknown submission may have succeeded on-chain — retrying could result in a duplicate NFT mint. The correct response is to flag for reconciliation.

### R2: Database Uniqueness Constraint

**Rejected:** Adding a UNIQUE constraint on `(user_id, course_id)` in `nft_credentials`.

**Reason:** Requires migration approval. The in-process lock provides sufficient protection for the current deployment model. A DB constraint would be appropriate if/when the system scales to multiple processes.

### R3: Distributed Lock

**Rejected:** Using Redis or a DB advisory lock for mint concurrency.

**Reason:** Overengineering for a SQLite single-process deployment. Introduces a new infrastructure dependency (Redis) or complex DB locking patterns for a problem that the in-process lock solves adequately.
