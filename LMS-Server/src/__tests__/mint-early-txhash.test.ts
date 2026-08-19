/**
 * mint-early-txhash.test.ts — Verify tx_hash can be saved before poll loop
 *
 * ETXH-1: tx_hash column is writable on pending credential
 * ETXH-2: tx_hash persists even when mint_status remains pending
 * ETXH-3: failed credential retains tx_hash for reconciliation
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { db, execute, queryOne } from '../config/database.js';

function seedUser(): string {
  const id = uuidv4();
  db.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, 'ETXH User', 'hash', 'student')`)
    .run(id, `etxh-${id}@test.com`);
  return id;
}

describe('Early tx_hash persistence (reconciliation support)', () => {
  it('ETXH-1: tx_hash column is writable on pending credential', () => {
    const userId = seedUser();
    const id = uuidv4();
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network)
       VALUES (?, ?, 'GWALLET', 'pending', 'CTEST', 'testnet')`
    ).run(id, userId);

    execute(
      `UPDATE nft_credentials SET tx_hash = ?, updated_at = datetime('now') WHERE id = ?`,
      ['abc123hash', id]
    );
    const row = queryOne<{ tx_hash: string | null }>('SELECT tx_hash FROM nft_credentials WHERE id = ?', [id]);
    expect(row?.tx_hash).toBe('abc123hash');
  });

  it('ETXH-2: tx_hash persists even when mint_status remains pending', () => {
    const userId = seedUser();
    const id = uuidv4();
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network)
       VALUES (?, ?, 'GWALLET', 'pending', 'CTEST', 'testnet')`
    ).run(id, userId);

    execute(`UPDATE nft_credentials SET tx_hash = ? WHERE id = ?`, ['def456hash', id]);
    const row = queryOne<{ tx_hash: string | null; mint_status: string }>(
      'SELECT tx_hash, mint_status FROM nft_credentials WHERE id = ?', [id]
    );
    expect(row?.tx_hash).toBe('def456hash');
    expect(row?.mint_status).toBe('pending');
  });

  it('ETXH-3: failed credential retains tx_hash for reconciliation', () => {
    const userId = seedUser();
    const id = uuidv4();
    db.prepare(
      `INSERT INTO nft_credentials (id, user_id, wallet_address, mint_status, contract_id, network)
       VALUES (?, ?, 'GWALLET', 'pending', 'CTEST', 'testnet')`
    ).run(id, userId);

    execute(`UPDATE nft_credentials SET tx_hash = ? WHERE id = ?`, ['ghi789hash', id]);
    execute(
      `UPDATE nft_credentials SET mint_status = 'failed', error = 'Transaction not confirmed: status=unknown' WHERE id = ?`,
      [id]
    );
    const row = queryOne<{ tx_hash: string | null; mint_status: string }>(
      'SELECT tx_hash, mint_status FROM nft_credentials WHERE id = ?', [id]
    );
    expect(row?.tx_hash).toBe('ghi789hash');
    expect(row?.mint_status).toBe('failed');
  });
});
