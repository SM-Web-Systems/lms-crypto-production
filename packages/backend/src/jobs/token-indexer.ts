import { TokenService } from '../modules/tokens/token.service';
import { syncTomlImages } from '../lib/toml-sync';
import { syncAllIcons } from '../lib/icon-resolver';

const tokenService = new TokenService();

export async function runTokenIndexer() {
  console.log('[token-indexer] Starting sync...');

  try {
    // Phase 1: Discover new assets from Horizon
    const discovered = await tokenService.discoverFromHorizon();
    console.log(`[token-indexer] Discovered ${discovered} assets from Horizon`);

    // Phase 2: Enrich with StellarExpert ratings & metadata
    await tokenService.enrichFromStellarExpert();

    // Phase 3: Sync TOML images for tokens with a homeDomain
    await syncTomlImages();

    // Phase 4: Download & cache icons from CryptoLogos / CMC / spothq
    await syncAllIcons();

    console.log('[token-indexer] Sync complete');
  } catch (err) {
    console.error('[token-indexer] Error:', err);
  }
}
