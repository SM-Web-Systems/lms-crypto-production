# NFT Credential Transparency (AW-011) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile positional matching in `Nfts.tsx` with deterministic `soroban_token_id`-based matching so each LMS NFT card correctly shows the course title, code, mint date, and Stellar Explorer link.

**Architecture:** The Soroban `mint()` contract call returns the assigned token ID (a `u32` ScVal). LMS `mintService.ts` will extract this from the transaction result and store it in `nft_credentials.soroban_token_id`. The public credentials API will include this field. `Nfts.tsx` will build a `Map<sorobanTokenId, LmsCredential>` and look up by `item.token.tokenId`. Legacy credentials where `soroban_token_id IS NULL` fall back to positional matching.

**Tech Stack:** TypeScript, Express (LMS backend), better-sqlite3, Vite/React (AmmaWallet frontend), `@stellar/stellar-sdk` (Soroban RPC).

## Global Constraints

- LMS test runner: `cd LMS-Server && npx vitest run --sequence.shuffle=false` — must stay green (currently 280 passing)
- AW frontend build: `cd packages/web-app && npm run build` — must succeed
- No breaking changes to the LMS public credentials API shape (additive only — add `sorobanTokenId` field)
- `soroban_token_id` stored as INTEGER (SQLite) / number (TypeScript) — the Soroban contract `mint()` return value is a `u32`
- Never log or return `NFT_MINTER_SECRET`
- AW and LMS are separate repos/containers — changes in LMS must be deployed by rebuilding `lms-api` container

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `LMS-Server/database/schema.sql` | Modify | Add `soroban_token_id INTEGER` to `nft_credentials` |
| `LMS-Server/src/config/database.ts` | Modify | Add `ensureNftCredentialsSorobanTokenId()` migration guard |
| `LMS-Server/src/services/mintService.ts` | Modify | Extract Soroban return value; `mintCredential()` returns `{txHash, sorobanTokenId}` |
| `LMS-Server/src/routes/nftApplications.ts` | Modify | Pass `sorobanTokenId` from `mintCredential()` result into `nft_credentials` INSERT |
| `LMS-Server/src/routes/publicCredentials.ts` | Modify | Include `soroban_token_id` in public credentials response |
| `LMS-Server/src/__tests__/credentials-public.test.ts` | Create | Tests CA-1 through CA-5 |
| `amma-wallet/packages/web-app/src/pages/Nfts.tsx` | Modify | Map-based matching, overlay UI improvements, legacy fallback |

---

### Task 1: Add `soroban_token_id` column to LMS `nft_credentials`

**Files:**
- Modify: `LMS-Server/database/schema.sql`
- Modify: `LMS-Server/src/config/database.ts`

**Interfaces:**
- Produces: `nft_credentials.soroban_token_id INTEGER` column (nullable); `ensureNftCredentialsSorobanTokenId()` migration guard callable from app startup

- [ ] **Step 1: Add column to schema.sql**

Open `LMS-Server/database/schema.sql`. Find the `CREATE TABLE IF NOT EXISTS nft_credentials` block. Add `soroban_token_id INTEGER` after `error TEXT`:

```sql
CREATE TABLE IF NOT EXISTS nft_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id TEXT REFERENCES quizzes(id),
  course_id TEXT REFERENCES courses(id),
  application_id TEXT REFERENCES course_nft_applications(id),
  wallet_address TEXT NOT NULL,
  tx_hash TEXT,
  contract_id TEXT,
  mint_status TEXT NOT NULL DEFAULT 'pending',
  network TEXT DEFAULT 'public',
  error TEXT,
  soroban_token_id INTEGER,
  is_superseded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Add ensure function to database.ts**

Open `LMS-Server/src/config/database.ts`. Find the section where other `ensure*` migration guards are defined (search for `ensureNftCredentialsIsSuperseded` — add the new one immediately after it):

```typescript
function ensureNftCredentialsSorobanTokenId(): void {
  const cols = db
    .prepare("PRAGMA table_info(nft_credentials)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === 'soroban_token_id')) {
    db.prepare('ALTER TABLE nft_credentials ADD COLUMN soroban_token_id INTEGER').run();
    console.log('[db] Added nft_credentials.soroban_token_id');
  }
}
```

- [ ] **Step 3: Call the ensure function at startup**

In `database.ts`, find where other `ensure*` functions are called (typically near the bottom in the `initDatabase()` or equivalent startup call chain). Add:

```typescript
ensureNftCredentialsSorobanTokenId();
```

- [ ] **Step 4: Run LMS tests to confirm nothing breaks**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run --sequence.shuffle=false 2>&1 | tail -5
```

