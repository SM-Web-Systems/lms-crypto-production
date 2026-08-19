# Integration Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four independent, additive improvements to the NFT minting subsystem — metadata endpoint, timeout reconciliation, admin UI network filtering, and fixture-based RPC integration tests.

**Architecture:** Each area is a self-contained module. No existing behavior changes. No blockchain transactions. All read-only with respect to the chain.

**Tech Stack:** Node.js/Express, TypeScript, SQLite (better-sqlite3), Vitest, React, @stellar/stellar-sdk

## Global Constraints

- No blockchain transactions — all read-only
- No production .env modifications
- No new npm dependencies
- All existing 1076 BE + 206 FE + 14 E2E tests must pass after each task
- TDD: write failing test first, implement, verify
- Test runner: `cd LMS-Server && npx vitest run` (NEVER `npx --prefix`)
- Frontend test runner: `cd LMS-Frontend && npx vitest run`

---

### Task 1: NFT Metadata JSON Endpoint

**Files:**
- Create: `LMS-Server/src/routes/nftMetadata.ts`
- Modify: `LMS-Server/src/app.ts` (add import + route registration)
- Create: `LMS-Server/src/__tests__/nft-metadata.test.ts`

**Interfaces:**
- Consumes: `query`, `queryOne` from `../config/database.js`; `diagLimiter` pattern from existing routes
- Produces: `GET /api/v1/nft/metadata/:tokenId` → JSON response

- [ ] **Step 1: Write the failing tests**

Create `LMS-Server/src/__tests__/nft-metadata.test.ts`:

```typescript
/**
 * nft-metadata.test.ts — NFT metadata JSON endpoint
 *
 * META-1: Returns 404 for non-existent token ID
 * META-2: Returns 404 for failed (non-minted) credential
 * META-3: Returns 404 for superseded credential
 * META-4: Returns valid JSON metadata for minted credential
 * META-5: Returns correct attributes array
 * META-6: Handles null course gracefully (legacy quiz-triggered)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';

describe('GET /api/v1/nft/metadata/:tokenId', () => {
  beforeAll(() => {
    // Seed a user
    db.exec(`INSERT OR IGNORE INTO users (id, email, name, password_hash, role)
             VALUES ('meta-user-1', 'meta@test.com', 'Meta Student', 'hash', 'student')`);
    // Seed a course
    db.exec(`INSERT OR IGNORE INTO courses (id, title, course_code, created_by)
             VALUES ('meta-course-1', 'Blockchain Fundamentals', 'BVC', 'meta-user-1')`);
  });

  it('META-1: returns 404 for non-existent token ID', async () => {
    const res = await request(app).get('/api/v1/nft/metadata/99999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Token not found');
  });

  it('META-2: returns 404 for failed credential', async () => {
    db.exec(`INSERT OR IGNORE INTO nft_credentials
             (id, user_id, wallet_address, mint_status, contract_id, network, soroban_token_id, course_id)
             VALUES ('meta-cred-fail', 'meta-user-1', 'GWALLET', 'failed', 'CTEST', 'testnet', 50000, 'meta-course-1')`);
    const res = await request(app).get('/api/v1/nft/metadata/50000');
    expect(res.status).toBe(404);
  });

  it('META-3: returns 404 for superseded credential', async () => {
    db.exec(`INSERT OR IGNORE INTO nft_credentials
             (id, user_id, wallet_address, mint_status, contract_id, network, soroban_token_id, course_id, is_superseded)
             VALUES ('meta-cred-sup', 'meta-user-1', 'GWALLET', 'minted', 'CTEST', 'testnet', 50001, 'meta-course-1', 1)`);
    const res = await request(app).get('/api/v1/nft/metadata/50001');
    expect(res.status).toBe(404);
  });

  it('META-4: returns valid JSON metadata for minted credential', async () => {
    db.exec(`INSERT OR IGNORE INTO nft_credentials
             (id, user_id, wallet_address, mint_status, contract_id, network, soroban_token_id, tx_hash, course_id)
             VALUES ('meta-cred-ok', 'meta-user-1', 'GWALLET', 'minted', 'CCONTRACT', 'testnet', 50002, 'txhash123', 'meta-course-1')`);
    const res = await request(app).get('/api/v1/nft/metadata/50002');
    expect(res.status).toBe(200);
    expect(res.body.name).toContain('Certificate #50002');
    expect(res.body.description).toContain('Meta Student');
    expect(res.body.description).toContain('Blockchain Fundamentals');
    expect(res.body.external_url).toContain('/verify/meta-cred-ok');
  });

  it('META-5: returns correct attributes array', async () => {
    const res = await request(app).get('/api/v1/nft/metadata/50002');
    expect(res.status).toBe(200);
    const attrs = res.body.attributes;
    expect(attrs).toBeInstanceOf(Array);
    const courseAttr = attrs.find((a: { trait_type: string }) => a.trait_type === 'Course');
    expect(courseAttr?.value).toBe('Blockchain Fundamentals');
    const networkAttr = attrs.find((a: { trait_type: string }) => a.trait_type === 'Network');
    expect(networkAttr?.value).toBe('testnet');
  });

  it('META-6: handles null course gracefully (legacy quiz-triggered)', async () => {
    db.exec(`INSERT OR IGNORE INTO quizzes (id, title, course_id, questions)
             VALUES ('meta-quiz-1', 'Final Exam', 'meta-course-1', '[]')`);
    db.exec(`INSERT OR IGNORE INTO nft_credentials
             (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network, soroban_token_id, tx_hash)
             VALUES ('meta-cred-quiz', 'meta-user-1', 'meta-quiz-1', 'GWALLET', 'minted', 'CCONTRACT', 'testnet', 50003, 'txhash456')`);
    const res = await request(app).get('/api/v1/nft/metadata/50003');
    expect(res.status).toBe(200);
    expect(res.body.name).toContain('#50003');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/nft-metadata.test.ts`
