/**
 * mintService.ts — Soroban NFT credential minting (server-side only)
 *
 * Security: NFT_MINTER_SECRET is read from environment and NEVER logged, returned, or exposed.
 * All env vars are read at call time so the service can be configured without reloading.
 *
 * Activation: set NFT_MINTER_SECRET, NFT_CONTRACT_ID, and NFT_TRIGGER_QUIZ_IDS in .env
 * then rebuild and restart lms-api. Until all three are set, minting is a no-op.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { v4 as uuidv4 } from 'uuid';
import { db, queryOne, execute } from '../config/database.js';
import logger from '../utils/logger.js';

const VALID_NETWORKS = ['public', 'testnet'] as const;
type StellarNetwork = (typeof VALID_NETWORKS)[number];

const NETWORK_DEFAULTS: Record<StellarNetwork, { passphrase: string; rpcUrl: string }> = {
  public: {
    passphrase: 'Public Global Stellar Network ; September 2015',
    rpcUrl: 'https://mainnet.sorobanrpc.com',
  },
  testnet: {
    passphrase: 'Test SDF Network ; September 2015',
    rpcUrl: 'https://soroban-testnet.stellar.org',
  },
};

/**
 * Validates and returns NFT network configuration.
 * Fails closed: missing or invalid NFT_STELLAR_NETWORK throws.
 * Never exposes NFT_MINTER_SECRET in error messages.
 */
export function getNftNetworkConfig(): {
  network: StellarNetwork;
  networkPassphrase: string;
  rpcUrl: string;
  contractId: string;
  minterSecret: string;
} {
  const rawNetwork = process.env.NFT_STELLAR_NETWORK;
  if (!rawNetwork || !(VALID_NETWORKS as readonly string[]).includes(rawNetwork)) {
    throw new Error(
      `NFT_STELLAR_NETWORK must be one of: ${VALID_NETWORKS.join(', ')}. Got: ${JSON.stringify(rawNetwork ?? '')}`
    );
  }
  const network = rawNetwork as StellarNetwork;

  const minterSecret = process.env.NFT_MINTER_SECRET;
  if (!minterSecret) {
    throw new Error('NFT_MINTER_SECRET is not configured');
  }

  const contractId = process.env.NFT_CONTRACT_ID;
  if (!contractId) {
    throw new Error('NFT_CONTRACT_ID is not configured');
  }

  const defaults = NETWORK_DEFAULTS[network];
  const rpcUrl = process.env.NFT_SOROBAN_RPC_URL || defaults.rpcUrl;

  return {
    network,
    networkPassphrase: defaults.passphrase,
    rpcUrl,
    contractId,
    minterSecret,
  };
}

/**
 * Returns true if this quiz ID should trigger an NFT credential mint on pass.
 * Reads NFT_TRIGGER_QUIZ_IDS from env at call time so it can be overridden in tests.
 */
export function isTriggerQuiz(quizId: string): boolean {
  const raw = process.env.NFT_TRIGGER_QUIZ_IDS ?? '';
  if (!raw) return false;
  const ids = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  return ids.has(quizId);
}

interface NftCredentialRow {
  id: string;
  mint_status: string;
}

/**
 * Fire-and-forget: mint an NFT credential for a QUIZ completion (legacy path).
 *
 * Called from quizzesController only when NFT_AUTO_MINT_ENABLED=true.
 * Contract ABI (verified 2026-07-19): mint(to: Address, caller: Address)
 *
 * Idempotent: if already minted for this (user, quiz) pair, returns immediately.
 * On failure: persists error to nft_credentials.error, logs to server console.
 * Never throws — all paths are caught internally.
 */
