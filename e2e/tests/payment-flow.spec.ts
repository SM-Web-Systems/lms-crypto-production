import { test, expect } from '../fixtures/auth';
import { apiURL } from '../playwright.config';
import { createHmac } from 'crypto';

/**
 * E2E tests for payment flows (Paystack + Stellar).
 *
 * These tests validate the payment lifecycle from the student's perspective.
 * External payment providers (Paystack, Stellar Horizon) are not available
 * in the test environment — tests validate API behavior at the boundary.
 *
 * Guardrails:
 * - No production credentials.
 * - Test environment only (NODE_ENV=test).
 * - No real payment transactions.
 */

test.describe('Payment Flow', () => {
  test('student can view course pricing', async ({ studentPage }) => {
    // Fetch available courses to find one with pricing
    const coursesRes = await studentPage.request.get(`${apiURL}/api/v1/courses`);
    expect(coursesRes.ok()).toBeTruthy();
    const coursesBody = await coursesRes.json();
    const courses = coursesBody.data?.courses || coursesBody.data || [];

    if (courses.length === 0) {
      test.skip(true, 'No courses available in test environment');
      return;
    }

    const courseId = courses[0].id;
    const pricingRes = await studentPage.request.get(
      `${apiURL}/api/v1/courses/${courseId}/pricing`,
    );
    expect(pricingRes.ok()).toBeTruthy();
    const pricing = await pricingRes.json();
    const data = pricing.data || pricing;

    // Pricing response should include key fields
    expect(data).toHaveProperty('priceCents');
    expect(data).toHaveProperty('currency');
    expect(typeof data.priceCents).toBe('number');
    expect(data.priceCents).toBeGreaterThanOrEqual(0);
  });

  test('checkout requires valid applicationId', async ({ studentPage }) => {
    // POST without applicationId should return 400
    const res = await studentPage.request.post(`${apiURL}/api/v1/payments/checkout/paystack`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('checkout with non-existent application returns 404', async ({ studentPage }) => {
    const res = await studentPage.request.post(`${apiURL}/api/v1/payments/checkout/paystack`, {
      data: { applicationId: 'non-existent-app-id-00000000' },
    });
    // Should be 404 (application not found) or 400
    expect([400, 404]).toContain(res.status());
  });

  test('Stellar checkout requires valid applicationId', async ({ studentPage }) => {
    // POST without applicationId should return 400
    const res = await studentPage.request.post(`${apiURL}/api/v1/payments/checkout/stellar`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('payment status for non-existent payment returns 404', async ({ studentPage }) => {
    const res = await studentPage.request.get(
      `${apiURL}/api/v1/payments/non-existent-payment-id/status`,
    );
    expect([404, 400]).toContain(res.status());
  });

  test('receipt for non-existent payment returns 404', async ({ studentPage }) => {
    const res = await studentPage.request.get(
      `${apiURL}/api/v1/payments/non-existent-payment-id/receipt`,
    );
    expect([404, 400]).toContain(res.status());
  });
});

test.describe('Webhook Security', () => {
  test('webhook without signature is rejected', async ({ request }) => {
    const payload = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'fake-ref-001', amount: 10000 },
    });

    const res = await request.post(`${apiURL}/api/v1/webhooks/paystack`, {
      data: payload,
      headers: { 'Content-Type': 'application/json' },
    });
    // Should be 401 (missing signature) or 400
    expect([400, 401]).toContain(res.status());
  });

  test('webhook with invalid signature is rejected', async ({ request }) => {
    const payload = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'fake-ref-002', amount: 10000 },
    });

    const res = await request.post(`${apiURL}/api/v1/webhooks/paystack`, {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': 'invalid-signature-value',
      },
    });
    // Should be 401 (bad signature)
    expect([400, 401]).toContain(res.status());
  });

  test('webhook with valid signature but unknown reference returns 200', async ({ request }) => {
    // In test env, PAYSTACK_SECRET_KEY defaults to empty string
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY || '';
    const payload = JSON.stringify({
      event: 'charge.success',
      data: {
        reference: 'lms-pay-unknown-ref-9999',
        amount: 10000,
        currency: 'ZAR',
        status: 'success',
      },
    });

    const signature = createHmac('sha512', paystackSecret)
      .update(payload)
      .digest('hex');

    const res = await request.post(`${apiURL}/api/v1/webhooks/paystack`, {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': signature,
      },
    });
    // Webhook with valid sig but unknown ref: should return 200 (no-match, logged)
    expect(res.status()).toBe(200);
  });

  test('duplicate webhook with same reference is handled idempotently', async ({ request }) => {
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY || '';
    const payload = JSON.stringify({
      event: 'charge.success',
      data: {
        reference: 'lms-pay-idempotent-test-01',
        amount: 10000,
        currency: 'ZAR',
        status: 'success',
      },
    });

    const signature = createHmac('sha512', paystackSecret)
      .update(payload)
      .digest('hex');

    const headers = {
      'Content-Type': 'application/json',
      'x-paystack-signature': signature,
    };

    // Send the same webhook twice
    const res1 = await request.post(`${apiURL}/api/v1/webhooks/paystack`, {
      data: payload,
      headers,
    });
    const res2 = await request.post(`${apiURL}/api/v1/webhooks/paystack`, {
      data: payload,
      headers,
    });

    // Both should return 200 (idempotent — no error on duplicate)
    expect(res1.status()).toBe(200);
    expect(res2.status()).toBe(200);
  });
});

