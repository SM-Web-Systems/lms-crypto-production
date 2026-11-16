import { Horizon, NotFoundError } from '@stellar/stellar-sdk';
import { db } from '../../config/database.js';
import logger from '../../utils/logger.js';
import { overCommittedLearners } from './rewardClaimService.js';
import { payoutConfiguration } from './rewardPayoutService.js';

/**
 * Daily check that the reward pool on the Stellar network still covers what the LMS owes, and that the LMS and the
 * network agree about what was paid. It reads only; it never moves funds and never changes a claim.
 */

/** An account must keep 1 XLM (two base reserves) to stay open, so that part of the pool is not spendable. */
export const POOL_RESERVE_STROOPS = 10_000_000n;
const HORIZON_URL = { testnet: 'https://horizon-testnet.stellar.org', public: 'https://horizon.stellar.org' } as const;

export interface ReconciliationHorizon {
  /** Native balance in stroops, or null when the account does not exist. */
  balanceStroops(account: string): Promise<bigint | null>;
  /** null when the network does not know the transaction. */
  transaction(hash: string): Promise<{ successful: boolean } | null>;
}

export interface ReconciliationReport {
  ok: boolean;
  checkedAt: string;
  network: string;
  pool: string;
  poolBalanceStroops: string | null;
  spendableStroops: string | null;
  obligationsStroops: string;
  obligations: { releasedUnclaimed: string; verifiedUnpaid: string; promisedToLearners: string };
  paidPayoutsChecked: number;
  issues: string[];
}

/** Horizon writes balances as decimal strings with up to 7 places; read them without floating point. */
export function decimalToStroops(value: string): bigint {
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole) * 10_000_000n + BigInt((frac + '0000000').slice(0, 7));
}

function horizonClient(network: 'testnet' | 'public'): ReconciliationHorizon {
  const server = new Horizon.Server(HORIZON_URL[network]);
  return {
    async balanceStroops(account) {
      try {
        const loaded = await server.loadAccount(account);
        const native = loaded.balances.find(b => b.asset_type === 'native');
        return native ? decimalToStroops(native.balance) : 0n;
      } catch (err) { if (err instanceof NotFoundError) return null; throw err; }
    },
    async transaction(hash) {
      try { const tx = await server.transactions().transaction(hash).call(); return { successful: tx.successful }; }
      catch (err) { if (err instanceof NotFoundError) return null; throw err; }
    },
  };
}

const sum = (sql: string, ...args: unknown[]) => BigInt((db.prepare(sql).get(...args) as { total: number }).total ?? 0);

export async function reconcileRewardTreasury(horizon?: ReconciliationHorizon, now = new Date()): Promise<ReconciliationReport> {
  const cfg = payoutConfiguration();
  const network = process.env.REWARD_STELLAR_NETWORK ?? 'unset';
  const pool = process.env.REWARD_STELLAR_DESTINATION ?? '';
  const issues: string[] = [];

  // What the LMS owes learners, in XLM stroops. Released balances are only what learners have not yet claimed.
  const releasedUnclaimed = sum(`SELECT COALESCE(SUM(MAX(0, a.available_stroops - COALESCE(v.total, 0))), 0) AS total
    FROM reward_accounts a
    LEFT JOIN (SELECT user_id, SUM(amount_stroops) AS total FROM reward_claims WHERE status = 'verified' GROUP BY user_id) v ON v.user_id = a.user_id
    WHERE a.account_type = 'recipient' AND a.currency_code = 'XLM'`);
  const verifiedUnpaid = sum(`SELECT COALESCE(SUM(c.amount_stroops), 0) AS total FROM reward_claims c
    WHERE c.status = 'verified' AND NOT EXISTS (SELECT 1 FROM reward_claim_payouts p WHERE p.claim_id = c.id AND p.status = 'paid')`);
  const promisedToLearners = sum(`SELECT COALESCE(SUM(amount_stroops), 0) AS total FROM reward_allocations WHERE status IN ('pending', 'eligible')`);
  const obligations = releasedUnclaimed + verifiedUnpaid + promisedToLearners;

  for (const o of overCommittedLearners()) issues.push(`learner ${o.userId.slice(0, 8)} has verified claims ${o.shortfallStroops} stroops above their balance`);

  let poolBalance: bigint | null = null;
  let spendable: bigint | null = null;
  let paidChecked = 0;
  if (!cfg) {
    issues.push('payouts are not configured, so the pool could not be checked');
  } else {
    const chain = horizon ?? horizonClient(cfg.network as 'testnet' | 'public');
    poolBalance = await chain.balanceStroops(pool);
    if (poolBalance === null) issues.push('the reward pool account does not exist on the network');
    else {
      spendable = poolBalance > POOL_RESERVE_STROOPS ? poolBalance - POOL_RESERVE_STROOPS : 0n;
      if (spendable < obligations) issues.push(`the pool can spend ${spendable} stroops but the LMS owes learners ${obligations} stroops`);
    }
    const paid = db.prepare(`SELECT claim_id, tx_hash FROM reward_claim_payouts WHERE network = ? AND status = 'paid' ORDER BY updated_at DESC LIMIT 20`)
      .all(cfg.network) as { claim_id: string; tx_hash: string }[];
    for (const p of paid) {
      paidChecked++;
      const tx = await chain.transaction(p.tx_hash);
      if (!tx) issues.push(`payout for claim ${p.claim_id.slice(0, 8)} is recorded as paid but the network does not know transaction ${p.tx_hash.slice(0, 12)}`);
      else if (!tx.successful) issues.push(`payout for claim ${p.claim_id.slice(0, 8)} is recorded as paid but the network says it failed`);
    }
  }

  const report: ReconciliationReport = {
    ok: issues.length === 0, checkedAt: now.toISOString(), network, pool,
    poolBalanceStroops: poolBalance === null ? null : poolBalance.toString(),
    spendableStroops: spendable === null ? null : spendable.toString(),
    obligationsStroops: obligations.toString(),
    obligations: { releasedUnclaimed: releasedUnclaimed.toString(), verifiedUnpaid: verifiedUnpaid.toString(), promisedToLearners: promisedToLearners.toString() },
    paidPayoutsChecked: paidChecked, issues,
  };
  if (report.ok) logger.info({ module: 'reward-reconciliation', report }, 'Reward treasury reconciliation passed');
  else logger.error({ module: 'reward-reconciliation', report }, 'Reward treasury reconciliation found problems');
  return report;
}

const DAY_MS = 24 * 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

/** Runs the check a minute after start and then daily, unless REWARD_RECONCILIATION=off. Failures are logged, never thrown. */
export function startRewardReconciliation(): void {
  if (timer || process.env.REWARD_RECONCILIATION === 'off') return;
  const run = () => { reconcileRewardTreasury().catch(err => logger.error({ module: 'reward-reconciliation', err }, 'Reward treasury reconciliation could not run')); };
  setTimeout(run, 60_000).unref();
  timer = setInterval(run, DAY_MS);
  timer.unref();
}
