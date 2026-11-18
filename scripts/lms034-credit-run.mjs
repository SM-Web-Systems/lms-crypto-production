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
 *   node lms034-credit-run.mjs --base https://lms.smwebsystems.com --class <class id> --run lms034-1 \n *     --teacher tester@smwebsystems.com --requester tester+admin-a@smwebsystems.com --approver mukhtar.meer@smwebsystems.com [--amount 0.1] [--dry-run]
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

/**
 * After the reward is active and the scheduler has marked its allocation eligible, the teacher releases it to the learner.
 * Only the teacher's sign-in is needed. Safe to repeat: a released allocation is skipped.
 */
export async function releaseEligible({ call, log = () => {}, runId, rewardId, teacher }) {
  if (!rewardId) throw new Error('--release needs the reward id');
  const res = await call('GET', `/teacher/rewards/${rewardId}/allocations`, { token: teacher.token });
  if (res.status !== 200) throw new Error(`Reading the allocations failed (HTTP ${res.status})`);
  const list = res.body?.data?.allocations ?? res.body?.data ?? [];
  if (!Array.isArray(list) || !list.length) throw new Error('This reward has no allocation yet.');
  const out = [];
  for (const a of list) {
    if (a.status === 'released') { log('release', `${a.id} is already released`); out.push({ id: a.id, status: 'released' }); continue; }
    if (a.status !== 'eligible') { log('release', `${a.id} is ${a.status}, not eligible yet. Try again in a minute.`); out.push({ id: a.id, status: a.status }); continue; }
    const r = await call('POST', `/teacher/rewards/${rewardId}/allocations/${a.id}/release`, { token: teacher.token, body: { idempotencyKey: `${runId}-release-${a.id}` } });
    if (![200, 201].includes(r.status)) throw new Error(`Releasing ${a.id} failed (HTTP ${r.status} ${r.body?.error?.code ?? ''})`);
    log('release', `${a.id} released (${r.body?.data?.status})`);
    out.push({ id: a.id, status: r.body?.data?.status ?? 'released' });
  }
  return out;
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

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

/** Reads a line without ever showing it, including pasted text, by reading raw key presses. */
export function askHidden(question) {
  return new Promise(resolve => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let buf = '';
    const done = () => { stdin.setRawMode?.(false); stdin.pause(); stdin.removeListener('data', onData); process.stdout.write('\n'); resolve(buf.trim()); };
    const onData = chunk => {
      for (const c of String(chunk)) {
        if (c === '\r' || c === '\n') { done(); return; }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1); else buf += c;
      }
    };
    stdin.setRawMode?.(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);
  });
}

/** Stops the run if a sign-in is not the account this step needs, so a token pasted at the wrong prompt cannot be used by mistake. */
export function assertWho(label, expectedEmail, actualEmail) {
  if (!expectedEmail) return;
  if (String(actualEmail ?? '').toLowerCase() !== String(expectedEmail).toLowerCase()) {
    throw new Error(`${label} must be ${expectedEmail}, but that sign-in was ${actualEmail}. Nothing was created. Run it again and paste the right one.`);
  }
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
  // Either a session token (paste it, as for the seed script) or an email and password. Everything typed or pasted here stays hidden.
  const login = async (who, expectedEmail) => {
    console.log(`
${who}${expectedEmail ? ` (expected: ${expectedEmail})` : ''}`);
    const pasted = await askHidden('  Paste a session token, or press Enter to use email and password: ');
    let result;
    if (pasted) {
      const me = await call('GET', '/auth/me', { token: pasted });
      const email = me.body?.data?.email ?? me.body?.data?.user?.email;
      if (me.status !== 200 || !email) throw new Error(`That token for ${who} was not accepted (HTTP ${me.status}).`);
      result = { token: pasted, email };
    } else {
      const email = expectedEmail && (await ask(`  Email [${expectedEmail}]: `)) || expectedEmail || await ask('  Email: ');
      const password = await askHidden('  Password (hidden): ');
      const res = await call('POST', '/auth/login', { body: { email, password } });
      const token = res.body?.data?.token ?? res.body?.data?.accessToken;
      if (res.status !== 200 || !token) throw new Error(`Sign-in as ${who} failed (HTTP ${res.status}).`);
      result = { token, email };
    }
    assertWho(who, expectedEmail, result.email);
    console.log(`  signed in as ${result.email}`);
    return result;
  };
  const log = (step, text) => console.log(`${step.padEnd(9)} ${text}`);
  if (args.release) {
    console.log(`LMS ${base}
This releases the eligible reward ${args.release} to the learner. It needs only the teacher's sign-in.
`);
    const teacher = await login('The TEACHER who owns the class', args.teacher);
    await releaseEligible({ call, log, runId: args.run ?? 'release', rewardId: args.release, teacher });
    return;
  }
  const amountStroops = xlmToStroops(args.amount ?? '0.1');
  if (BigInt(amountStroops) > 10_000_000n) throw new Error('This check is limited to 1 XLM');
  console.log(`LMS ${base}\nThis creates ONE reward of ${args.amount ?? '0.1'} XLM and funds it from platform credit. Nothing is paid out to anyone.\n`);
  const teacher = await login('1 of 3: the TEACHER who owns the class', args.teacher);
  const requester = await login('2 of 3: ADMINISTRATOR A, who requests the credit', args.requester);
  const approver = await login('3 of 3: a DIFFERENT ADMINISTRATOR, who approves and authorizes', args.approver);
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
