import { seedTestAccount } from './helpers/rbacFixtures.js';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import app from '../app.js';
import { db, execute, queryOne } from '../config/database.js';
import * as wallet from '../services/ammaWalletSSOService.js';

const verifier = randomBytes(32).toString('hex');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const appState = randomBytes(32).toString('hex');
const identity: wallet.AmmaWalletSSOUser = {
  userId: 'wallet-test-identity', email: 'wallet-user@example.invalid',
  firstName: 'Wallet', lastName: 'Learner', isEmailVerified: true, mainnetWalletAddress: null,
};

beforeEach(() => {
  // Production migrations add these columns; tests use the canonical schema fixture.
  db.exec('ALTER TABLE users ADD COLUMN auth_provider TEXT; ALTER TABLE users ADD COLUMN ammawallet_user_id TEXT');
  vi.spyOn(wallet, 'verifyAssertion').mockResolvedValue(identity);
});
afterEach(() => vi.restoreAllMocks());

async function initiate(extra = {}) {
  return request(app).get('/api/v1/auth/amma-login').query({
    client: 'mobile', code_challenge: challenge, code_challenge_method: 'S256', app_state: appState, ...extra,
  });
}
async function callback() {
  const start = await initiate();
  const state = new URL(start.headers.location).searchParams.get('state');
  return request(app).get('/api/v1/auth/amma-callback').query({state, assertion: 'wallet-assertion'});
}
async function code() {
  const response = await callback();
  expect(response.headers.location).toMatch(/^lmsmobile:\/\/sso-callback\?/);
  return new URL(response.headers.location).searchParams.get('code');
}
const exchange = (value: string | null, proof = verifier) => request(app)
  .post('/api/v1/auth/amma-mobile-session').send({code: value, code_verifier: proof});

