import { describe, it, expect, vi, afterEach } from 'vitest';
import './setup.js';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { v4 as uuid } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

afterEach(() => vi.unstubAllEnvs());

const scriptUrl = pathToFileURL(path.resolve(__dirname, '../../../scripts/lms034-credit-run.mjs')).href;
type Call = (method: string, p: string, o?: { token?: string; body?: unknown }) => Promise<{ status: number; body: any }>;

function person(roleId: string, legacy: 'student' | 'lecturer' | 'admin', name: string) {
  const id = uuid(), email = `${id}@test.invalid`;
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'hash', ?)").run(id, name, email, legacy);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, roleId);
  return { id, email, token: makeToken({ userId: id, email, role: legacy }) };
}

function setup() {
  const teacher = person('role_teacher', 'lecturer', 'Teacher');
  const adminA = person('role_admin', 'admin', 'Admin A');
  const adminB = person('role_admin', 'admin', 'Admin B');
  const learner = person('role_student', 'student', 'Learner');
  const classId = uuid();
  db.prepare('INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, ?, ?, ?)').run(classId, 'Class', 'class', teacher.id);
  db.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(classId, learner.id);
  // A verified backing deposit on the public network, as the real deposit is on staging.
  const destination = Keypair.random().publicKey();
  vi.stubEnv('REWARD_STELLAR_NETWORK', 'public');
  vi.stubEnv('REWARD_STELLAR_DESTINATION', destination);
  vi.stubEnv('REWARD_TREASURY_SOURCE_ACCOUNT', Keypair.random().publicKey());
  vi.stubEnv('REWARD_TREASURY_PILOT_TOTAL_STROOPS', '100000000');
  const intent = uuid(), hex = (c: string) => c.repeat(64);
  db.prepare(`INSERT INTO platform_backing_intents (id, requester_user_id, network, destination, memo_hash, amount_stroops, reason, idempotency_key, expires_at, created_at)
    VALUES (?, ?, 'public', ?, ?, 5000000, 'Test backing', ?, '2099-01-01T00:00:00.000Z', '2026-11-16T00:00:00.000Z')`).run(intent, adminA.id, destination, hex('a'), uuid());
  db.prepare(`INSERT INTO platform_backing_deposits (id, intent_id, verified_by_user_id, network, operation_id, amount_stroops, transaction_hash, ledger_sequence, ledger_hash, created_at)
    VALUES (?, ?, ?, 'public', '281376192463028225', 5000000, ?, 65513000, ?, '2026-11-16T00:00:00.000Z')`).run(uuid(), intent, adminA.id, hex('b'), hex('c'));
  const call: Call = async (method, p, o = {}) => {
    let r = (request(app) as any)[method.toLowerCase()](`/api/v1${p}`);
    if (o.token) r = r.set('Authorization', `Bearer ${o.token}`);
    const res = await (o.body ? r.send(o.body) : r);
    return { status: res.status, body: res.body };
  };
  return { teacher, adminA, adminB, learner, classId, call };
}

