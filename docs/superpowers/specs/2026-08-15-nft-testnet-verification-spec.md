# NFT Testnet Verification Specification

**Date:** 2026-08-15
**Status:** BLOCKED — APPROACH DECISION REQUIRED
**Author:** Superpowers Team
**Related Tags:** `stellar-sdk-v16-upgrade-2026-08-15`

---

## Executive Summary

The Stellar SDK upgrade from v15.1.0 to v16.2.0 (2026-08-15) resolved 28 CVEs via axios 1.15.0→1.18.0. The `mintService.ts` module had zero code changes in the upgrade and all static verification tests pass:

- SDK imports: verified ✅
- Mock mint tests: pass ✅
- Backend test suite: 1091/1091 pass ✅

However, **runtime verification of the NFT mint flow remains BLOCKED** because:

1. **NFT_AUTO_MINT_ENABLED=false** in production (no automatic minting)
2. **No testnet deployment target** configured (test environment unavailable)
3. **Live mint = irreversible blockchain transaction** (cannot safely test on mainnet)

This specification outlines two mutually exclusive paths forward:

- **Option A: Testnet-First Design (RECOMMENDED)** — Deploy testnet infrastructure, verify SDK v16 mint behavior in isolated environment, then promote to production
- **Option B: Production-Opportunistic Verification** — Wait for first natural admin-triggered mint, verify post-transaction

**This decision must be made before any production NFT mint occurs.**

---

## Current Static Verification (VERIFIED ✅)

### SDK v16 Upgrade Validation

| Component | Status | Evidence |
|-----------|--------|----------|
| **mintService.ts code changes** | No changes | Diff review confirmed zero edits |
| **@stellar/stellar-sdk imports** | ✅ Pass | v16.2.0 correctly imported, module resolution working |
| **axios CVE resolution** | ✅ Resolved | 1.15.0→1.18.0 (28 CVEs fixed) |
| **Mock mint unit tests** | ✅ Pass | Mocked Soroban contract calls succeed |
| **Backend test suite** | ✅ 1091/1091 | Full regression suite passes |
| **Frontend test suite** | ✅ 206/206 | No mint-related component breakage |

### Test Coverage
- Unit tests for mint validation, error handling, DB persistence
- Mock Soroban contract calls (no live transaction)
- nft_credentials schema and constraints verified
- Status enum and state transitions validated

**Conclusion:** All static checks pass. The module is functionally correct at the code level.

---

## Runtime Verification Blocker

### Why Runtime Verification is Blocked

**The Problem:** Static verification (unit tests with mocks) does NOT verify actual runtime behavior:

1. **Live transaction generation** — Does SDK v16 correctly construct Soroban transaction envelopes?
2. **Network communication** — Does Horizon API communication work with SDK v16?
3. **Token metadata** — Does the contract correctly parse and store token metadata?
4. **Idempotency** — Are duplicate requests correctly rejected?
5. **Retry semantics** — Does backoff and timeout work as expected?
6. **Error recovery** — How does the system handle contract failures, network timeouts?

These scenarios **cannot be verified with mock tests** — they require a live Soroban contract and Horizon network.

### Current Constraints

| Constraint | Impact | Why |
|-----------|--------|-----|
| **NFT_AUTO_MINT_ENABLED=false** | No automatic mints occur | Feature flag disables auto-mint path (safe for production) |
| **No testnet deployment** | Cannot test in isolation | Testnet contract + environment not configured |
| **Mainnet only** | Cannot safely test on production network | Live mint is irreversible; first mint must be validated |
| **No recent admin-triggered mints** | No natural testing opportunity | No eligible approved student cohort has triggered manual mint |

### Risk Assessment

**If we proceed to production mint without runtime verification:**

- First SDK v16 mint on mainnet is an **unvalidated transaction**
- If contract execution fails mid-transaction, partial state is irreversible
- If token metadata is malformed, the NFT is permanently on-chain
- No clear recovery path exists for blockchain errors
- Compliance/audit trail may require pre-testnet validation

**Recommendation:** Do not proceed to production mint without testnet validation OR explicit stakeholder authorization to accept runtime risk.

---

## Option A: Testnet-First Design (RECOMMENDED)

### Overview

Deploy NFT minting to Stellar testnet before production. Verify SDK v16 runtime behavior in isolated environment with reversible transactions and test accounts.

### Advantages

- ✅ Safe, reversible testing environment
- ✅ Can run unlimited mints without cost or chain pollution
- ✅ Validates SDK v16 integration comprehensively
- ✅ Supports iterative debugging if issues arise
- ✅ Provides audit trail for compliance
- ✅ Testnet can remain as staging environment

### Implementation Steps

#### 1. Testnet Environment Setup

**Create testnet-specific configuration:**

```env
# .env.testnet or conditional in app.ts
STELLAR_NETWORK=testnet
SOROBAN_CONTRACT_ID=<testnet-contract-address>
STELLAR_ISSUER_SECRET=<testnet-issuer-keypair>
HORIZON_URL=https://horizon-testnet.stellar.org
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NFT_AUTO_MINT_ENABLED=false  # testnet also manual-only
```

**Network passphrase mapping:**

| Network | Passphrase |
|---------|-----------|
| **Mainnet (public)** | `Public Global Stellar Network ; September 2015` |
| **Testnet** | `Test SDF Network ; September 2015` |

**CRITICAL:** These passphrases MUST NOT be swapped. Production config must use the public passphrase. Testnet config must use the test passphrase. Missing or invalid passphrase must fail closed.

#### 2. Testnet Contract Deployment

**Option A1: Deploy new contract to testnet**

```bash
# Prerequisites
soroban contract deploy \
  --network testnet \
  --source <testnet-issuer-keypair> \
  --wasm <path-to-contract.wasm>
```