describe('Amma Wallet native session handoff', () => {
  it('keeps the existing web initiation and token callback working', async () => {
    const start = await request(app).get('/api/v1/auth/amma-login');
    expect(start.status).toBe(302);
    const state = new URL(start.headers.location).searchParams.get('state');
    const response = await request(app).get('/api/v1/auth/amma-callback').query({state,assertion:'web-assertion'});
    expect(response.headers.location).toContain('/sso-callback#token=');
    expect(response.headers.location).not.toContain('lmsmobile:');
  });
  it.each([
    {code_challenge: ''}, {code_challenge: 'short'}, {code_challenge_method: 'plain'},
    {app_state: ''}, {client: 'unknown'}, {redirect_uri: 'evil://callback'},
  ])('rejects incomplete or unapproved native parameters: %j', async extra => {
    expect((await initiate(extra)).status).toBe(400);
    expect(wallet.verifyAssertion).not.toHaveBeenCalled();
  });
  it('returns a proof-bound code instead of a bearer token and creates no session until exchange', async () => {
    const response = await callback();
    const destination = new URL(response.headers.location);
    expect(destination.protocol + '//' + destination.host).toBe('lmsmobile://sso-callback');
    expect(destination.searchParams.get('state')).toBe(appState);
    expect(destination.searchParams.get('code')).toMatch(/^[a-f0-9]{64}$/);
    expect(response.headers.location).not.toMatch(/token=|eyJ|role=/);
    expect(queryOne<{count:number}>('SELECT count(*) count FROM active_sessions')?.count).toBe(0);
    expect(queryOne<{password_hash:string}>('SELECT password_hash FROM users WHERE email=?',[identity.email])?.password_hash).toBe('$sso$');
    const result = await exchange(destination.searchParams.get('code'));
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toContain('no-store');
    expect(result.body.data.user.workspaces).toContain('student');
    expect((await request(app).get('/api/v1/auth/me').auth(result.body.data.token,{type:'bearer'})).status).toBe(200);
  });
  it('denies a stolen code with a wrong verifier without consuming the legitimate exchange', async () => {
    const value = await code();
    expect((await exchange(value,'x'.repeat(64))).status).toBe(401);
    expect((await exchange(value)).status).toBe(200);
    expect((await exchange(value)).status).toBe(401);
  });
  it('expires unused codes', async () => {
    const value = await code();
    vi.spyOn(Date,'now').mockReturnValue(Date.now()+61_000);
    expect((await exchange(value)).status).toBe(401);
  });
  it('preserves managed roles and reads current effective context at exchange', async () => {
    seedTestAccount(db, `INSERT INTO users(id,name,email,password_hash) VALUES('managed','Sponsor',?,'$sso$')`, [identity.email], ["role_student"]).changes;
    execute("UPDATE users SET auth_provider='ammawallet', ammawallet_user_id=? WHERE id='managed'",[identity.userId]);
    execute("DELETE FROM user_roles WHERE user_id='managed'");
    execute("INSERT INTO user_roles(user_id,role_id) VALUES('managed','role_sponsor')");
    const value = await code();
    const result = await exchange(value);
    expect(result.status).toBe(200);
    expect(result.body.data.user.id).toBe('managed');
    expect(result.body.data.user.workspaces).toEqual(['sponsor']);
    expect(result.body.data.user.rbacRoles).toEqual(['sponsor']);
  });
  it('denies codes issued before authorization invalidation', async () => {
    const value = await code();
    execute('UPDATE users SET authorization_version=authorization_version+1 WHERE email=?',[identity.email]);
    expect((await exchange(value)).status).toBe(401);
  });
  it('does not issue a session for an account deleted after the wallet callback', async () => {
    const value = await code();
    execute('DELETE FROM users WHERE email=?',[identity.email]);
    expect((await exchange(value)).status).toBe(401);
  });
  it('returns wallet failures only to the fixed native callback after valid state verification', async () => {
    vi.mocked(wallet.verifyAssertion).mockRejectedValueOnce(new Error('Wallet unavailable'));
    const response = await callback();
    const destination = new URL(response.headers.location);
    expect(destination.protocol).toBe('lmsmobile:');
    expect(destination.searchParams.get('error')).toBe('verify_failed');
    expect(destination.searchParams.get('state')).toBe(appState);
    expect(destination.searchParams.has('code')).toBe(false);
  });
  it('returns a cancelled wallet request to the native app without issuing a session', async () => {
    const start = await initiate();
    const state = new URL(start.headers.location).searchParams.get('state');
    const response = await request(app).get('/api/v1/auth/amma-callback').query({state,error:'access_denied'});
    const destination = new URL(response.headers.location);
    expect(destination.protocol).toBe('lmsmobile:');
    expect(destination.searchParams.get('error')).toBe('cancelled');
    expect(wallet.verifyAssertion).not.toHaveBeenCalled();
  });
  it('preserves pending-deletion account management after a fresh wallet sign-in', async () => {
    const value = await code();
    execute("UPDATE users SET deletion_status='pending_deletion' WHERE email=?",[identity.email]);
    const result = await exchange(value);
    expect(result.status).toBe(200);
    expect(result.body.data.user.deletionStatus).toBe('pending_deletion');
    expect((await request(app).get('/api/v1/courses').auth(result.body.data.token,{type:'bearer'})).status).toBe(403);
    expect((await request(app).get('/api/v1/account/delete/status').auth(result.body.data.token,{type:'bearer'})).status).toBe(200);
  });
  it('rejects an expired state before contacting the wallet', async () => {
    const start = await initiate();
    const state = new URL(start.headers.location).searchParams.get('state');
    vi.spyOn(Date,'now').mockReturnValue(Date.now()+301_000);
    const response = await request(app).get('/api/v1/auth/amma-callback').query({state,assertion:'a'});
    expect(response.headers.location).toContain('sso_error=invalid_state');
    expect(wallet.verifyAssertion).not.toHaveBeenCalled();
  });
  it('rejects tampered and replayed signed state before assertion exchange', async () => {
    const start = await initiate();
    const state = new URL(start.headers.location).searchParams.get('state')!;
    await request(app).get('/api/v1/auth/amma-callback').query({state:state+'broken',assertion:'a'});
    expect(wallet.verifyAssertion).not.toHaveBeenCalled();
    await request(app).get('/api/v1/auth/amma-callback').query({state,assertion:'a'});
    await request(app).get('/api/v1/auth/amma-callback').query({state,assertion:'a'});
    expect(wallet.verifyAssertion).toHaveBeenCalledTimes(1);
  });
});
