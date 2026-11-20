/**
 * AUTH-14: LMS side of Amma SSO audience binding, against a fake Amma /sso/verify.
 * Covers the brief's T1 (happy path), T2 (second use), T4/T8 (rejected assertion),
 * T5 (tampered callback), the per-status error table and the single 429 retry.
 */
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app.js';
import { db, queryOne } from '../config/database.js';
import * as sso from '../services/ammaWalletSSOService.js';
import { ammaConfigWarnings } from '../services/ammaConfigCheck.js';
import logger from '../utils/logger.js';

const apiKey = 'fixture-db-tenant-key';
const identity = {
  userId: 'binding-learner', email: 'binding-learner@example.invalid',
  firstName: null, lastName: null, isEmailVerified: true, mainnetWalletAddress: null,
};
type Reply = { status: number; body: unknown };
type Received = { path?: string; apiKey?: string | string[]; body: { assertion?: string; state?: string } };
let replies: Reply[] = [];
let received: Received[] = [];
let server: Server;
let ammaUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received.push({ path: req.url, apiKey: req.headers['x-api-key'], body: JSON.parse(body || '{}') });
      const reply = replies.shift() ?? { status: 200, body: identity };
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  ammaUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

beforeEach(() => {
  db.exec('ALTER TABLE users ADD COLUMN auth_provider TEXT; ALTER TABLE users ADD COLUMN ammawallet_user_id TEXT');
  vi.stubEnv('AMMA_WALLET_URL', ammaUrl);
  vi.stubEnv('AMMA_WALLET_API_KEY', apiKey);
  replies = [];
  received = [];
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const ssoCookies = (response: request.Response) =>
  ([] as string[]).concat(response.headers['set-cookie'] ?? []).filter(c => c.startsWith(`${sso.SSO_STATE_COOKIE}=`));

async function start(query: Record<string, string> = {}) {
  const response = await request(app).get('/api/v1/auth/amma-login').query(query);
  expect(response.status).toBe(302);
  const state = new URL(response.headers.location).searchParams.get('state')!;
  const [cookie] = ssoCookies(response);
  return { state, cookie: cookie.split(';')[0] };
}
const finish = (state: string, cookie?: string, assertion = 'fixture-assertion') => {
  const call = request(app).get('/api/v1/auth/amma-callback').query({ state, assertion });
  return cookie ? call.set('Cookie', cookie) : call;
};
const errorCode = (response: request.Response) => new URL(response.headers.location).searchParams.get('sso_error');
const sessions = () => queryOne<{ total: number }>('SELECT count(*) AS total FROM active_sessions')!.total;

describe('state is bound to the browser that started the login', () => {
  it('sets an HttpOnly, Secure, Lax cookie holding sha256(state), scoped to the callback', async () => {
    const response = await request(app).get('/api/v1/auth/amma-login');
    const state = new URL(response.headers.location).searchParams.get('state')!;
    const cookies = ssoCookies(response);
    expect(cookies).toHaveLength(1);
    const cookie = cookies[0];
    expect(cookie.split(';')[0]).toBe(`${sso.SSO_STATE_COOKIE}=${sha256(state)}`);
    expect(cookie).not.toContain(state);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\/api\/v1\/auth\/amma-callback/);
    expect(cookie).toMatch(/; Max-Age=600/);
  });

  it('T1: sends the bound state with the assertion and the DB key, then signs in and clears the cookie', async () => {
    const { state, cookie } = await start();
    const response = await finish(state, cookie);
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/sso-callback#token=');
    expect(received).toEqual([{ path: '/api/v1/sso/verify', apiKey, body: { assertion: 'fixture-assertion', state } }]);
    const cleared = ssoCookies(response);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cleared[0]).toMatch(/Path=\/api\/v1\/auth\/amma-callback/);
  });

  it('T5: rejects a callback without the cookie before calling Amma, and does not burn the state', async () => {
    const { state, cookie } = await start();
    expect(errorCode(await finish(state))).toBe('invalid_state');
    expect(received).toHaveLength(0);
    // The real browser can still finish its own login.
    expect((await finish(state, cookie)).headers.location).toContain('/sso-callback#token=');
    expect(received).toHaveLength(1);
  });

  it('T5: rejects a validly signed state that belongs to a different browser', async () => {
    const victim = await start();
    const attacker = await start();
    expect(errorCode(await finish(victim.state, attacker.cookie))).toBe('invalid_state');
    expect(errorCode(await finish(victim.state, `${sso.SSO_STATE_COOKIE}=not-a-hash`))).toBe('invalid_state');
    expect(received).toHaveLength(0);
  });

  it('still rejects a replayed state even with the matching cookie', async () => {
    const { state, cookie } = await start();
    await finish(state, cookie);
    expect(errorCode(await finish(state, cookie))).toBe('invalid_state');
    expect(received).toHaveLength(1);
  });

  it('binds mobile sign-in too and returns binding errors to the native callback', async () => {
    const mobile = {
      client: 'mobile', code_challenge: 'c'.repeat(43), code_challenge_method: 'S256', app_state: 'a'.repeat(32),
    };
    const { state, cookie } = await start(mobile);
    const unbound = new URL((await finish(state)).headers.location);
    expect(unbound.protocol).toBe('lmsmobile:');
    expect(unbound.searchParams.get('error')).toBe('invalid_state');
    const bound = new URL((await finish(state, cookie)).headers.location);
    expect(bound.protocol).toBe('lmsmobile:');
    expect(bound.searchParams.has('code')).toBe(true);
  });
});