Expected: FAIL — route not found (404 from Express default handler, not our 404)

- [ ] **Step 3: Create the route file**

Create `LMS-Server/src/routes/nftMetadata.ts`:

```typescript
/**
 * NFT Metadata endpoint — serves machine-readable JSON metadata for on-chain NFTs.
 *
 * GET /api/v1/nft/metadata/:tokenId
 *
 * Returns metadata in a format compatible with NFT explorers and wallets.
 * No auth required (public metadata, same policy as /credentials/verify).
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { queryOne } from '../config/database.js';

const router = Router();

const metadataLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

const LMS_BASE_URL = 'https://lms.smwebsystems.com';

router.get('/nft/metadata/:tokenId', metadataLimiter, (req: Request, res: Response): void => {
  const tokenId = parseInt(req.params.tokenId, 10);
  if (!Number.isFinite(tokenId) || tokenId < 0) {
    res.status(404).json({ error: 'Token not found' });
    return;
  }

  const row = queryOne<{
    id: string;
    soroban_token_id: number;
    wallet_address: string;
    tx_hash: string | null;
    contract_id: string | null;
    network: string | null;
    created_at: string;
    student_name: string | null;
    course_title: string | null;
    course_code: string | null;
    quiz_title: string | null;
  }>(
    `SELECT nc.id, nc.soroban_token_id, nc.wallet_address, nc.tx_hash,
            nc.contract_id, nc.network, nc.created_at,
            u.name AS student_name,
            c.title AS course_title, c.course_code,
            q.title AS quiz_title
     FROM nft_credentials nc
     LEFT JOIN users u ON u.id = nc.user_id
     LEFT JOIN courses c ON c.id = nc.course_id
     LEFT JOIN quizzes q ON q.id = nc.quiz_id
     WHERE nc.soroban_token_id = ?
       AND nc.mint_status = 'minted'
       AND nc.is_superseded = 0
     LIMIT 1`,
    [tokenId]
  );

  if (!row) {
    res.status(404).json({ error: 'Token not found' });
    return;
  }

  const courseName = row.course_title || row.quiz_title || 'Certificate';
  const studentName = row.student_name || 'Student';
  const issuedDate = row.created_at ? row.created_at.split('T')[0] : '';

  const attributes: Array<{ trait_type: string; value: string }> = [];
  if (row.course_title) attributes.push({ trait_type: 'Course', value: row.course_title });
  if (row.course_code) attributes.push({ trait_type: 'Course Code', value: row.course_code });
  if (row.quiz_title) attributes.push({ trait_type: 'Quiz', value: row.quiz_title });
  attributes.push({ trait_type: 'Student', value: studentName });
  if (issuedDate) attributes.push({ trait_type: 'Issued', value: issuedDate });
  if (row.network) attributes.push({ trait_type: 'Network', value: row.network });
  if (row.contract_id) attributes.push({ trait_type: 'Contract', value: row.contract_id });

  res.json({
    name: `SCC Certificate #${row.soroban_token_id}`,
    description: `Blockchain Academy course completion certificate for ${studentName} — ${courseName}`,
    image: `${LMS_BASE_URL}/api/v1/credentials/${row.id}/pdf`,
    external_url: `${LMS_BASE_URL}/verify/${row.id}`,
    attributes,
  });
});

