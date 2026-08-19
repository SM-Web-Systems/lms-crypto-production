# Integration Hardening Design

**Date:** 2026-08-19
**Phase:** 18 (Integration Hardening)

## Goal

Four independent, additive improvements to the NFT minting subsystem — no existing behavior changed, no blockchain activity, no production env modifications.

## Architecture

Each area is a self-contained module with its own route/service file and test file. All changes are read-only with respect to the blockchain. All existing tests must continue to pass (1076 BE + 206 FE + 14 E2E).

## Area 1: NFT Metadata JSON Endpoint

### Problem

The on-chain `base_uri` points to `https://testnet.ammawallet.com/nft/` but HTTP requests return SPA HTML (Amma Wallet frontend catch-all), not machine-readable NFT metadata JSON. Wallets, explorers, and marketplaces expect JSON at `{base_uri}{token_id}`.

### Design

**Route:** `GET /api/v1/nft/metadata/:tokenId`

**No auth required** — public metadata (same policy as `/credentials/verify/:credentialId`).

**Query:**
```sql
SELECT nc.id, nc.soroban_token_id, nc.wallet_address, nc.tx_hash,
       nc.contract_id, nc.network, nc.created_at,
       u.name AS student_name,
       c.title AS course_title, c.code AS course_code
FROM nft_credentials nc
LEFT JOIN users u ON u.id = nc.user_id
LEFT JOIN courses c ON c.id = nc.course_id
WHERE nc.soroban_token_id = ?
  AND nc.mint_status = 'minted'
  AND nc.is_superseded = 0
LIMIT 1
```

**Response (200):**
```json
{
  "name": "SCC Certificate #0",
  "description": "Blockchain Academy course completion certificate for Student Name — Course Title",
  "image": "https://lms.smwebsystems.com/api/v1/credentials/{credentialId}/pdf",
  "external_url": "https://lms.smwebsystems.com/verify/{credentialId}",
  "attributes": [
    { "trait_type": "Course", "value": "Course Title" },
    { "trait_type": "Course Code", "value": "BVC" },
    { "trait_type": "Student", "value": "Student Name" },
    { "trait_type": "Issued", "value": "2026-08-19" },
    { "trait_type": "Network", "value": "testnet" },
    { "trait_type": "Contract", "value": "CAJ74ZCQ..." }
  ]
}
```

**Response (404):** `{ "error": "Token not found" }`

**Files:**
- Create: `LMS-Server/src/routes/nftMetadata.ts`
- Modify: `LMS-Server/src/app.ts` (register route)
- Create: `LMS-Server/src/__tests__/nft-metadata.test.ts`

### Rate Limiting

Same `diagLimiter` used by other public credential endpoints (20 req/min per IP).

## Area 2: Timeout-Then-Success Transaction Reconciliation

### Problem

Both mint paths (quiz: 10×3s, course: 15×4s) mark the DB credential as `failed` when polling exhausts. However, the transaction may land on-chain after the poll window closes. The `tx_hash` from `sendTransaction` is currently only persisted to the DB on SUCCESS — on timeout, it's lost, making reconciliation impossible.

### Design

**Part A — Early tx_hash persistence:**

Modify `mintService.ts` to save `tx_hash` to DB immediately after `sendTransaction` returns a non-ERROR status, before the poll loop begins. This ensures the hash is available for reconciliation even if polling times out.

```typescript
// After sendTransaction succeeds, persist hash immediately
execute(
  `UPDATE nft_credentials SET tx_hash = ?, updated_at = datetime('now') WHERE id = ?`,
  [txHash, credId]
);
```

Both `mintCredentialForQuiz` and `mintCredential` get this change.

For `mintCredential` (course path), the tx_hash is returned to the caller and persisted by the route handler. The early persistence here adds it to the DB record the route handler already created, so reconciliation can find it.

**Part B — Reconciliation service:**

New file: `LMS-Server/src/services/reconciliationService.ts`

```typescript
export async function reconcileCredential(credentialId: string): Promise<ReconcileResult>
```

Logic:
1. Load credential from DB. Must be `mint_status = 'failed'` and have a non-null `tx_hash`.
2. Query Horizon: `GET https://horizon-testnet.stellar.org/transactions/{tx_hash}` (or mainnet, based on `network` column).
3. If Horizon returns `successful: true`:
   - Extract ledger, fee, timestamp from response
   - Try to extract `soroban_token_id` from Soroban result XDR (best effort)
   - Update DB: `mint_status = 'minted'`, populate soroban_token_id if found
   - Return `{ reconciled: true, status: 'minted', ledger, txHash }`
4. If Horizon returns `successful: false`: return `{ reconciled: true, status: 'chain_failed' }` (leave DB as `failed`)
5. If Horizon returns 404: return `{ reconciled: false, reason: 'not_found_on_chain' }` (tx never landed)

**Part C — Admin endpoint:**

`POST /api/v1/admin/credentials/:id/reconcile`
- Requires `certificate.approve` permission
- Calls `reconcileCredential(id)`
- Returns reconciliation result
- Rate limited (1 per 10s per credential to prevent hammering)

