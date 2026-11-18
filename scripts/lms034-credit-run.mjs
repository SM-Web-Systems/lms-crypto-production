#!/usr/bin/env node
/**
 * LMS-034: run the platform credit path for ONE small reward, end to end, with the people the rules require.
 *
 *   1. Teacher creates a reward for a class (max 1 recipient, default 0.1 XLM).
 *   2. Administrator A requests that much platform credit for the teacher.
 *   3. A different administrator approves the credit request.
 *   4. The approver reserves the credit on the reward and authorizes it (funded).
 *   5. The teacher activates the reward.
 * It stops there. Releasing the reward to the learner and the claim on the phone are separate steps.
 *
 * Nothing here moves XLM by itself: the credit is backed by the deposit already verified on the network, and the learner's claim
 * is a separate step. Every request has a fixed idempotency key built from the run id, so running it again with the same
 * --run id never creates anything twice.
 *
 *   node lms034-credit-run.mjs --base https://lms.smwebsystems.com --class <class id> --run lms034-1 [--amount 0.1] [--dry-run]
 *
 * Passwords and tokens are typed at the prompt (hidden) and never written anywhere.
 */
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STROOPS = 10_000_000n;

export function xlmToStroops(value) {
  const m = /^(\d{1,6})(?:\.(\d{1,7}))?$/.exec(String(value).trim());
  if (!m) throw new Error(`Bad amount "${value}"`);
  const s = BigInt(m[1]) * STROOPS + BigInt((m[2] ?? '').padEnd(7, '0'));
  if (s <= 0n) throw new Error('Amount must be above zero');
  return s.toString();
}

/**
 * The whole path, with the network call injected so the same code is tested against the real API in-process.
 * call(method, path, { token, body }) must return { status, body }.
 */
export async function runCreditPath({ call, log = () => {}, runId, classId, amountStroops, teacher, requester, approver, dryRun = false }) {
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(runId ?? '')) throw new Error('--run must be 4 to 40 letters, digits, - or _');
  if (!classId) throw new Error('--class is required');
  const key = step => `${runId}-${step}`;
  const need = (res, ok, what) => {
    if (!ok.includes(res.status)) {
      const err = res.body?.error;
      throw new Error(`${what} failed (HTTP ${res.status}${err?.code ? ` ${err.code}` : ''}${err?.message ? `: ${err.message}` : ''})`);
    }
    return res.body?.data;
  };

  // Who is who. Tokens only, so passwords never reach this function.
  const me = need(await call('GET', '/auth/me', { token: teacher.token }), [200], 'Reading the teacher account');
  const teacherId = me?.id ?? me?.user?.id;
  if (!teacherId) throw new Error('Could not read the teacher id');
  log('check', `teacher ${me.email ?? teacherId}, class ${classId}, ${BigInt(amountStroops) / STROOPS}.${(BigInt(amountStroops) % STROOPS).toString().padStart(7, '0')} XLM`);

  const pool = need(await call('GET', '/admin/rewards/platform-credit', { token: approver.token }), [200], 'Reading the platform credit summary');
  const pub = pool.pools.find(p => p.network === 'public');
  if (!pub || BigInt(pub.availableStroops) < BigInt(amountStroops)) throw new Error('Not enough verified backing is available on the public network');
  log('check', `available verified backing ${pub.availableStroops} stroops`);
  if (dryRun) { log('dry-run', 'nothing was created'); return { dryRun: true }; }

  // 1. The teacher creates the reward (one recipient, so the funding is exactly this amount).
  const reward = need(await call('POST', '/teacher/rewards', { token: teacher.token, body: {
    scopeId: classId, rewardType: 'custom', amountStroops: String(amountStroops), maxRecipients: 1,
    description: `Credit path check ${runId}`, idempotencyKey: key('create') } }), [200, 201], 'Creating the reward');
  log('reward', `created ${reward.id} (${reward.status})`);

  let request, grant, intent;
  // A run that stopped half way continues from the reward's real state; steps already done are never repeated.
  if (reward.status === 'draft') {
    // 2. Administrator A asks for the credit for the teacher.
    request = need(await call('POST', '/admin/rewards/platform-credit/requests', { token: requester.token, body: {
      beneficiaryUserId: teacherId, amountStroops: String(amountStroops), reason: `Credit path check ${runId}`, idempotencyKey: key('request') } }), [200, 201], 'Requesting credit');
    log('credit', `requested ${request.id}`);

    // 3. A different administrator approves it.
    need(await call('POST', `/admin/rewards/platform-credit/requests/${request.id}/approve`, { token: approver.token, body: {
      reason: `Approved for ${runId}`, idempotencyKey: key('approve') } }), [200, 201], 'Approving the credit');
    log('credit', 'approved by the independent administrator');

    // 4. The approver reserves that credit on the reward and authorizes it.
    const options = need(await call('GET', `/teacher/rewards/${reward.id}/funding-options`, { token: approver.token }), [200], 'Reading the funding options');
    const credit = options.find(o => o.sourceType === 'platform_credit');
    grant = credit?.available ? credit.creditGrants?.find(g => BigInt(g.availableStroops ?? 0) >= BigInt(amountStroops)) ?? credit.creditGrants?.[0] : undefined;
    if (!grant) throw new Error(`Platform credit is not offered for this reward (${credit?.reason ?? 'no credit grant for the teacher'})`);
    intent = need(await call('POST', `/teacher/rewards/${reward.id}/funding-intents`, { token: approver.token, body: {
      sourceType: 'platform_credit', reference: grant.id, idempotencyKey: key('intent') } }), [200, 201], 'Reserving the credit');
    const funded = need(await call('POST', `/teacher/rewards/${reward.id}/fund`, { token: approver.token, body: {
      sourceType: 'platform_credit', reference: grant.id, intentId: intent.id, idempotencyKey: key('fund') } }), [200, 201], 'Authorizing the funding');
    log('funding', `reward is ${funded.status}`);

  } else {
    log('resume', `reward is already ${reward.status}, skipping the credit steps`);
  }

  // 5. The teacher activates it.
  let status = reward.status === 'draft' ? 'funded' : reward.status;
  if (status !== 'active') {
    const active = need(await call('POST', `/teacher/rewards/${reward.id}/activate`, { token: teacher.token, body: { idempotencyKey: key('activate') } }), [200, 201], 'Activating the reward');
    status = active.status;
  }
  log('activate', `reward is ${status}`);
  return { rewardId: reward.id, requestId: request?.id ?? null, grantId: grant?.id ?? null, intentId: intent?.id ?? null, status };
}

