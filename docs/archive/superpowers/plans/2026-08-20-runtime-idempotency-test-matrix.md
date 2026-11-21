# Runtime Idempotency Test Matrix

- **Date:** 2026-08-20
- **Database:** SQLite 3.45.1 via better-sqlite3 (:memory:)

## Repository Tests

| ID | Test | Input | Expected | Status |
|----|------|-------|----------|--------|
| RT-1 | setOperationKey success | Valid credentialId + unique key | Returns true, row updated | TODO |
| RT-2 | setOperationKey missing row | Nonexistent credentialId | Returns false | TODO |
| RT-3 | setOperationKey duplicate key | Same key on different credential | Throws SQLITE_CONSTRAINT | TODO |
| RT-4 | findByOperationKey found | Key matching existing row | Returns credential object | TODO |
| RT-5 | findByOperationKey not found | Nonexistent key | Returns undefined | TODO |
| RT-6 | columnExists pre-migration | Schema without mint_operation_key | Returns false | TODO |
| RT-7 | columnExists post-migration | Schema with mint_operation_key | Returns true | TODO |

## Key Derivation Tests

| ID | Test | Input | Expected | Status |
|----|------|-------|----------|--------|
| RT-8 | Deterministic output | Same 5 inputs, 1000 calls | All outputs identical | TODO |
| RT-9 | Uniqueness - different userId | userId=1 vs userId=2, rest same | Different keys | TODO |
| RT-10 | Uniqueness - different courseId | courseId=1 vs courseId=2, rest same | Different keys | TODO |
| RT-11 | Uniqueness - different wallet | walletA vs walletB, rest same | Different keys | TODO |
| RT-12 | Uniqueness - different contract | contractA vs contractB, rest same | Different keys | TODO |
| RT-13 | Uniqueness - different network | testnet vs public, rest same | Different keys | TODO |
| RT-14 | Missing required field | walletAddress = undefined | Throws validation error | TODO |
| RT-15 | Format verification | Known inputs | Matches `mint:${u}:${c}:${w}:${x}:${n}` pattern | TODO |

## Integration Tests

| ID | Test | Input | Expected | Status |
|----|------|-------|----------|--------|
| RT-16 | Idempotent return | Mint request with existing completed key | Returns existing credential, no mock blockchain call | TODO |
| RT-17 | First mint sets key | New mint request | Key written to DB, mock blockchain called | TODO |
| RT-18 | Failed allows retry | Existing failed record, same key | Mock blockchain called again | TODO |
| RT-19 | Provider disabled | NFT_PROVIDER=legacy | Enhanced provider not invoked | TODO |
| RT-20 | Provider not ready | NFT_PROVIDER=enhanced (no real config) | Throws PROVIDER_NOT_READY | TODO |

## Notes

- All tests use `:memory:` database.
- Blockchain calls are mocked (no real Stellar/Soroban activity).
- Enhanced provider is disabled in production by default.
