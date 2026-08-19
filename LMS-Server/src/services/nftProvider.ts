/**
 * nftProvider.ts — NftProvider interface and factory for provider abstraction.
 *
 * Enables switching between NFT minting implementations via NFT_PROVIDER env var.
 * Default: 'legacy' (existing mintService.ts behavior).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MintParams {
  userId: string;
  walletAddress: string;
  courseId?: string;
  quizId?: string;
  applicationId?: string;
  idempotencyKey?: string;
}

export interface MintResult {
  txHash: string;
  sorobanTokenId: number | null;
  network: string;
  provider: string;
}

export interface MetadataResult {
  name: string;
  description: string;
  image: string;
  external_url: string;
  attributes: Array<{ trait_type: string; value: string }>;
}

export interface ReconcileResult {
  status: 'recovered' | 'chain_failed' | 'not_found' | 'ineligible';
  reason?: string;
  ledger?: number;
  txHash?: string;
}

export interface CredentialStatus {
  credentialId: string;
  mintStatus: 'pending' | 'minted' | 'failed';
  txHash: string | null;
  network: string | null;
  provider: string;
}

export interface ProviderInfo {
  name: string;
  version: string;
  network: string;
  capabilities: string[];
}

// ─── Interface ───────────────────────────────────────────────────────────────

export interface NftProvider {
  readonly name: string;
  readonly version: string;

  mint(params: MintParams): Promise<MintResult>;
  reconcile(credentialId: string): Promise<ReconcileResult>;
  getProviderInfo(): ProviderInfo;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

import { LegacyStellarProvider } from './providers/legacyStellarProvider.js';
import { EnhancedStellarProvider } from './providers/enhancedStellarProvider.js';

let _providerCache: NftProvider | null = null;
let _lastProviderName: string | null = null;

/**
 * Returns the configured NftProvider based on NFT_PROVIDER env var.
 * Defaults to 'legacy' if missing or invalid (fail-safe).
 */
export function getNftProvider(): NftProvider {
  const providerName = (process.env.NFT_PROVIDER || 'legacy').toLowerCase().trim();

  if (_providerCache && _lastProviderName === providerName) {
    return _providerCache;
  }

  let provider: NftProvider;

  switch (providerName) {
    case 'enhanced':
      provider = new EnhancedStellarProvider();
      break;
    case 'legacy':
    default:
      provider = new LegacyStellarProvider();
      break;
  }

  _providerCache = provider;
  _lastProviderName = providerName;
  return provider;
}

/** Reset provider cache — for tests only. */
export function _resetProviderCache(): void {
  _providerCache = null;
  _lastProviderName = null;
}
