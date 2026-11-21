# Second NFT Solution — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** Create a provider abstraction layer for NFT minting that wraps the existing solution and enables a second, independently switchable provider.

**Architecture:** NftProvider interface + LegacyStellarProvider (adapter) + EnhancedStellarProvider (stub) + feature flag (`NFT_PROVIDER`)

**Tech Stack:** TypeScript, Vitest, better-sqlite3, Express

## Global Constraints

- No blockchain transactions
- No production configuration changes
- No database migrations executed
- Feature flag defaults to `legacy`
- All existing 1341 tests must continue passing
- No secrets in committed files

---

### Task 1: NftProvider Interface + Types

**Files:**
- Create: `LMS-Server/src/services/nftProvider.ts`
- Test: `LMS-Server/src/__tests__/nft-provider.test.ts`

**Produces:**
- `NftProvider` interface
- `MintParams`, `MintResult`, `MetadataResult`, `ReconcileResult`, `CredentialStatus`, `ProviderInfo` types
- `getNftProvider()` factory function

- [ ] **Step 1: Write failing tests for provider interface contract**

```typescript
// Tests: PROV-1 through PROV-6
// PROV-1: getNftProvider() returns LegacyStellarProvider by default
// PROV-2: getNftProvider() returns LegacyStellarProvider when NFT_PROVIDER=legacy
// PROV-3: getNftProvider() returns EnhancedStellarProvider when NFT_PROVIDER=enhanced
// PROV-4: getNftProvider() falls back to legacy for invalid value
// PROV-5: getNftProvider() falls back to legacy when NFT_PROVIDER is empty
// PROV-6: provider.getProviderInfo() returns name, version, network
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

- [ ] **Step 3: Implement NftProvider interface and factory**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Run full backend suite**

---

### Task 2: LegacyStellarProvider Adapter

**Files:**
- Create: `LMS-Server/src/services/providers/legacyStellarProvider.ts`
- Test: `LMS-Server/src/__tests__/legacy-provider.test.ts`

**Consumes:** `NftProvider` interface from Task 1
**Produces:** `LegacyStellarProvider` class implementing `NftProvider`

- [ ] **Step 1: Write failing tests**

```typescript
// Tests: LP-1 through LP-4
// LP-1: LegacyStellarProvider implements NftProvider interface
// LP-2: mint() delegates to mintCredential() from mintService
// LP-3: reconcile() delegates to reconcileCredential() from reconciliationService
// LP-4: getProviderInfo() returns name='legacy-stellar', network from env
```

- [ ] **Step 2: Implement LegacyStellarProvider**

- [ ] **Step 3: Run focused + full tests**

---

### Task 3: EnhancedStellarProvider Stub

**Files:**
- Create: `LMS-Server/src/services/providers/enhancedStellarProvider.ts`
- Test: `LMS-Server/src/__tests__/enhanced-provider.test.ts`

**Consumes:** `NftProvider` interface from Task 1
**Produces:** `EnhancedStellarProvider` class (stub — all methods throw `PROVIDER_NOT_READY`)

- [ ] **Step 1: Write failing tests**

```typescript
// Tests: EP-1 through EP-4
// EP-1: EnhancedStellarProvider implements NftProvider interface
// EP-2: mint() throws PROVIDER_NOT_READY error
// EP-3: reconcile() throws PROVIDER_NOT_READY error
// EP-4: getProviderInfo() returns name='enhanced-stellar', capabilities=[]
```

- [ ] **Step 2: Implement EnhancedStellarProvider stub**

- [ ] **Step 3: Run focused + full tests**

---

### Task 4: Feature Flag Safety Tests

**Files:**
- Test: `LMS-Server/src/__tests__/nft-feature-flag.test.ts`

- [ ] **Step 1: Write feature flag tests**

```typescript
// Tests: FF-1 through FF-6
// FF-1: Missing NFT_PROVIDER env → legacy provider
// FF-2: NFT_PROVIDER=legacy → legacy provider
// FF-3: NFT_PROVIDER=enhanced → enhanced provider
// FF-4: NFT_PROVIDER=invalid → legacy provider (fail safe)
// FF-5: NFT_PROVIDER='' → legacy provider
// FF-6: Provider selection does not load secrets when selecting
```

- [ ] **Step 2: Run focused + full tests**

---

### Task 5: Provider Info Endpoint

**Files:**
- Modify: `LMS-Server/src/controllers/adminController.ts` (add provider info to integration-status)
- Test: `LMS-Server/src/__tests__/provider-info.test.ts`

- [ ] **Step 1: Write test for provider info in integration-status**

```typescript
// Tests: PI-1 through PI-2
// PI-1: GET /admin/integration-status includes nftProvider field
// PI-2: nftProvider shows name and version but no secrets
```

- [ ] **Step 2: Add provider info to integrationStatus handler**

- [ ] **Step 3: Run focused + full tests**

---

### Task 6: Documentation and Diagrams

- [ ] **Step 1: Verify all spec files complete**
- [ ] **Step 2: Verify all diagram files have valid Mermaid**
- [ ] **Step 3: Update decision log**

---

### Task 7: Verification and Review

- [ ] **Step 1: Run full backend suite (1135+ tests)**
- [ ] **Step 2: Run full frontend suite (206 tests)**
- [ ] **Step 3: Verify no secrets in committed files**
- [ ] **Step 4: Verify feature flag defaults**
- [ ] **Step 5: Verify production config unchanged**
- [ ] **Step 6: Request review**