Expected: `280 passed` (no failures).

- [ ] **Step 5: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/database/schema.sql LMS-Server/src/config/database.ts
git commit -m "feat(NM-A2): add soroban_token_id column to nft_credentials"
```

---

### Task 2: Extract Soroban token ID from mint return value

**Files:**
- Modify: `LMS-Server/src/services/mintService.ts`

**Interfaces:**
- `mintCredential()` currently returns `Promise<{ txHash: string }>`
- After this task it returns `Promise<{ txHash: string; sorobanTokenId: number | null }>`
- `mintCredentialForQuiz()` remains `Promise<void>` but internally captures and stores `soroban_token_id`

**Key knowledge:** The Soroban `mint(to, caller)` function returns the newly assigned token ID as a `u32` ScVal. After `server.getTransaction(txHash)` returns `SUCCESS`, `getResult.returnValue` is the ScVal. Extract it with:

```typescript
import * as StellarSdk from '@stellar/stellar-sdk';
// getResult is the result of server.getTransaction()
const sorobanTokenId: number | null = (() => {
  try {
    if (!getResult?.returnValue) return null;
    // scValToNative converts u32 ScVal → JS number
    const native = StellarSdk.scValToNative(getResult.returnValue);
    return typeof native === 'number' ? native : null;
  } catch {
    return null;
  }
})();
```

- [ ] **Step 1: Update `mintCredential()` return type and extraction**

In `mintService.ts`, find `mintCredential()`. Update its return type and add extraction after the SUCCESS check:

```typescript
export async function mintCredential(params: {
  userId: string;
  courseId: string;
  walletAddress: string;
  applicationId: string;
}): Promise<{ txHash: string; sorobanTokenId: number | null }> {
  // ... (existing code unchanged until getResult SUCCESS block) ...

  if (getResult?.status !== 'SUCCESS') {
    throw new Error(`Transaction not confirmed: status=${getResult?.status ?? 'unknown'}`);
  }

  // Extract assigned on-chain token ID from Soroban return value
  let sorobanTokenId: number | null = null;
  try {
    if (getResult.returnValue) {
      const native = StellarSdk.scValToNative(getResult.returnValue);
      if (typeof native === 'number') sorobanTokenId = native;
    }
  } catch {
    // Non-fatal: legacy behaviour if extraction fails
    console.warn('[mint-course] Could not extract soroban token ID from return value');
  }

  console.log(`[mint-course] SUCCESS: user=${userId} course=${courseId} tx=${txHash} tokenId=${sorobanTokenId}`);
  return { txHash, sorobanTokenId };
}
```

- [ ] **Step 2: Update `mintCredentialForQuiz()` to store soroban_token_id**

In `mintCredentialForQuiz()`, find the SUCCESS block where `nft_credentials` is updated with `mint_status = 'minted'`. Extract the token ID there and include it in the UPDATE:

```typescript
if (getResult?.status === 'SUCCESS') {
  let sorobanTokenId: number | null = null;
  try {
    if (getResult.returnValue) {
      const native = StellarSdk.scValToNative(getResult.returnValue);
      if (typeof native === 'number') sorobanTokenId = native;
    }
  } catch { /* non-fatal */ }

  execute(
    `UPDATE nft_credentials
     SET mint_status = 'minted', tx_hash = ?, soroban_token_id = ?, error = NULL, updated_at = datetime('now')
     WHERE id = ?`,
    [txHash, sorobanTokenId, credId]
  );
  console.log(`[mint] SUCCESS: user=${userId} quiz=${quizId} tx=${txHash} tokenId=${sorobanTokenId}`);
}
```

- [ ] **Step 3: Run LMS tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run --sequence.shuffle=false 2>&1 | tail -5
```

