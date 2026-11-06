import { describe, it, expect, vi } from 'vitest';
import './setup.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { createReward, fundReward, fundRewardAsync } from '../services/rewards/rewardService.js';
import { createFundingIntent, getFundingAvailability } from '../services/rewards/rewardFundingIntentService.js';
import { reconcileAccount } from '../services/rewards/rewardLedger.js';

function fixture() {
  const owner = uuidv4(), admin = uuidv4(), other = uuidv4(), course = uuidv4(), cohort = uuidv4();
  for (const id of [owner, admin, other]) {
    db.prepare("INSERT INTO users (id,name,email,password_hash,role) VALUES (?,'Test',?,'hash','admin')").run(id, `${id}@test.invalid`);
  }
  db.prepare("INSERT INTO courses (id,title,course_code) VALUES (?,'Funding',?)").run(course, course);
  db.prepare("INSERT INTO sponsor_cohorts (id,sponsor_user_id,course_id,name) VALUES (?,?,?,'Funding')").run(cohort, owner, course);
  const reward = () => createReward(owner, {scopeType: 'sponsor_cohort', scopeId: cohort, rewardType: 'custom',
    amountStroops: '1234567', maxRecipients: 3, idempotencyKey: uuidv4()});
  return {owner, admin, other, reward};
}
const source = {type: 'admin_grant' as const, reference: 'approved-grant'};
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n: number}).n;

