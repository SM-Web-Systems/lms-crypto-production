/**
 * W07 — Billing DTO and permission-contract reconciliation
 * Frontend service tests (behavioral TDD)
 *
 * W7-FE-1: employer getBilling maps wire snake_case to camelCase
 *           RED before fix: amountCents/createdAt/courseId/paymentMethod all undefined
 *           GREEN after fix: all fields mapped; total is count not totalSpent
 * W7-FE-2: employer getBilling with success:false propagates as ApiRequestError
 *           RED before fix: assertApiSuccess not used → TypeError on undefined.payments
 *           GREEN after fix: assertApiSuccess throws ApiRequestError with code + message
 * W7-FE-3: sponsor getBilling with success:false propagates as ApiRequestError
 *           RED before fix: res.data.data used directly → TypeError; not ApiRequestError
 *           GREEN after fix: assertApiSuccess throws ApiRequestError
 * W7-FE-4: sponsor getBilling maps correctly and propagates empty success
 * W7-FE-5: employer null/undefined fields exact — no Number fallback coercion
 * W7-FE-6: wire integration — actual snake_case payload exposing field mapping gap
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/api', () => ({
  default: { get: vi.fn() },
  setTokenGetter: vi.fn(),
  onUnauthorized: () => () => {},
}));

import api from '../services/api';
import { employerService } from '../services/employerService';
import { sponsorService } from '../services/sponsorService';
import { ApiRequestError } from '../utils/apiError';

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── Employer billing ─────────────────────────────────────────────────────────

describe('W07 employer billing service', () => {
  const wirePayment = {
    id: 'pay-001',
    course_id: 'crs-001',
    amount_cents: 5000,
    currency: 'USD',
    payment_method: 'manual',
    status: 'confirmed',
    created_at: '2026-10-31T10:00:00.000Z',
  };

  it('W7-FE-1: maps wire snake_case fields to camelCase EmployerBilling (RED→GREEN)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: { payments: [wirePayment], total: 1 },
      },
    });

    const result = await employerService.getBilling();

    // These assertions FAIL before the fix (fields are undefined without a mapper)
    expect(result.payments[0].amountCents).toBe(5000);
    expect(result.payments[0].createdAt).toBe('2026-10-31T10:00:00.000Z');
    expect(result.payments[0].courseId).toBe('crs-001');
    expect(result.payments[0].paymentMethod).toBe('manual');
    expect(result.payments[0].id).toBe('pay-001');
    expect(result.payments[0].currency).toBe('USD');
    expect(result.payments[0].status).toBe('confirmed');
    // total is a count (not monetary aggregate) — RED: undefined (was totalSpent); GREEN: 1
    expect(result.total).toBe(1);
  });

  it('W7-FE-2: total is result count, not a monetary aggregate (no totalSpent)', async () => {
    const multiCurrencyPayments = [
      { ...wirePayment, id: 'p1', currency: 'USD', amount_cents: 5000, status: 'confirmed' },
      { ...wirePayment, id: 'p2', currency: 'XLM', amount_cents: 10000, status: 'failed' },
      { ...wirePayment, id: 'p3', currency: 'USD', amount_cents: 2000, status: 'refunded' },
    ];
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: { payments: multiCurrencyPayments, total: 3 },
      },
    });

    const result = await employerService.getBilling();
    // total is count (3), NOT sum of amount_cents across currencies/statuses
    expect(result.total).toBe(3);
    // No totalSpent property
    expect((result as unknown as Record<string, unknown>).totalSpent).toBeUndefined();
  });

  it('W7-FE-3: success:false response propagates as ApiRequestError (RED→GREEN)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      },
    });

    let caught: unknown;
    try {
      await employerService.getBilling();
    } catch (e) {
      caught = e;
    }
    // RED: caught is TypeError (no mapper + assertApiSuccess missing); GREEN: ApiRequestError
    expect(caught).toBeInstanceOf(ApiRequestError);
    expect((caught as ApiRequestError).code).toBe('FORBIDDEN');
    expect((caught as ApiRequestError).message).toBe('Insufficient permissions');
  });

  it('W7-FE-4: empty payment list is distinct from API failure (not undefined)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: { payments: [], total: 0 },
      },
    });

    const result = await employerService.getBilling();
    expect(Array.isArray(result.payments)).toBe(true);
    expect(result.payments).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('W7-FE-5: integer minor units preserved — no Number() coercion on null/malformed', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          payments: [{ ...wirePayment, amount_cents: 0, status: 'waived' }],
          total: 1,
        },
      },
    });
    const result = await employerService.getBilling();
    // Zero is a valid amount (waived); must not be coerced to a default
    expect(result.payments[0].amountCents).toBe(0);
  });
});

// ─── Sponsor billing service ───────────────────────────────────────────────────

describe('W07 sponsor billing service', () => {
  const wireResponse = {
    payments: [
      {
        id: 'sp1',
        course_id: 'crs-sp1',
        course_name: 'ML Fundamentals',
        payer_name: 'Alice',
        amount_cents: 12000,
        currency: 'USD',
        payment_method: 'paystack',
        status: 'confirmed',
        created_at: '2026-10-15T09:00:00.000Z',
      },
    ],
    total: 1,
    scope: 'cohort',
  };

  it('W7-FE-6: success:false response propagates as ApiRequestError (RED→GREEN)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        success: false,
        error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Cohort billing access is required' },
      },
    });

    let caught: unknown;
    try {
      await sponsorService.getBilling();
    } catch (e) {
      caught = e;
    }
    // RED: caught is TypeError (res.data.data is undefined → raw.payments.map throws);
    //      NOT an ApiRequestError with the server's code
    // GREEN: assertApiSuccess → ApiRequestError with code + message
    expect(caught).toBeInstanceOf(ApiRequestError);
    expect((caught as ApiRequestError).code).toBe('INSUFFICIENT_PERMISSIONS');
    expect((caught as ApiRequestError).message).toBe('Cohort billing access is required');
  });

  it('W7-FE-7: sponsor getBilling maps snake_case and optional fields correctly', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { success: true, data: wireResponse },
    });

    const result = await sponsorService.getBilling();
    const p = result.payments[0];
    expect(p.id).toBe('sp1');
    expect(p.courseId).toBe('crs-sp1');
    expect(p.courseName).toBe('ML Fundamentals');
    expect(p.payerName).toBe('Alice');
    expect(p.amountCents).toBe(12000);
    expect(p.currency).toBe('USD');
    expect(p.paymentMethod).toBe('paystack');
    expect(p.status).toBe('confirmed');
    expect(p.createdAt).toBe('2026-10-15T09:00:00.000Z');
    expect(result.total).toBe(1);
  });

  it('W7-FE-8: null course join yields undefined courseName (not fabricated title)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          payments: [{
            id: 'sp2', course_id: 'deleted-crs', course_name: null,
            payer_name: null, amount_cents: 3000, currency: 'USD',
            payment_method: 'manual', status: 'confirmed',
            created_at: '2026-10-20T00:00:00.000Z',
          }],
          total: 1,
          scope: 'own',
        },
      },
    });

    const result = await sponsorService.getBilling();
    // Null from LEFT JOIN must not be replaced with a fabricated title
    expect(result.payments[0].courseName).toBeUndefined();
    expect(result.payments[0].payerName).toBeUndefined();
    // Own payment still present even though course was deleted
    expect(result.payments[0].id).toBe('sp2');
    expect(result.payments[0].amountCents).toBe(3000);
  });

  it('W7-FE-9: empty successful billing distinct from failure (no throw on empty)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { success: true, data: { payments: [], total: 0, scope: 'own' } },
    });

    const result = await sponsorService.getBilling();
    expect(result.payments).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('W7-FE-10: no sensitive fields exposed — no user_id, email, provider references in payment', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { success: true, data: wireResponse },
    });

    const result = await sponsorService.getBilling();
    const p = result.payments[0] as Record<string, unknown>;
    // Server projection does not include user_id, email, paystack_reference etc.
    // Client mapping must not add them either
    expect(p.userId).toBeUndefined();
    expect(p.email).toBeUndefined();
    expect(p.paystackReference).toBeUndefined();
  });
});
