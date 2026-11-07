import { seedTestAccount } from './helpers/rbacFixtures.js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import './setup.js';
import { Keypair, Networks } from '@stellar/stellar-sdk';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { createReward, fundRewardAsync } from '../services/rewards/rewardService.js';
import { createFundingIntent, getFundingAvailability, createFundingIntentVerified, verifiedFundingAvailability } from '../services/rewards/rewardFundingIntentService.js';

afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks();});
function fixture() {
  const owner = uuidv4(), stranger = uuidv4(), course = uuidv4(), cohort = uuidv4();
  for (const id of [owner, stranger]) {
    seedTestAccount(db, "INSERT INTO users(id,name,email,password_hash) VALUES (?,'Synthetic',?,'hash')", [id, `${id}@test.invalid`], ["role_instructor"]);
    db.prepare("INSERT INTO user_roles(user_id,role_id) VALUES (?,'role_sponsor')").run(id);
  }
  db.prepare("INSERT INTO courses(id,title,course_code) VALUES (?,'Stellar',?)").run(course, course);
  db.prepare("INSERT INTO sponsor_cohorts(id,sponsor_user_id,course_id,name) VALUES (?,?,?,'Stellar')").run(cohort, owner, course);
  const reward = createReward(owner, {scopeType: 'sponsor_cohort', scopeId: cohort, rewardType: 'custom', amountStroops: '1234567', maxRecipients: 3, idempotencyKey: uuidv4()});
  vi.stubEnv('REWARD_STELLAR_NETWORK', 'testnet'); vi.stubEnv('REWARD_STELLAR_DESTINATION', Keypair.random().publicKey());
  const intent = createFundingIntent(reward.id, owner, {type: 'stellar'}, 'prepare');
  const reference = {type: 'stellar' as const, intentId: intent.id, reference: '123'};
  const responses: Record<string, Record<string, unknown>> = {
    '/': {network_passphrase: Networks.TESTNET, history_latest_ledger: 30},
    '/operations/123': {id: '123', type: 'payment', transaction_successful: true, to: intent.destination,
      asset_type: 'native', amount: '0.3703701', transaction_hash: 'b'.repeat(64)},
    [`/transactions/${'b'.repeat(64)}`]: {hash: 'b'.repeat(64), successful: true, ledger: 30, created_at: intent.created_at.replace(' ', 'T') + 'Z',
      memo_type: 'hash', memo: Buffer.from(intent.memo_hash!, 'hex').toString('base64')},
    '/ledgers/30': {sequence: 30, hash: 'c'.repeat(64), closed_at: intent.created_at.replace(' ', 'T') + 'Z'},
  };
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(responses[new URL(url).pathname]), {status: 200}));
  vi.stubGlobal('fetch', fetcher);
  return {owner, stranger, reward, intent, reference, responses, fetcher};
}
const counts = () => ({ledger: (db.prepare('SELECT COUNT(*) AS n FROM reward_transactions').get() as {n: number}).n,
  evidence: (db.prepare('SELECT COUNT(*) AS n FROM reward_funding_evidence').get() as {n: number}).n,
  stellar: (db.prepare('SELECT COUNT(*) AS n FROM reward_stellar_funding_evidence').get() as {n: number}).n});