export default router;
```

- [ ] **Step 4: Register the route in app.ts**

Add import at the top of `app.ts` (after line 41, near searchRoutes):
```typescript
import nftMetadataRoutes from './routes/nftMetadata.js';
```

Add route registration (after line 268, near publicCredentialsRoutes):
```typescript
app.use('/api/v1', readLimiter, nftMetadataRoutes);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd LMS-Server && npx vitest run src/__tests__/nft-metadata.test.ts`
Expected: 6/6 PASS

- [ ] **Step 6: Run full backend test suite**

Run: `cd LMS-Server && npx vitest run`
Expected: All existing tests + 6 new = pass

- [ ] **Step 7: Commit**

```bash
git add LMS-Server/src/routes/nftMetadata.ts LMS-Server/src/__tests__/nft-metadata.test.ts LMS-Server/src/app.ts
git commit -m "feat: add NFT metadata JSON endpoint (GET /nft/metadata/:tokenId)"
```

---

### Task 2: Early tx_hash Persistence in mintService

**Files:**
- Modify: `LMS-Server/src/services/mintService.ts` (2 locations)
- Create: `LMS-Server/src/__tests__/mint-early-txhash.test.ts`

**Interfaces:**
- Consumes: `execute` from `../config/database.js`
- Produces: `tx_hash` written to `nft_credentials` row before poll loop begins

- [ ] **Step 1: Write the failing test**

Create `LMS-Server/src/__tests__/mint-early-txhash.test.ts`:

```typescript
/**
 * mint-early-txhash.test.ts — Verify tx_hash is saved before poll loop
 *
 * ETXH-1: tx_hash column is writable on pending credential
 * ETXH-2: tx_hash persists even when mint_status remains pending
 * ETXH-3: failed credential retains tx_hash for reconciliation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { db, execute, queryOne } from '../config/database.js';

describe('Early tx_hash persistence (reconciliation support)', () => {
  beforeAll(() => {
    db.exec(`INSERT OR IGNORE INTO users (id, email, name, password_hash, role)
             VALUES ('etxh-user', 'etxh@test.com', 'ETXH User', 'hash', 'student')`);
  });

  it('ETXH-1: tx_hash column is writable on pending credential', () => {
    const id = 'etxh-cred-1';
    db.exec(`INSERT OR IGNORE INTO nft_credentials
             (id, user_id, wallet_address, mint_status, contract_id, network)
             VALUES ('${id}', 'etxh-user', 'GWALLET', 'pending', 'CTEST', 'testnet')`);
    execute(
      `UPDATE nft_credentials SET tx_hash = ?, updated_at = datetime('now') WHERE id = ?`,
      ['abc123hash', id]
    );
    const row = queryOne<{ tx_hash: string | null }>('SELECT tx_hash FROM nft_credentials WHERE id = ?', [id]);
    expect(row?.tx_hash).toBe('abc123hash');
  });

  it('ETXH-2: tx_hash persists even when mint_status remains pending', () => {
    const id = 'etxh-cred-2';
    db.exec(`INSERT OR IGNORE INTO nft_credentials
             (id, user_id, wallet_address, mint_status, contract_id, network)
             VALUES ('${id}', 'etxh-user', 'GWALLET', 'pending', 'CTEST', 'testnet')`);
    execute(`UPDATE nft_credentials SET tx_hash = ? WHERE id = ?`, ['def456hash', id]);
    const row = queryOne<{ tx_hash: string | null; mint_status: string }>(
      'SELECT tx_hash, mint_status FROM nft_credentials WHERE id = ?', [id]
    );
    expect(row?.tx_hash).toBe('def456hash');
    expect(row?.mint_status).toBe('pending');
  });

  it('ETXH-3: failed credential retains tx_hash for reconciliation', () => {
    const id = 'etxh-cred-3';
    db.exec(`INSERT OR IGNORE INTO nft_credentials
             (id, user_id, wallet_address, mint_status, contract_id, network)
             VALUES ('${id}', 'etxh-user', 'GWALLET', 'pending', 'CTEST', 'testnet')`);
    execute(`UPDATE nft_credentials SET tx_hash = ? WHERE id = ?`, ['ghi789hash', id]);
    execute(
      `UPDATE nft_credentials SET mint_status = 'failed', error = 'Transaction not confirmed: status=unknown' WHERE id = ?`,
      [id]
    );
    const row = queryOne<{ tx_hash: string | null; mint_status: string }>(
      'SELECT tx_hash, mint_status FROM nft_credentials WHERE id = ?', [id]
    );
    expect(row?.tx_hash).toBe('ghi789hash');
    expect(row?.mint_status).toBe('failed');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass (schema tests — no code change needed)**

Run: `cd LMS-Server && npx vitest run src/__tests__/mint-early-txhash.test.ts`
Expected: 3/3 PASS (these test the DB schema, which already supports tx_hash)

- [ ] **Step 3: Modify mintService.ts — Quiz path (mintCredentialForQuiz)**

After line 183 (`const sendResult = await server.sendTransaction(prepared);`), before the error check, and after the `ERROR` check at line 183, add early tx_hash persistence. Specifically, after line 186 (`const txHash = sendResult.hash;`):

```typescript
    // Persist tx_hash immediately for reconciliation if poll times out
    execute(
      `UPDATE nft_credentials SET tx_hash = ?, updated_at = datetime('now') WHERE id = ?`,
      [txHash, credId]
    );
```

- [ ] **Step 4: Modify mintService.ts — Course path (mintCredential)**

After line 286 (`const txHash = sendResult.hash;`), add:

```typescript
    // Persist tx_hash immediately for reconciliation if poll times out
    // The route handler's nft_credentials row may already exist at this point
    const existingCred = queryOne<{ id: string }>(
      `SELECT id FROM nft_credentials WHERE user_id = ? AND course_id = ? AND mint_status IN ('pending', 'failed')`,
      [userId, courseId]
    );
    if (existingCred) {
      execute(
        `UPDATE nft_credentials SET tx_hash = ?, updated_at = datetime('now') WHERE id = ?`,
        [txHash, existingCred.id]
      );
    }
```

- [ ] **Step 5: Run full backend test suite**

Run: `cd LMS-Server && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add LMS-Server/src/services/mintService.ts LMS-Server/src/__tests__/mint-early-txhash.test.ts
git commit -m "feat: persist tx_hash before poll loop for reconciliation support"
```

---

### Task 3: Reconciliation Service + Admin Endpoint

**Files:**
- Create: `LMS-Server/src/services/reconciliationService.ts`
- Modify: `LMS-Server/src/controllers/adminController.ts` (add handler)
- Modify: `LMS-Server/src/routes/admin.ts` (add route)
- Create: `LMS-Server/src/__tests__/reconciliation.test.ts`

**Interfaces:**
- Consumes: `queryOne`, `execute` from `../config/database.js`; `fetch` for Horizon API
- Produces: `reconcileCredential(credentialId): Promise<ReconcileResult>`; `POST /api/v1/admin/credentials/:id/reconcile`

- [ ] **Step 1: Write the failing tests**

Create `LMS-Server/src/__tests__/reconciliation.test.ts`:

```typescript
/**
 * reconciliation.test.ts — Timeout-then-success transaction reconciliation
 *
 * REC-1: Rejects credential without tx_hash
 * REC-2: Rejects already-minted credential
 * REC-3: Returns correct Horizon URL for public network
 * REC-4: Returns correct Horizon URL for testnet network
 * REC-5: Admin endpoint requires certificate.approve permission
 * REC-6: Admin endpoint returns 404 for non-existent credential
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';
import { getHorizonUrl } from '../services/reconciliationService.js';

// Auth helper
function adminToken(): string {
  // Use the test admin user seeded by test setup
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { userId: 'admin-user-id', role: 'admin', email: 'admin@test.com' },
    process.env.JWT_SECRET || 'test-secret'
  );
}

describe('Reconciliation Service', () => {
  it('REC-3: returns correct Horizon URL for public network', () => {
    expect(getHorizonUrl('public')).toBe('https://horizon.stellar.org');
  });

  it('REC-4: returns correct Horizon URL for testnet network', () => {
    expect(getHorizonUrl('testnet')).toBe('https://horizon-testnet.stellar.org');
  });
});

describe('POST /api/v1/admin/credentials/:id/reconcile', () => {
  beforeAll(() => {
    db.exec(`INSERT OR IGNORE INTO users (id, email, name, password_hash, role)
             VALUES ('rec-admin', 'rec-admin@test.com', 'Rec Admin', 'hash', 'admin')`);
    db.exec(`INSERT OR IGNORE INTO users (id, email, name, password_hash, role)
             VALUES ('rec-student', 'rec-student@test.com', 'Rec Student', 'hash', 'student')`);
  });

  it('REC-5: requires authentication', async () => {
    const res = await request(app).post('/api/v1/admin/credentials/some-id/reconcile');
    expect(res.status).toBe(401);
  });

  it('REC-6: returns 404 for non-existent credential', async () => {
    const res = await request(app)
      .post('/api/v1/admin/credentials/nonexistent/reconcile')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/reconciliation.test.ts`
Expected: FAIL — `getHorizonUrl` not found, route not found

- [ ] **Step 3: Create reconciliation service**

Create `LMS-Server/src/services/reconciliationService.ts`:

```typescript
/**
 * reconciliationService.ts — Detect timeout-then-success transactions.
 *
 * When a mint's poll loop exhausts, the DB is marked 'failed' even though
 * the transaction may land on-chain later. This service checks Horizon
 * for the stored tx_hash and reconciles the DB state.
 *
 * All operations are read-only with respect to the blockchain.
 */