**Option A2: Use existing testnet contract** (if available from previous deployment)

Verify contract address is recorded in testnet configuration.

**Prerequisite:** Testnet contract must be authorized for minting and token deployment.

#### 3. Testnet Account Funding

**Fund testnet issuer account via Stellar Friendbot:**

```bash
# Step 1: Create test keypair (if needed)
soroban keys generate testnet-issuer --network testnet

# Step 2: Fund via Friendbot
curl -X POST https://friendbot.stellar.org?addr=<testnet-public-key>

# Step 3: Verify funding
stellar account info --network testnet <testnet-public-key>
```

**Verify minimum balance:** ~5 XLM for contract operations + test mints

#### 4. Environment Configuration in Code

**File: `src/services/mintService.ts`**

Ensure network selection is environment-driven:

```typescript
const STELLAR_NETWORK = process.env.STELLAR_NETWORK || 'public';
const CONTRACT_ID = process.env.SOROBAN_CONTRACT_ID;
const ISSUER_SECRET = process.env.STELLAR_ISSUER_SECRET;
const HORIZON_URL = process.env.HORIZON_URL ||
  (STELLAR_NETWORK === 'testnet'
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org');

const NETWORK_PASSPHRASE = STELLAR_NETWORK === 'testnet'
  ? 'Test SDF Network ; September 2015'
  : 'Public Global Stellar Network ; September 2015';
```

**Ensure production isolation:**
- Production `STELLAR_NETWORK` must be `public` (enforced)
- Testnet account keypairs must never be used in production
- Container secrets: separate `app.env` for testnet vs. mainnet

#### 5. Test Account Setup

**Create test student cohort for testnet minting:**

| Account | Role | Purpose |
|---------|------|---------|
| **Testnet Issuer** | Admin/Minter | Submits mint transactions |
| **Test Student 1** | Student | Eligible for testnet NFT |
| **Test Student 2** | Student | Idempotency test (duplicate mint) |
| **Test Sponsor** | Sponsor | Deploys cohort |

**Create test data:**
- Course with 100% completion requirement
- Cohort with test students
- Student completion triggers eligibility check

#### 6. Mint Verification Tests

**Add testnet-specific test suite: `tests/mintService.testnet.spec.ts`**

```typescript
describe('NFT Mint on Testnet', () => {
  // Must run against LIVE testnet, not mocked

  test('TNVM-001: Testnet mint succeeds', async () => {
    const result = await mintService.mint({
      courseId: testCourseId,
      studentId: testStudentId,
      network: 'testnet',
    });

    expect(result.success).toBe(true);
    expect(result.transactionHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('TNVM-002: Transaction confirmed on Horizon', async () => {
    const tx = await horizon.transactions()
      .transaction(transactionHash)
      .call();

    expect(tx.successful).toBe(true);
  });

  test('TNVM-003: Token metadata correct', async () => {
    const token = await sorobanRpc.getContractData(contractId, tokenId);
    expect(token.metadata.name).toBe(expectedCourseName);
  });

  test('TNVM-004: DB persistence verified', async () => {
    const credential = await db.query(
      `SELECT * FROM nft_credentials WHERE id = ?`,
      [credentialId]
    );
    expect(credential.soroban_token_id).toBe(tokenId);
    expect(credential.transaction_hash).toBe(transactionHash);
  });

  test('TNVM-005: Idempotency (duplicate rejected)', async () => {
    const result1 = await mintService.mint({ courseId, studentId });
    const result2 = await mintService.mint({ courseId, studentId });

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(false);
    expect(result2.error).toMatch(/already minted/);
  });

  test('TNVM-006: Retry on transient failure', async () => {
    // Simulate temporary Horizon outage
    mockHorizon.failOnce().then(() => mockHorizon.restore());

    const result = await mintService.mint({ courseId, studentId });
    expect(result.success).toBe(true);
  });

  test('TNVM-007: Timeout handling', async () => {
    mockHorizon.delay(61000);  // Exceed 60s timeout

    const result = await mintService.mint({ courseId, studentId });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timeout/);
  });

  test('TNVM-008: No regression in existing tests', async () => {
    // Run full unit test suite with testnet config
    // Expect 1091/1091 pass
  });
});
```

**Test execution environment:**
```bash
# Testnet validation
STELLAR_NETWORK=testnet \
SOROBAN_CONTRACT_ID=<testnet-contract> \
npm run test:testnet

# Mainnet isolation check (CI)
npm run test:mainnet-isolation
```

#### 7. Verification Checklist

Before promoting to production, validate:

- [ ] Testnet contract deployed and verified
- [ ] Testnet account funded (≥5 XLM)
- [ ] TNVM-001 through TNVM-008 tests pass
- [ ] Transaction confirmed on Stellar Expert (testnet instance)
- [ ] Token metadata verified on testnet
- [ ] DB records created with correct transaction_hash and soroban_token_id
- [ ] Idempotency verified (duplicate mint rejected)
- [ ] Retry logic validates (transient failures handled)
- [ ] Timeout handling works (61s+ delays fail gracefully)
- [ ] No regression in backend test suite (1091/1091 pass)
- [ ] Production isolation verified (no testnet secrets in prod config)
- [ ] Audit log entry created for testnet mint
- [ ] Security review: no secrets exposed in test logs

#### 8. Promotion to Production

Once testnet validation completes:

1. **Merge testnet validation PR** with feature-flagged STELLAR_NETWORK support
2. **Production config review:** Ensure STELLAR_NETWORK=public, production account keypairs
3. **Tag release:** `nft-testnet-verified-2026-08-XX`
4. **Deploy to staging** (if applicable)
5. **Manual smoke test:** Verify production contract is accessible
6. **Enable admin mint button** (if feature-flagged)
7. **Document:** Post-mint verification procedure for admins

