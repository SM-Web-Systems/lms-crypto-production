# Enhanced Provider Activation Boundary Specification
**Date:** 2026-08-20
**Status:** NOT APPROVED
**Document:** Scope boundary for enhanced-provider activation authorization

---

## Executive Summary

This specification explicitly documents that **enhanced-provider activation is NOT authorized as part of the `001-add-mint-operation-key.sql` migration.**

The migration prepares the database schema layer only. Activation of the enhanced provider requires separate approval, implementation, and validation.

**Production migration does not authorize enhanced-provider activation.**
**No blockchain operation is part of migration verification.**

---

## Scope: What This Migration DOES

✅ **Authorized by production migration:**

1. ADD COLUMN `mint_operation_key TEXT` to `nft_credentials` table
2. CREATE UNIQUE partial INDEX on `mint_operation_key`
3. CREATE composite INDEX for query performance
4. Database integrity verification
5. Backup and restore procedures
6. Schema rollback procedures
7. Post-migration verification (schema-only)

---

## Scope: What This Migration DOES NOT DO

❌ **NOT authorized, explicitly blocked:**

1. Activate enhanced provider (NFT_PROVIDER environment variable set to "enhanced")
2. Instantiate `TransactionClient` in production
3. Load `EnhancedStellarProvider` class into runtime
4. Enable auto-minting (NFT_AUTO_MINT_ENABLED=true)
5. Perform any Soroban/Stellar blockchain operations
6. Update mint operation flow to use new column
7. Deploy provider-related code changes to production

---

## Current State: Pre-Migration

| Component | State | Notes |
|-----------|-------|-------|
| **Database Schema** | Pre-migration | 14 columns, no `mint_operation_key` |
| **NFT_PROVIDER env** | Unset | Defaults to "legacy" |
| **Legacy Provider** | Active | Using existing mintService flow |
| **Enhanced Provider Code** | In repository | Not deployed or active |
| **TransactionClient** | Not instantiated | Feature not implemented for production |
| **NFT_AUTO_MINT_ENABLED** | false | Admin-triggered only |

---

## After-Migration State: REQUIRED

| Component | State | Notes |
|-----------|-------|-------|
| **Database Schema** | Post-migration | 15 columns, includes `mint_operation_key` |
| **NFT_PROVIDER env** | ❌ Still unset | Must not be set to "enhanced" |
| **Legacy Provider** | ✅ Still active | Continue using existing flow |
| **Enhanced Provider Code** | In repository | Still not deployed or active |
| **TransactionClient** | ❌ Still not instantiated | No production implementation |
| **NFT_AUTO_MINT_ENABLED** | ❌ Still false | No change to minting behavior |

---

## What hasOperationKeyColumn() Detects

After migration, the legacy provider's helper function will detect the new column:

```typescript
async function hasOperationKeyColumn(): Promise<boolean> {
  // Checks if nft_credentials has mint_operation_key column
  // Returns: true (column exists)
  // Usage: Guard for enhanced provider features
}
```

**Status after migration:** `hasOperationKeyColumn()` returns `true`

**Implication:** Code path exists to check column, but legacy provider doesn't use it.

**No impact:** Legacy provider continues using existing mint flow.

---

## Activation Flowchart: Current Boundary

```
Migration Complete
  ↓
[hasOperationKeyColumn() = true]
  ↓
  ├─ Check NFT_PROVIDER env
  │   ├─ "legacy" → Use LegacyStellarProvider ✅ (ACTIVE)
  │   └─ "enhanced" → Use EnhancedStellarProvider ❌ (BLOCKED)
  ↓
  └─ [All operations use legacy provider]
```

**Enhanced provider activation requires:**
1. Separate approval vote (not this PR)
2. TransactionClient implementation (not in this PR)
3. Testnet E2E validation (separate ticket)
4. Blockchain operation authorization (separate approval)
5. NFT_PROVIDER=enhanced environment variable (post-approval deployment)

---

## Boundary Enforcement

### Code-Level

The factory function must not select enhanced provider:

```typescript
// In nftProvider.ts factory
const provider = NFT_PROVIDER === 'enhanced'
  ? new EnhancedStellarProvider(...)  // ❌ NOT USED IN PRODUCTION
  : new LegacyStellarProvider(...);   // ✅ ALWAYS SELECTED
```

**Enforcement:** NFT_PROVIDER is not set (or explicitly "legacy")

### Deployment-Level

Docker environment must not include enhanced activation:

```bash
# /home/webadmin/amma-wallet-docker/docker-compose.yml

services:
  lms-api:
    environment:
      # ✅ Correct (unset, defaults to legacy)
      # NFT_PROVIDER is NOT in this list

      # ❌ Incorrect (would activate enhanced)
      # NFT_PROVIDER: "enhanced"  # FORBIDDEN
```

### Configuration-Level

Environment file must not enable enhanced provider:

```bash
# /home/webadmin/amma-wallet-docker/app.env

# ✅ Correct state
NFT_AUTO_MINT_ENABLED=false
# NFT_PROVIDER not set (no override)

# ❌ Incorrect state (blocked)
# NFT_PROVIDER=enhanced
```

---

## Separation: Schema vs. Provider

### Schema Layer (This Migration: APPROVED)

Database structure change to support future enhanced provider:
- Column to track mint operations
- Indexes for performance
- Fully backward compatible
- No provider behavior change
- Transparent to running API

**Status:** APPROVED and READY FOR PRODUCTION

### Provider Layer (Future Work: REQUIRES SEPARATE APPROVAL)

Logic to use new column and blockchain client:
- Enhanced provider implementation
- TransactionClient integration
- Mint operation tracking in column
- Soroban/Stellar blockchain calls
- API behavior changes

**Status:** NOT APPROVED, PENDING SEPARATE AUTHORIZATION

---

## Why Separate Approval?

### Schema Changes (Safe)

✅ **Low risk, additive:**
- New column (NULL by default)
- Unused by legacy provider
- Backward compatible
- Rollback is trivial
- No operational impact

### Provider Activation (Risky)

❌ **High risk, behavioral:**
- Changes mint authorization flow
- Requires blockchain client credentials
- Introduces new transaction types
- Requires operational monitoring
- Potential for failed transactions
- Requires incident response procedures
- Impacts user wallet operations

---

## STOP Conditions: Enhanced Activation Blocked

Do NOT activate enhanced provider if:

- [ ] NFT_PROVIDER env variable is set to "enhanced" → STOP, remove
- [ ] TransactionClient is instantiated in code → STOP, remove
- [ ] EnhancedStellarProvider is imported in mintService.ts → STOP, remove
- [ ] Soroban contract calls in mint flow → STOP, remove
- [ ] Stellar operation memoBuild using new column → STOP, remove
- [ ] Docker logs show "Enhanced provider" messages → STOP, investigate
- [ ] Mint flow attempts to use operation_key → STOP, revert
- [ ] API startup fails with "TransactionClient not configured" → STOP, check env

**All of the above are FORBIDDEN in this migration.**

---

## Test Verification: Provider Remains Legacy

After migration, verify:

```bash
# Test 1: Check NFT_PROVIDER is not set
docker inspect lms-api | jq '.[0].Config.Env[]' | grep NFT_PROVIDER
→ (no output or "NFT_PROVIDER=legacy")

# Test 2: Check no enhanced provider logs
docker logs lms-api 2>&1 | grep -i "enhanced" | grep -i provider
→ (no output)

# Test 3: Check mint flow still uses legacy
curl -s http://lms-api:3000/api/v1/admin/credentials \
  -X POST -d '{"...": "..."}' | jq . | grep -i "enhanced"
→ (no "enhanced" in response)

# Test 4: Check column exists but unused
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT mint_operation_key FROM nft_credentials LIMIT 1;"
→ (all NULL, never populated)
```

**All tests MUST pass.**

---

## Timeline: Separation of Concerns

| Phase | Work | Approval | Status |
|-------|------|----------|--------|
| **Aug 20** | Schema migration (column + indexes) | This PR | READY |
| **Sep-Oct** | Enhanced provider implementation | FUTURE | PENDING |
| **Oct-Nov** | TransactionClient credential setup | FUTURE | PENDING |
| **Nov-Dec** | Testnet E2E validation | FUTURE | PENDING |
| **Jan 2027** | Activation approval vote | FUTURE | PENDING |
| **Jan 2027** | Deployment with NFT_PROVIDER=enhanced | FUTURE | PENDING |

---

## Documentation: Clear Boundaries

**This document serves as:**
1. ✅ Authorization scope for schema migration
2. ✅ Explicit denial of provider activation
3. ✅ Requirements for future activation approval
4. ✅ Test verification procedures
5. ✅ STOP conditions if activation is attempted

---

## References

- Production Migration Spec: `2026-08-20-production-migration-execution-spec.md`
- Post-Migration Verification: `2026-08-20-post-migration-verification-spec.md`
- NFT Provider Design (future): `2026-08-20-enhanced-provider-design.md` (TBD)
- Enhanced Provider Implementation (future): Code review required