// ───────────────────────── command line ─────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`Type only the command itself (stray "${argv[i]}").`);
    const k = argv[i].slice(2);
    if (k === 'dry-run') args[k] = true; else args[k] = argv[++i];
  }
  return args;
}

function ask(question, { hidden = false } = {}) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) { rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(s); }; }
    rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()); });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = (args.base ?? '').replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(base)) throw new Error('--base must be the https address of the LMS');
  const api = `${base}/api/v1`;
  const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(api + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  // Either a session token (paste it, as for the seed script) or an email and password, typed hidden. Accounts with a second factor need the token.
  const login = async who => {
    const pasted = await ask(`${who}: paste a session token, or press Enter to sign in with email and password: `, { hidden: true });
    if (pasted) {
      const me = await call('GET', '/auth/me', { token: pasted });
      const email = me.body?.data?.email ?? me.body?.data?.user?.email;
      if (me.status !== 200 || !email) throw new Error(`That token for ${who} was not accepted (HTTP ${me.status}).`);
      console.log(`          signed in as ${email}`);
      return { token: pasted, email };
    }
    const email = await ask(`${who} email: `);
    const password = await ask(`${who} password (hidden): `, { hidden: true });
    const res = await call('POST', '/auth/login', { body: { email, password } });
    const token = res.body?.data?.token ?? res.body?.data?.accessToken;
    if (res.status !== 200 || !token) throw new Error(`Sign-in as ${who} failed (HTTP ${res.status}).`);
    console.log(`          signed in as ${email}`);
    return { token, email };
  };
  const log = (step, text) => console.log(`${step.padEnd(9)} ${text}`);
  const amountStroops = xlmToStroops(args.amount ?? '0.1');
  if (BigInt(amountStroops) > 10_000_000n) throw new Error('This check is limited to 1 XLM');
  console.log(`LMS ${base}\nThis creates ONE reward of ${args.amount ?? '0.1'} XLM and funds it from platform credit. Nothing is paid out to anyone.\n`);
  const teacher = await login('Teacher (class owner)');
  const requester = await login('Administrator A (requests the credit)');
  const approver = await login('Different administrator (approves and authorizes)');
  if (new Set([teacher.email, requester.email, approver.email].map(e => e.toLowerCase())).size !== 3) throw new Error('Use three different accounts.');
  const result = await runCreditPath({ call, log, runId: args.run, classId: args.class, amountStroops, teacher, requester, approver, dryRun: !!args['dry-run'] });
  if (!result.dryRun) {
    fs.writeFileSync(`lms034-${args.run}.json`, JSON.stringify(result, null, 2));
    console.log(`\nDone. Tell the thread the reward id: ${result.rewardId}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => { console.error(`
Stopped: ${err.message}`); process.exit(1); });
}
