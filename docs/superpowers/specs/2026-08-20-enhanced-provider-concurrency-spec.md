# Enhanced Stellar Provider — Concurrency Design Spec

- **Status:** IN REVIEW
- **Date:** 2026-08-20
- **Scope:** `EnhancedStellarProvider.mintNft()` concurrency guard

---

## Design

### In-Process Lock

A `Map<string, Promise<void>>` stored as a private class field on `EnhancedStellarProvider`.

**Key format:** `mint:${userId}:${courseId}`

### Lifecycle

```
1. mintNft(params) called
2. Compute lock key: `mint:${params.userId}:${params.courseId}`
3. If key exists in map → await existing promise
4. Create new Promise, store in map
5. Proceed with DB check → simulate → submit → poll
6. In `finally` block: delete key from map, resolve promise
7. If step 3 waited → re-check DB for existing credential
```

### Lock Acquired Before DB Check

The lock must wrap the entire flow including the initial DB check. Without this, two requests could both see "no existing credential" and both proceed to mint.

```typescript
private activeMints = new Map<string, Promise<void>>();

async mintNft(params: MintParams): Promise<MintResult> {
  const lockKey = `mint:${params.userId}:${params.courseId}`;

  // Wait for any in-flight mint for this key
  const existing = this.activeMints.get(lockKey);
  if (existing) {
    await existing;
    // Re-check DB — first request may have completed
    const credential = this.getExistingCredential(params);
    if (credential?.tx_hash) {
      return { status: 'already_minted', tx_hash: credential.tx_hash };
    }
  }

  // Acquire lock
  let resolve: () => void;
  const lock = new Promise<void>(r => { resolve = r; });
  this.activeMints.set(lockKey, lock);

  try {
    // ... mint logic ...
  } finally {
    this.activeMints.delete(lockKey);
    resolve!();
  }
}
```

### Limitations

- **Not distributed.** Only guards within a single Node.js process. If multiple processes serve the same DB, races are still possible.
- **Does not survive restart.** If the process crashes mid-mint, the lock is lost. Reconciliation service handles recovery.
- **Sufficient for SQLite.** SQLite is single-writer by design, and the LMS runs as a single process. This lock prevents application-level races, not DB-level races.

### Test Approach

Two sequential calls where the first acquires the lock and the second waits:

```typescript
// EP-H1: Concurrency guard prevents duplicate mint
it('should serialize concurrent mint requests for same credential', async () => {
  // First call: starts mint, holds lock
  // Second call: awaits lock, re-checks DB, finds credential
  // Result: only one mint executed
});
```

The test uses a deferred promise to control timing — the first mint is held mid-execution while the second request is initiated. After the first completes, the second should detect the existing credential.
