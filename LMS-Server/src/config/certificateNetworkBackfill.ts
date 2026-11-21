import type { Database } from 'better-sqlite3';

/**
 * Owner decision 2026-11-21 ("testnet is for testing"): a certificate with no network recorded
 * (NULL or blank nft_credentials.network) is marked 'testnet' only when the record shows it was
 * issued on testnet. A Soroban contract id belongs to one network, so the evidence is the contract:
 *   - it is the testnet contract this server issues with (NFT_STELLAR_NETWORK=testnet, NFT_CONTRACT_ID), or
 *   - another certificate on the same contract was minted (minted, with a tx hash) and is recorded
 *     'testnet' (that value is only ever written from a real testnet configuration).
 * The column is NOT NULL DEFAULT 'public' in schema.sql, so on current databases nothing is blank;
 * this covers blank values from older or hand-edited databases.
 * A certificate on the mainnet contract this server issues with is never marked. Anything else is
 * left as it is and counted as unclassified. A recorded network is never changed. Course issues
 * before #288 were recorded 'public' whatever network they were really on; those on a testnet
 * contract are only counted (publicOnTestnetContract), for an owner decision.
 *
 * Only blank values are written, so it is idempotent and safe to run on every startup.
 */
export interface CertificateNetworkBackfillResult {
  missing: number;
  markedTestnet: number;
  unclassified: number;
  publicOnTestnetContract: number;
  dryRun: boolean;
}

export interface CertificateNetworkBackfillOptions {
  /** NFT_STELLAR_NETWORK of this server. */
  nftNetwork?: string;
  /** NFT_CONTRACT_ID of this server. */
  nftContractId?: string;
  /** Count only; write nothing. */
  dryRun?: boolean;
}

const MISSING = "(network IS NULL OR TRIM(network) = '')";

export function backfillTestnetCertificateNetwork(
  db: Database,
  opts: CertificateNetworkBackfillOptions = {},
): CertificateNetworkBackfillResult {
  const dryRun = !!opts.dryRun;
  const empty = { missing: 0, markedTestnet: 0, unclassified: 0, publicOnTestnetContract: 0, dryRun };
  const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'nft_credentials'").get();
  if (!hasTable) return empty;

  const contract = opts.nftContractId?.trim() || null;
  const configuredTestnet = opts.nftNetwork === 'testnet' ? contract : null;
  const configuredMainnet = opts.nftNetwork === 'public' ? contract : null;

  // Contract ids shown to be on testnet, excluding the mainnet contract this server issues with.
  const testnetContracts = `(
    SELECT ? AS contract_id WHERE ? IS NOT NULL
    UNION SELECT DISTINCT contract_id FROM nft_credentials
          WHERE network = 'testnet' AND mint_status = 'minted' AND tx_hash IS NOT NULL
  )`;
  const provablyTestnet = `contract_id IN ${testnetContracts} AND contract_id IS NOT ?`;
  const params = [configuredTestnet, configuredTestnet, configuredMainnet];

  const count = (where: string, p: unknown[] = []) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM nft_credentials WHERE ${where}`).get(...p) as { n: number }).n;

  const run = (): CertificateNetworkBackfillResult => {
    const missing = count(MISSING);
    const classifiable = count(`${MISSING} AND ${provablyTestnet}`, params);
    const publicOnTestnetContract = count(`network = 'public' AND ${provablyTestnet}`, params);
    if (!dryRun && classifiable > 0) {
      db.prepare(`UPDATE nft_credentials SET network = 'testnet' WHERE ${MISSING} AND ${provablyTestnet}`).run(...params);
    }
    return { missing, markedTestnet: classifiable, unclassified: missing - classifiable, publicOnTestnetContract, dryRun };
  };
  return db.transaction(run)();
}