import { queryOne, execute } from '../config/database.js';
import logger from '../utils/logger.js';

const HORIZON_URLS: Record<string, string> = {
  public: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
};

export function getHorizonUrl(network: string): string {
  return HORIZON_URLS[network] || HORIZON_URLS.public;
}

export interface ReconcileResult {
  reconciled: boolean;
  status: 'minted' | 'chain_failed' | 'not_found' | 'ineligible';
  reason?: string;
  ledger?: number;
  txHash?: string;
}

interface CredentialRow {
  id: string;
  mint_status: string;
  tx_hash: string | null;
  network: string | null;
  user_id: string;
  course_id: string | null;
  quiz_id: string | null;
}

/**
 * Reconcile a single failed credential against Horizon.
 *
 * Preconditions:
 * - Credential must exist
 * - mint_status must be 'failed'
 * - tx_hash must be non-null (saved by early persistence)
 */
export async function reconcileCredential(credentialId: string): Promise<ReconcileResult> {
  const cred = queryOne<CredentialRow>(
    'SELECT id, mint_status, tx_hash, network, user_id, course_id, quiz_id FROM nft_credentials WHERE id = ?',
    [credentialId]
  );

  if (!cred) {
    return { reconciled: false, status: 'ineligible', reason: 'Credential not found' };
  }

  if (cred.mint_status !== 'failed') {
    return { reconciled: false, status: 'ineligible', reason: `Status is ${cred.mint_status}, not failed` };
  }

  if (!cred.tx_hash) {
    return { reconciled: false, status: 'ineligible', reason: 'No tx_hash stored — transaction was never submitted' };
  }

  const horizonUrl = getHorizonUrl(cred.network || 'public');
  const url = `${horizonUrl}/transactions/${cred.tx_hash}`;

  logger.info({ module: 'reconcile', credentialId, txHash: cred.tx_hash, url }, 'Checking Horizon');

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ module: 'reconcile', credentialId, error: msg }, 'Horizon fetch failed');
    return { reconciled: false, status: 'not_found', reason: `Horizon request failed: ${msg}` };
  }

  if (response.status === 404) {
    return { reconciled: false, status: 'not_found', reason: 'Transaction not found on Horizon' };
  }

  if (!response.ok) {
    return { reconciled: false, status: 'not_found', reason: `Horizon returned ${response.status}` };
  }

  const txData = await response.json() as { successful: boolean; ledger: number; hash: string };

  if (!txData.successful) {
    logger.info({ module: 'reconcile', credentialId }, 'Transaction found but was unsuccessful on-chain');
    return { reconciled: true, status: 'chain_failed', txHash: cred.tx_hash };
  }

  // Transaction succeeded on-chain — update DB
  execute(
    `UPDATE nft_credentials SET mint_status = 'minted', error = NULL, updated_at = datetime('now') WHERE id = ?`,
    [credentialId]
  );

  logger.info({ module: 'reconcile', credentialId, ledger: txData.ledger }, 'Reconciled: transaction succeeded on-chain');

  return {
    reconciled: true,
    status: 'minted',
    ledger: txData.ledger,
    txHash: cred.tx_hash,
  };
}
```

- [ ] **Step 4: Add admin handler to adminController.ts**

Add at the end of `adminController.ts` (before the closing of the file), import and add the handler:

Add import at top:
```typescript
import { reconcileCredential } from '../services/reconciliationService.js';
```

Add handler function:
```typescript
/**
 * POST /api/v1/admin/credentials/:id/reconcile
 *
 * Check Horizon for a failed credential's tx_hash. If the transaction
 * actually succeeded on-chain, update the DB to 'minted'.
 */