describe('Stellar intent verification and atomic consumption', () => {
  it('derives immutable deposit instructions from dedicated configuration and keeps other funding unavailable', () => {
    const f = fixture();
    expect(f.intent).toMatchObject({owner_user_id: f.owner, actor_user_id: f.owner, network: 'testnet', asset: 'native:XLM', amount_stroops: 3703701});
    expect(f.intent.memo_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(getFundingAvailability(f.reward.id, f.owner).filter(option => option.available).map(option => option.sourceType)).toEqual(['stellar']);
    expect(() => db.exec("UPDATE reward_stellar_funding_bindings SET destination='changed'")).toThrow(/immutable/);
    expect(() => createFundingIntent(f.reward.id, f.owner, {type: 'stellar', reference: '123'}, 'another')).toThrow(/before sending/);
    vi.stubEnv('REWARD_STELLAR_NETWORK', '');
    expect(getFundingAvailability(f.reward.id, f.owner).some(option => option.available)).toBe(false);
    expect(() => createFundingIntent(f.reward.id, f.owner, {type: 'stellar'}, 'unconfigured')).toThrow(/not configured/);
  });

  it('consumes exact closed payment once and replays without another provider call', async () => {
    const f = fixture();
    await expect(fundRewardAsync(f.reward.id, f.owner, f.reference, 'fund')).resolves.toMatchObject({status: 'funded'});
    expect(counts()).toEqual({ledger: 2, evidence: 1, stellar: 1});
    expect(db.prepare("SELECT funding_reference FROM reward_transactions WHERE transaction_type='fund'").get()).toEqual({funding_reference: 'stellar:testnet:123'});
    expect(db.prepare('SELECT available_stroops,reserved_stroops FROM reward_accounts WHERE user_id=?').get(f.owner)).toEqual({available_stroops: 0, reserved_stroops: 3703701});
    f.fetcher.mockClear();
    await expect(fundRewardAsync(f.reward.id, f.owner, f.reference, 'fund')).resolves.toMatchObject({status: 'funded'});
    expect(f.fetcher).not.toHaveBeenCalled();
    await expect(fundRewardAsync(f.reward.id, f.stranger, f.reference, 'fund')).rejects.toMatchObject({statusCode: 404});
    expect(() => db.exec("UPDATE reward_stellar_funding_evidence SET ledger_sequence=99")).toThrow(/immutable/);
  });

  it('retains pinned instructions for an existing intent when new configuration changes', async () => {
    const f = fixture();
    vi.stubEnv('REWARD_STELLAR_NETWORK', 'public'); vi.stubEnv('REWARD_STELLAR_DESTINATION', Keypair.random().publicKey());
    expect(createFundingIntent(f.reward.id, f.owner, {type: 'stellar'}, 'prepare').destination).toBe(f.intent.destination);
    await expect(fundRewardAsync(f.reward.id, f.owner, f.reference, 'fund')).resolves.toMatchObject({status: 'funded'});
    expect(f.fetcher.mock.calls.every(([url]) => new URL(url).hostname === 'horizon-testnet.stellar.org')).toBe(true);
  });

  it('rolls back fund, reserve, base evidence and intent consumption if provider evidence cannot persist', async () => {
    const f = fixture();
    db.exec("CREATE TRIGGER synthetic_stellar_failure BEFORE INSERT ON reward_stellar_funding_evidence BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END");
    await expect(fundRewardAsync(f.reward.id, f.owner, f.reference, 'fund')).rejects.toThrow('synthetic storage failure');
    expect(counts()).toEqual({ledger: 0, evidence: 0, stellar: 0});
    expect(db.prepare('SELECT status FROM reward_funding_intents WHERE id=?').get(f.intent.id)).toEqual({status: 'pending'});
    expect(db.prepare('SELECT COUNT(*) AS n FROM reward_accounts').get()).toEqual({n: 0});
    db.exec('DROP TRIGGER synthetic_stellar_failure');
    await expect(fundRewardAsync(f.reward.id, f.owner, f.reference, 'fund')).resolves.toMatchObject({status: 'funded'});
  });

  it('rechecks current funding permission after provider verification', async () => {
    const f = fixture();
    const original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async url => {
      if (new URL(url).pathname === '/ledgers/30') db.prepare('DELETE FROM user_roles WHERE user_id=?').run(f.owner);
      return original(url);
    });
    await expect(fundRewardAsync(f.reward.id, f.owner, f.reference, 'fund')).rejects.toMatchObject({statusCode: 403});
    expect(counts()).toEqual({ledger: 0, evidence: 0, stellar: 0});
  });

  it('rejects missing intent and forged memo evidence without crediting a reward', async () => {
    const f = fixture();
    await expect(fundRewardAsync(f.reward.id, f.owner, {type: 'stellar', reference: '123'}, 'missing')).rejects.toMatchObject({statusCode: 402});
    expect(f.fetcher).not.toHaveBeenCalled();
    f.responses[`/transactions/${'b'.repeat(64)}`].memo = Buffer.alloc(32).toString('base64');
    await expect(fundRewardAsync(f.reward.id, f.owner, f.reference, 'wrong')).rejects.toMatchObject({statusCode: 402});
    expect(counts()).toEqual({ledger: 0, evidence: 0, stellar: 0});
  });

  it('serializes concurrent verified callbacks to one credit and refuses a new key after consumption', async () => {
    const f = fixture();
    const results = await Promise.all(Array.from({length: 5}, () => fundRewardAsync(f.reward.id, f.owner, f.reference, 'fund')));
    expect(results.every(reward => reward.status === 'funded')).toBe(true);
    await expect(fundRewardAsync(f.reward.id, f.owner, f.reference, 'different')).rejects.toMatchObject({statusCode: 409});
    expect(counts()).toEqual({ledger: 2, evidence: 1, stellar: 1});
  });

  it('keeps inactive receivers unavailable and refuses to issue new payment instructions', async () => {
    const f = fixture();
    const original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async url => new URL(url).pathname.startsWith('/accounts/')
      ? new Response('{}', {status: 404}) : original(url));
    const options = await verifiedFundingAvailability(f.reward.id, f.owner);
    expect(options.find(option => option.sourceType === 'stellar')).toMatchObject({available: false, reason: expect.stringContaining('not active')});
    await expect(createFundingIntentVerified(f.reward.id, f.owner, {type: 'stellar'}, 'new-deposit')).rejects.toMatchObject({statusCode: 503});
    expect(db.prepare('SELECT COUNT(*) AS n FROM reward_funding_intents').get()).toEqual({n: 1});
  });

  it('checks active receiver/network before issuing fresh instructions and rechecks configuration after waiting', async () => {
    const f = fixture();
    const configDestination = process.env.REWARD_STELLAR_DESTINATION;
    const original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async url => new URL(url).pathname.startsWith('/accounts/')
      ? new Response(JSON.stringify({account_id: configDestination}), {status: 200}) : original(url));
    await expect(createFundingIntentVerified(f.reward.id, f.owner, {type: 'stellar'}, 'new-deposit')).resolves.toMatchObject({destination: configDestination});
    expect((await verifiedFundingAvailability(f.reward.id, f.owner)).find(option => option.sourceType === 'stellar')?.available).toBe(true);
    f.fetcher.mockImplementation(async url => {
      if (new URL(url).pathname.startsWith('/accounts/')) {
        vi.stubEnv('REWARD_STELLAR_DESTINATION', Keypair.random().publicKey());
        return new Response(JSON.stringify({account_id: configDestination}), {status: 200});
      }
      return original(url);
    });
    await expect(createFundingIntentVerified(f.reward.id, f.owner, {type: 'stellar'}, 'changed-config')).rejects.toMatchObject({statusCode: 503});
  });
});
