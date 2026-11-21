# Testnet API Runtime Loop Plan

**Date:** 2026-08-19
**Status:** ACTIVE

## Allowed Operations
| Operation | Frequency |
|-----------|-----------|
| Git status/branch checks | Every loop |
| Environment key inspection (redacted) | Every loop |
| Backend tests | On demand |
| API start with testnet overrides | On demand |
| Health/readiness checks | On demand |
| Process status checks | On demand |
| Production container status | Every loop |
| Blockchain operation count | On demand |
| Documentation validation | On demand |

## Forbidden Operations
| Operation | Reason |
|-----------|--------|
| Contract invocation | Not authorized |
| NFT minting | Not authorized |
| Any blockchain transaction | Not authorized |
| Auto-mint enablement | Not authorized |
| Production env changes | Not authorized |
| Production API restart | Not authorized |
| Credential rotation | Not authorized |
| Automatic commit/push | Not authorized |

## Stop Conditions
- STOP_RUNTIME — API must be stopped after verification
- STOP_ON_SECRET_LEAK — if any secret appears in logs/output
- STOP_ON_PRODUCTION_CHANGE — if production config differs from baseline
- STOP_ON_BLOCKCHAIN_ACTIVITY — if operation count exceeds 3
- STOP_ON_UNEXPECTED_CONTRACT_CALL — if any invocation detected
- STOP_ON_TEST_FAILURE — if backend tests fail
- STOP_ON_UNAUTHORIZED_WRITE — if tracked files change unexpectedly