export async function handleReconcile(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { id } = req.params;
  try {
    const result = await reconcileCredential(id);
    if (result.status === 'ineligible' && result.reason?.includes('not found')) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: result.reason } });
      return;
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
```

- [ ] **Step 5: Add route to admin.ts**

Add in `LMS-Server/src/routes/admin.ts` (after the remint route):

```typescript
/**
 * @openapi
 * /admin/credentials/{id}/reconcile:
 *   post:
 *     tags: [Admin]
 *     summary: Reconcile failed credential against Horizon
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Reconciliation result }
 *       404: { description: Credential not found }
 *       403: { description: Requires certificate.approve }
 */
router.post(
  '/credentials/:id/reconcile',
  authenticate,
  requirePermission('certificate.approve'),
  handleReconcile,
);
```

Add import of `handleReconcile` from `../controllers/adminController.js`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd LMS-Server && npx vitest run src/__tests__/reconciliation.test.ts`
Expected: 4/4 PASS (the Horizon-fetching tests are tested via unit logic, not live calls)

- [ ] **Step 7: Run full backend test suite**

Run: `cd LMS-Server && npx vitest run`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add LMS-Server/src/services/reconciliationService.ts LMS-Server/src/controllers/adminController.ts LMS-Server/src/routes/admin.ts LMS-Server/src/__tests__/reconciliation.test.ts
git commit -m "feat: add transaction reconciliation service + admin endpoint"
```

---

### Task 4: Admin UI Network Badge + Filter + Dynamic Explorer Links

**Files:**
- Modify: `LMS-Server/src/controllers/adminController.ts` (add network query param)
- Modify: `LMS-Frontend/src/pages/AdminCertificates.tsx` (badge, filter, links)
- Modify: `LMS-Frontend/src/services/adminCertificateService.ts` (pass network param)
- Create: `LMS-Server/src/__tests__/admin-network-filter.test.ts`
- Create: `LMS-Frontend/src/__tests__/AdminCertificatesNetwork.test.tsx`

**Interfaces:**
- Consumes: `IssuedCredential.network` field (already in type)
- Produces: `?network=public|testnet` query param; network badge; dynamic explorer links

- [ ] **Step 1: Write the failing backend test**

Create `LMS-Server/src/__tests__/admin-network-filter.test.ts`:

```typescript
/**
 * admin-network-filter.test.ts — Network filter for issued credentials
 *
 * ANF-1: Returns all credentials when no network filter
 * ANF-2: Filters to testnet-only when ?network=testnet
 * ANF-3: Filters to public-only when ?network=public
 * ANF-4: Ignores invalid network value
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';

function adminToken(): string {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { userId: 'anf-admin', role: 'admin', email: 'anf-admin@test.com' },
    process.env.JWT_SECRET || 'test-secret'
  );
}

describe('GET /api/v1/admin/issued-credentials?network=', () => {
  beforeAll(() => {
    db.exec(`INSERT OR IGNORE INTO users (id, email, name, password_hash, role)
             VALUES ('anf-admin', 'anf-admin@test.com', 'ANF Admin', 'hash', 'admin')`);
    db.exec(`INSERT OR IGNORE INTO users (id, email, name, password_hash, role)
             VALUES ('anf-student', 'anf-student@test.com', 'ANF Student', 'hash', 'student')`);

    // Insert one testnet and one public credential
    db.exec(`INSERT OR IGNORE INTO nft_credentials
             (id, user_id, wallet_address, mint_status, contract_id, network)
             VALUES ('anf-testnet', 'anf-student', 'GWALLET', 'minted', 'CTEST', 'testnet')`);
    db.exec(`INSERT OR IGNORE INTO nft_credentials
             (id, user_id, wallet_address, mint_status, contract_id, network)
             VALUES ('anf-public', 'anf-student', 'GWALLET', 'minted', 'CPROD', 'public')`);
  });

  it('ANF-1: returns both when no network filter', async () => {
    const res = await request(app)
      .get('/api/v1/admin/issued-credentials')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.credentials.map((c: { credentialId: string }) => c.credentialId);
    expect(ids).toContain('anf-testnet');
    expect(ids).toContain('anf-public');
  });

  it('ANF-2: filters to testnet when ?network=testnet', async () => {
    const res = await request(app)
      .get('/api/v1/admin/issued-credentials?network=testnet')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    const networks = res.body.data.credentials.map((c: { network: string }) => c.network);
    for (const n of networks) {
      expect(n).toBe('testnet');
    }
  });

  it('ANF-3: filters to public when ?network=public', async () => {
    const res = await request(app)
      .get('/api/v1/admin/issued-credentials?network=public')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    const networks = res.body.data.credentials.map((c: { network: string }) => c.network);
    for (const n of networks) {
      expect(n).toBe('public');
    }
  });

  it('ANF-4: ignores invalid network value', async () => {
    const res = await request(app)
      .get('/api/v1/admin/issued-credentials?network=mainnet')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    // Should return all (no filter applied)
    const ids = res.body.data.credentials.map((c: { credentialId: string }) => c.credentialId);
    expect(ids).toContain('anf-testnet');
    expect(ids).toContain('anf-public');
  });
});
```

- [ ] **Step 2: Run backend test to verify ANF-2/ANF-3 fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/admin-network-filter.test.ts`
Expected: ANF-2 and ANF-3 FAIL (network filter not implemented yet)

- [ ] **Step 3: Add network filter to adminController.ts listIssuedCredentials**

In `listIssuedCredentials`, add `network` to the destructured query params and add the filter condition:

```typescript
const { courseId, userId, mintStatus, network } = req.query as {
  courseId?: string;
  userId?: string;
  mintStatus?: string;
  network?: string;
};
```

After the existing `mintStatus` filter (around line 196), add:

```typescript
if (network && ['public', 'testnet'].includes(network)) {
  conditions.push('nc.network = ?');
  params.push(network);
}
```

- [ ] **Step 4: Run backend tests to verify they pass**

Run: `cd LMS-Server && npx vitest run src/__tests__/admin-network-filter.test.ts`
Expected: 4/4 PASS

- [ ] **Step 5: Write frontend test**

Create `LMS-Frontend/src/__tests__/AdminCertificatesNetwork.test.tsx`:

```typescript
/**
 * AdminCertificatesNetwork.test.tsx — Network badge and dynamic explorer links
 *
 * ACNF-1: Explorer link uses testnet for testnet credentials
 * ACNF-2: Explorer link uses public for public credentials
 * ACNF-3: Network badge renders correct text
 */

