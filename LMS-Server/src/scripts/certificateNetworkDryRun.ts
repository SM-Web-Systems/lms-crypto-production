/**
 * Dry run of the certificate network backfill: prints what the next startup would do, writes nothing.
 *
 * Usage (on the server, inside the API container):
 *   npm run db:certificate-network-dry-run -- [DATABASE_PATH]
 * Uses NFT_STELLAR_NETWORK and NFT_CONTRACT_ID from the environment, as startup does.
 */
import Database from 'better-sqlite3';
import { backfillTestnetCertificateNetwork } from '../config/certificateNetworkBackfill.js';

const dbPath = process.argv[2] || process.env.DATABASE_PATH;
if (!dbPath) {
  console.error('Usage: certificateNetworkDryRun DATABASE_PATH (or set DATABASE_PATH)');
  process.exit(2);
}
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
try {
  const result = backfillTestnetCertificateNetwork(db, {
    nftNetwork: process.env.NFT_STELLAR_NETWORK,
    nftContractId: process.env.NFT_CONTRACT_ID,
    dryRun: true,
  });
  console.log(JSON.stringify({ database: dbPath, nftNetwork: process.env.NFT_STELLAR_NETWORK ?? null, ...result }));
} finally {
  db.close();
}
