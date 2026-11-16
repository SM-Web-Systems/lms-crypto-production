import { Networks, StrKey } from '@stellar/stellar-sdk';
import { RewardError } from './rewardErrors.js';

export interface StellarFundingBinding {
  network: 'testnet' | 'public';
  destination: string;
  source?: string;
  memoHash: string;
  /** Optional one-time text memo (for wallets that cannot send a hash memo). Hash memo stays accepted. */
  textMemo?: string;
  amountStroops: number;
  createdAt: string;
  expiresAt: string;
}

export interface VerifiedStellarFunding {
  operationId: string;
  transactionHash: string;
  ledger: number;
  ledgerHash: string;
  network: 'testnet' | 'public';
  destination: string;
  amountStroops: number;
  memoHash: string;
}

const providers = {
  testnet: {url: 'https://horizon-testnet.stellar.org', passphrase: Networks.TESTNET},
  public: {url: 'https://horizon.stellar.org', passphrase: Networks.PUBLIC},
} as const;
const hashPattern = /^[a-f0-9]{64}$/;
export const TEXT_MEMO_PATTERN = /^LMS-[A-Z2-7]{12}$/;
const deny = () => new RewardError('FUNDING_UNVERIFIED', 'That payment does not match this request. Check the operation ID (the payment operation, not the transaction hash), and that the amount, memo and sending wallet are the ones shown.', 402);

function horizonReader(provider: {url: string}) {
  const signal = AbortSignal.timeout(5000);
  async function read(endpoint: string, allowMissing = false, missingEvidence = false): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(`${provider.url}${endpoint}`, {signal, redirect: 'error', headers: {Accept: 'application/json'}});
      if (allowMissing && response.status === 404) return {missing: true};
      if (missingEvidence && response.status === 404) throw new RewardError('FUNDING_UNVERIFIED', 'Stellar operation was not found. Check its ID or retry after ingestion.', 402);
      if (!response.ok || !response.body) throw new Error('provider');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > 128 * 1024) throw new Error('provider');
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('provider');
      return value as Record<string, unknown>;
    } catch (err) {
      if (err instanceof RewardError) throw err;
      throw new RewardError('FUNDING_UNVERIFIED', 'Stellar verification is temporarily unavailable. Retry the same intent.', 503);
    }
  }
  return read;
}

// Public-data reads only. Never signs, submits a transaction or follows a
// provider-supplied link. The caller must supply a stored authoritative intent.
export async function verifyStellarFunding(binding: StellarFundingBinding, operationId: string): Promise<VerifiedStellarFunding> {
  if (binding.network !== 'testnet' && binding.network !== 'public') throw deny();
  const provider = providers[binding.network];
  const created = Date.parse(binding.createdAt), expiry = Date.parse(binding.expiresAt);
  if (!StrKey.isValidEd25519PublicKey(binding.destination) || !hashPattern.test(binding.memoHash)
    || (binding.source !== undefined && !StrKey.isValidEd25519PublicKey(binding.source))
    || (binding.textMemo !== undefined && !TEXT_MEMO_PATTERN.test(binding.textMemo))
    || !Number.isSafeInteger(binding.amountStroops) || binding.amountStroops <= 0
    || !Number.isFinite(created) || !Number.isFinite(expiry) || expiry <= Date.now()
    || expiry <= created || typeof operationId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(operationId)) throw deny();
  const read = horizonReader(provider);
  const root = await read('/');
  if (root.network_passphrase !== provider.passphrase) throw deny();
  const operation = await read(`/operations/${operationId}`, false, true);
  if (operation.id !== operationId || operation.type !== 'payment' || operation.transaction_successful !== true
    || operation.asset_type !== 'native' || operation.asset_code !== undefined || operation.asset_issuer !== undefined
    || (binding.source !== undefined && (operation.from !== binding.source
      || operation.from_muxed !== undefined || operation.from_muxed_id !== undefined))
    || operation.to !== binding.destination || operation.to_muxed !== undefined || operation.to_muxed_id !== undefined
    || typeof operation.amount !== 'string' || !/^(0|[1-9][0-9]*)\.[0-9]{7}$/.test(operation.amount)
    || typeof operation.transaction_hash !== 'string' || !hashPattern.test(operation.transaction_hash)) throw deny();
  const [whole, fraction] = operation.amount.split('.');
  if (BigInt(whole) * 10_000_000n + BigInt(fraction) !== BigInt(binding.amountStroops)) {
    throw new RewardError('FUNDING_AMOUNT_MISMATCH', 'Stellar operation amount does not match the funding intent.', 402);
  }
  const transaction = await read(`/transactions/${operation.transaction_hash}`);
  const expectedMemo = Buffer.from(binding.memoHash, 'hex').toString('base64');
  const transactionTime = typeof transaction.created_at === 'string' ? Date.parse(transaction.created_at) : NaN;
  if (transaction.hash !== operation.transaction_hash || transaction.successful !== true
    || !((transaction.memo_type === 'hash' && transaction.memo === expectedMemo)
      || (binding.textMemo !== undefined && transaction.memo_type === 'text' && transaction.memo === binding.textMemo))
    || !Number.isSafeInteger(transaction.ledger) || (transaction.ledger as number) <= 0
    || !Number.isSafeInteger(root.history_latest_ledger) || (root.history_latest_ledger as number) < (transaction.ledger as number)
    || !Number.isFinite(transactionTime) || transactionTime < Math.floor(created / 1000) * 1000 || transactionTime > expiry) throw deny();
  const ledger = await read(`/ledgers/${transaction.ledger}`);
  if (ledger.sequence !== transaction.ledger || typeof ledger.hash !== 'string' || !hashPattern.test(ledger.hash)
    || typeof ledger.closed_at !== 'string' || Date.parse(ledger.closed_at) !== transactionTime) throw deny();
  return {operationId, transactionHash: operation.transaction_hash, ledger: transaction.ledger as number,
    ledgerHash: ledger.hash, network: binding.network, destination: binding.destination,
    amountStroops: binding.amountStroops, memoHash: binding.memoHash};
}

