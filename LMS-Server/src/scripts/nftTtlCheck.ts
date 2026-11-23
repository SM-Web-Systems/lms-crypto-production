/**
 * Dry run of the NFT TTL keeper: reads every contract/certificate entry, simulates the extension the
 * keeper would send, and prints the XLM cost. Never signs or sends anything.
 *
 * Usage (on the server, inside the API container):
 *   npm run nft:ttl-check
 * Uses NFT_STELLAR_NETWORK, NFT_CONTRACT_ID, NFT_MINTER_SECRET (to derive the minter address only),
 * NFT_TTL_THRESHOLD_DAYS and NFT_TTL_TARGET_DAYS from the environment.
 */
import { runTtlKeeper } from '../services/nftTtlKeeper.js';

process.env.NFT_TTL_KEEPER_ENABLED = 'true';
process.env.NFT_TTL_KEEPER_SEND = 'false';

runTtlKeeper()
  .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
  .catch((err) => { console.error(String(err)); process.exit(1); });
