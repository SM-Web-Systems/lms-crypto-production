import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { seedTestData } from './helpers/seed.js';
import { makeToken } from './helpers/auth.js';
import { getXlmUsdcPrice, resetXlmUsdcPriceCache, CIRCLE_USDC_ISSUER } from '../services/xlmPriceService.js';

const book = (bid: string, ask: string) => ({
  ok: true,
  json: async () => ({ bids: [{ price: bid }], asks: [{ price: ask }] }),
});

beforeEach(() => resetXlmUsdcPriceCache());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('getXlmUsdcPrice', () => {
  it('returns the order book mid-price for XLM/Circle USDC from public Horizon', async () => {
    const fetchMock = vi.fn().mockResolvedValue(book('0.29', '0.31'));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getXlmUsdcPrice()).toBeCloseTo(0.3);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url.startsWith('https://horizon.stellar.org/order_book?')).toBe(true);
    expect(url).toContain('selling_asset_type=native');
    expect(url).toContain('buying_asset_code=USDC');
    expect(url).toContain(`buying_asset_issuer=${CIRCLE_USDC_ISSUER}`);
  });

  it('still reads the public network price when the server runs on testnet', async () => {
    vi.stubEnv('REWARD_STELLAR_NETWORK', 'testnet');
    vi.stubEnv('NFT_STELLAR_NETWORK', 'testnet');
    const fetchMock = vi.fn().mockResolvedValue(book('0.29', '0.31'));
    vi.stubGlobal('fetch', fetchMock);

    await getXlmUsdcPrice();
    expect(String(fetchMock.mock.calls[0][0])).toContain('https://horizon.stellar.org/');
  });

  it('caches the price for about 5 minutes', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(book('0.29', '0.31'));
    vi.stubGlobal('fetch', fetchMock);

    await getXlmUsdcPrice();
    vi.advanceTimersByTime(4 * 60_000);
    await getXlmUsdcPrice();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2 * 60_000);
    await getXlmUsdcPrice();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('passes an abort signal so a slow Horizon times out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(book('0.29', '0.31'));
    vi.stubGlobal('fetch', fetchMock);
    await getXlmUsdcPrice();
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['Horizon is unreachable', () => Promise.reject(new Error('timeout'))],
    ['Horizon answers non-ok', () => Promise.resolve({ ok: false, status: 503 })],
    ['the book is empty', () => Promise.resolve({ ok: true, json: async () => ({ bids: [], asks: [] }) })],
    ['a price is not a number', () => Promise.resolve(book('abc', '0.31'))],
  ])('returns null when %s', async (_label, impl) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(impl));
    expect(await getXlmUsdcPrice()).toBeNull();
  });
});

describe('GET /api/v1/prices/xlm-usdc', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/prices/xlm-usdc');
    expect(res.status).toBe(401);
  });

  it('returns the price for a signed-in user, and null when unavailable', async () => {
    const ids = seedTestData();
    const token = makeToken({ userId: ids.studentUserId, email: 'student@test.com', role: 'student', studentId: ids.studentId });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(book('0.29', '0.31')));
    let res = await request(app).get('/api/v1/prices/xlm-usdc').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.xlmUsdc).toBeCloseTo(0.3);
    expect(res.body.data.source).toBe('stellar-public-dex');

    resetXlmUsdcPriceCache();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    res = await request(app).get('/api/v1/prices/xlm-usdc').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.xlmUsdc).toBeNull();
  });
});
