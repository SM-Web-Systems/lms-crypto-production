/**
 * enhancedStellarProvider.ts — Enhanced NFT provider with explicit transaction lifecycle.
 *
 * Disabled by default (NFT_PROVIDER=legacy). When no TransactionClient is injected,
 * all methods throw PROVIDER_NOT_READY — preserving backward compatibility with the
 * factory in nftProvider.ts.
 *
 * When a TransactionClient is injected (e.g. in tests or future activation), the
 * provider supports: simulate → submit → persist tx_hash → poll → finalize.
 *
 * No implementation may submit a real blockchain transaction in tests.
 */

import { db } from '../../config/database.js';
import type { NftProvider, MintParams, MintResult, ReconcileResult, ProviderInfo } from '../nftProvider.js';

// ─── TransactionClient interface ─────────────────────────────────────────────

export interface SimulateResult {
  success: boolean;
  resourceFee?: string;
  error?: string;
}

export interface SubmitResult {
  hash: string;
  status: string;
}

export interface PollResult {
  status: string;
  returnValue?: number;
}

export interface TransactionClient {
  simulate: (params: { walletAddress: string; contractId: string; network: string }) => Promise<SimulateResult>;
  submit: (params: { walletAddress: string; contractId: string; network: string }) => Promise<SubmitResult>;
  getStatus: (hash: string) => Promise<PollResult>;
}

// ─── Mock factory (test-only) ────────────────────────────────────────────────

/**
 * Creates a mock TransactionClient for testing. Only call from vitest tests
 * (globals: true required so `vi` is available on globalThis).
 * Never called in production — the function is only imported by test files.
 */
