import { db } from '../../config/database.js';
import { RewardError } from './rewardErrors.js';

type Pool = {
  network: 'public' | 'testnet';
  depositedStroops: number;
  allocatedStroops: number;
  reservedStroops: number;
  availableStroops: number;
};

function count(sql: string, ...parameters: string[]): number {
  return (db.prepare(sql).get(...parameters) as { count: number }).count;
}

/** Called with the pool totals from the same SQLite read transaction. */
export function reconcileCreditLedger(pool: Pool, asOf: string) {
  const { network } = pool;
  if ([pool.depositedStroops, pool.allocatedStroops, pool.reservedStroops, pool.availableStroops]
    .some(amount => !Number.isSafeInteger(amount))) {
    throw new RewardError('FUNDING_UNVERIFIED', 'Treasury ledger totals exceed the supported range.', 409);
  }
  const deposits = count(`
    SELECT COUNT(*) AS count FROM platform_backing_deposits d
    LEFT JOIN platform_backing_intents i ON i.id = d.intent_id
    WHERE (d.network = ? OR i.network = ?)
      AND (i.id IS NULL OR d.network IS NOT i.network OR d.amount_stroops IS NOT i.amount_stroops
        OR EXISTS (SELECT 1 FROM reward_funding_evidence e
          WHERE e.source_type = 'stellar' AND e.network = d.network AND e.reference = d.operation_id))
  `, network, network);
  const approvals = count(`
    SELECT COUNT(*) AS count FROM platform_credit_requests r
    LEFT JOIN platform_credit_grants g ON g.request_id = r.id
    WHERE r.network = ? AND (r.requester_user_id = r.beneficiary_user_id
      OR (r.status = 'approved') <> (g.id IS NOT NULL)
      OR g.approved_by_user_id IN (r.requester_user_id, r.beneficiary_user_id))
  `, network);
  const reservations = count(`
    SELECT COUNT(*) AS count FROM platform_credit_reservations c
    LEFT JOIN reward_funding_intents i ON i.id = c.intent_id
    LEFT JOIN platform_credit_grants g ON g.id = c.grant_id
    LEFT JOIN platform_credit_requests r ON r.id = g.request_id
    LEFT JOIN platform_credit_consumptions u ON u.intent_id = c.intent_id
    WHERE (r.network = ? OR i.network = ?)
      AND (i.id IS NULL OR r.id IS NULL OR i.source_type IS NOT 'platform_credit'
        OR i.network IS NOT r.network OR i.owner_user_id IS NOT r.beneficiary_user_id
        OR i.reference IS NOT c.grant_id OR i.amount_stroops IS NOT c.amount_stroops
        OR i.expires_at IS NOT c.expires_at OR (c.status = 'consumed') <> (u.intent_id IS NOT NULL)
        OR (c.status = 'consumed') <> (i.status = 'consumed'))
  `, network, network);
  const consumptions = count(`
    SELECT COUNT(*) AS count FROM platform_credit_consumptions u
    LEFT JOIN reward_funding_intents i ON i.id = u.intent_id
    LEFT JOIN reward_funding_evidence e ON e.id = u.evidence_id
    LEFT JOIN reward_transactions t ON t.id = u.fund_transaction_id
    WHERE (i.network = ? OR e.network = ?)
      AND (i.id IS NULL OR e.id IS NULL OR t.id IS NULL OR e.intent_id IS NOT i.id
        OR e.source_type IS NOT 'platform_credit' OR e.network IS NOT i.network
        OR e.verification_method IS NOT 'backed_platform_credit'
        OR e.reference IS NOT ('intent:' || i.id) OR e.ledger_transaction_id IS NOT t.id
        OR t.transaction_type IS NOT 'fund' OR t.funding_source_type IS NOT 'platform_credit'
        OR t.funding_reference IS NOT ('platform-credit:' || i.network || ':' || i.id)
        OR t.reward_id IS NOT i.reward_id OR t.amount_stroops IS NOT i.amount_stroops
        OR t.actor_user_id IS NOT i.actor_user_id OR t.destination_user_id IS NOT i.owner_user_id)
  `, network, network);
  const missingReservations = count(`
    SELECT COUNT(*) AS count FROM reward_funding_intents i
    WHERE i.network = ? AND i.source_type = 'platform_credit'
      AND NOT EXISTS (SELECT 1 FROM platform_credit_reservations c WHERE c.intent_id = i.id)
  `, network);
  const missingConsumptions = count(`
    SELECT COUNT(*) AS count FROM reward_funding_evidence e
    WHERE e.network = ? AND e.source_type = 'platform_credit'
      AND NOT EXISTS (SELECT 1 FROM platform_credit_consumptions u WHERE u.evidence_id = e.id)
  `, network);
  const grants = db.prepare(`
    SELECT r.amount_stroops AS approved,
      COALESCE(SUM(CASE WHEN c.status = 'held' AND c.expires_at > ? THEN c.amount_stroops END), 0) AS held,
      COALESCE(SUM(CASE WHEN c.status = 'consumed' THEN c.amount_stroops END), 0) AS consumed
    FROM platform_credit_grants g
    JOIN platform_credit_requests r ON r.id = g.request_id
    LEFT JOIN platform_credit_reservations c ON c.grant_id = g.id
    WHERE r.network = ? GROUP BY g.id
  `).safeIntegers().all(asOf, network) as { approved: bigint; held: bigint; consumed: bigint }[];
  const held = grants.reduce((sum, grant) => sum + grant.held, 0n);
  const consumed = grants.reduce((sum, grant) => sum + grant.consumed, 0n);
  const exceptionCounts = {
    depositBinding: deposits,
    approvalBinding: approvals,
    reservationBinding: reservations,
    consumptionBinding: consumptions,
    missingReservations,
    missingConsumptions,
    overcommittedGrants: grants.filter(grant => grant.held + grant.consumed > grant.approved).length,
    overcommittedPool: Number(pool.availableStroops < 0),
  };
  return {
    ...pool, asOf,
    heldGrantStroops: held.toString(),
    consumedGrantStroops: consumed.toString(),
    unreservedGrantStroops: (BigInt(pool.allocatedStroops) - held - consumed).toString(),
    exceptionCounts,
    internalLedgerBalanced: Object.values(exceptionCounts).every(value => value === 0),
  };
}