**Note:** Testnet can remain as staging environment for future NFT feature work.

---

## Option B: Production-Opportunistic Verification

### Overview

Do not deploy testnet. Instead, wait for the first natural admin-triggered mint request, verify post-transaction, and document the outcome.

### Advantages

- ✅ Minimal code changes (no testnet feature flag)
- ✅ No testnet infrastructure deployment
- ✅ Saves development effort

### Disadvantages

- ❌ First SDK v16 mint is unvalidated production transaction
- ❌ If contract fails, the NFT is permanently malformed on-chain
- ❌ No recovery path for runtime errors
- ❌ High risk for compliance/audit trail
- ❌ Assumes no hidden SDK v16 integration issues

### Prerequisites

1. **Natural admin-triggered mint request** occurs (student cohort completes course, admin approves mint)
2. **Explicit authorization** from stakeholder to proceed with unvalidated production mint
3. **Risk acknowledgment** documented in sign-off

### Post-Mint Verification Checklist

**After admin triggers mint via UI:**

- [ ] Transaction submitted to Stellar
- [ ] Transaction hash recorded (monitor logs)
- [ ] Check transaction on **Stellar Expert** (mainnet):
  - Transaction ID matches log
  - Status: successful
  - All operations completed
- [ ] Query contract state:
  ```bash
  soroban contract invoke --network public \
    --source <issuer> \
    --contract <contract-id> \
    -- get_token_metadata --token_id <soroban_token_id>
  ```
  - Token name/metadata matches expected values
- [ ] Verify DB record:
  ```sql
  SELECT * FROM nft_credentials WHERE id = <credential_id>;
  ```
  - `soroban_token_id` populated (matches contract query)
  - `transaction_hash` populated (matches Stellar Expert)
  - `status` = 'minted'
  - `created_at` = recent timestamp
- [ ] Verify nft_credentials constraints:
  - UNIQUE constraint on (course_id, student_id) exists
  - No duplicate rows created
- [ ] Check minter account balance:
  ```bash
  stellar account info <issuer-public-key>
  ```
  - Balance decreased by transaction cost (0.00001 XLM typical)
  - Balance ≥ 5 XLM (alert if < 5 XLM)
- [ ] Audit log entry exists:
  - Admin user who triggered mint
  - Timestamp
  - Course ID and student ID
  - Transaction hash
- [ ] No secrets in logs:
  - Grep logs for STELLAR_ISSUER_SECRET, keypairs, private keys
  - Verify only public keys/addresses exposed

### Failure Scenario Response

**If post-mint verification fails:**

1. **Do NOT retry without investigation**
2. **Escalate to senior developer** (unsafe production behavior)
3. **Investigate:**
   - Check Stellar Expert for transaction failure reason
   - Review contract execution logs (if available)
   - Review mintService.ts error handling
   - Check for SDK v16 regression
4. **Options:**
   - If SDK v16 issue: roll back to v15.1.0 (requires re-validation)
   - If contract issue: redeploy contract or disable minting
   - If account issue: fund minter account or use backup account
5. **Document findings** in incident report
6. **Root cause analysis** before retry

### Production Mint Authorization

**Required sign-off (before any mint):**

```markdown
## Production NFT Mint Authorization

**Date:** [YYYY-MM-DD]
**Authorized by:** [Name, Title]
**Risk acknowledged:** Yes, SDK v16 runtime unvalidated
**First production mint?** Yes
**Testnet verification skipped?** Yes
**Approval rationale:** [Reason for opportunistic approach]

Signature: ___________________
```

---

## Network/Passphrase Configuration

### Current State

The LMS currently uses:

- **Network:** Stellar Public (mainnet)
- **Passphrase:** `Public Global Stellar Network ; September 2015`
- **Horizon URL:** `https://horizon.stellar.org`
- **Soroban RPC:** `https://soroban-rpc.stellar.org`

### Proposed Testnet Configuration

**File: `src/config/stellar.ts`** (new file)

```typescript
export const STELLAR_CONFIG = {
  networks: {
    public: {
      network: 'public',
      passphrase: 'Public Global Stellar Network ; September 2015',
      horizonUrl: 'https://horizon.stellar.org',
      sorobanUrl: 'https://soroban-rpc.stellar.org',
      contractId: process.env.SOROBAN_CONTRACT_ID_PUBLIC,
      issuerSecret: process.env.STELLAR_ISSUER_SECRET_PUBLIC,
    },
    testnet: {
      network: 'testnet',
      passphrase: 'Test SDF Network ; September 2015',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      sorobanUrl: 'https://soroban-testnet.stellar.org',
      contractId: process.env.SOROBAN_CONTRACT_ID_TESTNET,
      issuerSecret: process.env.STELLAR_ISSUER_SECRET_TESTNET,
    },
  },

  getConfig(network: 'public' | 'testnet' = 'public') {
    const config = this.networks[network];
    if (!config) throw new Error(`Unknown network: ${network}`);
    return config;
  },
};

// Usage in mintService.ts
const network = process.env.STELLAR_NETWORK || 'public';
const config = STELLAR_CONFIG.getConfig(network as any);
```

### Isolation Guarantees

**Production must never leak testnet configuration:**

1. **Environment variable validation:**
   ```typescript
   if (process.env.NODE_ENV === 'production') {
     if (process.env.STELLAR_NETWORK !== 'public') {
       throw new Error('Production must use public network');
     }
   }
   ```

2. **Docker secrets separation:**
   - Testnet: `testnet.env` (separate file)
   - Production: `production.env` (must not reference testnet vars)
   - CI/CD: conditional env loading based on deployment target