export interface RecentPayment {id: string; from: string; to: string; amountStroops: number; createdAt: string}
/** Public-data read of the latest payments into an account, used only to find candidate operation IDs. Every candidate is still fully verified. */
export async function recentPaymentsTo(network: 'testnet' | 'public', destination: string): Promise<RecentPayment[]> {
  if ((network !== 'testnet' && network !== 'public') || !StrKey.isValidEd25519PublicKey(destination)) return [];
  const root = await horizonReader(providers[network])(`/accounts/${destination}/payments?order=desc&limit=30`);
  const records = ((root._embedded as {records?: unknown} | undefined)?.records);
  if (!Array.isArray(records)) return [];
  const out: RecentPayment[] = [];
  for (const r of records as Record<string, unknown>[]) {
    if (r.type !== 'payment' || r.asset_type !== 'native' || r.to !== destination || typeof r.from !== 'string' || typeof r.id !== 'string'
      || !/^[1-9][0-9]{0,19}$/.test(r.id) || typeof r.created_at !== 'string' || typeof r.amount !== 'string'
      || !/^(0|[1-9][0-9]*)\.[0-9]{7}$/.test(r.amount)) continue;
    const [whole, fraction] = r.amount.split('.');
    const stroops = BigInt(whole) * 10_000_000n + BigInt(fraction);
    if (stroops > BigInt(Number.MAX_SAFE_INTEGER)) continue;
    out.push({id: r.id, from: r.from, to: destination, amountStroops: Number(stroops), createdAt: r.created_at});
  }
  return out;
}

export async function stellarReceiverReadiness(config: {network: 'testnet' | 'public'; destination: string}): Promise<{ready: boolean; reason: string | null}> {
  if ((config.network !== 'testnet' && config.network !== 'public') || !StrKey.isValidEd25519PublicKey(config.destination)) {
    return {ready: false, reason: 'Stellar funding is not configured.'};
  }
  const provider = providers[config.network], read = horizonReader(provider);
  try {
    const root = await read('/');
    if (root.network_passphrase !== provider.passphrase) return {ready: false, reason: 'The Stellar provider network could not be verified.'};
    const account = await read(`/accounts/${config.destination}`, true);
    return account.account_id === config.destination ? {ready: true, reason: null}
      : {ready: false, reason: 'The receiving account is not active on the configured Stellar network.'};
  } catch { return {ready: false, reason: 'Stellar funding is temporarily unavailable. Please retry.'}; }
}