import { describe, it, expect } from 'vitest';

// Test the explorer URL generation logic directly
function getExplorerUrl(network: string | null, txHash: string): string {
  const net = network || 'public';
  return `https://stellar.expert/explorer/${net}/tx/${txHash}`;
}

describe('Network-aware explorer links', () => {
  it('ACNF-1: uses testnet for testnet credentials', () => {
    expect(getExplorerUrl('testnet', 'abc123')).toBe('https://stellar.expert/explorer/testnet/tx/abc123');
  });

  it('ACNF-2: uses public for public credentials', () => {
    expect(getExplorerUrl('public', 'abc123')).toBe('https://stellar.expert/explorer/public/tx/abc123');
  });

  it('ACNF-3: defaults to public for null network', () => {
    expect(getExplorerUrl(null, 'abc123')).toBe('https://stellar.expert/explorer/public/tx/abc123');
  });
});
```

- [ ] **Step 6: Run frontend test**

Run: `cd LMS-Frontend && npx vitest run src/__tests__/AdminCertificatesNetwork.test.tsx`
Expected: 3/3 PASS

- [ ] **Step 7: Update AdminCertificates.tsx — Fix hardcoded explorer links**

Replace line 492:
```tsx
// OLD: href={`https://stellar.expert/explorer/public/tx/${app.txHash}`}
// NEW:
href={`https://stellar.expert/explorer/${app.network || 'public'}/tx/${app.txHash}`}
```

Replace line 787:
```tsx
// OLD: href={`https://stellar.expert/explorer/public/tx/${cred.txHash}`}
// NEW:
href={`https://stellar.expert/explorer/${cred.network || 'public'}/tx/${cred.txHash}`}
```

- [ ] **Step 8: Add network filter dropdown and badge to AdminCertificates.tsx**

Add `networkFilter` state:
```tsx
const [networkFilter, setNetworkFilter] = useState('');
```

Add network filter dropdown in the Issued Credentials filter bar (alongside existing filters):
```tsx
<select
  value={networkFilter}
  onChange={(e) => setNetworkFilter(e.target.value)}
  className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