Expected: `280 passed`.

- [ ] **Step 4: Commit**

```bash
git add LMS-Server/src/services/mintService.ts
git commit -m "feat(NM-A2): extract Soroban token ID from mint return value"
```

---

### Task 3: Update nftApplications.ts to store sorobanTokenId

**Files:**
- Modify: `LMS-Server/src/routes/nftApplications.ts`

**Interfaces:**
- Consumes: `mintCredential()` now returns `{ txHash: string; sorobanTokenId: number | null }`
- The INSERT into `nft_credentials` inside the mint handler must include `soroban_token_id`

- [ ] **Step 1: Find the mint handler INSERT in nftApplications.ts**

Search for `INSERT INTO nft_credentials` in `nftApplications.ts`. It currently inserts `tx_hash` but not `soroban_token_id`. Update:

```typescript
const { txHash, sorobanTokenId } = await mintCredential({
  userId: app.user_id,
  courseId,
  walletAddress: app.wallet_address,
  applicationId: appId,
});

execute(
  `INSERT INTO nft_credentials
     (id, user_id, course_id, application_id, wallet_address, tx_hash, soroban_token_id,
      contract_id, mint_status, network)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'minted', 'public')`,
  [
    uuidv4(),
    app.user_id,
    courseId,
    appId,
    app.wallet_address,
    txHash,
    sorobanTokenId ?? null,
    process.env.NFT_CONTRACT_ID ?? '',
  ]
);
```

- [ ] **Step 2: Verify the remint handler also stores soroban_token_id**

Search for `mintCredential` calls in `nftApplications.ts` (there may be a remint path). Apply the same pattern: destructure `{ txHash, sorobanTokenId }` and include in INSERT.

- [ ] **Step 3: Run tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run --sequence.shuffle=false 2>&1 | tail -5
```

Expected: `280 passed`.

- [ ] **Step 4: Commit**

```bash
git add LMS-Server/src/routes/nftApplications.ts
git commit -m "feat(NM-A2): store soroban_token_id in nft_credentials on mint"
```

---

### Task 4: Expose `sorobanTokenId` in public credentials API + write tests

**Files:**
- Modify: `LMS-Server/src/routes/publicCredentials.ts`
- Create: `LMS-Server/src/__tests__/credentials-public.test.ts`

**Interfaces:**
- `GET /api/v1/credentials/public?wallet=X` response adds `sorobanTokenId: number | null` to each credential object
- No other field changes — purely additive

- [ ] **Step 1: Write the failing test file**

Create `LMS-Server/src/__tests__/credentials-public.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { seedBase, clearTestData } from './helpers/seed.js';

const TEST_WALLET = 'GTESTWALLETADDRESSPLACEHOLDERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const OTHER_WALLET = 'GDPOFQ7YDGLMFVWZ2LRKLQFN7KQBJ5UVTVF6TVVQ5G5W3K4Z4WQZX7I'; // fake, not on Stellar

