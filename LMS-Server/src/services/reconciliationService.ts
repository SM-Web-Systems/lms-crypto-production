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
    'SELECT id, mint_status, tx_hash, network FROM nft_credentials WHERE id = ?',
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
