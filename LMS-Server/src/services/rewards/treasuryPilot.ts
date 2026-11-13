import { db } from '../../config/database.js';
import { decimalXlmToStroops, MAX_SAFE_STROOPS } from './currencyConfig.js';
import { RewardError } from './rewardErrors.js';

const learnerCap = decimalXlmToStroops('0.1');
const publicCreditEvidence = `
  SELECT 1 FROM reward_funding_intents i
  JOIN reward_funding_evidence e ON e.intent_id = i.id
  WHERE i.reward_id = ? AND e.source_type = 'platform_credit' AND e.network = 'public'
`;

function budget(): bigint {
  const configured = process.env.REWARD_TREASURY_PILOT_TOTAL_STROOPS;
  if (configured && configured === configured.trim() && /^[1-9][0-9]{0,15}$/.test(configured)) {
    const amount = BigInt(configured);
    if (amount <= MAX_SAFE_STROOPS) return amount;
  }
  throw new RewardError('TREASURY_PILOT_UNAVAILABLE', 'The public treasury pilot budget is not configured.', 503);
}

/** The configured treasury pilot budget in stroops; throws when it is not configured. */
export const treasuryBudgetStroops = budget;

/** Call inside the immediate transaction that records the request or approval. */
export function enforceTreasuryBudget(network: string, alreadyCommitted: number, amount: number) {
  if (network !== 'public') return;
  if (BigInt(alreadyCommitted) + BigInt(amount) > budget()) {
    throw new RewardError('TREASURY_PILOT_LIMIT_EXCEEDED', 'This request exceeds the treasury pilot budget.', 409);
  }
}

/** Use immutable funding evidence, so changing the configured network cannot bypass the learner cap. */
export function enforceTreasuryLearnerCap(
  rewardId: string, learners: string[], amount: number, includePending: boolean,
) {
  if (!db.prepare(publicCreditEvidence).get(rewardId)) return;
  budget();
  const remaining = learnerCap - BigInt(amount);
  const exceeded = remaining < 0n || db.prepare(`
    SELECT 1 FROM reward_allocations a
    JOIN json_each(?) learner ON learner.value = a.student_user_id
    WHERE (a.status IN ('released', 'refunded') OR (? = 1 AND a.status IN ('pending', 'eligible')))
      AND EXISTS (
        SELECT 1 FROM reward_funding_intents i
        JOIN reward_funding_evidence e ON e.intent_id = i.id
        WHERE i.reward_id = a.reward_id AND e.source_type = 'platform_credit' AND e.network = 'public'
      )
    GROUP BY a.student_user_id
    HAVING SUM(a.amount_stroops) > ?
    LIMIT 1
  `).get(JSON.stringify(learners), Number(includePending), remaining);
  if (exceeded) {
    throw new RewardError('TREASURY_PILOT_LIMIT_EXCEEDED', 'This allocation exceeds the 0.1 XLM treasury pilot limit per learner.', 409);
  }
}
