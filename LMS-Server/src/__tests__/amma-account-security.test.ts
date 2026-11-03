import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Keypair } from '@stellar/stellar-sdk';
import { createHash } from 'node:crypto';
import app from '../app.js';
import { db, execute, queryOne, createSession } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import * as sso from '../services/ammaWalletSSOService.js';

const email = 'owner@example.invalid';
const password = 'local-password-proof';
const walletAddress = Keypair.random().publicKey();
const nextAddress = Keypair.random().publicKey();
const identity: sso.AmmaWalletSSOUser = {
  userId: 'wallet-owner', email, firstName: 'Wallet', lastName: 'Owner',
  isEmailVerified: true, mainnetWalletAddress: walletAddress,
};
const verifier = 'a'.repeat(64);

beforeEach(() => {
  db.exec('ALTER TABLE users ADD COLUMN auth_provider TEXT; ALTER TABLE users ADD COLUMN ammawallet_user_id TEXT');
  vi.spyOn(sso, 'verifyAssertion').mockResolvedValue({...identity});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function localUser(boundId: string | null = null) {
  execute(`INSERT INTO users(id,name,email,password_hash,role,auth_provider,ammawallet_user_id,walletAddress,wallet_linking_status)
    VALUES('owner','Local owner',?,?,'admin',?,?,?,'linked')`,
  [email, await bcrypt.hash(password, 4), boundId ? 'ammawallet' : 'local', boundId, walletAddress]);
  const token = generateToken({userId: 'owner', email, role: 'admin'});
  createSession('owner', token);
  return token;
}
const row = () => queryOne<Record<string, unknown>>('SELECT * FROM users WHERE id = ?', ['owner'])!;
const sessions = () => queryOne<{total: number}>('SELECT count(*) AS total FROM active_sessions WHERE revoked_at IS NULL')!.total;
async function callback(state?: string, mobile = false) {
  if (!state) {
    const start = await request(app).get('/api/v1/auth/amma-login').query(mobile ? {
      client: 'mobile', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256', app_state: 's'.repeat(64),
    } : {});
    state = new URL(start.headers.location).searchParams.get('state')!;
  }
  return request(app).get('/api/v1/auth/amma-callback').query({state, assertion: 'assertion'});
}
async function linkState(token: string, body: object = {password}) {
  const start = await request(app).post('/api/v1/auth/amma-link').auth(token, {type: 'bearer'}).send(body);
  expect(start.status).toBe(200);
  expect(start.headers['cache-control']).toBe('no-store');
  expect(start.body.data.url).not.toContain(token);
  return new URL(start.body.data.url).searchParams.get('state')!;
}
function expectError(response: request.Response, code: string, mobile = false) {
  const destination = new URL(response.headers.location);
  expect(response.status).toBe(302);
  expect((destination.searchParams.get(mobile ? 'error' : 'sso_error') ?? destination.searchParams.get('wallet_error'))).toBe(code);
  expect(destination.searchParams.has('code')).toBe(false);
  expect(destination.hash).toBe('');
}

describe('Amma identity and explicit linking policy', () => {
  it.each([false, true])('rejects unverified takeover on web/native=%s without mutations', async mobile => {
    await localUser();
    const before = row();
    vi.mocked(sso.verifyAssertion).mockResolvedValue({...identity, isEmailVerified: false});
    expectError(await callback(undefined, mobile), 'email_unverified', mobile);
    expect(row()).toEqual(before);
    expect(sessions()).toBe(1);
  });
  it('cannot provision allowlisted privileges with an unverified email', async () => {
    vi.stubEnv('ADMIN_EMAILS', email);
    vi.mocked(sso.verifyAssertion).mockResolvedValue({...identity, isEmailVerified: false});
    expectError(await callback(), 'email_unverified');
    expect(queryOne('SELECT id FROM users WHERE email = ?', [email])).toBeNull();
    expect(sessions()).toBe(0);
  });
  it.each([null, '', 'invalid', 'bad address@example.invalid'])('handles missing/invalid email %s without a server error', async value => {
    vi.mocked(sso.verifyAssertion).mockResolvedValue({...identity, email: value});
    expectError(await callback(), 'email_required');
    expect(sessions()).toBe(0);
  });
  it('returns the controlled phone-only error through the native callback', async () => {
    vi.mocked(sso.verifyAssertion).mockResolvedValue({...identity, email: null});
    expectError(await callback(undefined, true), 'email_required', true);
  });
  it.each([
    {userId: ''}, {userId: 17}, {isEmailVerified: 'true'}, {mainnetWalletAddress: 'invalid'}, {email: {}},
  ])('rejects malformed provider data %j before writes', async change => {
    vi.mocked(sso.verifyAssertion).mockResolvedValue({...identity, ...change} as sso.AmmaWalletSSOUser);
    expectError(await callback(), 'verify_failed');
    expect(sessions()).toBe(0);
  });
  it('requires consent for a verified email matching a local administrator', async () => {
    await localUser();
    const before = row();
    expectError(await callback(), 'link_required');
    expect(row()).toEqual(before);
  });
  it('never replaces an existing binding via email fallback', async () => {
    await localUser('different-wallet-user');
    const before = row();
    expectError(await callback(), 'identity_conflict');
    expect(row()).toEqual(before);
  });
  it('preserves stable identity and LMS email after a verified Wallet email change', async () => {
    await localUser(identity.userId);
    vi.mocked(sso.verifyAssertion).mockResolvedValue({...identity, email: 'changed@example.invalid'});
    const result = await callback();
    expect(result.headers.location).toContain('/sso-callback#token=');
    expect(row().email).toBe(email);
    expect(row().role).toBe('admin');
    expect(row().ammawallet_user_id).toBe(identity.userId);
  });
  it('rejects pre-existing duplicate provider bindings for administrative recovery', async () => {
    await localUser(identity.userId);
    execute(`INSERT INTO users(id,name,email,password_hash,role,ammawallet_user_id)
      VALUES('duplicate','Duplicate','duplicate@example.invalid','$sso$','student',?)`, [identity.userId]);
    expectError(await callback(), 'identity_conflict');
  });
  it('requires authentication and a correct LMS password before offering a link', async () => {
    const token = await localUser();
    expect((await request(app).post('/api/v1/auth/amma-link').send({password})).status).toBe(401);
    for (const body of [{}, {password: 'wrong'}, {password: {}}]) {
      expect((await request(app).post('/api/v1/auth/amma-link').auth(token, {type: 'bearer'}).send(body)).status).toBe(400);
    }
    expect(row().auth_provider).toBe('local');
  });
  it('links only the authenticated account, preserves roles, and revokes its earlier sessions', async () => {
    const token = await localUser();
    const state = await linkState(token, {password, userId: 'attacker-controlled-target'});
    const result = await callback(state);
    const fresh = new URL(result.headers.location).hash.slice('#token='.length);
    expect(fresh).toBeTruthy();
    expect(row().auth_provider).toBe('ammawallet');
    expect(row().ammawallet_user_id).toBe(identity.userId);
    expect(row().role).toBe('admin');
    expect(row().authorization_version).toBe(1);
    expect((await request(app).get('/api/v1/auth/me').auth(token, {type: 'bearer'})).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').auth(fresh, {type: 'bearer'})).status).toBe(200);
    expect(sessions()).toBe(1);
    expectError(await callback(state), 'invalid_state');
  });
  it.each(['logout', 'version', 'delete', 'expiry'])('rejects an outstanding link after %s', async change => {
    const token = await localUser();
    const state = await linkState(token);
    if (change === 'logout') await request(app).post('/api/v1/auth/logout').auth(token, {type: 'bearer'});
    if (change === 'version') execute("UPDATE users SET authorization_version=authorization_version+1 WHERE id='owner'");
    if (change === 'delete') execute("UPDATE users SET deletion_status='pending_deletion' WHERE id='owner'");
    if (change === 'expiry') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 301_000);
    expectError(await callback(state), change === 'expiry' ? 'invalid_state' : 'link_expired');
    expect(row().auth_provider).toBe('local');
  });
  it('requires the same verified email for initial conversion', async () => {
    const token = await localUser();
    const state = await linkState(token);
    vi.mocked(sso.verifyAssertion).mockResolvedValue({...identity, email: 'other@example.invalid'});
    expectError(await callback(state), 'link_email_mismatch');
    expect(row().auth_provider).toBe('local');
  });
  it('cannot link an identity already bound to another LMS account', async () => {
    const token = await localUser();
    const state = await linkState(token);
    execute(`INSERT INTO users(id,name,email,password_hash,role,ammawallet_user_id)
      VALUES('other','Other','other@example.invalid','$sso$','student',?)`, [identity.userId]);
    expectError(await callback(state), 'identity_conflict');
    expect(row().auth_provider).toBe('local');
  });
  it('refreshes only the current bound identity and rejects account switching', async () => {
    const token = await localUser(identity.userId);
    const state = await linkState(token, {});
    vi.mocked(sso.verifyAssertion).mockResolvedValue({...identity, userId: 'other'});
    expectError(await callback(state), 'identity_conflict');
    expect(row().ammawallet_user_id).toBe(identity.userId);
  });
  it.each([null, nextAddress])('synchronizes current wallet to %s without modifying historical recipients', async address => {
    await localUser(identity.userId);
    execute(`INSERT INTO nft_credentials(id,user_id,quiz_id,wallet_address,contract_id,network,mint_status)
      VALUES('history','owner',NULL,?,'test-contract','mainnet','minted')`, [walletAddress]);
    vi.mocked(sso.verifyAssertion).mockResolvedValue({...identity, mainnetWalletAddress: address});
    const response = await callback();
    expect(response.headers.location).toContain('/sso-callback#token=');
    expect(row().walletAddress).toBe(address);
    expect(row().wallet_linking_status).toBe(address ? 'linked' : 'none');
    expect(queryOne<{wallet_address: string}>("SELECT wallet_address FROM nft_credentials WHERE id='history'")!.wallet_address).toBe(walletAddress);
    if (!address) {
      const token = new URL(response.headers.location).hash.slice('#token='.length);
      const status = await request(app).get('/api/v1/wallet/status').auth(token, {type: 'bearer'});
      expect(status.body.data).toMatchObject({walletAddress: null, walletLinkingStatus: 'none', network: null,
        xlmBalance: null, selectionPolicy: 'last_confirmed_address'});
    }
  });
  it('rolls back conversion and revocation together if wallet synchronization fails', async () => {
    const token = await localUser();
    const state = await linkState(token);
    db.exec("CREATE TRIGGER fail_link BEFORE UPDATE OF walletAddress ON users BEGIN SELECT RAISE(ABORT, 'simulated failure'); END");
    expect((await callback(state)).status).toBe(500);
    expect(row().auth_provider).toBe('local');
    expect(row().authorization_version).toBe(0);
    expect((await request(app).get('/api/v1/auth/me').auth(token, {type: 'bearer'})).status).toBe(200);
  });
});
