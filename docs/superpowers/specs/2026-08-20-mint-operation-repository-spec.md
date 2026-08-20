# MintOperationRepository Spec

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Database:** SQLite 3.45.1 via better-sqlite3
- **Scope:** In-memory (:memory:) only. Production database is NOT touched.

> In-memory migration validation and runtime tests do not authorize production migration.

## Problem

The enhanced NFT provider needs a repository layer to read and write `mint_operation_key` values in `nft_credentials`. This layer must be testable in isolation using in-memory SQLite and must not assume the column exists (graceful degradation when migration has not been applied).

## Goals

1. Define a `MintOperationRepository` interface for mint_operation_key CRUD.
2. Provide `setOperationKey(credentialId, operationKey)` and `findByOperationKey(operationKey)` methods.
3. Ensure the repository is injectable and testable with `:memory:` databases.
4. Handle the case where `mint_operation_key` column does not exist (legacy schema).

## Non-Goals

- Implementing the enhanced provider logic (separate spec).
- Running against production database.
- Managing database connections or pooling.

## Interface

```typescript
interface MintOperationRepository {
  /** Set the operation key for a credential. Returns true if updated. */
  setOperationKey(credentialId: number, operationKey: string): boolean;

  /** Find a credential by its operation key. Returns undefined if not found. */
  findByOperationKey(operationKey: string): IssuedCredential | undefined;

  /** Check if the mint_operation_key column exists. */
  columnExists(): boolean;
}
```

## Behavior

| Method | Input | Output | Side Effects |
|--------|-------|--------|-------------|
| `setOperationKey` | credentialId, operationKey | `true` if row updated | UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ? |
| `findByOperationKey` | operationKey | Credential row or undefined | SELECT * FROM nft_credentials WHERE mint_operation_key = ? |
| `columnExists` | none | boolean | PRAGMA table_info check |

### Error Cases

- `setOperationKey` with duplicate key: throws UNIQUE constraint error (caller handles).
- `setOperationKey` on nonexistent credentialId: returns `false` (no rows updated).
- `findByOperationKey` when column missing: returns `undefined` (graceful degradation).

## Schema Before/After

Same as in-memory migration validation spec. The repository operates on the post-migration schema but degrades gracefully on pre-migration schema.

## Acceptance Criteria

- [ ] `setOperationKey` updates exactly one row and returns true.
- [ ] `setOperationKey` with duplicate key throws SQLITE_CONSTRAINT.
- [ ] `findByOperationKey` returns the correct credential row.
- [ ] `findByOperationKey` returns undefined for unknown keys.
- [ ] `columnExists` returns false on pre-migration schema.
- [ ] `columnExists` returns true on post-migration schema.
- [ ] All tests use `:memory:` database.

## Risks

| Risk | Mitigation |
|------|-----------|
| Column missing at runtime | `columnExists()` check before operations |
| Concurrent writes to same key | SQLite serializes writes; UNIQUE index rejects duplicates |

## Required Approvals

- [ ] Interface review by project owner
- [ ] Test coverage review