describe('LMS-034 credit path script', () => {
  it('runs the whole path against the real API: create, request, independent approval, reserve and authorize, activate', async () => {
    const { runCreditPath } = await import(/* @vite-ignore */ scriptUrl);
    const s = setup(), lines: string[] = [];
    const out = await runCreditPath({ call: s.call, log: (a: string, b: string) => lines.push(`${a} ${b}`), runId: 'run-test-1', classId: s.classId, amountStroops: '1000000',
      teacher: { token: s.teacher.token }, requester: { token: s.adminA.token }, approver: { token: s.adminB.token } });
    expect(out.status).toBe('active');
    const reward = db.prepare('SELECT status, amount_stroops, max_recipients, creator_user_id FROM rewards WHERE id = ?').get(out.rewardId) as any;
    expect(reward).toMatchObject({ status: 'active', amount_stroops: 1000000, max_recipients: 1, creator_user_id: s.teacher.id });
    expect(db.prepare("SELECT status FROM platform_credit_requests WHERE id = ?").get(out.requestId)).toMatchObject({ status: 'approved' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM platform_credit_consumptions').get()).toMatchObject({ n: 1 });
    expect(lines.some(l => l.startsWith('activate reward is active'))).toBe(true);
  });

  it('is safe to run again with the same run id: nothing is created twice', async () => {
    const { runCreditPath } = await import(/* @vite-ignore */ scriptUrl);
    const s = setup(), args = { call: s.call, runId: 'run-test-2', classId: s.classId, amountStroops: '1000000',
      teacher: { token: s.teacher.token }, requester: { token: s.adminA.token }, approver: { token: s.adminB.token } };
    const first = await runCreditPath(args);
    const second = await runCreditPath(args);
    expect(second.rewardId).toBe(first.rewardId);
    expect(db.prepare('SELECT COUNT(*) AS n FROM rewards').get()).toMatchObject({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM platform_credit_requests').get()).toMatchObject({ n: 1 });
  });

  it('refuses the same person as requester and approver, and creates nothing past the refusal', async () => {
    const { runCreditPath } = await import(/* @vite-ignore */ scriptUrl);
    const s = setup();
    await expect(runCreditPath({ call: s.call, runId: 'run-test-3', classId: s.classId, amountStroops: '1000000',
      teacher: { token: s.teacher.token }, requester: { token: s.adminA.token }, approver: { token: s.adminA.token } })).rejects.toThrow(/Approving the credit failed/);
    expect(db.prepare("SELECT status FROM platform_credit_requests").get()).toMatchObject({ status: 'pending' });
  });

  it('dry run reads only, and a missing backing stops it before anything is created', async () => {
    const { runCreditPath } = await import(/* @vite-ignore */ scriptUrl);
    const s = setup();
    const dry = await runCreditPath({ call: s.call, runId: 'run-test-4', classId: s.classId, amountStroops: '1000000', dryRun: true,
      teacher: { token: s.teacher.token }, requester: { token: s.adminA.token }, approver: { token: s.adminB.token } });
    expect(dry).toEqual({ dryRun: true });
    expect(db.prepare('SELECT COUNT(*) AS n FROM rewards').get()).toMatchObject({ n: 0 });
    await expect(runCreditPath({ call: s.call, runId: 'run-test-5', classId: s.classId, amountStroops: '900000000',
      teacher: { token: s.teacher.token }, requester: { token: s.adminA.token }, approver: { token: s.adminB.token } })).rejects.toThrow(/Not enough verified backing/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM rewards').get()).toMatchObject({ n: 0 });
  });

  it('converts amounts exactly', async () => {
    const { xlmToStroops } = await import(/* @vite-ignore */ scriptUrl);
    expect(xlmToStroops('0.1')).toBe('1000000');
    expect(xlmToStroops('1')).toBe('10000000');
    expect(() => xlmToStroops('0')).toThrow();
    expect(() => xlmToStroops('0.12345678')).toThrow();
  });

  it('stops when a sign-in is not the expected account, and accepts the right one regardless of case', async () => {
    const { assertWho } = await import(/* @vite-ignore */ scriptUrl);
    expect(() => assertWho('the teacher', 'tester@smwebsystems.com', 'mukhtar.meer@smwebsystems.com')).toThrow(/must be tester@smwebsystems.com, but that sign-in was mukhtar/);
    expect(() => assertWho('the teacher', 'Tester@smwebsystems.com', 'tester@SMWEBSYSTEMS.com')).not.toThrow();
    expect(() => assertWho('the teacher', undefined, 'anyone@x.test')).not.toThrow();
  });

  it('never prints what is typed or pasted at a hidden prompt', () => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import('${scriptUrl}').then(async m => { const v = await m.askHidden('Token: '); console.log('LENGTH ' + v.length); })`],
    { input: 'super-secret-token-value\n', encoding: 'utf8' });
    expect(run.stdout).toContain('Token: ');
    expect(run.stdout).toContain('LENGTH 24');
    expect(run.stdout).not.toContain('super-secret-token-value');
    expect(run.stderr).not.toContain('super-secret-token-value');
  });

  it('releases an eligible allocation to the learner with only the teacher sign-in, and skips one already released', async () => {
    const { runCreditPath, releaseEligible } = await import(/* @vite-ignore */ scriptUrl);
    const s = setup();
    const out = await runCreditPath({ call: s.call, runId: 'run-test-6', classId: s.classId, amountStroops: '1000000',
      teacher: { token: s.teacher.token }, requester: { token: s.adminA.token }, approver: { token: s.adminB.token } });
    // The scheduler marks the allocation eligible when the learner's event is processed; here it is set directly.
    const alloc = db.prepare('SELECT id, status FROM reward_allocations WHERE reward_id = ?').get(out.rewardId) as { id: string; status: string };
    expect(alloc.status).toBe('pending');
    const early = await releaseEligible({ call: s.call, runId: 'run-test-6', rewardId: out.rewardId, teacher: { token: s.teacher.token } });
    expect(early).toEqual([{ id: alloc.id, status: 'pending' }]);
    db.prepare("UPDATE reward_allocations SET status = 'eligible' WHERE id = ?").run(alloc.id);
    const done = await releaseEligible({ call: s.call, runId: 'run-test-6', rewardId: out.rewardId, teacher: { token: s.teacher.token } });
    expect(done).toEqual([{ id: alloc.id, status: 'released' }]);
    expect(db.prepare("SELECT available_stroops AS a FROM reward_accounts WHERE user_id = ? AND account_type = 'recipient'").get(s.learner.id)).toMatchObject({ a: 1000000 });
    const again = await releaseEligible({ call: s.call, runId: 'run-test-6', rewardId: out.rewardId, teacher: { token: s.teacher.token } });
    expect(again).toEqual([{ id: alloc.id, status: 'released' }]);
    expect(db.prepare("SELECT available_stroops AS a FROM reward_accounts WHERE user_id = ? AND account_type = 'recipient'").get(s.learner.id)).toMatchObject({ a: 1000000 });
  });

  it('reversal: cancelling a credit-funded reward before release cancels, is safe to repeat, and leaves the credit grant consumed (recorded behaviour)', async () => {
    const { runCreditPath, cancelFunded } = await import(/* @vite-ignore */ scriptUrl);
    const s = setup();
    const out = await runCreditPath({ call: s.call, runId: 'run-test-7', classId: s.classId, amountStroops: '1000000',
      teacher: { token: s.teacher.token }, requester: { token: s.adminA.token }, approver: { token: s.adminB.token } });
    const before = db.prepare("SELECT status FROM platform_credit_reservations").all();
    expect(before).toEqual([{ status: 'consumed' }]);
    const first = await cancelFunded({ call: s.call, runId: 'run-test-7', rewardId: out.rewardId, teacher: { token: s.teacher.token } });
    expect(first.status).toBe('cancelled');
    const again = await cancelFunded({ call: s.call, runId: 'run-test-7', rewardId: out.rewardId, teacher: { token: s.teacher.token } });
    expect(again.status).toBe('cancelled');
    // Today's behaviour, recorded so a change is noticed: the reward's funds go back to the funder's reward account (a 'cancel'
    // ledger entry) but the platform credit grant stays consumed and the pool still counts it as allocated.
    const credits = await s.call('GET', `/admin/rewards/platform-credit/credits/${s.teacher.id}`, { token: s.adminB.token });
    expect(credits.body.data[0]).toMatchObject({ availableStroops: 0, consumedStroops: 1000000 });
    const ledger = db.prepare("SELECT transaction_type AS t FROM reward_transactions ORDER BY rowid").all() as { t: string }[];
    expect(ledger.map(r => r.t)).toEqual(['fund', 'reserve', 'cancel']);
    const pool = await s.call('GET', '/admin/rewards/platform-credit', { token: s.adminB.token });
    expect(pool.body.data.pools.find((p: { network: string }) => p.network === 'public')).toMatchObject({ depositedStroops: 5000000, allocatedStroops: 1000000, availableStroops: 4000000 });
  });
});