describe('durable reward funding intents', () => {
  it('binds the authoritative owner/asset/network/exposure and consumes evidence with a balanced reserve', () => {
    const f = fixture(), r = f.reward();
    const intent = createFundingIntent(r.id, f.admin, source, 'intent-1');
    expect(intent).toMatchObject({reward_id: r.id, owner_user_id: f.owner, actor_user_id: f.admin,
      network: 'internal', asset: 'native:XLM', currency_code: 'XLM', amount_stroops: 3703701, status: 'pending'});
    expect(count('reward_transactions')).toBe(0);
    fundReward(r.id, f.admin, {...source, intentId: intent.id}, 'fund-1');
    expect(db.prepare('SELECT status FROM reward_funding_intents WHERE id=?').get(intent.id)).toEqual({status: 'consumed'});
    expect(count('reward_funding_evidence')).toBe(1);
    expect(count('reward_transactions')).toBe(2);
    expect(reconcileAccount(f.owner, 'funder')).toMatchObject({matches: true, stored: {available: 0, reserved: 3703701}});
  });

  it('replays the same intent creation but rejects changed financial, resource, source and reference bindings', () => {
    const f = fixture(), r = f.reward();
    const intent = createFundingIntent(r.id, f.admin, source, 'same');
    expect(createFundingIntent(r.id, f.admin, source, 'same').id).toBe(intent.id);
    expect(() => createFundingIntent(f.reward().id, f.admin, source, 'same')).toThrow(/immutable intent/);
    expect(() => createFundingIntent(r.id, f.admin, {...source, reference: 'different'}, 'same')).toThrow(/immutable intent/);
    db.prepare('UPDATE rewards SET max_recipients=4 WHERE id=?').run(r.id);
    expect(() => fundReward(r.id, f.admin, {...source, intentId: intent.id}, 'fund')).toThrow(/immutable intent/);
    expect(count('reward_transactions')).toBe(0);
  });

  it('rejects foreign actor/reward intents, missing IDs and expired intents without credits', () => {
    const f = fixture(), r = f.reward(), r2 = f.reward();
    const intent = createFundingIntent(r.id, f.admin, source, 'intent');
    for (const [reward, actor, id] of [[r2.id, f.admin, intent.id], [r.id, f.other, intent.id], [r.id, f.admin, 'missing']]) {
      expect(() => fundReward(reward, actor, {...source, intentId: id}, uuidv4())).toThrow(/immutable intent/);
    }
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(intent.expires_at) + 1);
    try {
      expect(() => fundReward(r.id, f.admin, {...source, intentId: intent.id}, 'expired')).toThrow(/expired/);
    } finally { clock.mockRestore(); }
    expect(count('reward_transactions')).toBe(0);
  });

  it('records an automatic intent for existing callers and binds explicit replay to that evidence', async () => {
    const f = fixture(), r = f.reward();
    await fundRewardAsync(r.id, f.admin, source, 'legacy');
    const intent = db.prepare('SELECT id FROM reward_funding_intents WHERE reward_id=?').get(r.id) as {id: string};
    await expect(fundRewardAsync(r.id, f.admin, {...source, intentId: intent.id}, 'legacy')).resolves.toMatchObject({status: 'funded'});
    await expect(fundRewardAsync(r.id, f.admin, {...source, intentId: 'wrong'}, 'legacy')).rejects.toThrow(/immutable intent/);
    expect(count('reward_funding_evidence')).toBe(1);
    expect(count('reward_transactions')).toBe(2);
  });

  it('rolls back both ledger entries, balances and consumption if evidence persistence fails', () => {
    const f = fixture(), r = f.reward();
    const intent = createFundingIntent(r.id, f.admin, source, 'intent');
    db.exec("CREATE TRIGGER fail_funding_evidence BEFORE INSERT ON reward_funding_evidence BEGIN SELECT RAISE(ABORT, 'storage failure'); END");
    expect(() => fundReward(r.id, f.admin, {...source, intentId: intent.id}, 'fund')).toThrow('storage failure');
    expect(count('reward_transactions')).toBe(0);
    expect(count('reward_accounts')).toBe(0);
    expect(db.prepare('SELECT status FROM rewards WHERE id=?').get(r.id)).toEqual({status: 'draft'});
    expect(db.prepare('SELECT status FROM reward_funding_intents WHERE id=?').get(intent.id)).toEqual({status: 'pending'});
    db.exec('DROP TRIGGER fail_funding_evidence');
    expect(fundReward(r.id, f.admin, {...source, intentId: intent.id}, 'fund').status).toBe('funded');
  });

  it('retains immutable intent/evidence history and rejects evidence reuse across rewards', () => {
    const f = fixture(), r = f.reward();
    fundReward(r.id, f.admin, source, 'fund');
    expect(() => fundReward(f.reward().id, f.admin, source, 'another')).toThrow(/already been consumed/);
    expect(() => db.exec("UPDATE reward_funding_intents SET amount_stroops=1")).toThrow(/immutable/);
    expect(() => db.exec("UPDATE reward_funding_evidence SET reference='changed'")).toThrow(/immutable/);
    expect(() => db.exec('DELETE FROM reward_funding_evidence')).toThrow(/immutable/);
    expect(() => db.exec('DELETE FROM reward_funding_intents')).toThrow(/immutable/);
    expect(count('reward_funding_evidence')).toBe(1);
  });

  it('rechecks current authority on an existing intent and never offers unsupported or self grants', () => {
    const f = fixture(), r = f.reward();
    const intent = createFundingIntent(r.id, f.admin, source, 'intent');
    db.prepare('DELETE FROM user_roles WHERE user_id=?').run(f.admin);
    expect(() => fundReward(r.id, f.admin, {...source, intentId: intent.id}, 'fund')).toThrow(/reward.manage/);
    expect(getFundingAvailability(r.id, f.owner).every(option => !option.available)).toBe(true);
    const options = getFundingAvailability(r.id, f.other);
    expect(options.filter(option => option.available).map(option => option.sourceType)).toEqual(['admin_grant']);
    for (const type of ['stellar', 'paystack', 'platform_credit'] as const) {
      expect(() => createFundingIntent(r.id, f.other, {type}, uuidv4())).toThrowError(expect.objectContaining({code: 'FUNDING_UNVERIFIED', statusCode: 402}));
    }
    expect(count('reward_transactions')).toBe(0);
  });

  it('serializes simultaneous async retries to one fund/reserve and one evidence record', async () => {
    const f = fixture(), r = f.reward();
    const results = await Promise.all(Array.from({length: 8}, () => fundRewardAsync(r.id, f.admin, source, 'concurrent')));
    expect(results.every(result => result.status === 'funded')).toBe(true);
    expect(count('reward_funding_intents')).toBe(1);
    expect(count('reward_funding_evidence')).toBe(1);
    expect(count('reward_transactions')).toBe(2);
  });
});
