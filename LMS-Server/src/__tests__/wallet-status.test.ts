import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { seedTestData, type TestIds, LINKED_WALLET_ADDRESS } from './helpers/seed.js';
import { makeToken } from './helpers/auth.js';

let ids: TestIds;
let adminToken: string;
let studentToken: string;
let linkedStudentToken: string;

beforeEach(() => {
  ids = seedTestData();
  adminToken = makeToken({ userId: ids.adminId, email: 'admin@test.com', role: 'admin' });
  studentToken = makeToken({ userId: ids.studentUserId, email: 'student@test.com', role: 'student', studentId: ids.studentId });
  linkedStudentToken = makeToken({ userId: ids.linkedStudentUserId, email: 'linked@test.com', role: 'student', studentId: ids.linkedStudentId });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/v1/wallet/status', () => {
  it('uses testnet Horizon for a testnet wallet', async () => {
    vi.stubEnv('AMMA_SSO_WALLET_NETWORK', 'testnet');
    vi.stubEnv('AMMA_WALLET_URL', 'https://wallet-test.example.invalid');
    vi.stubEnv('AMMA_SSO_ISSUER', 'https://wallet-test.example.invalid');
    const { execute } = await import('../config/database.js');
    execute("UPDATE users SET wallet_network = 'testnet' WHERE id = ?", [ids.linkedStudentUserId]);
    const mockFetch = vi.fn().mockResolvedValue({ok: true, json: async () => ({balances: [{asset_type: 'native', balance: '2'}]})});
    vi.stubGlobal('fetch', mockFetch);
    try {
      const res = await request(app).get('/api/v1/wallet/status').set('Authorization', `Bearer ${linkedStudentToken}`);
      expect(res.body.data.network).toBe('testnet');
      expect(mockFetch.mock.calls[0][0]).toBe(`https://horizon-testnet.stellar.org/accounts/${LINKED_WALLET_ADDRESS}`);
    } finally {vi.unstubAllEnvs(); vi.unstubAllGlobals();}
  });
  it('does not query mainnet for a legacy binding while staging is on testnet', async () => {
    vi.stubEnv('AMMA_SSO_WALLET_NETWORK', 'testnet');
    vi.stubEnv('AMMA_WALLET_URL', 'https://wallet-test.example.invalid');
    vi.stubEnv('AMMA_SSO_ISSUER', 'https://wallet-test.example.invalid');
    const mockFetch = vi.fn(); vi.stubGlobal('fetch', mockFetch);
    try {
      const res = await request(app).get('/api/v1/wallet/status').set('Authorization', `Bearer ${linkedStudentToken}`);
      expect(res.body.data).toMatchObject({network: 'mainnet', xlmBalance: null});
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {vi.unstubAllEnvs(); vi.unstubAllGlobals();}
  });
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/wallet/status');
    expect(res.status).toBe(401);
  });

  it('returns none/null for student with no linked wallet', async () => {
    const res = await request(app)
      .get('/api/v1/wallet/status')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.walletLinkingStatus).toBe('none');
    expect(res.body.data.network).toBeNull();
    expect(res.body.data.xlmBalance).toBeNull();
  });

  it('returns mainnet/balance for linked student when Horizon succeeds', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        balances: [
          { asset_type: 'native', balance: '1.5000000' },
          { asset_type: 'credit_alphanum4', balance: '100.0000000' },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await request(app)
      .get('/api/v1/wallet/status')
      .set('Authorization', `Bearer ${linkedStudentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.walletAddress).toBe(LINKED_WALLET_ADDRESS);
    expect(res.body.data.walletLinkingStatus).toBe('linked');
    expect(res.body.data.network).toBe('mainnet');
    expect(res.body.data.xlmBalance).toBeCloseTo(1.5);
  });

  it('returns xlmBalance: null gracefully when Horizon fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'));
    vi.stubGlobal('fetch', mockFetch);

    const res = await request(app)
      .get('/api/v1/wallet/status')
      .set('Authorization', `Bearer ${linkedStudentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.walletLinkingStatus).toBe('linked');
    expect(res.body.data.network).toBe('mainnet');
    expect(res.body.data.xlmBalance).toBeNull();
  });

  it('returns xlmBalance: null when Horizon returns non-ok status', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', mockFetch);

    const res = await request(app)
      .get('/api/v1/wallet/status')
      .set('Authorization', `Bearer ${linkedStudentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.xlmBalance).toBeNull();
  });

  it('admin can also call wallet/status', async () => {
    const res = await request(app)
      .get('/api/v1/wallet/status')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.walletLinkingStatus).toBe('none');
    expect(res.body.data.xlmBalance).toBeNull();
  });
});
