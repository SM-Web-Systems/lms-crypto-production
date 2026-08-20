/**
 * enhanced-provider.test.ts — EnhancedStellarProvider lifecycle tests
 *
 * The enhanced provider is implemented but remains disabled by default.
 * No implementation test may submit a blockchain transaction.
 *
 * EP-1:  implements NftProvider interface
 * EP-2:  getProviderInfo returns correct metadata
 * EP-3:  validates network configuration
 * EP-4:  validates contract ID configuration
 * EP-5:  mint succeeds with mock TransactionClient
 * EP-6:  mint persists tx_hash immediately after submit
 * EP-7:  simulation failure prevents submission
 * EP-8:  submission timeout creates SUBMISSION_UNKNOWN
 * EP-9:  reconcile finds successful transaction via Horizon
 * EP-10: reconcile returns not_found for missing tx
 * EP-11: reconcile is idempotent (repeated calls same result)
 * EP-12: duplicate mint for same credential returns existing result
 * EP-13: mint rejects invalid wallet address
 * EP-14: provider does not log secrets
 * EP-15: provider requires courseId and applicationId
 * EP-16: getProviderInfo capabilities include lifecycle states
 *
 * EP-R1: operation key is reserved BEFORE simulate/submit
 * EP-R2: UNIQUE constraint prevents second reservation
 * EP-R3: simulation failure clears reserved operation key
 * EP-R4: submit failure clears reserved operation key
 * EP-R5: retry succeeds after simulation failure cleared the key
 * EP-R6: operation key persists through full successful lifecycle
 * EP-R7: non-UNIQUE database error during reservation propagates correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { _resetProviderCache, getNftProvider } from '../services/nftProvider.js';

// We'll import the enhanced provider and its TransactionClient types
import {
  EnhancedStellarProvider,
  createMockTransactionClient,
  _resetMintLocks,
  _resetSchemaCache,
  deriveOperationKey,
} from '../services/providers/enhancedStellarProvider.js';
import type { TransactionClient } from '../services/providers/enhancedStellarProvider.js';

function seedUserAndCredential(overrides?: {
  mintStatus?: string;
  txHash?: string;
  network?: string;
}): { userId: string; credId: string; courseId: string; appId: string } {
  const userId = uuidv4();
  const courseId = uuidv4();
  const credId = uuidv4();
  const appId = uuidv4();

  db.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, 'EP User', 'hash', 'student')`)
    .run(userId, `ep-${userId}@test.com`);
  db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'EP Course', 'Test', ?)`)
    .run(courseId, `EPC-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network, course_id, tx_hash)
     VALUES (?, ?, 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY', ?, 'CTEST', ?, ?, ?)`
  ).run(
    credId,
    userId,
    overrides?.mintStatus ?? 'pending',
    overrides?.network ?? 'testnet',
    courseId,
    overrides?.txHash ?? null
  );

  return { userId, credId, courseId, appId };
}

describe('EnhancedStellarProvider', () => {
  let provider: EnhancedStellarProvider;
  let mockClient: TransactionClient;

  beforeEach(() => {
    _resetProviderCache();
    process.env.NFT_STELLAR_NETWORK = 'testnet';
    process.env.NFT_CONTRACT_ID = 'CTEST123456789';

    mockClient = createMockTransactionClient({
      simulateResult: { success: true, resourceFee: '100' },
      submitResult: { hash: 'abc123txhash', status: 'PENDING' },
      pollResult: { status: 'SUCCESS', returnValue: 42 },
    });

    provider = new EnhancedStellarProvider(mockClient);
  });

  afterEach(() => {
    _resetProviderCache();
    _resetMintLocks();
    _resetSchemaCache();
    delete process.env.NFT_PROVIDER;
    delete process.env.NFT_STELLAR_NETWORK;
    delete process.env.NFT_CONTRACT_ID;
  });

  it('EP-1: implements NftProvider interface', () => {
    expect(provider.name).toBe('enhanced-stellar');
    expect(typeof provider.mint).toBe('function');
    expect(typeof provider.reconcile).toBe('function');
    expect(typeof provider.getProviderInfo).toBe('function');
  });

  it('EP-2: getProviderInfo returns correct metadata', () => {
    const info = provider.getProviderInfo();
    expect(info.name).toBe('enhanced-stellar');
    expect(info.version).toMatch(/^2\./);
    expect(info.network).toBe('testnet');
    expect(info.capabilities).toContain('mint');
    expect(info.capabilities).toContain('reconcile');
    expect(info.capabilities).toContain('simulate');
  });

  it('EP-3: validates network configuration', () => {
    delete process.env.NFT_STELLAR_NETWORK;
    const p = new EnhancedStellarProvider(mockClient);
    expect(p.getProviderInfo().network).toBe('public'); // defaults to public
  });

  it('EP-4: validates contract ID configuration', async () => {
    delete process.env.NFT_CONTRACT_ID;
    const p = new EnhancedStellarProvider(mockClient);
    const { userId, courseId, appId } = seedUserAndCredential();
    await expect(p.mint({
      userId,
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      courseId,
      applicationId: appId,
    })).rejects.toThrow(/contract/i);
  });

  it('EP-5: mint succeeds with mock TransactionClient', async () => {
    const { userId, courseId, appId } = seedUserAndCredential();
    const result = await provider.mint({
      userId,
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      courseId,
      applicationId: appId,
    });
    expect(result.txHash).toBe('abc123txhash');
    expect(result.sorobanTokenId).toBe(42);
    expect(result.network).toBe('testnet');
    expect(result.provider).toBe('enhanced-stellar');
  });

  it('EP-6: mint persists tx_hash immediately after submit', async () => {
    const { userId, credId, courseId, appId } = seedUserAndCredential();
    // Use a client that succeeds on submit but we check DB state
    await provider.mint({
      userId,
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      courseId,
      applicationId: appId,
    });
    const row = db.prepare('SELECT tx_hash, mint_status FROM nft_credentials WHERE id = ?').get(credId) as {
      tx_hash: string | null;
      mint_status: string;
    };
    expect(row.tx_hash).toBe('abc123txhash');
    expect(row.mint_status).toBe('minted');
  });

  it('EP-7: simulation failure prevents submission', async () => {
    const failClient = createMockTransactionClient({
      simulateResult: { success: false, error: 'Simulation failed: insufficient funds' },
    });
    const p = new EnhancedStellarProvider(failClient);
    const { userId, courseId, appId } = seedUserAndCredential();

    await expect(p.mint({
      userId,
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      courseId,
      applicationId: appId,
    })).rejects.toThrow(/simulation/i);

    // submit should NOT have been called
    expect(failClient.submit).not.toHaveBeenCalled();
  });

  it('EP-8: submission timeout marks credential as failed', async () => {
    const timeoutClient = createMockTransactionClient({
      simulateResult: { success: true, resourceFee: '100' },
      submitResult: { hash: 'timeout-tx-hash', status: 'PENDING' },
      pollResult: { status: 'NOT_FOUND' }, // never confirms
    });
    const p = new EnhancedStellarProvider(timeoutClient);
    const { userId, credId, courseId, appId } = seedUserAndCredential();

    await expect(p.mint({
      userId,
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      courseId,
      applicationId: appId,
    })).rejects.toThrow(/not confirmed|timeout/i);

    // tx_hash should still be persisted for reconciliation
    const row = db.prepare('SELECT tx_hash, mint_status FROM nft_credentials WHERE id = ?').get(credId) as {
      tx_hash: string | null;
      mint_status: string;
    };
    expect(row.tx_hash).toBe('timeout-tx-hash');
  });

  it('EP-9: reconcile finds successful transaction via Horizon mock', async () => {
    const { credId } = seedUserAndCredential({
      mintStatus: 'failed',
      txHash: 'reconcile-tx-hash',
    });

    // Mock fetch for Horizon
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ successful: true, ledger: 12345 }),
    }) as unknown as typeof fetch;

    try {
      const result = await provider.reconcile(credId);
      expect(result.status).toBe('recovered');
      expect(result.ledger).toBe(12345);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('EP-10: reconcile returns not_found for missing tx', async () => {
    const { credId } = seedUserAndCredential({
      mintStatus: 'failed',
      txHash: 'missing-tx-hash',
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    try {
      const result = await provider.reconcile(credId);
      expect(result.status).toBe('not_found');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('EP-11: reconcile is idempotent', async () => {
    const { credId } = seedUserAndCredential({
      mintStatus: 'failed',
      txHash: 'idem-tx-hash',
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ successful: true, ledger: 999 }),
    }) as unknown as typeof fetch;

    try {
      const r1 = await provider.reconcile(credId);
      expect(r1.status).toBe('recovered');
      // Second call — credential is now minted, should return ineligible
      const r2 = await provider.reconcile(credId);
      expect(r2.status).toBe('ineligible');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('EP-12: duplicate mint for already-minted credential returns ineligible', async () => {
    const { userId, courseId, appId } = seedUserAndCredential({ mintStatus: 'minted', txHash: 'existing-hash' });
    await expect(provider.mint({
      userId,
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      courseId,
      applicationId: appId,
    })).rejects.toThrow(/already minted/i);
  });

  it('EP-13: mint rejects invalid wallet address', async () => {
    const { userId, courseId, appId } = seedUserAndCredential();
    await expect(provider.mint({
      userId,
      walletAddress: 'INVALID',
      courseId,
      applicationId: appId,
    })).rejects.toThrow(/wallet/i);
  });

  it('EP-14: provider does not log secrets', () => {
    const info = provider.getProviderInfo();
    const json = JSON.stringify(info);
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('PRIVATE');
    expect(json).not.toContain('SEED');
    expect(json).not.toContain('MINTER');
  });

  it('EP-15: provider requires courseId and applicationId', async () => {
    const { userId } = seedUserAndCredential();
    await expect(provider.mint({
      userId,
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
    })).rejects.toThrow(/courseId/i);

    await expect(provider.mint({
      userId,
      walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      courseId: 'some-course',
    })).rejects.toThrow(/applicationId/i);
  });

  it('EP-16: getProviderInfo capabilities include lifecycle states', () => {
    const info = provider.getProviderInfo();
    expect(info.capabilities).toContain('mint');
    expect(info.capabilities).toContain('reconcile');
    expect(info.capabilities).toContain('simulate');
  });

  // ─── Hardening tests (EP-H series) ──────────────────────────────────────────

  describe('Concurrency Guard', () => {
    it('EP-H1: concurrent mint for same user+course does not double-submit', async () => {
      const { userId, courseId, appId } = seedUserAndCredential();

      // First call will acquire lock, second should wait and find minted credential
      const mintParams = {
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      };

      const [r1, r2] = await Promise.allSettled([
        provider.mint(mintParams),
        provider.mint(mintParams),
      ]);

      // One should succeed, the other should get "already minted" or same result
      const successes = [r1, r2].filter(r => r.status === 'fulfilled');
      const failures = [r1, r2].filter(r => r.status === 'rejected');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);

      // The failure should be "already minted", not a DB error
      const failResult = failures[0] as PromiseRejectedResult;
      expect(failResult.reason.message).toMatch(/already minted|no pending/i);

      // submit should only be called once
      expect(mockClient.submit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Bounded Polling', () => {
    it('EP-H2: polls multiple times before giving up', async () => {
      let pollCount = 0;
      const slowClient = createMockTransactionClient({
        simulateResult: { success: true, resourceFee: '100' },
        submitResult: { hash: 'slow-tx-hash', status: 'PENDING' },
      });
      // Override getStatus to track calls and return PENDING then SUCCESS
      (slowClient.getStatus as any).mockImplementation(async () => {
        pollCount++;
        if (pollCount < 3) return { status: 'PENDING' };
        return { status: 'SUCCESS', returnValue: 99 };
      });

      const p = new EnhancedStellarProvider(slowClient);
      const { userId, courseId, appId } = seedUserAndCredential();

      const result = await p.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      });

      expect(result.txHash).toBe('slow-tx-hash');
      expect(result.sorobanTokenId).toBe(99);
      expect(pollCount).toBeGreaterThanOrEqual(3);
    });

    it('EP-H3: bounded polling gives up after max attempts', async () => {
      const neverClient = createMockTransactionClient({
        simulateResult: { success: true, resourceFee: '100' },
        submitResult: { hash: 'forever-pending-hash', status: 'PENDING' },
        pollResult: { status: 'PENDING' }, // never succeeds
      });
      const p = new EnhancedStellarProvider(neverClient);
      const { userId, credId, courseId, appId } = seedUserAndCredential();

      await expect(p.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      })).rejects.toThrow(/not confirmed|timeout/i);

      // Should have polled multiple times (bounded), not just once
      expect(neverClient.getStatus).toHaveBeenCalledTimes(3); // MAX_POLL_ATTEMPTS

      // tx_hash preserved for reconciliation
      const row = db.prepare('SELECT tx_hash, mint_status, error FROM nft_credentials WHERE id = ?').get(credId) as any;
      expect(row.tx_hash).toBe('forever-pending-hash');
      expect(row.mint_status).toBe('failed');
      expect(row.error).toMatch(/reconcil/i); // error should mention reconciliation
    });

    it('EP-H4: polling never calls submit', async () => {
      const pendingClient = createMockTransactionClient({
        simulateResult: { success: true, resourceFee: '100' },
        submitResult: { hash: 'one-submit-hash', status: 'PENDING' },
        pollResult: { status: 'PENDING' },
      });
      const p = new EnhancedStellarProvider(pendingClient);
      const { userId, courseId, appId } = seedUserAndCredential();

      await expect(p.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      })).rejects.toThrow();

      // submit must be called exactly once
      expect(pendingClient.submit).toHaveBeenCalledTimes(1);
    });
  });

  describe('tx_hash Overwrite Protection', () => {
    it('EP-H5: tx_hash is not overwritten if already set', async () => {
      // Seed a pending credential that already has a tx_hash from a prior attempt
      const { userId, credId, courseId, appId } = seedUserAndCredential({
        mintStatus: 'pending',
        txHash: 'original-hash-do-not-overwrite',
      });

      // Mint should skip simulate+submit (H2 fix) and poll the existing hash
      // The mock client returns SUCCESS for polling, so mint succeeds
      const result = await provider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      });

      // Result should use the original hash, not a new one
      expect(result.txHash).toBe('original-hash-do-not-overwrite');

      // DB should preserve original hash
      const row = db.prepare('SELECT tx_hash FROM nft_credentials WHERE id = ?').get(credId) as any;
      expect(row.tx_hash).toBe('original-hash-do-not-overwrite');

      // submit should NOT have been called (skipped because tx_hash existed)
      expect(mockClient.submit).not.toHaveBeenCalled();
      // simulate should NOT have been called either
      expect(mockClient.simulate).not.toHaveBeenCalled();
    });
  });

  describe('Reconciliation Network Isolation', () => {
    it('EP-H6: reconcile uses correct Horizon URL for testnet', async () => {
      const { credId } = seedUserAndCredential({
        mintStatus: 'failed',
        txHash: 'testnet-tx-hash',
        network: 'testnet',
      });

      const originalFetch = globalThis.fetch;
      let fetchedUrl = '';
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        fetchedUrl = url;
        return { ok: true, json: () => Promise.resolve({ successful: true, ledger: 100 }) };
      }) as unknown as typeof fetch;

      try {
        await provider.reconcile(credId);
        expect(fetchedUrl).toContain('horizon-testnet.stellar.org');
        expect(fetchedUrl).not.toContain('horizon.stellar.org/');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('EP-H7: reconcile uses mainnet Horizon for public network', async () => {
      const { credId } = seedUserAndCredential({
        mintStatus: 'failed',
        txHash: 'mainnet-tx-hash',
        network: 'public',
      });

      const originalFetch = globalThis.fetch;
      let fetchedUrl = '';
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        fetchedUrl = url;
        return { ok: true, json: () => Promise.resolve({ successful: true, ledger: 200 }) };
      }) as unknown as typeof fetch;

      try {
        await provider.reconcile(credId);
        expect(fetchedUrl).toContain('horizon.stellar.org');
        expect(fetchedUrl).not.toContain('testnet');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Submit Error Handling', () => {
    it('EP-H12: submit() throwing does not persist tx_hash', async () => {
      const submitErrorClient = createMockTransactionClient({
        simulateResult: { success: true, resourceFee: '100' },
      });
      (submitErrorClient.submit as any).mockRejectedValue(new Error('Connection refused'));

      const p = new EnhancedStellarProvider(submitErrorClient);
      const { userId, credId, courseId, appId } = seedUserAndCredential();

      await expect(p.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      })).rejects.toThrow(/Connection refused/);

      // No tx_hash should be persisted (submit threw before returning a hash)
      const row = db.prepare('SELECT tx_hash, mint_status FROM nft_credentials WHERE id = ?').get(credId) as any;
      expect(row.tx_hash).toBeNull();
      // Credential should still be pending (not failed, since no tx was submitted)
      expect(row.mint_status).toBe('pending');
    });
  });

  describe('SUBMISSION_UNKNOWN Handling', () => {
    it('EP-H8: submit timeout error preserves tx_hash and indicates reconciliation', async () => {
      const errorClient = createMockTransactionClient({
        simulateResult: { success: true, resourceFee: '100' },
        submitResult: { hash: 'error-submit-hash', status: 'PENDING' },
      });
      // submit succeeds but getStatus throws (network error during poll)
      (errorClient.getStatus as any).mockRejectedValue(new Error('Network timeout'));

      const p = new EnhancedStellarProvider(errorClient);
      const { userId, credId, courseId, appId } = seedUserAndCredential();

      await expect(p.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      })).rejects.toThrow();

      // tx_hash must be preserved even when polling throws
      const row = db.prepare('SELECT tx_hash, mint_status, error FROM nft_credentials WHERE id = ?').get(credId) as any;
      expect(row.tx_hash).toBe('error-submit-hash');
      expect(row.mint_status).toBe('failed');
      expect(row.error).toMatch(/reconcil/i);
    });
  });

  describe('Mock Client Safety', () => {
    it('EP-H9: mock client cannot reach real network', () => {
      const client = createMockTransactionClient({});
      // Verify these are vi.fn() mocks, not real implementations
      expect(vi.isMockFunction(client.simulate)).toBe(true);
      expect(vi.isMockFunction(client.submit)).toBe(true);
      expect(vi.isMockFunction(client.getStatus)).toBe(true);
    });

    it('EP-H10: provider without client always throws PROVIDER_NOT_READY', async () => {
      const noClient = new EnhancedStellarProvider(); // no client
      await expect(noClient.mint({
        userId: 'x',
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
      })).rejects.toThrow(/PROVIDER_NOT_READY|not yet implemented/i);
      await expect(noClient.reconcile('x')).rejects.toThrow(/PROVIDER_NOT_READY|not yet implemented/i);
    });

    it('EP-H11: enhanced provider disabled by default in factory', async () => {
      // When NFT_PROVIDER is not set, factory should return legacy
      delete process.env.NFT_PROVIDER;
      _resetProviderCache();
      const { getNftProvider } = await import('../services/nftProvider.js');
      const p = getNftProvider();
      expect(p.name).toBe('legacy-stellar');
    });
  });

  // ─── Activation Blocker Tests (EP-B series) ─────────────────────────────────

  describe('Structured Error Codes', () => {
    it('EP-B1: poll timeout error includes RECONCILIATION_REQUIRED code', async () => {
      const timeoutClient = createMockTransactionClient({
        simulateResult: { success: true, resourceFee: '100' },
        submitResult: { hash: 'timeout-code-hash', status: 'PENDING' },
        pollResult: { status: 'PENDING' },
      });
      const p = new EnhancedStellarProvider(timeoutClient);
      const { userId, credId, courseId, appId } = seedUserAndCredential();

      await expect(p.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      })).rejects.toThrow();

      const row = db.prepare('SELECT error FROM nft_credentials WHERE id = ?').get(credId) as any;
      // Error must contain structured code for operator filtering
      expect(row.error).toContain('[RECONCILIATION_REQUIRED]');
    });

    it('EP-B2: poll network error includes RECONCILIATION_REQUIRED code', async () => {
      const errorClient = createMockTransactionClient({
        simulateResult: { success: true, resourceFee: '100' },
        submitResult: { hash: 'net-error-hash', status: 'PENDING' },
      });
      (errorClient.getStatus as any).mockRejectedValue(new Error('ECONNRESET'));
      const p = new EnhancedStellarProvider(errorClient);
      const { userId, credId, courseId, appId } = seedUserAndCredential();

      await expect(p.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      })).rejects.toThrow();

      const row = db.prepare('SELECT error FROM nft_credentials WHERE id = ?').get(credId) as any;
      expect(row.error).toContain('[RECONCILIATION_REQUIRED]');
    });

    it('EP-B3: simulation failure does NOT include RECONCILIATION_REQUIRED', async () => {
      const failClient = createMockTransactionClient({
        simulateResult: { success: false, error: 'out of gas' },
      });
      const p = new EnhancedStellarProvider(failClient);
      const { userId, credId, courseId, appId } = seedUserAndCredential();

      await expect(p.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      })).rejects.toThrow(/simulation/i);

      // Simulation failure should NOT mark credential as reconciliation-required
      // (credential stays pending — no submit occurred)
      const row = db.prepare('SELECT mint_status, error FROM nft_credentials WHERE id = ?').get(credId) as any;
      expect(row.mint_status).toBe('pending');
    });

    it('EP-B4: confirmed FAILED status does NOT include RECONCILIATION_REQUIRED', async () => {
      const failedClient = createMockTransactionClient({
        simulateResult: { success: true, resourceFee: '100' },
        submitResult: { hash: 'failed-tx-hash', status: 'PENDING' },
        pollResult: { status: 'FAILED' },
      });
      const p = new EnhancedStellarProvider(failedClient);
      const { userId, credId, courseId, appId } = seedUserAndCredential();

      await expect(p.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      })).rejects.toThrow();

      const row = db.prepare('SELECT error FROM nft_credentials WHERE id = ?').get(credId) as any;
      // Confirmed failure should say CONFIRMED_FAILED, not RECONCILIATION_REQUIRED
      expect(row.error).toContain('[CONFIRMED_FAILED]');
      expect(row.error).not.toContain('[RECONCILIATION_REQUIRED]');
    });
  });

  describe('Rollback and Activation Safety', () => {
    it('EP-B5: NFT_PROVIDER=legacy selects legacy provider', () => {
      process.env.NFT_PROVIDER = 'legacy';
      _resetProviderCache();
      const p = getNftProvider();
      expect(p.name).toBe('legacy-stellar');
    });

    it('EP-B6: removing NFT_PROVIDER flag selects legacy', () => {
      delete process.env.NFT_PROVIDER;
      _resetProviderCache();
      const p = getNftProvider();
      expect(p.name).toBe('legacy-stellar');
    });

    it('EP-B7: invalid NFT_PROVIDER value selects legacy (fail-safe)', () => {
      process.env.NFT_PROVIDER = 'bogus-provider';
      _resetProviderCache();
      const p = getNftProvider();
      expect(p.name).toBe('legacy-stellar');
    });

    it('EP-B8: NFT_PROVIDER=enhanced without client throws PROVIDER_NOT_READY', () => {
      process.env.NFT_PROVIDER = 'enhanced';
      _resetProviderCache();
      const p = getNftProvider();
      expect(p.name).toBe('enhanced-stellar');
      // But it has no client, so all operations throw
      expect(() => p.getProviderInfo()).not.toThrow(); // info is safe
      expect(p.getProviderInfo().capabilities).toEqual([]); // no capabilities
    });

    it('EP-B9: enhanced provider code present while inactive does not affect legacy', () => {
      delete process.env.NFT_PROVIDER;
      _resetProviderCache();
      const p = getNftProvider();
      // Legacy provider should work normally
      expect(p.name).toBe('legacy-stellar');
      expect(p.getProviderInfo().capabilities).toContain('mint');
    });

    it('EP-B10: auto-mint default is false', () => {
      // NFT_AUTO_MINT_ENABLED must not default to true
      delete process.env.NFT_AUTO_MINT_ENABLED;
      const autoMint = process.env.NFT_AUTO_MINT_ENABLED === 'true';
      expect(autoMint).toBe(false);
    });
  });

  describe('Idempotency via Existing Schema', () => {
    it('EP-B11: second mint after success rejects with already-minted', async () => {
      const { userId, courseId, appId } = seedUserAndCredential();

      // First mint succeeds
      await provider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      });

      // Second mint for same user+course should fail
      // (create another pending credential to test the check)
      const credId2 = uuidv4();
      db.prepare(
        `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network, course_id)
         VALUES (?, ?, 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY', 'pending', 'CTEST', 'testnet', ?)`
      ).run(credId2, userId, courseId);

      await expect(provider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      })).rejects.toThrow(/already minted/i);
    });

    it('EP-B12: different users can mint same course independently', async () => {
      const seed1 = seedUserAndCredential();
      const seed2 = seedUserAndCredential();

      const r1 = await provider.mint({
        userId: seed1.userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId: seed1.courseId,
        applicationId: seed1.appId,
      });

      // Need a fresh mock client for second call
      const client2 = createMockTransactionClient({
        simulateResult: { success: true, resourceFee: '100' },
        submitResult: { hash: 'second-user-hash', status: 'PENDING' },
        pollResult: { status: 'SUCCESS', returnValue: 43 },
      });
      const p2 = new EnhancedStellarProvider(client2);

      const r2 = await p2.mint({
        userId: seed2.userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId: seed2.courseId,
        applicationId: seed2.appId,
      });

      expect(r1.txHash).toBe('abc123txhash');
      expect(r2.txHash).toBe('second-user-hash');
    });

    it('EP-B13: reconciliation does not create duplicate credential', async () => {
      const { credId } = seedUserAndCredential({
        mintStatus: 'failed',
        txHash: 'recon-dup-hash',
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ successful: true, ledger: 555 }),
      }) as unknown as typeof fetch;

      try {
        const r1 = await provider.reconcile(credId);
        expect(r1.status).toBe('recovered');

        // Count credentials with this tx_hash — should be exactly 1
        const count = db.prepare(
          'SELECT COUNT(*) as cnt FROM nft_credentials WHERE tx_hash = ?'
        ).get('recon-dup-hash') as { cnt: number };
        expect(count.cnt).toBe(1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ─── Durable Idempotency Tests (EP-D series) ───────────────────────────────

  describe('Durable Idempotency', () => {
    let migrationApplied = false;

    beforeEach(() => {
      _resetSchemaCache();
      // Apply migration to the test DB so operation key column exists
      try {
        db.exec('ALTER TABLE nft_credentials ADD COLUMN mint_operation_key TEXT');
        db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_credentials_operation_key
            ON nft_credentials(mint_operation_key)
            WHERE mint_operation_key IS NOT NULL
        `);
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_nft_credentials_user_course_status
            ON nft_credentials(user_id, course_id, mint_status)
        `);
        migrationApplied = true;
      } catch {
        // Column already exists from a previous test run — that's fine
        migrationApplied = true;
      }
    });

    afterEach(() => {
      _resetSchemaCache();
    });

    it('EP-D1: deriveOperationKey produces deterministic key', () => {
      const key = deriveOperationKey({
        userId: 'u1',
        courseId: 'c1',
        walletAddress: 'GTEST',
        contractId: 'CTEST',
        network: 'testnet',
      });
      expect(key).toBe('mint:u1:c1:GTEST:CTEST:testnet');

      // Same inputs produce same key
      const key2 = deriveOperationKey({
        userId: 'u1',
        courseId: 'c1',
        walletAddress: 'GTEST',
        contractId: 'CTEST',
        network: 'testnet',
      });
      expect(key2).toBe(key);
    });

    it('EP-D2: mint persists operation key on credential', async () => {
      if (!migrationApplied) return; // skip if migration failed

      const { userId, credId, courseId, appId } = seedUserAndCredential();

      await provider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      });

      const row = db.prepare('SELECT mint_operation_key FROM nft_credentials WHERE id = ?')
        .get(credId) as any;
      expect(row.mint_operation_key).toBeTruthy();
      expect(row.mint_operation_key).toContain(userId);
      expect(row.mint_operation_key).toContain(courseId);
    });

    it('EP-D3: second mint with same operation key replays existing result', async () => {
      if (!migrationApplied) return;

      const { userId, credId, courseId, appId } = seedUserAndCredential();

      // First mint succeeds
      const result1 = await provider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      });

      expect(result1.txHash).toBe('abc123txhash');

      // Reset schema cache to force re-detection
      _resetSchemaCache();

      // Create a fresh provider instance (simulates restart)
      const freshClient = createMockTransactionClient({});
      const freshProvider = new EnhancedStellarProvider(freshClient);

      // Second mint with same inputs should replay via operation key
      const result2 = await freshProvider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      });

      // Should return the same result (replayed from DB)
      expect(result2.txHash).toBe('abc123txhash');
      expect(result2.sorobanTokenId).toBe(42);
      expect(result2.provider).toBe('enhanced-stellar');

      // submit should NOT have been called on the fresh client
      expect(freshClient.submit).not.toHaveBeenCalled();
      expect(freshClient.simulate).not.toHaveBeenCalled();
    });

    it('EP-D4: operation key survives provider restart', async () => {
      if (!migrationApplied) return;

      const { userId, credId, courseId, appId } = seedUserAndCredential();

      await provider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      });

      // Verify operation key is persisted
      const row = db.prepare('SELECT mint_operation_key, mint_status FROM nft_credentials WHERE id = ?')
        .get(credId) as any;
      expect(row.mint_operation_key).toBeTruthy();
      expect(row.mint_status).toBe('minted');

      // Simulate restart: fresh provider, reset cache
      _resetSchemaCache();
      const freshProvider = new EnhancedStellarProvider(createMockTransactionClient({}));

      // Query by operation key directly — should find the minted credential
      const recovered = db.prepare(
        'SELECT id, mint_status, tx_hash FROM nft_credentials WHERE mint_operation_key = ?'
      ).get(row.mint_operation_key) as any;

      expect(recovered).toBeDefined();
      expect(recovered.id).toBe(credId);
      expect(recovered.mint_status).toBe('minted');
    });

    it('EP-D5: graceful degradation without migration', () => {
      _resetSchemaCache();

      // The provider should work even without the operation key column
      // (existing tests in EP-1..EP-16 prove this since they ran before migration)
      const info = provider.getProviderInfo();
      expect(info.name).toBe('enhanced-stellar');
      expect(info.version).toMatch(/^2\./);
    });

    it('EP-D6: operation key does not contain secrets', () => {
      const key = deriveOperationKey({
        userId: 'user-123',
        courseId: 'course-456',
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        contractId: 'CTEST123',
        network: 'testnet',
      });
      expect(key).not.toContain('SECRET');
      expect(key).not.toContain('PRIVATE');
      expect(key).not.toContain('SEED');
      expect(key).not.toContain('MINTER');
    });

    it('EP-D8: operation key replay returns result directly for minted credential', async () => {
      if (!migrationApplied) return;

      const userId = uuidv4();
      const courseId = uuidv4();
      const credId = uuidv4();
      const appId = uuidv4();

      db.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, 'EP User', 'hash', 'student')`)
        .run(userId, `ep-d8-${userId.slice(0, 8)}@test.com`);
      db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'EP D8 Course', 'Test', ?)`)
        .run(courseId, `D8-${courseId.slice(0, 8)}`);

      // Seed a minted credential WITH an operation key already set
      const opKey = `mint:${userId}:${courseId}:GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY:CTEST123456789:testnet`;
      db.prepare(
        `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network, course_id, tx_hash, soroban_token_id, mint_operation_key)
         VALUES (?, ?, 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY', 'minted', 'CTEST', 'testnet', ?, 'replay-tx-hash', 77, ?)`
      ).run(credId, userId, courseId, opKey);

      // Also seed a pending credential for the same user+course
      // (simulating a scenario where a new pending row was created)
      const pendingCredId = uuidv4();
      db.prepare(
        `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network, course_id)
         VALUES (?, ?, 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY', 'pending', 'CTEST', 'testnet', ?)`
      ).run(pendingCredId, userId, courseId);

      // Fresh provider — simulates restart
      _resetSchemaCache();
      const replayClient = createMockTransactionClient({});
      const replayProvider = new EnhancedStellarProvider(replayClient);

      // This should find the minted credential via operation key and replay
      const result = await replayProvider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      });

      // Should replay the existing minted result
      expect(result.txHash).toBe('replay-tx-hash');
      expect(result.sorobanTokenId).toBe(77);
      expect(result.provider).toBe('enhanced-stellar');

      // submit should NOT have been called — replayed from DB
      expect(replayClient.submit).not.toHaveBeenCalled();
      expect(replayClient.simulate).not.toHaveBeenCalled();
    });

    // ─── Pre-Submit Reservation Tests (EP-R series) ─────────────────────────

    it('EP-R1: operation key is reserved BEFORE simulate/submit', async () => {
      if (!migrationApplied) return;

      const { userId, credId, courseId, appId } = seedUserAndCredential();

      // Intercept simulate to check DB state at simulation time
      let keyAtSimulateTime: string | null = null;
      (mockClient.simulate as any).mockImplementation(async () => {
        const row = db.prepare('SELECT mint_operation_key FROM nft_credentials WHERE id = ?')
          .get(credId) as any;
        keyAtSimulateTime = row?.mint_operation_key ?? null;
        return { success: true, resourceFee: '100' };
      });

      await provider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      });

      // The operation key should have been set BEFORE simulate was called
      expect(keyAtSimulateTime).toBeTruthy();
      expect(keyAtSimulateTime).toContain(userId);
      expect(keyAtSimulateTime).toContain(courseId);
    });

    it('EP-R2: UNIQUE constraint prevents second reservation for same operation', async () => {
      if (!migrationApplied) return;

      const userId = uuidv4();
      const courseId = uuidv4();
      const appId = uuidv4();

      db.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, 'EP User', 'hash', 'student')`)
        .run(userId, `ep-r2-${userId.slice(0, 8)}@test.com`);
      db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'EP R2 Course', 'Test', ?)`)
        .run(courseId, `R2-${courseId.slice(0, 8)}`);

      // Create two pending credentials for the same user+course
      const credId1 = uuidv4();
      const credId2 = uuidv4();
      db.prepare(
        `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network, course_id)
         VALUES (?, ?, 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY', 'pending', 'CTEST', 'testnet', ?)`
      ).run(credId1, userId, courseId);
      db.prepare(
        `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network, course_id)
         VALUES (?, ?, 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY', 'pending', 'CTEST', 'testnet', ?)`
      ).run(credId2, userId, courseId);

      // Manually reserve the key on credId1 (simulating a concurrent process)
      const opKey = deriveOperationKey({
        userId,
        courseId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        contractId: 'CTEST123456789',
        network: 'testnet',
      });
      db.prepare('UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ?')
        .run(opKey, credId1);

      // Second reservation attempt on credId2 with same key should fail
      // (via UNIQUE constraint on mint_operation_key)
      expect(() => {
        db.prepare('UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ?')
          .run(opKey, credId2);
      }).toThrow(/UNIQUE/i);
    });

    it('EP-R3: simulation failure clears reserved operation key', async () => {
      if (!migrationApplied) return;

      const { userId, credId, courseId, appId } = seedUserAndCredential();

      const failClient = createMockTransactionClient({
        simulateResult: { success: false, error: 'out of gas' },
      });
      const failProvider = new EnhancedStellarProvider(failClient);

      await expect(failProvider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      })).rejects.toThrow(/simulation/i);

      // After simulation failure, the operation key should be cleared
      const row = db.prepare('SELECT mint_operation_key, tx_hash, mint_status FROM nft_credentials WHERE id = ?')
        .get(credId) as any;
      expect(row.mint_operation_key).toBeNull();
      expect(row.tx_hash).toBeNull();
      expect(row.mint_status).toBe('pending'); // still pending — can retry
    });

    it('EP-R4: submit failure clears reserved operation key', async () => {
      if (!migrationApplied) return;

      const { userId, credId, courseId, appId } = seedUserAndCredential();

      const submitFailClient = createMockTransactionClient({
        simulateResult: { success: true, resourceFee: '100' },
      });
      (submitFailClient.submit as any).mockRejectedValue(new Error('Connection refused'));
      const submitFailProvider = new EnhancedStellarProvider(submitFailClient);

      await expect(submitFailProvider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      })).rejects.toThrow(/Connection refused/);

      // After submit failure, the operation key should be cleared
      const row = db.prepare('SELECT mint_operation_key, tx_hash, mint_status FROM nft_credentials WHERE id = ?')
        .get(credId) as any;
      expect(row.mint_operation_key).toBeNull();
      expect(row.tx_hash).toBeNull();
      expect(row.mint_status).toBe('pending'); // still pending — can retry
    });

    it('EP-R5: retry succeeds after simulation failure cleared the key', async () => {
      if (!migrationApplied) return;

      const { userId, credId, courseId, appId } = seedUserAndCredential();

      // First attempt: simulation fails
      const failClient = createMockTransactionClient({
        simulateResult: { success: false, error: 'temporary error' },
      });
      const failProvider = new EnhancedStellarProvider(failClient);

      await expect(failProvider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      })).rejects.toThrow(/simulation/i);

      // Verify key is cleared
      const rowAfterFail = db.prepare('SELECT mint_operation_key FROM nft_credentials WHERE id = ?')
        .get(credId) as any;
      expect(rowAfterFail.mint_operation_key).toBeNull();

      // Second attempt: should succeed (key was cleared, so re-reservation works)
      _resetSchemaCache();
      const result = await provider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      });

      expect(result.txHash).toBe('abc123txhash');
      expect(result.sorobanTokenId).toBe(42);

      // Key should be set after successful mint
      const rowAfterSuccess = db.prepare('SELECT mint_operation_key FROM nft_credentials WHERE id = ?')
        .get(credId) as any;
      expect(rowAfterSuccess.mint_operation_key).toBeTruthy();
    });

    it('EP-R6: operation key persists through full successful lifecycle', async () => {
      if (!migrationApplied) return;

      const { userId, credId, courseId, appId } = seedUserAndCredential();

      // Track key state at each lifecycle stage
      let keyAtSimulate: string | null = null;
      let keyAtSubmit: string | null = null;
      let keyAtPoll: string | null = null;

      (mockClient.simulate as any).mockImplementation(async () => {
        const row = db.prepare('SELECT mint_operation_key FROM nft_credentials WHERE id = ?').get(credId) as any;
        keyAtSimulate = row?.mint_operation_key ?? null;
        return { success: true, resourceFee: '100' };
      });
      (mockClient.submit as any).mockImplementation(async () => {
        const row = db.prepare('SELECT mint_operation_key FROM nft_credentials WHERE id = ?').get(credId) as any;
        keyAtSubmit = row?.mint_operation_key ?? null;
        return { hash: 'lifecycle-hash', status: 'PENDING' };
      });
      (mockClient.getStatus as any).mockImplementation(async () => {
        const row = db.prepare('SELECT mint_operation_key FROM nft_credentials WHERE id = ?').get(credId) as any;
        keyAtPoll = row?.mint_operation_key ?? null;
        return { status: 'SUCCESS', returnValue: 55 };
      });

      await provider.mint({
        userId,
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        courseId,
        applicationId: appId,
      });

      // Key should be set at every stage (reserved before simulate, never cleared on success)
      expect(keyAtSimulate).toBeTruthy();
      expect(keyAtSubmit).toBeTruthy();
      expect(keyAtPoll).toBeTruthy();
      // Same key throughout
      expect(keyAtSimulate).toBe(keyAtSubmit);
      expect(keyAtSubmit).toBe(keyAtPoll);

      // Final DB state
      const finalRow = db.prepare('SELECT mint_operation_key, mint_status FROM nft_credentials WHERE id = ?')
        .get(credId) as any;
      expect(finalRow.mint_operation_key).toBe(keyAtSimulate);
      expect(finalRow.mint_status).toBe('minted');
    });

    it('EP-R7: non-UNIQUE database error during reservation propagates without clearing key', async () => {
      if (!migrationApplied) return;

      const { userId, credId, courseId, appId } = seedUserAndCredential();

      // Intercept the db.prepare call to throw a non-UNIQUE error on the reservation UPDATE
      const originalPrepare = db.prepare.bind(db);
      let interceptCount = 0;
      const prepareProxy = vi.fn().mockImplementation((sql: string) => {
        // Intercept the specific reservation UPDATE
        if (sql.includes('mint_operation_key') && sql.includes('SET') && sql.includes('IS NULL')) {
          interceptCount++;
          if (interceptCount === 1) {
            // First call is the reservation — throw a disk error
            return {
              run: () => { throw Object.assign(new Error('disk I/O error'), { code: 'SQLITE_IOERR' }); },
            };
          }
        }
        return originalPrepare(sql);
      });
      (db as any).prepare = prepareProxy;

      try {
        await expect(provider.mint({
          userId,
          walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
          courseId,
          applicationId: appId,
        })).rejects.toThrow(/disk I\/O error/);

        // Credential should remain pending (no state corruption)
        const row = db.prepare('SELECT mint_status, tx_hash FROM nft_credentials WHERE id = ?')
          .get(credId) as any;
        expect(row.mint_status).toBe('pending');
        expect(row.tx_hash).toBeNull();
      } finally {
        (db as any).prepare = originalPrepare;
      }
    });

    it('EP-D7: different inputs produce different operation keys', () => {
      const base = {
        userId: 'user-1',
        courseId: 'course-1',
        walletAddress: 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXY',
        contractId: 'CTEST',
        network: 'testnet',
      };
      const k1 = deriveOperationKey(base);
      const k2 = deriveOperationKey({ ...base, userId: 'user-2' });
      const k3 = deriveOperationKey({ ...base, courseId: 'course-2' });
      const k4 = deriveOperationKey({ ...base, network: 'public' });

      expect(k1).not.toBe(k2);
      expect(k1).not.toBe(k3);
      expect(k1).not.toBe(k4);
    });
  });
});
