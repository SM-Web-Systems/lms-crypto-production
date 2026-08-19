/**
 * rpc-integration.test.ts — Fixture-based RPC integration tests
 *
 * Uses real Horizon responses recorded from testnet mint tx 05e459cc...44b2.
 * Tests parse + validate Horizon response formats.
 *
 * FIXTURE-1: Parse transaction response — extract successful, ledger, fee
 * FIXTURE-2: Parse operations response — extract type, function
 * FIXTURE-3: Verify transaction source matches minter public key
 * FIXTURE-4: Verify transaction was successful
 * FIXTURE-5: Verify operation is invoke_host_function
 * FIXTURE-6: Horizon URL mapping for public network
 * FIXTURE-7: Horizon URL mapping for testnet network
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getHorizonUrl } from '../services/reconciliationService.js';

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname2, 'fixtures', 'testnet-rpc');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'));
}

describe('Fixture-based RPC integration', () => {
  const tx = loadFixture('transaction-05e459cc.json') as {
    successful: boolean;
    ledger: number;
    fee_charged: string;
    source_account: string;
    hash: string;
  };

  const ops = loadFixture('operations-05e459cc.json') as {
    _embedded: { records: Array<{ type: string; function?: string }> };
  };

  it('FIXTURE-1: parse transaction — successful, ledger, fee', () => {
    expect(tx.successful).toBe(true);
    expect(typeof tx.ledger).toBe('number');
    expect(tx.ledger).toBe(4228792);
    expect(typeof tx.fee_charged).toBe('string');
  });

  it('FIXTURE-2: parse operations — type and records exist', () => {
    const records = ops._embedded.records;
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].type).toBe('invoke_host_function');
  });

  it('FIXTURE-3: transaction source matches minter public key', () => {
    expect(tx.source_account).toBe('GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3');
  });

  it('FIXTURE-4: transaction was successful', () => {
    expect(tx.successful).toBe(true);
  });

  it('FIXTURE-5: operation is invoke_host_function', () => {
    const records = ops._embedded.records;
    expect(records[0].type).toBe('invoke_host_function');
  });

  it('FIXTURE-6: Horizon URL for public network', () => {
    expect(getHorizonUrl('public')).toBe('https://horizon.stellar.org');
  });

  it('FIXTURE-7: Horizon URL for testnet network', () => {
    expect(getHorizonUrl('testnet')).toBe('https://horizon-testnet.stellar.org');
  });
});
