/**
 * enhancedStellarProvider.ts — Enhanced NFT provider with explicit transaction lifecycle.
 *
 * Disabled by default (NFT_PROVIDER=legacy). When no TransactionClient is injected,
 * all methods throw PROVIDER_NOT_READY — preserving backward compatibility with the
 * factory in nftProvider.ts.
 *
 * When a TransactionClient is injected (e.g. in tests or future activation), the
 * provider supports: reserve key → simulate → submit → persist tx_hash → poll → finalize.
 *
 * Durable idempotency (mint_operation_key) is active when the migration has been
 * applied. Before migration, the provider gracefully degrades to process-local
 * mutex only. The operation key is derived deterministically from business inputs
 * (userId, courseId, walletAddress, contractId, network) — no random component.
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

// ─── Operation key derivation ────────────────────────────────────────────────

/**
 * Derives a deterministic operation key from business inputs.
 * Used for durable idempotency — same inputs always produce the same key.
 * Does not depend on tx_hash, random values, or secrets.
 */
export function deriveOperationKey(params: {
  userId: string;
  courseId: string;
  walletAddress: string;
  contractId: string;
  network: string;
}): string {
  return `mint:${params.userId}:${params.courseId}:${params.walletAddress}:${params.contractId}:${params.network}`;
}

// ─── Schema detection ───────────────────────────────────────────────────────

let _operationKeyColumnExists: boolean | null = null;

/** Check if mint_operation_key column exists (migration applied). Cached per process. */
function hasOperationKeyColumn(database: { prepare: (sql: string) => any }): boolean {
  if (_operationKeyColumnExists !== null) return _operationKeyColumnExists;
  try {
    const cols = database.prepare('PRAGMA table_info(nft_credentials)').all() as { name: string }[];
    _operationKeyColumnExists = cols.some(c => c.name === 'mint_operation_key');
  } catch {
    _operationKeyColumnExists = false;
  }
  return _operationKeyColumnExists;
}

/** Reset schema detection cache — for tests only. */
export function _resetSchemaCache(): void {
  _operationKeyColumnExists = null;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class EnhancedStellarProvider implements NftProvider {
  readonly name = 'enhanced-stellar';
  readonly version = '2.4.0';

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

    // ── Durable idempotency pre-check (before mutex) ────────────────────
    // If the mint_operation_key column exists, check for an already-completed
    // operation. This is a safe read-only check that enables replay without
    // acquiring the mutex. If found minted, return immediately.
    const contractId = process.env.NFT_CONTRACT_ID;
    const network = process.env.NFT_STELLAR_NETWORK || 'public';

    if (contractId && hasOperationKeyColumn(db)) {
      const opKey = deriveOperationKey({
        userId: params.userId,
        courseId: params.courseId!,
        walletAddress: params.walletAddress,
        contractId,
        network,
      });

      const existingOp = db.prepare(
        'SELECT id, mint_status, tx_hash, soroban_token_id FROM nft_credentials WHERE mint_operation_key = ?'
      ).get(opKey) as { id: string; mint_status: string; tx_hash: string | null; soroban_token_id: number | null } | undefined;

      if (existingOp && existingOp.mint_status === 'minted') {
        // Already completed — replay the result without acquiring mutex
        return {
          txHash: existingOp.tx_hash!,
          sorobanTokenId: existingOp.soroban_token_id,
          network,
          provider: this.name,
        };
      }
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

    // Determine if durable idempotency is available (migration applied)
    const useOperationKey = hasOperationKeyColumn(db);
    let operationKey: string | null = null;

    if (useOperationKey) {
      operationKey = deriveOperationKey({
        userId: params.userId,
        courseId: params.courseId!,
        walletAddress: params.walletAddress,
        contractId,
        network,
      });
    }

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
      // ── Pre-submit reservation (MP3 hardening) ────────────────────────
      // Reserve the operation key BEFORE simulate/submit. The UNIQUE index
      // on mint_operation_key is the cross-process guard — if two processes
      // race, only one reservation succeeds. On simulation or submit failure,
      // the key is cleared (WHERE tx_hash IS NULL) so retries are allowed.
      if (useOperationKey && operationKey) {
        try {
          const reserveResult = db.prepare(
            'UPDATE nft_credentials SET mint_operation_key = ?, updated_at = datetime(\'now\') WHERE id = ? AND mint_operation_key IS NULL'
          ).run(operationKey, cred.id);
          if (reserveResult.changes === 0) {
            // Row already has a key — check if it's ours or someone else's
            const existingKey = db.prepare(
              'SELECT mint_operation_key FROM nft_credentials WHERE id = ?'
            ).get(cred.id) as { mint_operation_key: string | null } | undefined;
            if (existingKey?.mint_operation_key !== operationKey) {
              throw new Error('Duplicate mint operation — operation key already exists');
            }
            // Same key already set (idempotent re-reservation) — continue
          }
        } catch (e: any) {
          if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.message?.includes('UNIQUE constraint')) {
            throw new Error('Duplicate mint operation — operation key already exists');
          }
          throw e;
        }
      }

      // Step 1: Simulate
      let simResult;
      try {
        simResult = await this.client!.simulate({
          walletAddress: params.walletAddress,
          contractId,
          network,
        });
      } catch (simError) {
        // Simulation threw — clear reservation so retry is possible
        if (useOperationKey && operationKey) {
          db.prepare(
            'UPDATE nft_credentials SET mint_operation_key = NULL, updated_at = datetime(\'now\') WHERE id = ? AND tx_hash IS NULL'
          ).run(cred.id);
        }
        throw simError;
      }

      if (!simResult.success) {
        // Simulation returned failure — clear reservation so retry is possible
        if (useOperationKey && operationKey) {
          db.prepare(
            'UPDATE nft_credentials SET mint_operation_key = NULL, updated_at = datetime(\'now\') WHERE id = ? AND tx_hash IS NULL'
          ).run(cred.id);
        }
        throw new Error(`Simulation failed: ${simResult.error || 'unknown error'}`);
      }

      // Step 2: Submit (exactly once)
      let submitResult;
      try {
        submitResult = await this.client!.submit({
          walletAddress: params.walletAddress,
          contractId,
          network,
        });
      } catch (submitError) {
        // Submit threw — clear reservation so retry is possible
        if (useOperationKey && operationKey) {
          db.prepare(
            'UPDATE nft_credentials SET mint_operation_key = NULL, updated_at = datetime(\'now\') WHERE id = ? AND tx_hash IS NULL'
          ).run(cred.id);
        }
        throw submitError;
      }

      txHash = submitResult.hash;

      // Step 3: Persist tx_hash immediately after submit (early persistence)
      // Operation key was already reserved — now anchor it with tx_hash
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