export async function mintCredentialForQuiz(params: {
  userId: string;
  quizId: string;
  walletAddress: string;
}): Promise<void> {
  const { userId, quizId, walletAddress } = params;

  // Guard: network, secret, and contract ID must all be configured
  let nftConfig: ReturnType<typeof getNftNetworkConfig>;
  try {
    nftConfig = getNftNetworkConfig();
  } catch {
    logger.info({ module: 'mint' }, 'NFT configuration incomplete — mint skipped');
    return;
  }

  // LMS-MINT-J2-003: validate Stellar address before RPC call
  if (!StellarSdk.StrKey.isValidEd25519PublicKey(walletAddress)) {
    logger.error({ module: 'mint', walletAddress }, 'Invalid Stellar wallet address');
    return;
  }

  try {
    // FIND-011a: Atomic idempotency check + INSERT inside a transaction
    // to prevent TOCTOU race causing duplicate on-chain mints.
    const ensureCredential = db.transaction(() => {
      const existing = queryOne<NftCredentialRow>(
        'SELECT id, mint_status FROM nft_credentials WHERE user_id = ? AND quiz_id = ?',
        [userId, quizId]
      );

      if (existing?.mint_status === 'minted') {
        return { credId: existing.id, alreadyMinted: true };
      }

      const credId = existing?.id ?? uuidv4();

      if (!existing) {
        execute(
          `INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
          [credId, userId, quizId, walletAddress, nftConfig.contractId, nftConfig.network]
        );
      } else {
        execute(
          `UPDATE nft_credentials SET mint_status = 'pending', error = NULL, updated_at = datetime('now')
           WHERE id = ?`,
          [credId]
        );
      }

      return { credId, alreadyMinted: false };
    });

    const { credId, alreadyMinted } = ensureCredential();

    if (alreadyMinted) {
      logger.info({ module: 'mint', userId, quizId }, 'Already minted');
      return;
    }

    logger.info({ module: 'mint', userId, quizId, walletAddress }, 'Attempting mint');

    const server = new StellarSdk.rpc.Server(nftConfig.rpcUrl);
    const minterKeypair = StellarSdk.Keypair.fromSecret(nftConfig.minterSecret);
    const account = await server.getAccount(minterKeypair.publicKey());
    const contract = new StellarSdk.Contract(nftConfig.contractId);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '1000000', // 0.1 XLM max fee for Soroban
      networkPassphrase: nftConfig.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'mint',
          new StellarSdk.Address(walletAddress).toScVal(),
          new StellarSdk.Address(minterKeypair.publicKey()).toScVal()
        )
      )
      .setTimeout(120)
      .build();

    // Simulate first — validates ABI and gets resource footprint
    const simulated = await server.simulateTransaction(tx);
    if (!StellarSdk.rpc.Api.isSimulationSuccess(simulated)) {
      const simErr = simulated as StellarSdk.rpc.Api.SimulateTransactionErrorResponse;
      throw new Error(`Simulation failed: ${String(simErr.error ?? 'unknown')}`);
    }

    // Assemble with resource fees from simulation
    const prepared = StellarSdk.rpc.assembleTransaction(tx, simulated).build();
    prepared.sign(minterKeypair);

    const sendResult = await server.sendTransaction(prepared);
    if (sendResult.status === 'ERROR') {
      throw new Error(`Send failed: ${JSON.stringify(sendResult.errorResult)}`);
    }

    // Persist tx_hash immediately for reconciliation if poll times out
    const txHash = sendResult.hash;
    execute(
      `UPDATE nft_credentials SET tx_hash = ?, updated_at = datetime('now') WHERE id = ?`,
      [txHash, credId]
    );

    // Poll for on-chain confirmation (up to ~30 seconds, 10 × 3s)
    type GetTxResult = Awaited<ReturnType<typeof server.getTransaction>>;
    let getResult: GetTxResult | null = null;
    for (let i = 0; i < 10; i++) {
      await new Promise<void>((r) => setTimeout(r, 3000));
      getResult = await server.getTransaction(txHash);
      if (getResult.status !== 'NOT_FOUND') break;
    }

    if (getResult?.status === 'SUCCESS') {
      let sorobanTokenId: number | null = null;
      try {
        if (getResult.returnValue) {
          const native = StellarSdk.scValToNative(getResult.returnValue);
          if (typeof native === 'number') sorobanTokenId = native;
        }
      } catch { /* non-fatal: legacy behaviour if extraction fails */ }

      execute(
        `UPDATE nft_credentials
         SET mint_status = 'minted', tx_hash = ?, soroban_token_id = ?, error = NULL, updated_at = datetime('now')
         WHERE id = ?`,
        [txHash, sorobanTokenId, credId]
      );
      logger.info({ module: 'mint', userId, quizId, txHash, sorobanTokenId }, 'Mint succeeded');
    } else {
      throw new Error(`Transaction not confirmed: status=${getResult?.status ?? 'unknown'}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const truncated = msg.slice(0, 500);
    // Persist failure — do not re-throw (fire-and-forget contract)
    execute(
      `UPDATE nft_credentials SET mint_status = 'failed', error = ?, updated_at = datetime('now')
       WHERE user_id = ? AND quiz_id = ?`,
      [truncated, userId, quizId]
    );
    logger.error({ module: 'mint', userId, quizId, error: truncated }, 'Mint failed');
  }
}

/**
 * Synchronous course-level mint for the new application → approve → mint flow.
 *
 * Called from the POST /courses/:id/completions/applications/:appId/mint admin endpoint.
 * Unlike mintCredentialForQuiz, this function THROWS on failure so the caller can return 502.
 * The route handler is responsible for all DB operations (updating application + inserting nft_credentials).
 *
 * Poll loop: 15 × 4s = up to 60s (longer than quiz path to match admin UX timeout).
 */
export async function mintCredential(params: {
  userId: string;
  courseId: string;
  walletAddress: string;
  applicationId: string;
}): Promise<{ txHash: string; sorobanTokenId: number | null }> {
  const { userId, courseId, walletAddress, applicationId } = params;

  const nftConfig = getNftNetworkConfig();

  // LMS-MINT-J2-003: validate Stellar address before RPC call
  if (!StellarSdk.StrKey.isValidEd25519PublicKey(walletAddress)) {
    throw new Error(`Invalid Stellar wallet address: ${walletAddress}`);
  }

  logger.info({ module: 'mint-course', userId, courseId, applicationId, walletAddress }, 'Attempting course mint');

  const server = new StellarSdk.rpc.Server(nftConfig.rpcUrl);
  const minterKeypair = StellarSdk.Keypair.fromSecret(nftConfig.minterSecret);
  const account = await server.getAccount(minterKeypair.publicKey());
  const contract = new StellarSdk.Contract(nftConfig.contractId);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: nftConfig.networkPassphrase,
  })
    .addOperation(
      contract.call(
        'mint',
        new StellarSdk.Address(walletAddress).toScVal(),
        new StellarSdk.Address(minterKeypair.publicKey()).toScVal()
      )
    )
    .setTimeout(120)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (!StellarSdk.rpc.Api.isSimulationSuccess(simulated)) {
    const simErr = simulated as StellarSdk.rpc.Api.SimulateTransactionErrorResponse;
    throw new Error(`Simulation failed: ${String(simErr.error ?? 'unknown')}`);
  }

  const prepared = StellarSdk.rpc.assembleTransaction(tx, simulated).build();
  prepared.sign(minterKeypair);

  const sendResult = await server.sendTransaction(prepared);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Send failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  // Persist tx_hash immediately for reconciliation if poll times out.
  // The route handler creates the nft_credentials row before calling this function.
  const txHash = sendResult.hash;
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

  type GetTxResult = Awaited<ReturnType<typeof server.getTransaction>>;
  let getResult: GetTxResult | null = null;
  for (let i = 0; i < 15; i++) {
    await new Promise<void>((r) => setTimeout(r, 4000));
    getResult = await server.getTransaction(txHash);
    if (getResult.status !== 'NOT_FOUND') break;
  }

  if (getResult?.status !== 'SUCCESS') {
    throw new Error(`Transaction not confirmed: status=${getResult?.status ?? 'unknown'}`);
  }

  // Extract assigned on-chain token ID from Soroban return value (non-fatal if missing)
  let sorobanTokenId: number | null = null;
  try {
    if (getResult.returnValue) {
      const native = StellarSdk.scValToNative(getResult.returnValue);
      if (typeof native === 'number') sorobanTokenId = native;
    }
  } catch {
    logger.warn({ module: 'mint-course' }, 'Could not extract soroban token ID from return value');
  }

  logger.info({ module: 'mint-course', userId, courseId, txHash, sorobanTokenId }, 'Course mint succeeded');
  return { txHash, sorobanTokenId };
}
