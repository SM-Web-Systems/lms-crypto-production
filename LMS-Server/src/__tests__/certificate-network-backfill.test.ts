/**
 * Owner decision 2026-11-21 ("testnet is for testing"): certificates with no network recorded are
 * marked 'testnet' only when the record itself shows it was issued on testnet. Anything that cannot
 * be shown is left alone and counted. Additive (UPDATE of empty values only) and idempotent.
 */
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { backfillTestnetCertificateNetwork } from '../config/certificateNetworkBackfill.js';

const schema = readFileSync(path.resolve('database/schema.sql'), 'utf8');
const TESTNET_CONTRACT = 'CTESTNETCONTRACT';
const MAINNET_CONTRACT = 'CMAINNETCONTRACT';
const UNKNOWN_CONTRACT = 'CUNKNOWNCONTRACT';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(schema);
  db.exec("INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Lee', 'lee@example.invalid', 'h')");
  return db;
}
function cred(db: Database.Database, id: string, contract: string, network: string | null) {
  db.prepare(`INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, tx_hash, contract_id, network)
              VALUES (?, 'u1', 'GWALLET', 'minted', ?, ?, ?)`).run(id, `tx-${id}`, contract, network);
}
const networkOf = (db: Database.Database, id: string) =>
  (db.prepare('SELECT network FROM nft_credentials WHERE id = ?').get(id) as { network: string | null }).network;

describe('backfillTestnetCertificateNetwork', () => {
  it('marks an empty network testnet when the contract is the testnet contract this server issues with', () => {
    const db = freshDb();
    cred(db, 'c1', TESTNET_CONTRACT, '');
    const result = backfillTestnetCertificateNetwork(db, { nftNetwork: 'testnet', nftContractId: TESTNET_CONTRACT });
    expect(networkOf(db, 'c1')).toBe('testnet');
    expect(result).toEqual({ missing: 1, markedTestnet: 1, unclassified: 0, publicOnTestnetContract: 0, dryRun: false });
  });

  it('marks an empty network testnet when another certificate on the same contract is recorded as testnet', () => {
    const db = freshDb();
    cred(db, 'known', TESTNET_CONTRACT, 'testnet');
    cred(db, 'c1', TESTNET_CONTRACT, '  ');
    const result = backfillTestnetCertificateNetwork(db, {});
    expect(networkOf(db, 'c1')).toBe('testnet');
    expect(result.markedTestnet).toBe(1);
  });

  it('does not take a failed testnet attempt as evidence for its contract', () => {
    const db = freshDb();
    db.prepare(`INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, error, contract_id, network)
                VALUES ('f1', 'u1', 'G', 'failed', 'boom', ?, 'testnet')`).run(UNKNOWN_CONTRACT);
    cred(db, 'c1', UNKNOWN_CONTRACT, '');
    const result = backfillTestnetCertificateNetwork(db, {});
    expect(networkOf(db, 'c1')).toBe('');
    expect(result.unclassified).toBe(1);
  });

  it('leaves a certificate it cannot classify and counts it', () => {
    const db = freshDb();
    cred(db, 'c1', UNKNOWN_CONTRACT, '');
    const result = backfillTestnetCertificateNetwork(db, { nftNetwork: 'testnet', nftContractId: TESTNET_CONTRACT });
    expect(networkOf(db, 'c1')).toBe('');
    expect(result).toEqual({ missing: 1, markedTestnet: 0, unclassified: 1, publicOnTestnetContract: 0, dryRun: false });
  });

  it('never marks a certificate on the mainnet contract this server issues with, even if other evidence says testnet', () => {
    const db = freshDb();
    cred(db, 'odd', MAINNET_CONTRACT, 'testnet');
    cred(db, 'c1', MAINNET_CONTRACT, '');
    const result = backfillTestnetCertificateNetwork(db, { nftNetwork: 'public', nftContractId: MAINNET_CONTRACT });
    expect(networkOf(db, 'c1')).toBe('');
    expect(result.unclassified).toBe(1);
    expect(result.markedTestnet).toBe(0);
  });

  it('never changes a recorded network, but counts public certificates on a testnet contract for review', () => {
    const db = freshDb();
    cred(db, 'p1', TESTNET_CONTRACT, 'public');
    cred(db, 'p2', MAINNET_CONTRACT, 'public');
    const result = backfillTestnetCertificateNetwork(db, { nftNetwork: 'testnet', nftContractId: TESTNET_CONTRACT });
    expect(networkOf(db, 'p1')).toBe('public');
    expect(networkOf(db, 'p2')).toBe('public');
    expect(result).toEqual({ missing: 0, markedTestnet: 0, unclassified: 0, publicOnTestnetContract: 1, dryRun: false });
  });

  it('dry run counts without changing anything', () => {
    const db = freshDb();
    cred(db, 'c1', TESTNET_CONTRACT, '');
    cred(db, 'c2', UNKNOWN_CONTRACT, '');
    const result = backfillTestnetCertificateNetwork(db, { nftNetwork: 'testnet', nftContractId: TESTNET_CONTRACT, dryRun: true });
    expect(result).toEqual({ missing: 2, markedTestnet: 1, unclassified: 1, publicOnTestnetContract: 0, dryRun: true });
    expect(networkOf(db, 'c1')).toBe('');
  });

  it('is idempotent: a second run changes nothing', () => {
    const db = freshDb();
    cred(db, 'c1', TESTNET_CONTRACT, '');
    backfillTestnetCertificateNetwork(db, { nftNetwork: 'testnet', nftContractId: TESTNET_CONTRACT });
    const again = backfillTestnetCertificateNetwork(db, { nftNetwork: 'testnet', nftContractId: TESTNET_CONTRACT });
    expect(again).toEqual({ missing: 0, markedTestnet: 0, unclassified: 0, publicOnTestnetContract: 0, dryRun: false });
    expect(networkOf(db, 'c1')).toBe('testnet');
  });

  it('handles NULL in an older table whose network column allowed it', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE nft_credentials (id TEXT PRIMARY KEY, user_id TEXT, wallet_address TEXT, mint_status TEXT,
             tx_hash TEXT, contract_id TEXT, network TEXT)`);
    db.prepare("INSERT INTO nft_credentials VALUES ('c1', 'u1', 'G', 'minted', 'tx', ?, NULL)").run(TESTNET_CONTRACT);
    db.prepare("INSERT INTO nft_credentials VALUES ('c2', 'u1', 'G', 'minted', 'tx', ?, NULL)").run(UNKNOWN_CONTRACT);
    const result = backfillTestnetCertificateNetwork(db, { nftNetwork: 'testnet', nftContractId: TESTNET_CONTRACT });
    expect(networkOf(db, 'c1')).toBe('testnet');
    expect(networkOf(db, 'c2')).toBeNull();
    expect(result).toEqual({ missing: 2, markedTestnet: 1, unclassified: 1, publicOnTestnetContract: 0, dryRun: false });
  });

  it('does nothing when there is no certificate table', () => {
    const db = new Database(':memory:');
    expect(backfillTestnetCertificateNetwork(db, {})).toEqual({ missing: 0, markedTestnet: 0, unclassified: 0, publicOnTestnetContract: 0, dryRun: false });
  });
});
