/**
 * enhancedStellarProvider.ts — Second NFT solution provider (STUB).
 *
 * This provider is disabled by default and cannot be activated in production
 * without explicit approval. All methods throw PROVIDER_NOT_READY.
 *
 * Future implementation will add:
 * - State machine for mint lifecycle
 * - Idempotency keys
 * - Structured error taxonomy
 * - Enhanced observability
 */

import type { NftProvider, MintParams, MintResult, ReconcileResult, ProviderInfo } from '../nftProvider.js';

export class ProviderNotReadyError extends Error {
  readonly code = 'PROVIDER_NOT_READY';
  constructor(method: string) {
    super(`EnhancedStellarProvider.${method}() is not yet implemented. Set NFT_PROVIDER=legacy to use the existing provider.`);
    this.name = 'ProviderNotReadyError';
  }
}

export class EnhancedStellarProvider implements NftProvider {
  readonly name = 'enhanced-stellar';
  readonly version = '2.0.0-stub';

  async mint(_params: MintParams): Promise<MintResult> {
    throw new ProviderNotReadyError('mint');
  }

  async reconcile(_credentialId: string): Promise<ReconcileResult> {
    throw new ProviderNotReadyError('reconcile');
  }

  getProviderInfo(): ProviderInfo {
    const network = process.env.NFT_STELLAR_NETWORK || 'public';
    return {
      name: this.name,
      version: this.version,
      network,
      capabilities: [], // No capabilities until implemented
    };
  }
}