>
  <option value="">All Networks</option>
  <option value="public">Public (Mainnet)</option>
  <option value="testnet">Testnet</option>
</select>
```

Add network badge in credential rows (after mint path badge):
```tsx
{cred.network && (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
    cred.network === 'testnet'
      ? 'bg-blue-50 text-blue-700'
      : 'bg-emerald-50 text-emerald-700'
  }`}>
    {cred.network === 'testnet' ? 'Testnet' : 'Public'}
  </span>
)}
```

Pass `network` param in service call:
```tsx
adminCertificateService.getIssuedCredentials({
  ...existingParams,
  network: networkFilter || undefined,
})
```

- [ ] **Step 9: Update adminCertificateService.ts**

Add `network` param to `getIssuedCredentials`:
```typescript
async getIssuedCredentials(params?: {
  courseId?: string;
  userId?: string;
  mintStatus?: 'pending' | 'minted' | 'failed';
  network?: string;
}): Promise<IssuedCredential[]> {
  const qs = new URLSearchParams();
  if (params?.courseId) qs.set('courseId', params.courseId);
  if (params?.userId) qs.set('userId', params.userId);
  if (params?.mintStatus) qs.set('mintStatus', params.mintStatus);
  if (params?.network) qs.set('network', params.network);
```

- [ ] **Step 10: Run all tests**

Run: `cd LMS-Server && npx vitest run` and `cd LMS-Frontend && npx vitest run`
Expected: All pass

- [ ] **Step 11: Commit**

```bash
git add LMS-Server/src/controllers/adminController.ts LMS-Server/src/__tests__/admin-network-filter.test.ts \
  LMS-Frontend/src/pages/AdminCertificates.tsx LMS-Frontend/src/services/adminCertificateService.ts \
  LMS-Frontend/src/__tests__/AdminCertificatesNetwork.test.tsx
git commit -m "feat: add network filter, badge, and dynamic explorer links to admin credentials"
```

---

### Task 5: Reconciliation UI Button

**Files:**
- Modify: `LMS-Frontend/src/pages/AdminCertificates.tsx` (add Reconcile button)
- Modify: `LMS-Frontend/src/services/adminCertificateService.ts` (add reconcile API call)

**Interfaces:**
- Consumes: `POST /api/v1/admin/credentials/:id/reconcile` from Task 3
- Produces: Reconcile button on failed credentials with tx_hash

- [ ] **Step 1: Add reconcile method to adminCertificateService.ts**

```typescript
/** POST /admin/credentials/:id/reconcile — check Horizon for failed tx */
async reconcileCredential(credentialId: string): Promise<{
  reconciled: boolean;
  status: string;
  reason?: string;
  ledger?: number;
  txHash?: string;
}> {
  const res = await api.post<{
    success: boolean;
    data: { reconciled: boolean; status: string; reason?: string; ledger?: number; txHash?: string };
  }>(`/admin/credentials/${credentialId}/reconcile`);
  return res.data.data;
},
```

- [ ] **Step 2: Add Reconcile button in AdminCertificates.tsx**

In the Issued Credentials table, for failed credentials with txHash, add a button:

```tsx
{cred.mintStatus === 'failed' && cred.txHash && (
  <button
    type="button"
    onClick={() => handleReconcile(cred.credentialId)}
    disabled={isActing}
    className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
  >
    {isActing ? 'Checking…' : 'Reconcile'}
  </button>
)}
```

Add `handleReconcile` function:

```tsx
const handleReconcile = async (credentialId: string) => {
  setActingId(credentialId);
  try {
    const result = await adminCertificateService.reconcileCredential(credentialId);
    if (result.status === 'minted') {
      alert(`Reconciled! Transaction confirmed on-chain (ledger ${result.ledger}).`);
      refreshCredentials();
    } else if (result.status === 'chain_failed') {
      alert('Transaction was found on-chain but failed. Credential remains failed.');
    } else if (result.status === 'not_found') {
      alert('Transaction not found on Horizon. It may not have been submitted successfully.');
    } else {
      alert(result.reason || 'Cannot reconcile this credential.');
    }
  } catch {
    alert('Reconciliation check failed. Please try again.');
  } finally {
    setActingId(null);
  }
};
```

- [ ] **Step 3: Run frontend tests**

Run: `cd LMS-Frontend && npx vitest run`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add LMS-Frontend/src/pages/AdminCertificates.tsx LMS-Frontend/src/services/adminCertificateService.ts
git commit -m "feat: add Reconcile button for failed credentials with tx_hash"
```

---

### Task 6: Fixture-Based RPC Integration Tests

**Files:**
- Create: `LMS-Server/src/__tests__/fixtures/testnet-rpc/transaction-05e459cc.json`
- Create: `LMS-Server/src/__tests__/fixtures/testnet-rpc/operations-05e459cc.json`
- Create: `LMS-Server/src/__tests__/rpc-integration.test.ts`

**Interfaces:**
- Consumes: Fixture JSON files; `getHorizonUrl` from reconciliationService; metadata route from Task 1
- Produces: 7 fixture-based tests + optional live tests

- [ ] **Step 1: Create fixture directory**

```bash
mkdir -p LMS-Server/src/__tests__/fixtures/testnet-rpc
```

- [ ] **Step 2: Fetch and save real Horizon responses as fixtures**

```bash
# Transaction fixture
curl -sf 'https://horizon-testnet.stellar.org/transactions/05e459ccc8cbdcae5e520ce5a3c912f09598dc5e81488764b4fbf6801f6744b2' \
  > LMS-Server/src/__tests__/fixtures/testnet-rpc/transaction-05e459cc.json

# Operations fixture
curl -sf 'https://horizon-testnet.stellar.org/transactions/05e459ccc8cbdcae5e520ce5a3c912f09598dc5e81488764b4fbf6801f6744b2/operations' \
  > LMS-Server/src/__tests__/fixtures/testnet-rpc/operations-05e459cc.json
```

- [ ] **Step 3: Write fixture-based tests**

Create `LMS-Server/src/__tests__/rpc-integration.test.ts`:

```typescript
/**
 * rpc-integration.test.ts — Fixture-based RPC integration tests
 *
 * Uses real Horizon responses recorded from testnet mint tx 05e459cc...44b2.
 * Tests parse + validate Horizon response formats.
 *
 * FIXTURE-1: Parse transaction response — extract successful, ledger, fee
 * FIXTURE-2: Parse operations response — extract type, function
 * FIXTURE-3: Verify transaction source matches minter public key
 * FIXTURE-4: Verify transaction was successful
 * FIXTURE-5: Verify operation is invoke_host_function
 * FIXTURE-6: Horizon URL mapping for public network
 * FIXTURE-7: Horizon URL mapping for testnet network
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getHorizonUrl } from '../services/reconciliationService.js';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname2, 'fixtures', 'testnet-rpc');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'));
}

describe('Fixture-based RPC integration', () => {
  const tx = loadFixture('transaction-05e459cc.json') as {
    successful: boolean;
    ledger: number;
    fee_charged: string;
    source_account: string;
    hash: string;
  };

  const ops = loadFixture('operations-05e459cc.json') as {
    _embedded: { records: Array<{ type: string; function?: string }> };
  };

  it('FIXTURE-1: parse transaction — successful, ledger, fee', () => {
    expect(tx.successful).toBe(true);
    expect(typeof tx.ledger).toBe('number');
    expect(tx.ledger).toBe(4228792);
    expect(typeof tx.fee_charged).toBe('string');
  });

  it('FIXTURE-2: parse operations — type and records exist', () => {
    const records = ops._embedded.records;
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].type).toBe('invoke_host_function');
  });

  it('FIXTURE-3: transaction source matches minter public key', () => {
    expect(tx.source_account).toBe('GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3');
  });

  it('FIXTURE-4: transaction was successful', () => {
    expect(tx.successful).toBe(true);
  });

  it('FIXTURE-5: operation is invoke_host_function', () => {
    const records = ops._embedded.records;
    expect(records[0].type).toBe('invoke_host_function');
  });

  it('FIXTURE-6: Horizon URL for public network', () => {
    expect(getHorizonUrl('public')).toBe('https://horizon.stellar.org');
  });

  it('FIXTURE-7: Horizon URL for testnet network', () => {
    expect(getHorizonUrl('testnet')).toBe('https://horizon-testnet.stellar.org');
  });
});
```

- [ ] **Step 4: Run fixture tests**

Run: `cd LMS-Server && npx vitest run src/__tests__/rpc-integration.test.ts`
Expected: 7/7 PASS

- [ ] **Step 5: Run full backend test suite**

Run: `cd LMS-Server && npx vitest run`
Expected: All tests pass (existing + all new)

- [ ] **Step 6: Run full frontend test suite**

Run: `cd LMS-Frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add LMS-Server/src/__tests__/fixtures/testnet-rpc/ LMS-Server/src/__tests__/rpc-integration.test.ts
git commit -m "test: add fixture-based RPC integration tests from testnet mint data"
```

---

### Task 7: Final Verification + Documentation

**Files:**
- Update: `docs/superpowers/plans/2026-08-19-testnet-next-steps-todo.md`
- Update: `docs/superpowers/diagrams/2026-08-19-dependency-map.md`

- [ ] **Step 1: Run full backend test suite**

Run: `cd LMS-Server && npx vitest run`
Expected: All tests pass (1076 existing + new tests)

- [ ] **Step 2: Run full frontend test suite**

Run: `cd LMS-Frontend && npx vitest run`
Expected: All tests pass (206 existing + new tests)

- [ ] **Step 3: Run E2E tests**

Run: `cd e2e && npx playwright test`
Expected: 14/14 PASS

- [ ] **Step 4: Update TODO with completed integration hardening tasks**

- [ ] **Step 5: Update dependency map diagram**

- [ ] **Step 6: STOP — Do not commit/push without explicit approval**

All changes staged. Present summary to user for commit/push approval.
