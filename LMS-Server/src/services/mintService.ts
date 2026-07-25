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
import { queryOne, execute } from '../config/database.js';

const SOROBAN_RPC_URL = process.env.NFT_SOROBAN_RPC_URL || 'https://mainnet.sorobanrpc.com';

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

  // Guard: both secret and contract ID must be configured (read at call time for testability)
  const minterSecret = process.env.NFT_MINTER_SECRET;
  const contractId = process.env.NFT_CONTRACT_ID;
  if (!minterSecret || !contractId) {
    console.log('[mint] NFT_MINTER_SECRET or NFT_CONTRACT_ID not configured — mint skipped');
    return;
  }

  try {
    // Idempotency check
    const existing = queryOne<NftCredentialRow>(
      'SELECT id, mint_status FROM nft_credentials WHERE user_id = ? AND quiz_id = ?',
      [userId, quizId]
    );

    if (existing?.mint_status === 'minted') {
      console.log(`[mint] Already minted: user=${userId} quiz=${quizId}`);
      return;
    }

    const credId = existing?.id ?? uuidv4();

    if (!existing) {
      execute(
        `INSERT INTO nft_credentials (id, user_id, quiz_id, wallet_address, mint_status, contract_id, network)
         VALUES (?, ?, ?, ?, 'pending', ?, 'public')`,
        [credId, userId, quizId, walletAddress, contractId]
      );
    } else {
      execute(
        `UPDATE nft_credentials SET mint_status = 'pending', error = NULL, updated_at = datetime('now')
         WHERE id = ?`,
        [credId]
      );
    }

    console.log(`[mint] Attempting: user=${userId} quiz=${quizId} wallet=${walletAddress}`);

    const server = new StellarSdk.rpc.Server(SOROBAN_RPC_URL);
    const minterKeypair = StellarSdk.Keypair.fromSecret(minterSecret);
    const account = await server.getAccount(minterKeypair.publicKey());
    const contract = new StellarSdk.Contract(contractId);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '1000000', // 0.1 XLM max fee for Soroban
      networkPassphrase: StellarSdk.Networks.PUBLIC,
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

    // Poll for on-chain confirmation (up to ~30 seconds, 10 × 3s)
    const txHash = sendResult.hash;
    type GetTxResult = Awaited<ReturnType<typeof server.getTransaction>>;
    let getResult: GetTxResult | null = null;
    for (let i = 0; i < 10; i++) {
      await new Promise<void>((r) => setTimeout(r, 3000));
      getResult = await server.getTransaction(txHash);
      if (getResult.status !== 'NOT_FOUND') break;
    }

    if (getResult?.status === 'SUCCESS') {
      execute(
        `UPDATE nft_credentials SET mint_status = 'minted', tx_hash = ?, error = NULL, updated_at = datetime('now')
         WHERE id = ?`,
        [txHash, credId]
      );
      console.log(`[mint] SUCCESS: user=${userId} quiz=${quizId} tx=${txHash}`);
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
    console.error(`[mint] FAILED: user=${userId} quiz=${quizId}: ${truncated}`);
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
}): Promise<{ txHash: string }> {
  const { userId, courseId, walletAddress, applicationId } = params;

  const minterSecret = process.env.NFT_MINTER_SECRET;
  const contractId = process.env.NFT_CONTRACT_ID;
  if (!minterSecret || !contractId) {
    throw new Error('NFT_MINTER_SECRET or NFT_CONTRACT_ID not configured');
  }

  console.log(`[mint-course] Attempting: user=${userId} course=${courseId} app=${applicationId} wallet=${walletAddress}`);

  const server = new StellarSdk.rpc.Server(SOROBAN_RPC_URL);
  const minterKeypair = StellarSdk.Keypair.fromSecret(minterSecret);
  const account = await server.getAccount(minterKeypair.publicKey());
  const contract = new StellarSdk.Contract(contractId);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: StellarSdk.Networks.PUBLIC,
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

  const txHash = sendResult.hash;
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

  console.log(`[mint-course] SUCCESS: user=${userId} course=${courseId} tx=${txHash}`);
  return { txHash };
}
