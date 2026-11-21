# Runtime Idempotency Loop

- **Date:** 2026-08-20
- **Status:** IN PROGRESS

## Safe Repeated Actions

These actions may be performed repeatedly without risk:

| Action | Safe? | Notes |
|--------|-------|-------|
| `git status` / `git log` / `git diff` | YES | Read-only git operations |
| Open `:memory:` SQLite database | YES | No file I/O, destroyed on close |
| Run vitest with `:memory:` tests | YES | No production data accessed |
| Read migration SQL file | YES | File is read-only reference |
| Read source files for analysis | YES | No modifications |
| Write/update spec documents | YES | Documentation only |
| Write/update plan documents | YES | Documentation only |
| Write/update diagram documents | YES | Documentation only |
| `PRAGMA table_info` on `:memory:` | YES | In-memory schema inspection |
| `PRAGMA index_list` on `:memory:` | YES | In-memory index inspection |
| Update TODO statuses | YES | Documentation bookkeeping |
| Update approval gate statuses | YES | Documentation bookkeeping |

## Stop Conditions

### STOP_ON_PRODUCTION_DATABASE

**STOP immediately if any action would read from or write to:**
- `LMS-Server/data/student_ms.db`
- Any file path containing `/data/student_ms.db`
- Any SQLite connection string that is not `:memory:`

### STOP_ON_BLOCKCHAIN_ACTIVITY

**STOP immediately if any action would:**
- Submit a Stellar/Soroban transaction
- Call Horizon API with real credentials
- Invoke `mintService.ts` with real network configuration
- Access mainnet or testnet RPC endpoints

### STOP_ON_PROVIDER_ACTIVATION

**STOP immediately if any action would:**
- Set `NFT_PROVIDER=enhanced` in production environment
- Modify `EnhancedStellarProvider` to remove the PROVIDER_NOT_READY guard
- Enable the enhanced provider in any Docker environment file

### STOP_ON_PRODUCTION_MIGRATION

**STOP immediately if any action would:**
- Execute `001-add-mint-operation-key.sql` against a file-backed database
- Run `ALTER TABLE nft_credentials ADD COLUMN` outside of `:memory:`
- Modify production schema without all approval gates passing

### STOP_ON_DESTRUCTIVE_GIT

**STOP immediately if any action would:**
- `git reset --hard`
- `git push --force`
- `git clean -f`
- Delete branches without confirmation

### STOP_ON_CONTAINER_MODIFICATION

**STOP immediately if any action would:**
- Restart or rebuild the `lms-api` container
- Modify Docker environment files
- Change `docker-compose.yml` configuration

## Current State

| Item | Value |
|------|-------|
| Phase | Documentation (Phase 5) |
| TODO items complete | 0 / 17 |
| Approval gates passed | 0 / 11 |
| Production DB touched | NO |
| Blockchain activity | NONE |
| Enhanced provider status | DISABLED (NFT_PROVIDER defaults to legacy) |
| Last safe action | Documentation file creation |
| Next action | Implement Phase 1 tests (RI-1 through RI-4) |

## Loop Iteration Log

| Iteration | Date | Actions Taken | Stop Conditions Hit |
|-----------|------|---------------|-------------------|
| 1 | 2026-08-20 | Created all spec, plan, diagram, and loop documents | None |
