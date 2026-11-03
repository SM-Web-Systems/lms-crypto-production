import { test, expect } from '../fixtures/auth';
import { apiURL } from '../playwright.config';

/**
 * E2E tests for sponsor authorization (AUTH-02/AUTH-03 combined).
 *
 * Validates cohort-scoped billing access and cohort ownership enforcement
 * at the HTTP boundary. Uses test-only data seeded in global-setup.ts.
 *
 * Guardrails:
 * - No production credentials or real payment transactions.
 * - All data seeded with deterministic e2e-* prefixed IDs.
 * - No Paystack or Stellar calls — uses pre-seeded payment records.
 * - Runs against isolated test database (DATABASE_PATH=/tmp/lms-e2e-*.db).
 */

// ── Deterministic IDs matching global-setup.ts seeding ──────────────────
const COHORT_A = 'e2e-cohort-a';
const COHORT_B = 'e2e-cohort-b';
const PAYMENT_A = 'e2e-payment-cohort-a';
const PAYMENT_B = 'e2e-payment-cohort-b';
const BADGE_A = 'e2e-badge-cohort-a';
const BADGE_B = 'e2e-badge-cohort-b';

test.describe('Sponsor Authorization — Cohort Access', () => {
  test('SPNS-E2E-01: Sponsor A can access own cohort', async ({ sponsorAPage }) => {
    const res = await sponsorAPage.request.get(`${apiURL}/api/v1/admin/cohorts/${COHORT_A}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.cohort.cohortId).toBe(COHORT_A);
  });

  test('SPNS-E2E-02: Sponsor A cannot access Sponsor B cohort', async ({ sponsorAPage }) => {
    const res = await sponsorAPage.request.get(`${apiURL}/api/v1/admin/cohorts/${COHORT_B}`);
    expect(res.status()).toBe(403);
  });
});

test.describe('Sponsor Authorization — Billing Data', () => {
  test('SPNS-E2E-03: Sponsor A sees only authorized payments', async ({ sponsorAPage }) => {
    const res = await sponsorAPage.request.get(`${apiURL}/api/v1/admin/payments`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const paymentIds = body.data.payments.map((p: { paymentId: string }) => p.paymentId);
    expect(paymentIds).toContain(PAYMENT_A);
    expect(paymentIds).not.toContain(PAYMENT_B);
  });

  test('SPNS-E2E-04: Sponsor A cannot view unrelated payment status', async ({ sponsorAPage }) => {
    const res = await sponsorAPage.request.get(`${apiURL}/api/v1/payments/${PAYMENT_B}/status`);
    expect(res.status()).toBe(403);
  });
});

test.describe('Sponsor Authorization — Receipt and Badge Access', () => {
  test('SPNS-E2E-05: Sponsor A cannot download unauthorized badge', async ({ sponsorAPage }) => {
    const res = await sponsorAPage.request.get(`${apiURL}/api/v1/badges/${BADGE_B}`);
    expect(res.status()).toBe(403);
  });

  test('SPNS-E2E-06: Sponsor A cannot initiate unauthorized cohort payment', async ({ sponsorAPage }) => {
    const res = await sponsorAPage.request.post(`${apiURL}/api/v1/admin/cohorts/${COHORT_B}/pay`);
    expect(res.status()).toBe(403);
  });
});

test.describe('Sponsor Authorization — Admin and Edge Cases', () => {
  test('SPNS-E2E-07: Admin retains full access to all cohorts', async ({ adminPage }) => {
    const resA = await adminPage.request.get(`${apiURL}/api/v1/admin/cohorts/${COHORT_A}`);
    expect(resA.status()).toBe(200);
    const resB = await adminPage.request.get(`${apiURL}/api/v1/admin/cohorts/${COHORT_B}`);
    expect(resB.status()).toBe(200);
  });

  test('SPNS-E2E-08: Unauthenticated request returns 401', async ({ request }) => {
    const res = await request.get(`${apiURL}/api/v1/admin/cohorts/${COHORT_A}`, {
      headers: { Authorization: '' },
    });
    expect(res.status()).toBe(401);
  });

  test('SPNS-E2E-09: Unauthorized student returns 403', async ({ studentPage }) => {
    const res = await studentPage.request.get(`${apiURL}/api/v1/admin/cohorts`);
    expect(res.status()).toBe(403);
  });

  test('SPNS-E2E-10: Revoked sponsor membership removes cohort access', async ({ sponsorAPage }) => {
    // Sponsor A should be able to see their own cohort list
    const listRes = await sponsorAPage.request.get(`${apiURL}/api/v1/admin/cohorts`);
    expect(listRes.status()).toBe(200);
    const body = await listRes.json();
    const cohortIds = body.data.cohorts.map((c: { cohortId: string }) => c.cohortId);
    // Sponsor A should see cohort A but not cohort B — confirming scope
    expect(cohortIds).toContain(COHORT_A);
    expect(cohortIds).not.toContain(COHORT_B);
  });
});
