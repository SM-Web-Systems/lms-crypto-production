/**
 * AUTH-14 — LMS side of Amma's SSO audience binding.
 * The SSO state is bound to the browser that started the login, the bound state is sent to
 * /sso/verify, each /verify failure maps to one user-facing code with safe logs, and the state
 * secret is the LMS's own (with a rotation window).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { db } from '../config/database.js';
import * as sso from '../services/ammaWalletSSOService.js';
import { ammaKeyConfigWarnings } from '../services/ammaKeyConfig.js';
import logger from '../utils/logger.js';
import { bindingCookie } from './helpers/ssoBinding.js';

const identity: sso.AmmaWalletSSOUser = {
  userId: 'auth14-identity', email: 'auth14-learner@example.invalid',
  firstName: null, lastName: null, isEmailVerified: true, mainnetWalletAddress: null,
};
const ASSERTION = 'auth14-fixture-assertion';

beforeEach(() => {
  db.exec('ALTER TABLE users ADD COLUMN auth_provider TEXT; ALTER TABLE users ADD COLUMN ammawallet_user_id TEXT');
  vi.spyOn(sso, 'verifyAssertion').mockResolvedValue({...identity});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function start() {
  const res = await request(app).get('/api/v1/auth/amma-login');
  expect(res.status).toBe(302);
  return {res, state: new URL(res.headers.location).searchParams.get('state')!, cookie: bindingCookie(res)};
}
const callback = (state: string, cookie?: string, assertion = ASSERTION) => {
  const req = request(app).get('/api/v1/auth/amma-callback');
  if (cookie !== undefined) req.set('Cookie', cookie);
  return req.query({state, assertion});
};
const ssoError = (res: request.Response) => new URL(res.headers.location).searchParams.get('sso_error');

describe('AUTH-14 browser binding of the SSO state', () => {
  it('sets an HttpOnly, Secure, SameSite=Lax __Host- cookie with a 10 minute life that holds no raw state', async () => {
    const {res, state} = await start();
    const raw = ([] as string[]).concat(res.headers['set-cookie'] as unknown as string[]);
    const cookie = raw.find(value => value.startsWith('__Host-lms_sso_state='))!;
    expect(cookie).toMatch(/; Max-Age=600;/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).not.toContain(state);
  });

  it('T1: a bound callback sends the stored state to /verify and signs the user in, then clears the cookie', async () => {
    const {state, cookie} = await start();
    const res = await callback(state, cookie);
    expect(res.headers.location).toContain('/sso-callback#token=');
    expect(sso.verifyAssertion).toHaveBeenCalledWith(ASSERTION, state);
    const cleared = ([] as string[]).concat(res.headers['set-cookie'] as unknown as string[]);
    expect(cleared.some(value => value.startsWith('__Host-lms_sso_state=;') && /Expires=Thu, 01 Jan 1970/.test(value))).toBe(true);
  });

  it('T5: refuses a callback opened in a browser with no binding cookie, before calling Amma', async () => {
    const {state} = await start();
    expect(ssoError(await callback(state))).toBe('invalid_state');
    expect(ssoError(await callback(state, 'unrelated=1'))).toBe('invalid_state');
    expect(sso.verifyAssertion).not.toHaveBeenCalled();
  });

  it('T5: refuses a state from another login (the victim browser holds its own cookie)', async () => {
    const attacker = await start();
    const victim = await start();
    expect(ssoError(await callback(attacker.state, victim.cookie))).toBe('invalid_state');
    expect(ssoError(await callback(attacker.state + 'x', attacker.cookie))).toBe('invalid_state');
    expect(sso.verifyAssertion).not.toHaveBeenCalled();
  });

  it('refuses two binding cookies with the same name (cookie tossing)', async () => {
    const one = await start();
    const two = await start();
    expect(ssoError(await callback(one.state, `${one.cookie}; ${two.cookie}`))).toBe('invalid_state');
    expect(sso.verifyAssertion).not.toHaveBeenCalled();
  });

  it('is single use: the same state and cookie cannot sign in twice', async () => {
    const {state, cookie} = await start();
    expect((await callback(state, cookie)).headers.location).toContain('/sso-callback#token=');
    expect(ssoError(await callback(state, cookie))).toBe('invalid_state');
    expect(sso.verifyAssertion).toHaveBeenCalledTimes(1);
  });

  it('keeps a state valid for 10 minutes and no longer', async () => {
    const now = Date.now();
    const early = await start();
    const late = await start();
    vi.spyOn(Date, 'now').mockReturnValue(now + 9 * 60_000);
    expect((await callback(early.state, early.cookie)).headers.location).toContain('/sso-callback#token=');
    vi.spyOn(Date, 'now').mockReturnValue(now + 601_000);
    expect(ssoError(await callback(late.state, late.cookie))).toBe('invalid_state');
  });

  it('AMMA_SSO_STATE_BINDING=optional allows a missing cookie with a warning, but still refuses a wrong one', async () => {
    vi.stubEnv('AMMA_SSO_STATE_BINDING', 'optional');
    const warn = vi.spyOn(logger, 'warn');
    const a = await start();
    expect((await callback(a.state)).headers.location).toContain('/sso-callback#token=');
    expect(warn.mock.calls.some(([fields]) => (fields as {event?: string; mode?: string}).event === 'amma_sso_state_unbound'
      && (fields as {mode?: string}).mode === 'optional')).toBe(true);
    const b = await start();
    const c = await start();
    expect(ssoError(await callback(b.state, c.cookie))).toBe('invalid_state');
  });

  it('binds the mobile sign-in in its auth browser too', async () => {
    const res = await request(app).get('/api/v1/auth/amma-login').query({
      client: 'mobile', code_challenge: 'A'.repeat(43), code_challenge_method: 'S256', app_state: 'b'.repeat(64),
    });
    const state = new URL(res.headers.location).searchParams.get('state')!;
    const refused = await callback(state);
    expect(new URL(refused.headers.location).searchParams.get('error')).toBe('invalid_state');
    expect(new URL(refused.headers.location).searchParams.get('state')).toBe('b'.repeat(64));
    expect(sso.verifyAssertion).not.toHaveBeenCalled();
  });
});

describe('AUTH-14 /verify failure handling at the callback', () => {
  it.each([
    ['request_rejected', 400, 'state is required', 'verify_failed', 'error'],
    ['config', 401, 'Invalid or missing API key', 'service_unavailable', 'error'],
    ['config', 403, 'SSO verify needs a tenant API key', 'service_unavailable', 'error'],
    ['assertion_rejected', 401, 'Invalid or expired assertion', 'assertion_failed', 'warn'],
    ['already_used', 409, 'Assertion already used', 'already_used', 'warn'],
    ['rate_limited', 429, 'API key rate limit exceeded', 'service_unavailable', 'error'],
    ['unavailable', 503, 'unrecognised', 'service_unavailable', 'error'],
    ['unavailable', null, 'none', 'service_unavailable', 'error'],
  ] as const)('%s (HTTP %s) sends the user to %s and logs at %s without secrets', async (failure, status, ammaError, code, level) => {
    vi.mocked(sso.verifyAssertion).mockRejectedValue(new sso.SsoVerifyError(failure, status, ammaError));
    const logged = [vi.spyOn(logger, 'warn'), vi.spyOn(logger, 'error')];
    const {state, cookie} = await start();
    const res = await callback(state, cookie);
    expect(ssoError(res)).toBe(code);
    const spy = level === 'error' ? logged[1] : logged[0];
    const entry = spy.mock.calls.find(([fields]) => (fields as {event?: string}).event === 'amma_sso_verify_failed');
    expect(entry?.[0]).toMatchObject({failure, status, ammaError, client: 'web', ...(level === 'error' ? {alert: true} : {})});
    const everything = JSON.stringify(logged.flatMap(s => s.mock.calls));
    expect(everything).not.toContain(ASSERTION);
    expect(everything).not.toContain(state);
    expect(everything).not.toContain(cookie.split('=')[1]);
  });
});

describe('AUTH-14 own state secret', () => {
  it('accepts a state signed with AMMA_SSO_STATE_SECRET_PREVIOUS during a rotation, and rejects other secrets', async () => {
    vi.stubEnv('AMMA_SSO_STATE_SECRET', 'new-lms-only-state-secret-0123456789abcdef');
    vi.stubEnv('AMMA_SSO_STATE_SECRET_PREVIOUS', 'old-shared-state-secret-0123456789abcdef');
    vi.resetModules();
    const fresh = await import('../services/ammaWalletSSOService.js');
    const sign = (secret: string, options: jwt.SignOptions = {expiresIn: 600}) =>
      jwt.sign({purpose: 'sso_state', nonce: Math.random().toString(16).slice(2)}, secret, options);
    expect(() => fresh.validateState(sign('old-shared-state-secret-0123456789abcdef'))).not.toThrow();
    expect(() => fresh.validateState(sign('new-lms-only-state-secret-0123456789abcdef'))).not.toThrow();
    expect(() => fresh.validateState(sign('someone-else'))).toThrow();
    expect(() => fresh.validateState(sign('old-shared-state-secret-0123456789abcdef', {expiresIn: -10}))).toThrow(/expired/);
    // New states are signed only with the current secret.
    const {state} = fresh.buildSsoInitiateUrl('https://lms.example.invalid/api/v1/auth/amma-callback');
    expect(() => jwt.verify(state, 'new-lms-only-state-secret-0123456789abcdef')).not.toThrow();
    vi.resetModules();
  });
});

describe('AUTH-14 key configuration check', () => {
  const base = {AMMA_ACTIVATION_ENABLED: 'on', AMMA_WALLET_URL: 'https://ammawallet.example', AMMA_ACTIVATION_BASE_URL: 'https://ammawallet.example/'};
  it('is quiet when both variables hold the same key and host', () => {
    expect(ammaKeyConfigWarnings({...base, AMMA_WALLET_API_KEY: 'k1', AMMA_ACTIVATION_API_KEY: 'k1'})).toEqual([]);
  });
  it('warns, without the values, when the keys or hosts differ', () => {
    const warnings = ammaKeyConfigWarnings({...base, AMMA_WALLET_API_KEY: 'secret-one', AMMA_ACTIVATION_API_KEY: 'secret-two',
      AMMA_ACTIVATION_BASE_URL: 'https://other.example'});
    expect(warnings).toHaveLength(2);
    expect(warnings.join(' ')).not.toMatch(/secret-one|secret-two/);
  });
  it('says nothing while activations are off', () => {
    expect(ammaKeyConfigWarnings({AMMA_WALLET_API_KEY: 'a', AMMA_ACTIVATION_API_KEY: 'b'})).toEqual([]);
  });
});
