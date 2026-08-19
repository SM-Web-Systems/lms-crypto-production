/**
 * legacyStellarProvider.ts — Adapter wrapping existing mintService + reconciliationService.
 *
 * This provider delegates all operations to the existing implementation.
 * Zero behavior change from the current system.
 */

import type { NftProvider, MintParams, MintResult, ReconcileResult, ProviderInfo } from '../nftProvider.js';
import { mintCredential } from '../mintService.js';
import { reconcileCredential, getHorizonUrl } from '../reconciliationService.js';

export class LegacyStellarProvider implements NftProvider {
  readonly name = 'legacy-stellar';
  readonly version = '1.0.0';

  async mint(params: MintParams): Promise<MintResult> {
    if (!params.courseId) {
      throw new Error('LegacyStellarProvider.mint() requires courseId');
    }
    if (!params.applicationId) {
      throw new Error('LegacyStellarProvider.mint() requires applicationId');
    }

    const result = await mintCredential({
      userId: params.userId,
      courseId: params.courseId,
      walletAddress: params.walletAddress,
      applicationId: params.applicationId,
    });

    const network = process.env.NFT_STELLAR_NETWORK || 'public';

    return {
      txHash: result.txHash,
      sorobanTokenId: result.sorobanTokenId,
      network,
      provider: this.name,
    };
  }

  async reconcile(credentialId: string): Promise<ReconcileResult> {
    const result = await reconcileCredential(credentialId);

    return {
      status: result.status === 'minted' ? 'recovered' : result.status as ReconcileResult['status'],
      reason: result.reason,
      ledger: result.ledger,
      txHash: result.txHash,
    };
  }

  getProviderInfo(): ProviderInfo {
    const network = process.env.NFT_STELLAR_NETWORK || 'public';
    return {
      name: this.name,
      version: this.version,
      network,
      capabilities: ['mint', 'reconcile', 'metadata'],
    };
  }
}