describe('GET /api/v1/credentials/public', () => {
  beforeEach(async () => {
    await clearTestData();
    await seedBase();
  });

  it('CA-1: returns sorobanTokenId for a minted credential', async () => {
    // Insert a minted credential with soroban_token_id
    const { db } = await import('../config/database.js');
    const id = 'cred-pub-test-1';
    db.prepare(`
      INSERT INTO nft_credentials
        (id, user_id, wallet_address, tx_hash, soroban_token_id, mint_status, network)
      VALUES (?, (SELECT id FROM users LIMIT 1), ?, 'txhash_ca1', 42, 'minted', 'public')
    `).run(id, TEST_WALLET);

    const res = await request(app)
      .get(`/api/v1/credentials/public?wallet=${TEST_WALLET}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.credentials).toHaveLength(1);
    expect(res.body.data.credentials[0].sorobanTokenId).toBe(42);
  });

  it('CA-2: sorobanTokenId is null for legacy credential', async () => {
    const { db } = await import('../config/database.js');
    db.prepare(`
      INSERT INTO nft_credentials
        (id, user_id, wallet_address, tx_hash, mint_status, network)
      VALUES ('cred-pub-test-2', (SELECT id FROM users LIMIT 1), ?, 'txhash_ca2', 'minted', 'public')
    `).run(TEST_WALLET);

    const res = await request(app)
      .get(`/api/v1/credentials/public?wallet=${TEST_WALLET}`)
      .expect(200);

    expect(res.body.data.credentials[0].sorobanTokenId).toBeNull();
  });

  it('CA-3: only minted credentials are returned', async () => {
    const { db } = await import('../config/database.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string };
    db.prepare(`INSERT INTO nft_credentials (id, user_id, wallet_address, tx_hash, mint_status, network)
      VALUES ('c-minted', ?, ?, 'tx1', 'minted', 'public')`).run(userId.id, TEST_WALLET);
    db.prepare(`INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, network)
      VALUES ('c-pending', ?, ?, 'pending', 'public')`).run(userId.id, TEST_WALLET);
    db.prepare(`INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, network)
      VALUES ('c-failed', ?, ?, 'failed', 'public')`).run(userId.id, TEST_WALLET);

    const res = await request(app)
      .get(`/api/v1/credentials/public?wallet=${TEST_WALLET}`)
      .expect(200);

    expect(res.body.data.credentials).toHaveLength(1);
    expect(res.body.data.credentials[0].credentialId).toBe('c-minted');
  });

  it('CA-4: only credentials for the queried wallet are returned', async () => {
    const { db } = await import('../config/database.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string };
    db.prepare(`INSERT INTO nft_credentials (id, user_id, wallet_address, tx_hash, soroban_token_id, mint_status, network)
      VALUES ('cred-wallet-a', ?, ?, 'tx-a', 1, 'minted', 'public')`).run(userId.id, TEST_WALLET);
    db.prepare(`INSERT INTO nft_credentials (id, user_id, wallet_address, tx_hash, soroban_token_id, mint_status, network)
      VALUES ('cred-wallet-b', ?, ?, 'tx-b', 2, 'minted', 'public')`).run(userId.id, OTHER_WALLET);

    const res = await request(app)
      .get(`/api/v1/credentials/public?wallet=${TEST_WALLET}`)
      .expect(200);

    expect(res.body.data.credentials).toHaveLength(1);
    expect(res.body.data.credentials[0].credentialId).toBe('cred-wallet-a');
  });

  it('CA-5: unknown wallet returns empty array, not 404', async () => {
    const res = await request(app)
      .get('/api/v1/credentials/public?wallet=GNOBODY')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.credentials).toEqual([]);
  });

  it('CA-6: missing wallet param returns 400', async () => {
    const res = await request(app)
      .get('/api/v1/credentials/public')
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail (CA-1 fails — no sorobanTokenId in response yet)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run --sequence.shuffle=false src/__tests__/credentials-public.test.ts 2>&1 | tail -20
```

Expected: CA-1 fails (`sorobanTokenId` is `undefined`), CA-3/4/5/6 may pass already.

- [ ] **Step 3: Update publicCredentials.ts to include soroban_token_id**

In `LMS-Server/src/routes/publicCredentials.ts`, update the SELECT query to include `soroban_token_id`, and add it to the response mapping:

```typescript
// Add soroban_token_id to SELECT
const rows = query<{
  id: string;
  wallet_address: string;
  tx_hash: string | null;
  course_id: string | null;
  course_title: string | null;
  course_code: string | null;
  quiz_id: string | null;
  quiz_title: string | null;
  network: string | null;
  created_at: string;
  soroban_token_id: number | null;
}>(
  `SELECT nc.id, nc.wallet_address, nc.tx_hash,
          nc.course_id, c.title AS course_title, c.course_code,
          nc.quiz_id, q.title AS quiz_title,
          nc.network, nc.created_at, nc.soroban_token_id
   FROM nft_credentials nc
   LEFT JOIN courses c ON c.id = nc.course_id
   LEFT JOIN quizzes q ON q.id = nc.quiz_id
   WHERE nc.wallet_address = ? AND nc.mint_status = 'minted'
   ORDER BY nc.created_at DESC`,
  [wallet]
);

// In the .map():
res.json({
  success: true,
  data: {
    credentials: rows.map((r) => ({
      credentialId: r.id,
      walletAddress: r.wallet_address,
      txHash: r.tx_hash,
      courseId: r.course_id,
      courseTitle: r.course_title,
      courseCode: r.course_code,
      quizId: r.quiz_id,
      quizTitle: r.quiz_title,
      network: r.network,
      mintedAt: r.created_at,
      sorobanTokenId: r.soroban_token_id ?? null,
    })),
  },
});
```

- [ ] **Step 4: Run all tests to confirm CA-1 through CA-6 pass and nothing regresses**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run --sequence.shuffle=false 2>&1 | tail -5
```

Expected: `286 passed` (280 + 6 new).

- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/routes/publicCredentials.ts LMS-Server/src/__tests__/credentials-public.test.ts
git commit -m "feat(NM-A2): expose sorobanTokenId in public credentials API + CA-1–CA-6 tests"
```

---

### Task 5: Fix matching in Nfts.tsx (AmmaWallet frontend)

**Files:**
- Modify: `amma-wallet/packages/web-app/src/pages/Nfts.tsx`

**Interfaces:**
- Consumes: LMS API now includes `sorobanTokenId: number | null` in each credential
- `item.token.tokenId` — the on-chain integer token ID (from AW NFT indexer DB, matches Soroban `u32`)
- Legacy fallback: when all `sorobanTokenId` are null, use positional matching (order by `mintedAt ASC` vs token order)

- [ ] **Step 1: Update `LmsCredential` interface and matching logic**

Open `amma-wallet/packages/web-app/src/pages/Nfts.tsx`. Replace the `LmsCredential` interface to add `sorobanTokenId`:

```typescript
interface LmsCredential {
  credentialId: string;
  walletAddress: string;
  txHash: string | null;
  courseId: string | null;
  courseTitle: string | null;
  courseCode: string | null;
  quizId: string | null;
  quizTitle: string | null;
  network: string | null;
  mintedAt: string;
  sorobanTokenId: number | null;    // ← NEW: on-chain Soroban u32 token ID
}
```

- [ ] **Step 2: Replace `getLmsCred()` with Map-based lookup**

Replace the current `lmsIndexedTokens` and `getLmsCred` definitions with:

```typescript
// Build lookup map: sorobanTokenId → LmsCredential (for deterministic matching)
const lmsCredMap = new Map<number, LmsCredential>();
// Also keep ordered list for legacy positional fallback (sorobanTokenId=null credentials)
const legacyCredList: LmsCredential[] = [];

for (const cred of lmsCredentials) {
  if (cred.sorobanTokenId !== null) {
    lmsCredMap.set(cred.sorobanTokenId, cred);
  } else {
    legacyCredList.push(cred);
  }
}

// Positional fallback: LMS-contract tokens ordered by their tokenId ascending
const lmsIndexedTokens = [...indexedNfts]
  .filter((item: any) => item.collection?.contractId === LMS_CONTRACT_ID)
  .sort((a: any, b: any) => (a.token.tokenId ?? 0) - (b.token.tokenId ?? 0));

function getLmsCred(item: any): LmsCredential | null {
  const tokenId: number | undefined = item.token?.tokenId;

  // Primary: map lookup by on-chain token ID
  if (tokenId !== undefined && lmsCredMap.has(tokenId)) {
    return lmsCredMap.get(tokenId)!;
  }

  // Legacy fallback: positional match for old credentials without sorobanTokenId
  if (legacyCredList.length > 0) {
    const pos = lmsIndexedTokens.indexOf(item);
    if (pos >= 0 && pos < legacyCredList.length) {
      return legacyCredList[pos];
    }
  }

  return null;
}
```

- [ ] **Step 3: Enhance overlay card (cohort display, improved layout)**

In the JSX where `cred` is rendered (inside the `{(() => { const cred = getLmsCred(item); ... })()}` IIFE), update the overlay to show richer information and use `courseCode` as a cohort label:

```tsx
{(() => {
  const cred = getLmsCred(item);
  if (!cred) return null;
  const cohortLabel = cred.courseCode ?? null;
  const issuedDate = cred.mintedAt
    ? new Date(cred.mintedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  return (
    <div className="mt-2 pt-2 border-t border-stellar-border/50 space-y-0.5">
      <p className="text-[10px] text-stellar-muted font-semibold uppercase tracking-wide">LMS Certificate</p>
      <p className="text-xs text-stellar-text font-medium truncate leading-tight">
        {cred.courseTitle ?? cred.quizTitle ?? 'SM Web Systems Certificate'}
      </p>
      {cohortLabel && (
        <p className="text-[10px] text-purple-400 font-medium">{cohortLabel}</p>
      )}
      {issuedDate && (
        <p className="text-[10px] text-stellar-muted">Issued {issuedDate}</p>
      )}
      {cred.txHash && (
        <a
          href={`https://stellar.expert/explorer/public/tx/${cred.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-purple-400 hover:underline inline-flex items-center gap-0.5 mt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {cred.txHash.slice(0, 8)}… <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
})()}
```

- [ ] **Step 4: Verify AW build succeeds**

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app
npm run build 2>&1 | tail -10
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 5: Deploy AW frontend (build + rsync)**

```bash
# Build AW frontend
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app
npm run build

