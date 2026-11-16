import { describe, it, expect, vi, afterEach } from 'vitest';
import './setup.js';
import { generateKeyPairSync, verify, createHash } from 'node:crypto';
import { v4 as uuid } from 'uuid';
import { db } from '../config/database.js';
import { canonicalString, signedHeaders, enqueueActivation, processActivations, activationStatusFor, ACTIVATION_PATH, type ActivationConfig } from '../services/ammaActivationService.js';

afterEach(() => vi.unstubAllGlobals());
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const cfg: ActivationConfig = { baseUrl: 'https://testnet.example', apiKey: 'k'.repeat(24), keyId: 'lms-staging-2026-11', privateKey, taskKey: 'lms:course-complete' };
function user() {
  const id = uuid();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'U', ?, 'hash', 'student')").run(id, `${id}@test.invalid`);
  return id;
}
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const row = (id: string) => db.prepare('SELECT * FROM amma_activations WHERE id = ?').get(id) as Record<string, unknown>;

describe('signing', () => {
  it('produces a signature the wallet side verifies, over the exact body, and a different body fails', () => {
    const body = JSON.stringify({ a: 1 }), now = 1_800_000_000_000;
    const h = signedHeaders(cfg, 'POST', ACTIVATION_PATH, body, now);
    expect(h['x-amma-timestamp']).toBe('1800000000');
    const sig = Buffer.from(h['x-amma-signature'].replace('ed25519=', ''), 'base64');
    expect(sig.length).toBe(64);
    const spki = publicKey;
    expect(verify(null, Buffer.from(canonicalString('POST', ACTIVATION_PATH, h['x-amma-timestamp'], body)), spki, sig)).toBe(true);
    expect(verify(null, Buffer.from(canonicalString('POST', ACTIVATION_PATH, h['x-amma-timestamp'], body + ' ')), spki, sig)).toBe(false);
    expect(canonicalString('post', '/p', '1', '')).toBe(`amma-partner-v1\nPOST\n/p\n1\n${createHash('sha256').update('').digest('hex')}`);
  });
});

describe('activation queue', () => {
  it('queues once per completion with a fixed idempotency key', () => {
    const u = user(), cid = uuid();
    const a = enqueueActivation({ userId: u, ammaUserId: 27, completionId: cid }), b = enqueueActivation({ userId: u, ammaUserId: 27, completionId: cid });
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
    expect(row(a.id).idempotency_key).toBe(`lms-activate-${cid}`);
  });

  it('sends the signed request, then polls until confirmed, and tells the learner only what is safe', async () => {
    const u = user(), q = enqueueActivation({ userId: u, ammaUserId: 27, completionId: uuid() }, 1000);
    const post = reply(202, { activationId: '55', status: 'pending', chains: [{ state: 'reserved' }] });
    vi.stubGlobal('fetch', post);
    await processActivations(1000, cfg);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://testnet.example${ACTIVATION_PATH}`);
    expect(JSON.parse(init.body as string)).toEqual({ ammaUserId: 27, taskKey: 'lms:course-complete', completionId: expect.any(String), idempotencyKey: expect.stringMatching(/^lms-activate-/), completedAt: expect.any(String) });
    expect(row(q.id)).toMatchObject({ status: 'submitted', remote_activation_id: '55' });
    expect(activationStatusFor(u)).toEqual({ state: 'pending', message: 'Your wallet is being activated.' });
    const get = reply(200, { activationId: '55', status: 'confirmed', chains: [{ state: 'confirmed', txHash: 'ab'.repeat(32) }] });
    vi.stubGlobal('fetch', get);
    await processActivations(1000 + 31_000, cfg);
    expect((get.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe('GET');
    expect(row(q.id)).toMatchObject({ status: 'confirmed', tx_hash: 'ab'.repeat(32) });
    expect(activationStatusFor(u).state).toBe('activated');
  });

  it('keeps the item queued on a budget refusal without telling the learner about the balance', async () => {
    const u = user(), q = enqueueActivation({ userId: u, ammaUserId: 27, completionId: uuid() }, 1000);
    vi.stubGlobal('fetch', reply(402, { error: { code: 'BUDGET_EXHAUSTED' } }));
    await processActivations(1000, cfg);
    expect(row(q.id)).toMatchObject({ status: 'blocked', last_error: 'BUDGET_EXHAUSTED' });
    expect(activationStatusFor(u).message).toBe('Your wallet is being activated.');
    expect(JSON.stringify(activationStatusFor(u))).not.toMatch(/budget|balance/i);
  });

  it('retries timeouts and server errors with backoff, and does not retry other refusals', async () => {
    const u = user(), q = enqueueActivation({ userId: u, ammaUserId: 27, completionId: uuid() }, 1000);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
    await processActivations(1000, cfg);
    expect(row(q.id)).toMatchObject({ status: 'queued', attempts: 1, next_attempt_at: 1000 + 60_000, last_error: 'network' });
    vi.stubGlobal('fetch', reply(503, {}));
    await processActivations(1000 + 60_000, cfg);
    expect(row(q.id)).toMatchObject({ attempts: 2, last_error: 'http_503', next_attempt_at: 1000 + 60_000 + 5 * 60_000 });
    vi.stubGlobal('fetch', reply(409, { error: { code: 'ALREADY_COMPLETED' } }));
    await processActivations(1000 + 60_000 + 5 * 60_000, cfg);
    expect(row(q.id)).toMatchObject({ status: 'failed', last_error: 'ALREADY_COMPLETED' });
  });

  it('waits and retries when the learner is not eligible yet, and does nothing when switched off', async () => {
    const u = user(), q = enqueueActivation({ userId: u, ammaUserId: 27, completionId: uuid() }, 1000);
    vi.stubGlobal('fetch', reply(403, { error: { code: 'WALLET_NOT_AMMA_HELD' } }));
    await processActivations(1000, cfg);
    expect(row(q.id)).toMatchObject({ status: 'blocked', next_attempt_at: 1000 + 6 * 3_600_000 });
    const off = vi.fn();
    vi.stubGlobal('fetch', off);
    await expect(processActivations(1000 + 7 * 3_600_000, null)).resolves.toBe(0);
    expect(off).not.toHaveBeenCalled();
  });
});