describe('verify errors per status (brief 2.3)', () => {
  it.each([
    [401, 'Invalid or expired assertion', 'assertion_failed', false],
    [409, 'Assertion already used', 'already_used', false],
    [400, 'state is required', 'service_unavailable', true],
    [401, 'Invalid or missing API key', 'service_unavailable', true],
    [403, 'SSO verify needs a tenant API key', 'service_unavailable', true],
    [403, 'API key missing required scope: sso:verify', 'service_unavailable', true],
    [503, 'SSO not configured', 'service_unavailable', true],
  ])('HTTP %s "%s" -> %s', async (status, error, code, alert) => {
    const errorLog = vi.spyOn(logger, 'error');
    replies = [{ status, body: { error } }];
    const { state, cookie } = await start();
    const response = await finish(state, cookie);
    expect(errorCode(response)).toBe(code);
    expect(received).toHaveLength(1);
    expect(sessions()).toBe(0);
    const alerts = errorLog.mock.calls.filter(([fields]) => (fields as { event?: string })?.event === sso.SSO_VERIFY_ALERT_EVENT);
    expect(alerts).toHaveLength(alert ? 1 : 0);
    if (alert) expect(alerts[0][0]).toMatchObject({ status, providerError: error });
  });

  it('never logs an unrecognised provider error, the assertion or the state', async () => {
    const errorLog = vi.spyOn(logger, 'error');
    replies = [{ status: 500, body: { error: 'fixture-sensitive-detail' } }];
    const { state, cookie } = await start();
    expect(errorCode(await finish(state, cookie, 'fixture-secret-assertion'))).toBe('service_unavailable');
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain('"providerError":"unrecognised"');
    for (const secret of ['fixture-sensitive-detail', 'fixture-secret-assertion', state, apiKey]) expect(logged).not.toContain(secret);
  });

  it('treats an unreachable Amma as service_unavailable', async () => {
    vi.stubEnv('AMMA_WALLET_URL', 'http://127.0.0.1:1');
    const { state, cookie } = await start();
    expect(errorCode(await finish(state, cookie))).toBe('service_unavailable');
  });

  it('429: retries once with the same assertion and state, then succeeds', async () => {
    replies = [{ status: 429, body: { error: 'API key rate limit exceeded' } }];
    const { state, cookie } = await start();
    const response = await finish(state, cookie);
    expect(response.headers.location).toContain('/sso-callback#token=');
    expect(received).toHaveLength(2);
    expect(received[1].body).toEqual(received[0].body);
    expect(received[1].body).toEqual({ assertion: 'fixture-assertion', state });
  });

  it('429 twice: fails after one retry', async () => {
    replies = [429, 429].map(status => ({ status, body: { error: 'API key rate limit exceeded' } }));
    const { state, cookie } = await start();
    expect(errorCode(await finish(state, cookie))).toBe('service_unavailable');
    expect(received).toHaveLength(2);
  });
});

describe('verifyAssertion', () => {
  it('waits before the single 429 retry', async () => {
    replies = [{ status: 429, body: {} }];
    const began = Date.now();
    await expect(sso.verifyAssertion('a', 's', { retryDelayMs: 200 })).resolves.toEqual(identity);
    expect(Date.now() - began).toBeGreaterThanOrEqual(190);
  });
});

describe('Amma key config warnings', () => {
  it('warns when the SSO and activation keys differ, never echoing them', () => {
    const warnings = ammaConfigWarnings({ AMMA_WALLET_API_KEY: 'key-one', AMMA_ACTIVATION_API_KEY: 'key-two' });
    expect(warnings).toHaveLength(1);
    expect(warnings.join()).not.toMatch(/key-one|key-two/);
  });
  it('warns when the two Amma base URLs point at different hosts', () => {
    expect(ammaConfigWarnings({
      AMMA_WALLET_URL: 'https://ammawallet.com', AMMA_ACTIVATION_BASE_URL: 'https://testnet.ammawallet.com',
    })).toHaveLength(1);
  });
  it('is quiet when both match or one is unset', () => {
    expect(ammaConfigWarnings({
      AMMA_WALLET_API_KEY: 'same', AMMA_ACTIVATION_API_KEY: 'same',
      AMMA_WALLET_URL: 'https://ammawallet.com', AMMA_ACTIVATION_BASE_URL: 'https://ammawallet.com/',
    })).toEqual([]);
    expect(ammaConfigWarnings({ AMMA_WALLET_API_KEY: 'only-one' })).toEqual([]);
  });
});