# Deploy to production dist dir
rsync -a --delete dist/ /var/www/html/amma-wallet/dist/

# Deploy to testnet dist dir (if testnet is separate)
rsync -a --delete dist/ /var/www/html/amma-wallet-testnet/dist/
```

- [ ] **Step 6: Smoke test — verify overlay renders**

Manual smoke test:
1. Log into ammawallet.com with an account that has at least one LMS NFT
2. Open NFT Gallery
3. Verify: the LMS NFT card shows course title, course code, issue date, and Stellar Expert link
4. Verify: non-LMS NFTs show no overlay
5. Log into testnet.ammawallet.com (or staging) — verify no overlay on testnet LMS NFTs (network guard: credentials are `network='public'`, testnet wallet has separate chain state)

- [ ] **Step 7: Deploy LMS container (rebuild lms-api)**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
docker compose build lms-api 2>&1 | tail -5
docker compose up -d --no-deps lms-api
docker ps | grep lms-api
```

Expected: `lms-api` container shows `Up` status.

- [ ] **Step 8: Commit AW changes**

```bash
cd /home/webadmin/web-stack/html/amma-wallet
git add packages/web-app/src/pages/Nfts.tsx
git commit -m "feat(NM-A3): fix NFT-credential matching using sorobanTokenId Map; improve overlay UI"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** NM-A1 (audit done here), NM-A2 (Tasks 1–4), NM-A3 (Task 5) — all covered
- [x] **No placeholders:** all code blocks are complete with actual field names and SQL
- [x] **Type consistency:** `sorobanTokenId: number | null` used consistently in all tasks
- [x] **Backward compatibility:** legacy credentials with `soroban_token_id IS NULL` fall back to positional matching — no data loss
- [x] **Container rebuild note included:** Task 5 Step 7 covers `docker compose build lms-api`
- [x] **Test count:** starts at 280, ends at 286 (+ 6 CA tests)