**Part D — Frontend button:**

Add "Reconcile" button to `AdminCertificates.tsx` on failed credentials that have a `tx_hash`. Displays result in a toast/status update.

**Horizon URL construction:**
```typescript
const HORIZON_URLS: Record<string, string> = {
  public: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
};
```

**Files:**
- Modify: `LMS-Server/src/services/mintService.ts` (early tx_hash save)
- Create: `LMS-Server/src/services/reconciliationService.ts`
- Modify: `LMS-Server/src/routes/admin.ts` (new route)
- Modify: `LMS-Server/src/controllers/adminController.ts` (handler)
- Modify: `LMS-Frontend/src/pages/AdminCertificates.tsx` (button)
- Modify: `LMS-Frontend/src/services/adminCertificateService.ts` (API call)
- Create: `LMS-Server/src/__tests__/reconciliation.test.ts`

## Area 3: Admin UI Network/Credential Filtering

### Problem

`AdminCertificates.tsx` hardcodes Stellar explorer links to `public` network (lines 492, 787). No network column or filter exists. When testnet credentials appear alongside mainnet, admins can't distinguish or filter them.

### Design

**Backend change:**

Add `?network=public|testnet` query parameter to `GET /api/v1/admin/issued-credentials`. In `listIssuedCredentials()`, add:

```typescript
if (network && ['public', 'testnet'].includes(network)) {
  conditions.push('nc.network = ?');
  params.push(network);
}
```

**Frontend changes:**

1. **Network filter dropdown** — Add alongside existing courseId/mintStatus filters:
   ```tsx
   <select value={networkFilter} onChange={...}>
     <option value="">All Networks</option>
     <option value="public">Public (Mainnet)</option>
     <option value="testnet">Testnet</option>
   </select>
   ```

2. **Network badge** — In the credential rows, display a colored badge:
   - `public` → green badge "Public"
   - `testnet` → blue badge "Testnet"

3. **Dynamic explorer links** — Replace hardcoded `public` with `cred.network`:
   ```tsx
   href={`https://stellar.expert/explorer/${cred.network || 'public'}/tx/${cred.txHash}`}
   ```
   Apply to both application rows (line 492) and credential rows (line 787).

**Files:**
- Modify: `LMS-Server/src/controllers/adminController.ts` (network filter)
- Modify: `LMS-Frontend/src/pages/AdminCertificates.tsx` (badge, filter, links)
- Create: `LMS-Server/src/__tests__/admin-network-filter.test.ts`
- Create: `LMS-Frontend/src/__tests__/AdminCertificatesNetwork.test.tsx`

## Area 4: Read-Only RPC Integration Tests

### Problem

All existing mint tests mock Soroban RPC calls. No tests verify that real Horizon/Soroban responses parse correctly. The testnet mint produced real data that can be used as fixtures.

### Design

**Fixture-based tests** using recorded real responses from the testnet mint:

**Fixtures directory:** `LMS-Server/src/__tests__/fixtures/testnet-rpc/`

Files:
- `transaction-05e459cc.json` — Horizon GET /transactions/{hash} response
- `operations-05e459cc.json` — Horizon GET /transactions/{hash}/operations response
- `contract-read-token-counter.json` — Contract state read response

**Test file:** `LMS-Server/src/__tests__/rpc-integration.test.ts`

Tests:
1. **FIXTURE-1:** Parse Horizon transaction response — extract successful, ledger, fee, source_account
2. **FIXTURE-2:** Parse Horizon operations response — extract type, function, parameters
3. **FIXTURE-3:** Reconciliation service correctly handles Horizon success response
4. **FIXTURE-4:** Reconciliation service correctly handles Horizon 404 (not found)
5. **FIXTURE-5:** Reconciliation service correctly handles Horizon failure (successful=false)
6. **FIXTURE-6:** Metadata endpoint returns correct JSON for known token fixture
7. **FIXTURE-7:** Network config returns correct Horizon URL for each network

**Optional live tests** (gated by `RUN_LIVE_RPC_TESTS=1`):
- LIVE-1: Fetch real transaction from testnet Horizon
- LIVE-2: Read contract state from testnet Soroban RPC
- LIVE-3: Verify metadata endpoint against live contract data

**Files:**
- Create: `LMS-Server/src/__tests__/fixtures/testnet-rpc/` (directory + 3 JSON files)
- Create: `LMS-Server/src/__tests__/rpc-integration.test.ts`

## Global Constraints

- No blockchain transactions (all read-only)
- No production .env modifications
- No new npm dependencies (use existing stellar-sdk, fetch/curl for Horizon)
- All existing 1076 BE + 206 FE tests must continue to pass
- TDD: write failing test first, then implement
- Each area is independently testable and committable

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Metadata endpoint exposes student PII | Only name + course — same as existing /credentials/verify (already public) |
| Reconciliation auto-updates DB | Admin-triggered only, requires certificate.approve RBAC |
| Early tx_hash persistence changes mint flow | Save occurs after sendTransaction success, before poll — minimal change |
| Fixture data becomes stale | Fixtures are static snapshots of known-good data; staleness doesn't affect correctness |