3. **Container configuration:**
   ```yaml
   # docker-compose.testnet.yml
   services:
     lms-api-testnet:
       env_file: testnet.env  # Uses testnet config only

   # docker-compose.yml (production)
   services:
     lms-api:
       env_file: production.env  # Uses production config only
   ```

4. **Test isolation:**
   ```bash
   # Testnet tests only run with STELLAR_NETWORK=testnet
   STELLAR_NETWORK=testnet npm run test:testnet

   # Mainnet tests run with STELLAR_NETWORK=public
   STELLAR_NETWORK=public npm run test:mainnet
   ```

---

## Contract and Account Prerequisites

### Mainnet (Current Production)

| Component | Status | Details |
|-----------|--------|---------|
| **Contract** | ✅ Deployed | `CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524` |
| **Issuer Account** | ✅ Active | Public key in production config (secret in env) |
| **Balance** | ✅ Verified | Monitored via `minter-balance-check.sh` cron (every 6 hours) |
| **Verification** | ✅ Stellar Expert | Public contract viewable at [Stellar Expert](https://stellar.expert/explorer/public) |

### Testnet (Option A Prerequisites)

| Component | Status | Action | Timeline |
|-----------|--------|--------|----------|
| **Contract** | ❌ Not deployed | Deploy via `soroban contract deploy` | Before testnet validation |
| **Issuer Account** | ❌ Not created | Create keypair + fund via Friendbot | Before testnet validation |
| **Balance** | ❌ Not funded | Friendbot (free, 10,000 XLM) | Before testnet validation |
| **Verification** | ❌ Not possible | Will be possible on Stellar Expert testnet | After deployment |

**Estimated effort:** ~2 hours (contract deployment, account setup, testing)

### If Testnet Contract Already Exists

If a previous testnet contract was deployed (from earlier phases):

1. **Retrieve contract ID** from git history or deployment notes
2. **Verify on Stellar Expert testnet:**
   ```
   https://stellar.expert/explorer/testnet/contract/<contract-id>
   ```
3. **Verify contract code:**
   ```bash
   soroban contract info --network testnet <contract-id>
   ```
4. **Update testnet config** to reference existing contract
5. **Test account setup:** Create test students and trigger mint

---

## Authentication and Authorization

### Existing Mint Authorization

**Mint endpoint: `POST /admin/mint-nft`** (current implementation)

- **Authentication:** Requires valid JWT (logged-in user)
- **Authorization:** Requires `admin` role (RBAC permission `nft.mint`)
- **Trigger:** Admin manually clicks "Mint Certificate" button
- **Feature flag:** `NFT_AUTO_MINT_ENABLED` (if false, no auto-mint)

**Current role:** `admin` role has full mint authority

### Testnet Mint Authorization

**Testnet mints should have same authorization:**

1. Admin-only access
2. RBAC permission check: `nft.mint` or `nft.mint.testnet`
3. User confirmation modal (required for any mint)
4. Audit log entry

**No changes to authorization required** — same RBAC applies to testnet mints.

### Future: Feature Flag for Testnet

**If testnet is deployed alongside production:**

```typescript
const ALLOW_TESTNET_MINTS = process.env.ALLOW_TESTNET_MINTS === 'true';

export async function mintNft(req: Request, res: Response) {
  const { network } = req.body;  // 'public' or 'testnet'

  if (network === 'testnet' && !ALLOW_TESTNET_MINTS) {
    return res.status(403).json({ error: 'Testnet mints disabled' });
  }

  // ... proceed with mint
}
```

This allows staging/development environments to have `ALLOW_TESTNET_MINTS=true` while production has `ALLOW_TESTNET_MINTS=false`.

---

## Idempotency

### Problem Statement

If an admin clicks "Mint Certificate" twice rapidly (or network timeout causes retry), the system should NOT create two blockchain transactions for the same student/course.

### Current Database Schema

**Table: `nft_credentials`**

```sql
CREATE TABLE nft_credentials (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- 'pending', 'minted', 'failed'
  soroban_token_id TEXT,
  transaction_hash TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(course_id, student_id),  -- IDEMPOTENCY KEY
  FOREIGN KEY(course_id) REFERENCES courses(id),
  FOREIGN KEY(student_id) REFERENCES users(id)
);
```

**Idempotency mechanism:** UNIQUE constraint on `(course_id, student_id)` ensures only ONE record per student/course pair.

### Idempotency Verification

**Test: TNVM-005 (Duplicate Mint Rejected)**

```typescript
test('TNVM-005: Duplicate mint request rejected', async () => {
  const mintPayload = {
    courseId: 'course-123',
    studentId: 'student-456',
    network: 'testnet',
  };

  // First mint succeeds
  const result1 = await mintService.mint(mintPayload);
  expect(result1.success).toBe(true);
  expect(result1.transactionHash).toBeDefined();

  // Immediate second mint should fail
  const result2 = await mintService.mint(mintPayload);
  expect(result2.success).toBe(false);
  expect(result2.error).toMatch(/already exists|unique constraint/);

  // Verify only one nft_credentials row exists
  const records = await db.query(
    `SELECT COUNT(*) as count FROM nft_credentials
     WHERE course_id = ? AND student_id = ?`,
    ['course-123', 'student-456']
  );
  expect(records.count).toBe(1);
});
```

### Duplicate Detection Logic

**File: `src/services/mintService.ts`**

```typescript
export async function mint(params: {
  courseId: string;
  studentId: string;
  network?: 'public' | 'testnet';
}): Promise<MintResult> {
  const { courseId, studentId, network = 'public' } = params;

  // Check for existing nft_credentials
  const existing = await db.query(
    `SELECT id, status FROM nft_credentials
     WHERE course_id = ? AND student_id = ?`,
    [courseId, studentId]
  );

  if (existing) {
    if (existing.status === 'minted') {
      return {
        success: false,
        error: 'NFT already minted for this student/course',
        credentialId: existing.id,
      };
    } else if (existing.status === 'pending') {
      return {
        success: false,
        error: 'Mint already in progress for this student/course',
        credentialId: existing.id,
      };
    } else if (existing.status === 'failed') {
      // Allow retry of failed mints
      return await retryMint(existing.id, network);
    }
  }

  // Proceed with new mint (INSERT will be atomic due to UNIQUE constraint)
  return await executeMint(courseId, studentId, network);
}
```

### Transaction-Level Idempotency

**Database INSERT with UNIQUE constraint:**

```sql
INSERT INTO nft_credentials (id, course_id, student_id, status)
VALUES (?, ?, ?, 'pending')
ON CONFLICT(course_id, student_id) DO NOTHING;  -- SQLite idempotency
```

If two concurrent mints attempt the same (course_id, student_id), the UNIQUE constraint ensures only one succeeds. The second returns a conflict error.

---

## Retry and Timeout Behavior

### Timeout Configuration

**Mint operation should have configurable timeout:**

```typescript
const MINT_TIMEOUT_MS = parseInt(process.env.MINT_TIMEOUT_MS || '60000', 10);

export async function mint(params: MintParams): Promise<MintResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MINT_TIMEOUT_MS);

  try {
    const result = await withTimeout(
      executeMint(params),
      MINT_TIMEOUT_MS,
      'Mint operation timed out'
    );
    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'Mint timeout after 60s',
        retryable: true,
      };
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### Retry Strategy

**Exponential backoff for transient errors:**

```typescript
export async function executeWithRetry(
  fn: () => Promise<any>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryableError(error)) {
        throw error;
      }

      if (attempt < maxRetries - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);  // 1s, 2s, 4s
        logger.warn(`Mint attempt ${attempt + 1} failed, retrying in ${delayMs}ms`, {
          error: error.message,
        });
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

function isRetryableError(error: any): boolean {
  const message = error.message?.toLowerCase() || '';
  return (
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    error.status === 429 ||  // Rate limit
    error.status >= 500      // Server error
  );
}
```

### Mint Execution with Retry

```typescript
export async function executeMint(
  courseId: string,
  studentId: string,
  network: 'public' | 'testnet' = 'public'
): Promise<MintResult> {
  const credentialId = generateId();

  // Insert pending record
  await db.insert('nft_credentials', {
    id: credentialId,
    course_id: courseId,
    student_id: studentId,
    status: 'pending',
  });

  try {
    // Execute mint with retries
    const result = await executeWithRetry(async () => {
      return await submitMintTransaction(credentialId, network);
    });

    // Update status to minted
    await db.update('nft_credentials',
      { id: credentialId },
      {
        status: 'minted',
        soroban_token_id: result.tokenId,
        transaction_hash: result.transactionHash,
        updated_at: new Date(),
      }
    );

    return {
      success: true,
      transactionHash: result.transactionHash,
      sorobanTokenId: result.tokenId,
    };
  } catch (error) {
    // Update status to failed
    await db.update('nft_credentials',
      { id: credentialId },
      {
        status: 'failed',
        error_message: error.message,
        updated_at: new Date(),
      }
    );

    return {
      success: false,
      error: `Mint failed: ${error.message}`,
      credentialId,
      retryable: isRetryableError(error),
    };
  }
}
```

### Test Cases

**TNVM-006: Retry on transient failure**

```typescript
test('TNVM-006: Retry on transient Horizon failure', async () => {
  // Mock Horizon to fail once, then succeed
  let attemptCount = 0;
  mockHorizonSubmit.mockImplementationOnce(() => {
    attemptCount++;
    throw new Error('ECONNREFUSED');  // Transient error
  });
  mockHorizonSubmit.mockImplementationOnce(() => {
    attemptCount++;
    return { hash: 'tx123' };  // Success on retry
  });

  const result = await executeWithRetry(() => mockHorizonSubmit(), 3, 10);

  expect(attemptCount).toBe(2);  // Failed once, succeeded on retry
  expect(result.hash).toBe('tx123');
});
```

**TNVM-007: Timeout handling**

```typescript
test('TNVM-007: Timeout after 60s', async () => {
  mockHorizonSubmit.mockImplementationOnce(
    () => new Promise(resolve => setTimeout(resolve, 70000))  // 70s delay
  );

  const result = await mint({
    courseId: 'course-123',
    studentId: 'student-456',
  });

  expect(result.success).toBe(false);
  expect(result.error).toMatch(/timeout/);
  expect(result.retryable).toBe(true);  // Can retry after timeout
});
```

---

## Transaction and Token Verification

### After Mint: Verification Workflow

**Once nft_credentials.status = 'minted', verify on Stellar:**

1. **Query transaction on Horizon:**
   ```bash
   curl https://horizon.stellar.org/transactions/<transaction_hash>
   ```

2. **Verify transaction structure:**
   - `successful: true`
   - `result_code: 'tx_success'`
   - All operations completed

3. **Verify token on Soroban:**
   ```bash
   soroban contract invoke --network public \
     --source <issuer> \
     --contract <contract-id> \
     -- get_token_metadata \
     --token_id <soroban_token_id>
   ```

4. **Compare metadata:**
   - Token name == course name
   - Token issuer == expected issuer
   - Metadata JSON matches database

### Test: Token Metadata Verification

**TNVM-003: Token metadata correct**

```typescript
test('TNVM-003: Token metadata matches database', async () => {
  // Mint on testnet
  const mintResult = await mintService.mint({
    courseId: 'course-123',
    studentId: 'student-456',
    network: 'testnet',
  });

  // Query token from contract
  const tokenMetadata = await sorobanClient.getTokenMetadata(
    testnetContractId,
    mintResult.sorobanTokenId
  );

  // Compare with database
  const credential = await db.query(
    `SELECT * FROM nft_credentials WHERE id = ?`,
    [mintResult.credentialId]
  );

  expect(tokenMetadata.name).toBe(credential.course_name);
  expect(tokenMetadata.issuer).toBe(config.getConfig('testnet').issuerPublicKey);
  expect(tokenMetadata.soroban_token_id).toBe(credential.soroban_token_id);
});
```

### Horizon Query Verification

**File: `src/services/horizonService.ts`**

```typescript
export async function verifyMintTransaction(
  transactionHash: string,
  network: 'public' | 'testnet' = 'public'
): Promise<VerifyResult> {
  const config = STELLAR_CONFIG.getConfig(network);
  const server = new Horizon.Server(config.horizonUrl);

  try {
    const tx = await server.transactions().transaction(transactionHash).call();

    if (!tx.successful) {
      return {
        verified: false,
        error: `Transaction not successful: ${tx.result_code}`,
      };
    }

    return {
      verified: true,
      transactionHash: tx.hash,
      ledger: tx.ledger_attr,
      timestamp: tx.created_at,
    };
  } catch (error) {
    return {
      verified: false,
      error: `Failed to query Horizon: ${error.message}`,
    };
  }
}
```

---

## Persistence and Reconciliation

### Database Persistence

**After successful mint, nft_credentials is populated:**

| Column | Value | Purpose |
|--------|-------|---------|
| `id` | UUID | Unique credential identifier |
| `course_id` | STRING | Course being certified |
| `student_id` | STRING | Student receiving NFT |
| `status` | 'minted' | Current state |
| `soroban_token_id` | STRING | On-chain token identifier |
| `transaction_hash` | STRING | Stellar transaction hash |
| `created_at` | TIMESTAMP | Mint time |
| `updated_at` | TIMESTAMP | Last update time |

**Example:**

```sql
INSERT INTO nft_credentials
  (id, course_id, student_id, status, soroban_token_id, transaction_hash, created_at)
VALUES
  ('cred-789', 'course-123', 'student-456', 'minted',
   'token-aaa111', 'c1e3d...', '2026-08-15 14:32:00');
```

### Reconciliation Process

**Daily reconciliation (optional, for data integrity):**

```typescript
export async function reconcileMints(network: 'public' | 'testnet' = 'public') {
  const pendingMints = await db.query(
    `SELECT * FROM nft_credentials WHERE status = 'pending'
     AND created_at < datetime('now', '-1 hour')`
  );

  for (const mint of pendingMints) {
    const verified = await verifyMintTransaction(
      mint.transaction_hash,
      network
    );

    if (verified.verified) {
      // Mark as confirmed
      await db.update('nft_credentials',
        { id: mint.id },
        { status: 'minted', updated_at: new Date() }
      );
      logger.info(`Reconciled mint ${mint.id} to confirmed`);
    } else {
      logger.warn(`Could not reconcile mint ${mint.id}`, verified);
    }
  }
}
```

**Trigger:** Optional daily cron (e.g., 2 AM) to reconcile any pending mints.

---

## Failure States

### Error Classification

| Error Class | Cause | Retryable | Recovery |
|------------|-------|-----------|----------|
| **Network timeout** | Horizon/Soroban unreachable | ✅ Yes | Exponential backoff retry (3x) |
| **Contract execution failed** | Soroban contract error | ❌ No | Log, mark failed, alert admin |
| **Insufficient funds** | Minter account < 0.5 XLM | ❌ No | Alert `minter-balance-check.sh` |
| **Duplicate request** | UNIQUE constraint violation | ❌ No | Reject, return existing credential |
| **Invalid course/student** | Foreign key violation | ❌ No | Validate input, return 400 |
| **Malformed metadata** | Token metadata invalid | ❌ No | Log, mark failed, alert |

### Handling Each Failure Type

**TNVM-006: Network timeout → Retry**

```typescript
if (error.message.includes('TIMEOUT') || error.message.includes('ECONNREFUSED')) {
  return await executeWithRetry(() => submitMint(), 3, 1000);
}
```

**Contract execution failure → Fail with details**

```typescript
if (error.message.includes('contract')) {
  await db.update('nft_credentials', { id }, {
    status: 'failed',
    error_message: error.message,
  });

  logger.error(`Mint failed: contract error`, {
    credentialId: id,
    error: error.message,
  });

  // Alert admin via notification
  await notificationService.sendAlert({
    title: 'NFT Mint Failed',
    message: `Contract error for credential ${id}: ${error.message}`,
    severity: 'high',
  });
}
```

**Insufficient funds → Alert (handled by separate monitoring)**

```bash
# minter-balance-check.sh runs every 6 hours
if [ "$(get_balance)" -lt 5 ]; then
  send_alert "NFT minter balance low: $(get_balance) XLM"
fi
```

**Duplicate → Silently return existing**

```typescript
if (error.code === 'UNIQUE_CONSTRAINT') {
  const existing = await db.query(
    `SELECT * FROM nft_credentials WHERE course_id = ? AND student_id = ?`,
    [courseId, studentId]
  );
  return {
    success: true,
    idempotent: true,
    credentialId: existing.id,
    message: 'NFT already minted',
  };
}
```

---

## Rollback and Recovery

### Why Rollback is Limited

**Blockchain transactions are immutable:**

- ✅ Database changes CAN be rolled back (delete nft_credentials row)
- ❌ Stellar transactions CANNOT be rolled back (permanent on-chain)
- ❌ NFT token CANNOT be destroyed (unless contract implements burn)
- ⚠️ Recovery depends on whether token is already on-chain

### Recovery Scenarios

#### Scenario 1: Mint failed before blockchain submission

**Problem:** Database record created with status='pending', but Stellar transaction never submitted.

**Recovery:**

```typescript
async function discardFailedMint(credentialId: string) {
  const credential = await db.query(
    `SELECT * FROM nft_credentials WHERE id = ?`,
    [credentialId]
  );

  if (credential.status === 'pending' && !credential.transaction_hash) {
    // Safe to delete — no blockchain transaction exists
    await db.delete('nft_credentials', { id: credentialId });
    return { recovered: true, message: 'Discarded pending mint' };
  }

  return { recovered: false, message: 'Cannot discard — transaction may be on-chain' };
}
```

#### Scenario 2: Mint succeeded on-chain but DB update failed

**Problem:** Transaction submitted and confirmed on Stellar, but nft_credentials.status stuck on 'pending'.

**Recovery:** Run reconciliation (see Persistence section) to update DB from Stellar.

#### Scenario 3: Contract execution failed, malformed token on-chain

**Problem:** Token exists on Stellar but has incorrect metadata (corrupted mint).

**Recovery:**

1. **Do NOT retry mint** (would create duplicate token)
2. **Mark credential as 'failed_on_chain':**
   ```sql
   UPDATE nft_credentials SET status = 'failed_on_chain',
     error_message = 'Token metadata corrupted on-chain'
   WHERE id = ?;
   ```
3. **Alert admin:** Token is permanently on-chain and cannot be destroyed without contract burn.
4. **Options:**
   - If contract supports burn: call burn to remove malformed token
   - If no burn: issue new certificate with different student/course pair
   - Escalate to senior developer

### Feature Flag: Disable Minting

**If systemic issues occur, disable all minting:**

```typescript
const NFT_MINTING_ENABLED = process.env.NFT_MINTING_ENABLED === 'true';

app.post('/admin/mint-nft', async (req, res) => {
  if (!NFT_MINTING_ENABLED) {
    return res.status(503).json({
      error: 'NFT minting is currently disabled',
    });
  }
  // ... proceed
});
```

**Set in production:**
```bash
NFT_MINTING_ENABLED=false  # Disables all mints
```

---

## Feature Flags

### Current Feature Flags

| Flag | Purpose | Default | Scope |
|------|---------|---------|-------|
| **NFT_AUTO_MINT_ENABLED** | Auto-mint on course completion | `false` | Global (affects LMS behavior) |
| **NFT_MINTING_ENABLED** | Allow any mint (admin-triggered or auto) | `true` | Global (disables minting if false) |

### Proposed Feature Flags (Testnet)

| Flag | Purpose | Default | Scope |
|------|---------|---------|-------|
| **STELLAR_NETWORK** | Select public or testnet | `public` | Global (network selection) |
| **ALLOW_TESTNET_MINTS** | Allow mints on testnet | `false` | Development/staging (testnet UI) |

**Environment configuration:**

```bash
# Production
STELLAR_NETWORK=public
NFT_MINTING_ENABLED=true
NFT_AUTO_MINT_ENABLED=false
ALLOW_TESTNET_MINTS=false

# Testnet (staging)
STELLAR_NETWORK=testnet
NFT_MINTING_ENABLED=true
NFT_AUTO_MINT_ENABLED=false
ALLOW_TESTNET_MINTS=true

# Development (fully enabled)
STELLAR_NETWORK=testnet
NFT_MINTING_ENABLED=true
NFT_AUTO_MINT_ENABLED=true
ALLOW_TESTNET_MINTS=true
```

---

## Explicit Approval Gates

### Gate 1: Testnet Contract Deployment

**Before any testnet mint:**

- [ ] Contract source code reviewed
- [ ] Contract security audit completed (or accepted risk)
- [ ] Testnet contract deployment authorized by senior developer
- [ ] Testnet contract verified on Stellar Expert
- [ ] Test account funded via Friendbot

**Approval:** Senior Developer + Project Lead

### Gate 2: Testnet Mint Execution

**Before TNVM-001 through TNVM-008 tests run:**

- [ ] Test data created (test course, test students, test cohort)
- [ ] All static tests pass (1091/1091 backend)
- [ ] Testnet environment variables configured and validated
- [ ] Test admin account has RBAC permission to mint
- [ ] Testnet mint checklist reviewed

**Approval:** QA Lead + Senior Developer

### Gate 3: Production Mint Authorization (First Mint)

**Before any production NFT mint:**

**Option A (Recommended): Testnet-First**
- [ ] All TNVM tests pass (TNVM-001 through TNVM-008)
- [ ] No regressions in backend test suite
- [ ] Production contract verified on Stellar Expert
- [ ] Production account funded (>5 XLM)
- [ ] Mint button enabled in production UI
- [ ] Post-mint verification checklist reviewed

**Option B: Production-Opportunistic**
- [ ] Stakeholder authorization signed (risk acknowledgment)
- [ ] Post-mint verification checklist prepared
- [ ] Incident response plan drafted
- [ ] Senior developer on-call during mint

**Approval (Option A):** Project Lead + CTO
**Approval (Option B):** CTO + Product Owner

### Gate 4: Blockchain Transaction Execution

**Before each production mint:**

- [ ] Admin user has RBAC permission `nft.mint`
- [ ] Student/course combination is eligible
- [ ] Confirmation modal displayed (admin clicks "Confirm Mint")
- [ ] Transaction submitted to Stellar
- [ ] Transaction hash logged
- [ ] nft_credentials record updated

**Approval:** Admin user (manual confirmation in UI)

---

## Acceptance Criteria

### Option A: Testnet-First (RECOMMENDED)

Before promoting to production, ALL of the following must be true:

**Infrastructure:**
- [ ] Testnet contract deployed and verified on Stellar Expert
- [ ] Testnet issuer account created and funded (>5 XLM)
- [ ] Environment variables configured (STELLAR_NETWORK=testnet)
- [ ] Test students and course created in testnet LMS database
- [ ] Test cohort created with eligible students

**Automated Testing:**
- [ ] TNVM-001: Testnet mint succeeds ✅ PASS
- [ ] TNVM-002: Transaction confirmed on Horizon ✅ PASS
- [ ] TNVM-003: Token metadata correct ✅ PASS
- [ ] TNVM-004: DB persistence verified ✅ PASS
- [ ] TNVM-005: Idempotency (duplicate rejected) ✅ PASS
- [ ] TNVM-006: Retry on transient failure ✅ PASS
- [ ] TNVM-007: Timeout handling ✅ PASS
- [ ] TNVM-008: No regression in existing tests ✅ PASS (1091/1091 pass)

**Integration & Security:**
- [ ] Backend test suite: 1091/1091 pass
- [ ] Frontend test suite: 206/206 pass
- [ ] E2E tests: all pass (if applicable)
- [ ] No secrets exposed in logs
- [ ] Production isolation verified (testnet config never leaks to prod)
- [ ] Error handling tested (network errors, contract failures)
- [ ] Audit log entry created for testnet mint

**Code Quality:**
- [ ] Code review approved (testnet changes)
- [ ] No type errors or lint warnings
- [ ] Documentation updated (this spec + code comments)
- [ ] Feature flag implementation verified

**Stakeholder Sign-Off:**
- [ ] QA Lead: Testnet validation passed
- [ ] Senior Developer: Code reviewed and approved
- [ ] Project Lead: Ready for production promotion
- [ ] CTO: Final approval to enable production minting

**Promotion to Production:**
- [ ] STELLAR_NETWORK=public in production config
- [ ] Production contract address correct
- [ ] Production account keypairs loaded from secrets
- [ ] Mint button enabled in production UI
- [ ] Post-mint verification checklist provided to admins

---

### Option B: Production-Opportunistic

If testnet-first is NOT selected, these criteria must be met:

**Risk Acknowledgment:**
- [ ] Explicit stakeholder authorization signed
- [ ] Risk of unvalidated SDK v16 runtime acknowledged
- [ ] First production mint is unvalidated transaction acknowledged

**Admin Readiness:**
- [ ] Post-mint verification checklist provided
- [ ] Admin trained on verification steps
- [ ] Incident response escalation path documented
- [ ] Senior developer on-call during mint

**First Mint Verification (Post-Transaction):**
- [ ] Transaction hash recorded and logged
- [ ] Transaction confirmed on Stellar Expert
- [ ] Token metadata verified on contract
- [ ] DB record verified (nft_credentials populated)
- [ ] Idempotency verified (no duplicates)
- [ ] No secrets in logs
- [ ] Audit log entry created

**Follow-Up:**
- [ ] Root cause analysis if any issues occur
- [ ] Document findings and lessons learned
- [ ] Determine if testnet deployment is needed for future mints

---

## Production-Opportunistic Alternative

### If Testnet-First is Deferred

**Status:** Mint validation is DEFERRED, not completed.

**Approach:**

1. **Wait for natural admin-triggered mint request**
   - Student completes course → eligible for NFT
   - Sponsor/admin approves → clicks "Mint Certificate"
   - No predetermined timeline

2. **Verify post-mint:**
   - Follow post-mint verification checklist (see Option B section)
   - Senior developer monitors logs
   - Transaction confirmed on Stellar Expert
   - Token metadata verified

3. **Document outcome:**
   - If successful: document runtime verification as complete
   - If failure: root cause analysis, escalate decision
   - Either way: capture findings for future reference

**Advantages:**
- No infrastructure effort
- No testnet deployment
- Minimal code changes

**Disadvantages:**
- First SDK v16 mint is unvalidated
- Higher risk if contract/SDK has issues
- No clear rollback path
- Compliance/audit trail may question lack of testnet validation

**Decision Timeline:**
- **By 2026-08-20:** Decide between Option A (testnet-first) or Option B (opportunistic)
- **If Option A:** Begin testnet deployment
- **If Option B:** Document risk acknowledgment and prepare verification checklist

---

## Conclusion

The Stellar SDK v16 upgrade (2026-08-15) successfully resolved 28 CVEs with zero code changes to `mintService.ts`. All static verification tests pass.

However, **runtime verification is BLOCKED** because:

1. NFT minting is disabled in production (NFT_AUTO_MINT_ENABLED=false)
2. No testnet deployment exists
3. Live mints are irreversible blockchain transactions

**Two mutually exclusive paths forward:**

### Option A: Testnet-First (RECOMMENDED)
- Deploy testnet contract + account
- Run TNVM-001 through TNVM-008 tests
- Validate SDK v16 runtime behavior
- Promote to production with confidence
- **Effort:** ~8-16 hours | **Risk:** Low | **Timeline:** 3-5 days

### Option B: Production-Opportunistic
- Wait for first natural admin-triggered mint
- Verify post-transaction on Stellar
- Document outcome
- **Effort:** ~2 hours (verification only) | **Risk:** High | **Timeline:** Unknown

**RECOMMENDATION:** Proceed with Option A (testnet-first) to eliminate runtime uncertainty before any production NFT mint.

**DECISION REQUIRED:** By 2026-08-20, stakeholders must select one path. Default to Option A if no decision is made.

---

## Document History

| Date | Author | Status | Notes |
|------|--------|--------|-------|
| 2026-08-15 | Superpowers | DRAFT | Initial specification of SDK v16 verification blocker |

---

**End of Specification**