export function createMockTransactionClient(config: {
  simulateResult?: SimulateResult;
  submitResult?: SubmitResult;
  pollResult?: PollResult;
}): TransactionClient {
  // Access vi from vitest globals (globals: true in vitest.config.ts)
  const _vi = (globalThis as any).vi;
  if (!_vi) {
    throw new Error('createMockTransactionClient requires vitest globals (vi)');
  }
  return {
    simulate: _vi.fn().mockResolvedValue(config.simulateResult ?? { success: true, resourceFee: '100' }),
    submit: _vi.fn().mockResolvedValue(config.submitResult ?? { hash: 'mock-hash', status: 'PENDING' }),
    getStatus: _vi.fn().mockResolvedValue(config.pollResult ?? { status: 'SUCCESS', returnValue: 1 }),
  };
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class ProviderNotReadyError extends Error {
  readonly code = 'PROVIDER_NOT_READY';
  constructor(method: string) {
    super(`EnhancedStellarProvider.${method}() is not yet implemented. Set NFT_PROVIDER=legacy to use the existing provider.`);
    this.name = 'ProviderNotReadyError';
  }
}

// ─── Horizon helpers ─────────────────────────────────────────────────────────

const HORIZON_URLS: Record<string, string> = {
  public: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
};

function getHorizonUrl(network: string): string {
  return HORIZON_URLS[network] || HORIZON_URLS.public;
}

// ─── Polling configuration ───────────────────────────────────────────────────

const MAX_POLL_ATTEMPTS = 3;
const POLL_DELAYS_MS = process.env.NODE_ENV === 'test' ? [10, 20, 40] : [1000, 2000, 4000];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── In-process async mutex ──────────────────────────────────────────────────
// Proper chaining mutex keyed on `mint:${userId}:${courseId}`.
// Each new caller awaits the TAIL of the chain, ensuring serialization.
// Sufficient for single-process SQLite. NOT a distributed lock.

const _mintLocks = new Map<string, Promise<void>>();

/** Reset lock state — for tests only. */
export function _resetMintLocks(): void {
  _mintLocks.clear();
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class EnhancedStellarProvider implements NftProvider {
  readonly name = 'enhanced-stellar';
  readonly version = '2.2.0';

  private readonly client: TransactionClient | null;

  constructor(client?: TransactionClient) {
    this.client = client ?? null;
  }

  async mint(params: MintParams): Promise<MintResult> {
    if (!this.client) throw new ProviderNotReadyError('mint');

    // Validate required fields
    if (!params.courseId) {
      throw new Error('Enhanced provider requires courseId');
    }
    if (!params.applicationId) {
      throw new Error('Enhanced provider requires applicationId');
    }

    // Validate wallet address (must start with G and be reasonably long)
    if (!params.walletAddress || params.walletAddress.length < 10 || !params.walletAddress.startsWith('G')) {
      throw new Error('Invalid wallet address');
    }

    // Async mutex: chain on the existing lock so callers serialize properly.
    // Each caller awaits the previous promise before proceeding, preventing
    // the TOCTOU race where two callers both read the Map before either sets it.
    const lockKey = `mint:${params.userId}:${params.courseId}`;
    const prev = _mintLocks.get(lockKey) ?? Promise.resolve();

    let releaseLock: () => void;
    const gate = new Promise<void>(resolve => { releaseLock = resolve; });
    // Immediately register our gate so the next caller chains on us
    _mintLocks.set(lockKey, gate);

    try {
      // Wait for any previous operation on this key to finish
      await prev;

      // After waiting, re-check DB state (previous call may have succeeded or failed)
      const nowMinted = db.prepare(
        'SELECT id FROM nft_credentials WHERE user_id = ? AND course_id = ? AND mint_status = ?'
      ).get(params.userId, params.courseId, 'minted');
      if (nowMinted) {
        throw new Error('Credential already minted for this user and course');
      }
      const stillPending = db.prepare(
        'SELECT id FROM nft_credentials WHERE user_id = ? AND course_id = ? AND mint_status = ?'
      ).get(params.userId, params.courseId, 'pending');
      if (!stillPending) {
        throw new Error('No pending credential found for this user and course');
      }

      return await this._doMint(params);
    } finally {
      // Release the lock so the next waiter can proceed
      releaseLock!();
      // Clean up if we're the last in the chain
      if (_mintLocks.get(lockKey) === gate) {
        _mintLocks.delete(lockKey);
      }
    }
  }

  private async _doMint(params: MintParams): Promise<MintResult> {
    const contractId = process.env.NFT_CONTRACT_ID;
    if (!contractId) {
      throw new Error('NFT_CONTRACT_ID not configured — contract required');
    }

    const network = process.env.NFT_STELLAR_NETWORK || 'public';

    // Check for already-minted credential
    const existing = db.prepare(
      'SELECT id, mint_status, tx_hash FROM nft_credentials WHERE user_id = ? AND course_id = ? AND mint_status = ?'
    ).get(params.userId, params.courseId!, 'minted') as { id: string; mint_status: string; tx_hash: string | null } | undefined;

    if (existing) {
      throw new Error('Credential already minted for this user and course');
    }

    // Find the pending credential
    const cred = db.prepare(
      'SELECT id, tx_hash FROM nft_credentials WHERE user_id = ? AND course_id = ? AND mint_status = ?'
    ).get(params.userId, params.courseId!, 'pending') as { id: string; tx_hash: string | null } | undefined;

    if (!cred) {
      throw new Error('No pending credential found for this user and course');
    }

    // If a previous attempt left a tx_hash, skip simulate+submit and go
    // directly to polling. This prevents double-submission (review finding H2).
    let txHash: string;

    if (cred.tx_hash) {
      // Previous attempt left a hash — poll it instead of re-submitting
      txHash = cred.tx_hash;
    } else {
      // Step 1: Simulate
      const simResult = await this.client!.simulate({
        walletAddress: params.walletAddress,
        contractId,
        network,
      });

      if (!simResult.success) {
        throw new Error(`Simulation failed: ${simResult.error || 'unknown error'}`);
      }

      // Step 2: Submit (exactly once)
      const submitResult = await this.client!.submit({
        walletAddress: params.walletAddress,
        contractId,
        network,
      });

      txHash = submitResult.hash;

      // Step 3: Persist tx_hash immediately after submit (early persistence)
      db.prepare(
        'UPDATE nft_credentials SET tx_hash = ?, updated_at = datetime(\'now\') WHERE id = ? AND tx_hash IS NULL'
      ).run(txHash, cred.id);
    }

    // Step 4: Bounded polling for confirmation
    let pollResult: PollResult | null = null;
    try {
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        if (attempt > 0) {
          await sleep(POLL_DELAYS_MS[attempt] ?? POLL_DELAYS_MS[POLL_DELAYS_MS.length - 1]);
        }
        pollResult = await this.client!.getStatus(txHash);
        if (pollResult.status === 'SUCCESS' || pollResult.status === 'FAILED') {
          break;
        }
      }
    } catch (pollError) {
      // Poll threw (network error) — status genuinely unknown, needs reconciliation
      db.prepare(
        'UPDATE nft_credentials SET mint_status = \'failed\', error = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).run('[RECONCILIATION_REQUIRED] Transaction submitted but status unknown — poll error', cred.id);
      throw new Error('Transaction not confirmed — timeout or rejection');
    }

    if (!pollResult || pollResult.status === 'FAILED') {
      // Poll confirmed the transaction failed on-chain — definitive failure
      db.prepare(
        'UPDATE nft_credentials SET mint_status = \'failed\', error = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).run('[CONFIRMED_FAILED] Transaction failed on-chain', cred.id);
      throw new Error('Transaction not confirmed — timeout or rejection');
    }

    if (pollResult.status !== 'SUCCESS') {
      // Poll exhausted without definitive answer — needs reconciliation
      db.prepare(
        'UPDATE nft_credentials SET mint_status = \'failed\', error = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).run('[RECONCILIATION_REQUIRED] Transaction submitted but status unknown — poll exhausted', cred.id);
      throw new Error('Transaction not confirmed — timeout or rejection');
    }

    // Step 5: Finalize — mark as minted
    db.prepare(
      'UPDATE nft_credentials SET mint_status = \'minted\', soroban_token_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(pollResult.returnValue ?? null, cred.id);

    return {
      txHash,
      sorobanTokenId: pollResult.returnValue ?? null,
      network,
      provider: this.name,
    };
  }

  async reconcile(credentialId: string): Promise<ReconcileResult> {
    if (!this.client) throw new ProviderNotReadyError('reconcile');

    // Look up credential
    const cred = db.prepare(
      'SELECT id, mint_status, tx_hash, network FROM nft_credentials WHERE id = ?'
    ).get(credentialId) as { id: string; mint_status: string; tx_hash: string | null; network: string | null } | undefined;

    if (!cred) {
      return { status: 'not_found' };
    }

    // Only reconcile failed credentials
    if (cred.mint_status !== 'failed') {
      return { status: 'ineligible', reason: `Status is ${cred.mint_status}, not failed` };
    }

    if (!cred.tx_hash) {
      return { status: 'not_found', reason: 'No tx_hash stored' };
    }

    // Check Horizon — uses credential's stored network for correct URL
    const network = cred.network || 'public';
    const horizonUrl = getHorizonUrl(network);
    const url = `${horizonUrl}/transactions/${cred.tx_hash}`;

    const response = await fetch(url);

    if (!response.ok) {
      return { status: 'not_found' };
    }

    const txData = await response.json() as { successful: boolean; ledger: number };

    if (!txData.successful) {
      return { status: 'chain_failed' };
    }

    // Transaction succeeded on-chain — update DB
    db.prepare(
      'UPDATE nft_credentials SET mint_status = \'minted\', error = NULL, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(credentialId);

    return {
      status: 'recovered',
      ledger: txData.ledger,
      txHash: cred.tx_hash,
    };
  }

  getProviderInfo(): ProviderInfo {
    const network = process.env.NFT_STELLAR_NETWORK || 'public';
    return {
      name: this.name,
      version: this.version,
      network,
      capabilities: this.client ? ['mint', 'reconcile', 'simulate'] : [],
    };
  }
}
