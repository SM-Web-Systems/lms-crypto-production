import { createHmac } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function service(key: string, mode: string | undefined) {
  vi.resetModules();
  vi.stubEnv('PAYSTACK_SECRET_KEY', key);
  vi.stubEnv('PAYSTACK_REQUIRED_MODE', mode);
  return import('../services/paystackService.js');
}

it.each([
  ['sk_live_fixture', 'test'],
  ['sk_test_fixture', 'live'],
  ['rk_test_fixture', 'test'],
  ['sk_test_', 'test'],
  ['', 'test'],
  ['sk_test_fixture', 'invalid'],
])('refuses provider access for incompatible key %s and required mode %s', async (key, mode) => {
  const paystack = await service(key, mode);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const body = '{}';
  const signature = createHmac('sha512', key).update(body).digest('hex');

  expect(paystack.isPaystackConfigured()).toBe(false);
  expect(paystack.verifyWebhookSignature(body, signature)).toBe(false);
  await expect(paystack.initializeTransaction('learner@example.invalid', 100, 'ZAR', 'charge', 'https://example.invalid'))
    .rejects.toThrow('Paystack is unavailable');
  await expect(paystack.createRefund('charge', 'refund', 100, 'ZAR')).rejects.toThrow('Paystack is unavailable');
  await expect(paystack.verifyTransaction('charge')).rejects.toThrow('Paystack is unavailable');
  expect(fetch).not.toHaveBeenCalled();
});

it.each([['sk_test_fixture', 'test'], ['sk_live_fixture', 'live'], ['legacy-fixture', undefined]])(
  'keeps a compatible integration available', async (key, mode) => {
    const paystack = await service(key, mode);
    const body = '{}';
    const signature = createHmac('sha512', key).update(body).digest('hex');
    const fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ status: true, data: {
        authorization_url: 'https://checkout.paystack.com/fixture', access_code: 'fixture', reference: 'charge',
      } }),
    });
    vi.stubGlobal('fetch', fetch);

    expect(paystack.isPaystackConfigured()).toBe(true);
    expect(paystack.verifyWebhookSignature(body, signature)).toBe(true);
    await expect(paystack.initializeTransaction('learner@example.invalid', 100, 'ZAR', 'charge', 'https://example.invalid'))
      .resolves.toMatchObject({ reference: 'charge' });
    expect(fetch).toHaveBeenCalledOnce();
  },
);
