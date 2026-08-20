# Runtime Idempotency TODO List

- **Date:** 2026-08-20
- **Status:** IN PROGRESS
- **Database target:** :memory:
- **Owner:** Claude Code

## Phase 1: Migration Validation

| ID | Priority | Status | Objective | Database Target | Owner |
|----|----------|--------|-----------|----------------|-------|
| RI-1 | P0 | TODO | Validate ALTER TABLE ADD COLUMN applies cleanly to seed schema in :memory: | :memory: | Claude Code |
| RI-2 | P0 | TODO | Validate partial unique index enforces uniqueness on non-NULL mint_operation_key | :memory: | Claude Code |
| RI-3 | P0 | TODO | Validate composite index (user_id, course_id, mint_status) is created and queryable | :memory: | Claude Code |
| RI-4 | P0 | TODO | Validate existing rows retain NULL mint_operation_key after migration | :memory: | Claude Code |

## Phase 2: Repository Layer

| ID | Priority | Status | Objective | Database Target | Owner |
|----|----------|--------|-----------|----------------|-------|
| RI-5 | P0 | TODO | Implement MintOperationRepository with setOperationKey and findByOperationKey | :memory: | Claude Code |
| RI-6 | P0 | TODO | Test setOperationKey returns true on success, false on missing credentialId | :memory: | Claude Code |
| RI-7 | P0 | TODO | Test findByOperationKey returns credential or undefined | :memory: | Claude Code |
| RI-8 | P1 | TODO | Test columnExists graceful degradation on pre-migration schema | :memory: | Claude Code |

## Phase 3: Key Derivation

| ID | Priority | Status | Objective | Database Target | Owner |
|----|----------|--------|-----------|----------------|-------|
| RI-9 | P0 | TODO | Implement deriveOperationKey function with template literal formula | :memory: | Claude Code |
| RI-10 | P0 | TODO | Test determinism (1000 identical calls) and uniqueness (each input variation) | :memory: | Claude Code |

## Phase 4: Runtime Integration

| ID | Priority | Status | Objective | Database Target | Owner |
|----|----------|--------|-----------|----------------|-------|
| RI-11 | P0 | TODO | Test idempotent return for duplicate mint request (same key, completed status) | :memory: | Claude Code |
| RI-12 | P0 | TODO | Test UNIQUE constraint rejection on concurrent claim of same operation key | :memory: | Claude Code |
| RI-13 | P1 | TODO | Test recovery of pending record after simulated restart | :memory: | Claude Code |
| RI-14 | P1 | TODO | Test retry of failed record with same operation key | :memory: | Claude Code |

## Phase 5: Documentation and Approval

| ID | Priority | Status | Objective | Database Target | Owner |
|----|----------|--------|-----------|----------------|-------|
| RI-15 | P1 | TODO | Complete all spec documents | n/a | Claude Code |
| RI-16 | P1 | TODO | Complete decision log with all design choices | n/a | Claude Code |
| RI-17 | P2 | TODO | Populate approval gates with evidence from test runs | n/a | Claude Code |

## Summary

- **Total:** 17
- **Completed:** 0
- **In Progress:** 0
- **Remaining:** 17