test.describe('Payment API', () => {
  test('payment history endpoint returns student payments', async ({ studentPage }) => {
    const response = await studentPage.request.get(`${apiURL}/api/v1/payments/mine`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const payments = body.data || [];

    // Response should be an array (may be empty for a fresh test user)
    expect(Array.isArray(payments)).toBe(true);

    // If payments exist, validate structure
    if (payments.length > 0) {
      const payment = payments[0];
      expect(payment).toHaveProperty('courseId');
      expect(payment).toHaveProperty('status');
      expect(payment).toHaveProperty('paymentMethod');
      expect(payment).toHaveProperty('amountCents');
    }
  });

  test('admin payment analytics endpoint returns summary', async ({ adminPage }) => {
    const response = await adminPage.request.get(`${apiURL}/api/v1/analytics/payments`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const data = body.data || body;

    // Analytics should include summary fields
    expect(data).toHaveProperty('summary');
    const summary = data.summary;
    expect(summary).toHaveProperty('totalRevenue');
    expect(summary).toHaveProperty('confirmed');
    expect(summary).toHaveProperty('pending');
    expect(summary).toHaveProperty('failed');
  });

  test('unauthenticated request to payments is rejected', async ({ page }) => {
    // Ensure payment endpoints require authentication
    const response = await page.request.get(`${apiURL}/api/v1/payments/mine`);
    expect(response.status()).toBe(401);
  });

  test('student cannot access admin payment list', async ({ studentPage }) => {
    const response = await studentPage.request.get(`${apiURL}/api/v1/admin/payments`);
    // Should be 403 (forbidden) or 401 depending on RBAC implementation
    expect([401, 403]).toContain(response.status());
  });

  test('student cannot confirm payments (admin-only)', async ({ studentPage }) => {
    const response = await studentPage.request.post(
      `${apiURL}/api/v1/admin/payments/fake-id/confirm`,
      { data: {} },
    );
    expect([401, 403]).toContain(response.status());
  });

  test('student cannot waive payments (admin-only)', async ({ studentPage }) => {
    const response = await studentPage.request.post(
      `${apiURL}/api/v1/admin/payments/fake-id/waive`,
      { data: { notes: 'test' } },
    );
    expect([401, 403]).toContain(response.status());
  });

  test('student cannot trigger refunds (admin-only)', async ({ studentPage }) => {
    const response = await studentPage.request.post(
      `${apiURL}/api/v1/admin/payments/fake-id/refund`,
      { data: {} },
    );
    expect([401, 403]).toContain(response.status());
  });
});
