import { describe, it, expect, vi, afterEach } from 'vitest';
import { Keypair, Networks } from '@stellar/stellar-sdk';
import { verifyStellarFunding, type StellarFundingBinding } from '../services/rewards/stellarFundingVerification.js';

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const now = Date.now(), timestamp = new Date(Math.floor(now / 1000) * 1000).toISOString();
  const binding: StellarFundingBinding = {network: 'testnet', destination: Keypair.random().publicKey(),
    memoHash: 'a'.repeat(64), amountStroops: 1234567, createdAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60000).toISOString()};
  const responses: Record<string, Record<string, unknown>> = {
    '/': {network_passphrase: Networks.TESTNET, history_latest_ledger: 20},
    '/operations/123': {id: '123', type: 'payment', transaction_successful: true, to: binding.destination,
      asset_type: 'native', amount: '0.1234567', transaction_hash: 'b'.repeat(64)},
    [`/transactions/${'b'.repeat(64)}`]: {hash: 'b'.repeat(64), successful: true, ledger: 20, created_at: timestamp,
      memo_type: 'hash', memo: Buffer.from(binding.memoHash, 'hex').toString('base64')},
    '/ledgers/20': {sequence: 20, hash: 'c'.repeat(64), closed_at: timestamp},
  };
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(responses[new URL(url).pathname]), {status: 200}));
  vi.stubGlobal('fetch', fetcher);
  return {binding, responses, fetcher, operation: responses['/operations/123'], transaction: responses[`/transactions/${'b'.repeat(64)}`]};
}

describe('Stellar funding operation verification', () => {
  it('verifies closed successful native payment with exact integer amount, destination, network and intent memo', async () => {
    const f = fixture();
    await expect(verifyStellarFunding(f.binding, '123')).resolves.toMatchObject({operationId: '123', amountStroops: 1234567, network: 'testnet', ledger: 20});
    expect(f.fetcher.mock.calls.every(([url]) => new URL(url).origin === 'https://horizon-testnet.stellar.org')).toBe(true);
  });
  for (const [name, change] of [
    ['wrong network', (f: ReturnType<typeof fixture>) => {f.responses['/'].network_passphrase = Networks.PUBLIC;}],
    ['failed operation', (f: ReturnType<typeof fixture>) => {f.operation.transaction_successful = false;}],
    ['wrong destination', (f: ReturnType<typeof fixture>) => {f.operation.to = Keypair.random().publicKey();}],
    ['issued XLM lookalike', (f: ReturnType<typeof fixture>) => {f.operation.asset_type = 'credit_alphanum4'; f.operation.asset_code = 'XLM';}],
    ['underpayment', (f: ReturnType<typeof fixture>) => {f.operation.amount = '0.1234566';}],
    ['overpayment', (f: ReturnType<typeof fixture>) => {f.operation.amount = '0.1234568';}],
    ['failed transaction', (f: ReturnType<typeof fixture>) => {f.transaction.successful = false;}],
    ['other intent memo', (f: ReturnType<typeof fixture>) => {f.transaction.memo = Buffer.alloc(32).toString('base64');}],
    ['text memo', (f: ReturnType<typeof fixture>) => {f.transaction.memo_type = 'text';}],
    ['future ledger', (f: ReturnType<typeof fixture>) => {f.responses['/'].history_latest_ledger = 19;}],
    ['wrong closed ledger', (f: ReturnType<typeof fixture>) => {f.responses['/ledgers/20'].sequence = 21;}],
    ['payment before intent', (f: ReturnType<typeof fixture>) => {f.transaction.created_at = '2000-01-01T00:00:00Z';}],
  ] as const) {
    it(`rejects ${name}`, async () => {const f = fixture(); change(f); await expect(verifyStellarFunding(f.binding, '123')).rejects.toMatchObject({statusCode: 402});});
  }
  it('rejects expired intent or an injected operation path without contacting a provider', async () => {
    const f = fixture();
    await expect(verifyStellarFunding({...f.binding, expiresAt: '2000-01-01T00:00:00Z'}, '123')).rejects.toThrow();
    await expect(verifyStellarFunding(f.binding, '../accounts/secret')).rejects.toThrow();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('rejects an unknown network instead of selecting an inherited object property', async () => {
    const f = fixture();
    await expect(verifyStellarFunding({...f.binding, network: 'constructor' as 'testnet'}, '123')).rejects.toMatchObject({statusCode: 402});
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('returns a retryable safe error for provider timeout without exposing raw provider text', async () => {
    const f = fixture(); f.fetcher.mockRejectedValueOnce(new Error('private upstream details'));
    await expect(verifyStellarFunding(f.binding, '123')).rejects.toMatchObject({statusCode: 503, message: expect.not.stringContaining('private')});
  });
});
