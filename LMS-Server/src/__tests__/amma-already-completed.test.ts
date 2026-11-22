import { describe, it, expect, vi, afterEach } from 'vitest';
import './setup.js';
import { generateKeyPairSync } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { v4 as uuid } from 'uuid';
import { db } from '../config/database.js';
import { enqueueActivation, processActivations, activationStatusFor, type ActivationConfig } from '../services/ammaActivationService.js';
import { queueSponsorOnboarding, alreadyOnboardedAmmaUsers, SPONSOR_TASK_KEY } from '../services/sponsorActivationService.js';
import { transitionCohortStatus } from '../services/cohortService.js';

// AmmaWallet allows each task once per user and answers ALREADY_COMPLETED (409, nothing charged) to any repeat, whatever the
// completionId. The LMS must treat that as done: never retried, never re-queued, and the user told the wallet is activated.

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const { privateKey } = generateKeyPairSync('ed25519');
const cfg: ActivationConfig = { baseUrl: 'https://testnet.example', apiKey: 'k'.repeat(24), keyId: 'lms-staging-2026-11', privateKey, taskKey: 'lms:course-complete' };
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const row = (id: string) => db.prepare('SELECT * FROM amma_activations WHERE id = ?').get(id) as Record<string, unknown>;
let nextAmmaId = 90_000;
function user(role = 'student') {
  const id = uuid();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role, walletAddress) VALUES (?, 'U', ?, 'hash', ?, ?)").run(id, `${id}@test.invalid`, role, Keypair.random().publicKey());
  return id;
}
function linkAmma(userId: string, ammaUserId: number) {
  const { walletAddress } = db.prepare('SELECT walletAddress FROM users WHERE id = ?').get(userId) as { walletAddress: string };
  db.prepare("INSERT INTO amma_wallet_links (user_id, amma_user_id, wallet_address, previous_address, imported_by, imported_at) VALUES (?, ?, ?, NULL, ?, datetime('now'))")
    .run(userId, ammaUserId, walletAddress, userId);
}
function cohort(sponsorId: string) {
  const courseId = uuid(), id = uuid();
  db.prepare("INSERT INTO courses (id, title, course_code) VALUES (?, 'Course', ?)").run(courseId, courseId);
  db.prepare("INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name, status) VALUES (?, ?, ?, 'Cohort', 'draft')").run(id, sponsorId, courseId);
  return id;
}
const ALREADY = { error: { code: 'ALREADY_COMPLETED', message: 'already completed', retryable: false } };

describe('ALREADY_COMPLETED is done, not a retry', () => {
  it('learner: marks the row confirmed, never sends it again on later worker runs, and says the wallet is activated', async () => {
    const u = user(), q = enqueueActivation({ userId: u, ammaUserId: nextAmmaId++, completionId: uuid() }, 1000);
    const fetch = reply(409, ALREADY);
    vi.stubGlobal('fetch', fetch);
    await processActivations(1000, cfg);
    expect(row(q.id)).toMatchObject({ status: 'confirmed', remote_state: 'already_completed', last_error: null, attempts: 1 });
    for (const t of [2000, 60 * 60_000, 48 * 60 * 60_000]) await processActivations(t, cfg);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(activationStatusFor(u)).toEqual({ state: 'activated', message: 'Wallet activated.' });
  });

  it('learner: a second course for the same Amma user is not queued once the task is done', async () => {
    const u = user(), amma = nextAmmaId++;
    const first = enqueueActivation({ userId: u, ammaUserId: amma, completionId: uuid() }, 1000);
    vi.stubGlobal('fetch', reply(409, ALREADY));
    await processActivations(1000, cfg);
    const second = enqueueActivation({ userId: u, ammaUserId: amma, completionId: uuid() }, 5000);
    expect(second).toEqual({ id: first.id, created: false });
    expect(db.prepare('SELECT COUNT(*) AS n FROM amma_activations WHERE amma_user_id = ?').get(amma)).toEqual({ n: 1 });
  });

  it('a done activation for one task does not stop a different task for the same user', async () => {
    const u = user(), amma = nextAmmaId++;
    enqueueActivation({ userId: u, ammaUserId: amma, completionId: uuid() }, 1000);
    vi.stubGlobal('fetch', reply(409, ALREADY));
    await processActivations(1000, cfg);
    expect(enqueueActivation({ userId: u, ammaUserId: amma, completionId: uuid(), taskKey: SPONSOR_TASK_KEY }, 2000).created).toBe(true);
  });

  it('other 409 refusals are not treated as done', async () => {
    const u = user(), q = enqueueActivation({ userId: u, ammaUserId: nextAmmaId++, completionId: uuid() }, 1000);
    vi.stubGlobal('fetch', reply(409, { error: { code: 'COMPLETION_DUPLICATE' } }));
    await processActivations(1000, cfg);
    expect(row(q.id)).toMatchObject({ status: 'failed', last_error: 'COMPLETION_DUPLICATE' });
    expect(activationStatusFor(u).state).toBe('delayed');
  });

  it('sponsor: ALREADY_COMPLETED confirms the sponsor row, it is not retried, and later cohorts do not re-queue it', async () => {
    vi.stubEnv('AMMA_SPONSOR_ACTIVATION', 'on');
    const s = user('lecturer'); linkAmma(s, nextAmmaId++);
    const c1 = cohort(s), c2 = cohort(s);
    expect(queueSponsorOnboarding(c1, 1000)).toBe('queued');
    const fetch = reply(409, ALREADY);
    vi.stubGlobal('fetch', fetch);
    await processActivations(1000, cfg);
    await processActivations(10 * 60 * 60_000, cfg);
    expect(fetch).toHaveBeenCalledTimes(1);
    const rows = db.prepare('SELECT task_key, status, remote_state FROM amma_activations WHERE user_id = ?').all(s);
    expect(rows).toEqual([{ task_key: SPONSOR_TASK_KEY, status: 'confirmed', remote_state: 'already_completed' }]);
    expect(queueSponsorOnboarding(c2, 20_000)).toBe('already_queued');
  });
});

describe('Sponsor A and B (Amma users 367 and 368) are never queued', () => {
  it('stays off by default, even for them', () => {
    const s = user('lecturer'); linkAmma(s, 367);
    const c = cohort(s);
    expect(queueSponsorOnboarding(c)).toBe('off');
    expect(transitionCohortStatus(c, 'active', s)).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS n FROM amma_activations WHERE user_id = ?').get(s)).toEqual({ n: 0 });
  });

  it('with the flag on, 367 and 368 are skipped as already onboarded and nothing is queued', () => {
    vi.stubEnv('AMMA_SPONSOR_ACTIVATION', 'on');
    for (const amma of [367, 368]) {
      const s = user('lecturer'); linkAmma(s, amma);
      const c = cohort(s);
      expect(queueSponsorOnboarding(c)).toBe('already_onboarded');
      expect(transitionCohortStatus(c, 'active', s)).toBe(true);
      expect(db.prepare('SELECT COUNT(*) AS n FROM amma_activations WHERE user_id = ?').get(s)).toEqual({ n: 0 });
    }
  });

  it('more already-onboarded Amma users can be added by env, on top of 367 and 368', () => {
    vi.stubEnv('AMMA_SPONSOR_ALREADY_ONBOARDED', '401, x, 402');
    expect([...alreadyOnboardedAmmaUsers()].sort()).toEqual([367, 368, 401, 402]);
    vi.stubEnv('AMMA_SPONSOR_ALREADY_ONBOARDED', '');
    expect([...alreadyOnboardedAmmaUsers()].sort()).toEqual([367, 368]);
  });
});
