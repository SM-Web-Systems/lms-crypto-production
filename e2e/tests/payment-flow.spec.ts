import { test, expect } from '../fixtures/auth';
import { apiURL } from '../playwright.config';

/**
 * E2E tests for payment flows (Paystack + Stellar).
 *
 * These tests validate the payment lifecycle from the student's perspective.
 * External payment providers (Paystack, Stellar Horizon) should be mocked
 * in the test environment — no real transactions occur.
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

  test.skip('successful Paystack checkout initiation', async ({ studentPage }) => {
    // Requires a paid course with an application — skip until test data seeding is available.
    // To implement:
    // 1. Create/find an application for a paid course
    // 2. POST /payments/checkout/paystack with applicationId
    // 3. Verify response contains checkoutUrl, reference, accessCode
  });

  test.skip('payment confirmation updates enrollment', async ({ studentPage }) => {
    // Requires simulating a Paystack webhook callback — skip until webhook mocking is available.
  });

  test.skip('failed payment shows error state', async ({ studentPage }) => {
    // Requires a failed payment scenario — skip until test data seeding is available.
  });

  test.skip('duplicate webhook is handled idempotently', async ({ request }) => {
    // Requires HMAC-signed webhook payloads — skip until webhook test helpers are available.
  });

  test.skip('expired payment session shows timeout', async ({ studentPage }) => {
    // Requires payment session expiry simulation — skip until test infrastructure supports it.
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
});
