import { test, expect } from '../fixtures/auth';
import { apiURL } from '../playwright.config';
import { withFixtureDatabase } from '../helpers/fixture-db';
import { randomUUID } from 'node:crypto';

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

for (const width of [320, 390, 768]) {
  test(`LMS-006: sponsor controls and keyboard focus at ${width}px`, async ({ sponsorAPage: page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/sponsor');
    const search = page.getByRole('button', { name: 'Search', exact: true });
    await expect(search).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
    await search.click();
    const dialog = page.getByRole('dialog', { name: 'Search', exact: true });
    const input = dialog.getByRole('textbox', { name: 'Search courses, certificates, and more' });
    const close = dialog.getByRole('button', { name: 'Close search' });
    await expect(input).toBeFocused();
    await input.press('Shift+Tab');
    await expect(close).toBeFocused();
    await close.press('Tab');
    await expect(input).toBeFocused();
    await input.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(search).toBeFocused();
    await page.getByRole('tab', { name: 'Sponsor Overview tab' }).focus();
    await page.keyboard.press('End');
    const billing = page.getByRole('tabpanel', { name: 'Billing tab' });
    await expect(billing).toBeVisible();
    const receipt = billing.getByRole('button', { name: /Download receipt/ });
    await receipt.focus();
    await expect(receipt).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

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

  test('SPNS-E2E-10: Cohort list is scoped to the sponsor', async ({ sponsorAPage }) => {
    // Sponsor A should be able to see their own cohort list
    const listRes = await sponsorAPage.request.get(`${apiURL}/api/v1/admin/cohorts`);
    expect(listRes.status()).toBe(200);
    const body = await listRes.json();
    const cohortIds = body.data.cohorts.map((c: { cohortId: string }) => c.cohortId);
    // Sponsor A should see cohort A but not cohort B — confirming scope
    expect(cohortIds).toContain(COHORT_A);
    expect(cohortIds).not.toContain(COHORT_B);
  });

  test('SPNS-E2E-11: membership removal and role revocation remove delegated access', async ({ superAdminPage, sponsorBPage, request }) => {
    const email = `e2e-revocation-${randomUUID()}@example.invalid`;
    const registration = await request.post(`${apiURL}/api/v1/auth/register`, {
      data: { name: 'Synthetic revocation sponsor', email, password: 'password123' },
    });
    expect(registration.status()).toBe(201);
    const target = (await registration.json()).data.user.id as string;
    const grant = await superAdminPage.request.post(`${apiURL}/api/v1/admin/users/${target}/roles`, { data: { roleId: 'role_sponsor' } });
    expect(grant.status()).toBe(201);
    const cohort = `e2e-revocation-${randomUUID()}`;
    const memberId = withFixtureDatabase(db => {
      db.prepare('INSERT INTO sponsor_cohorts(id,name,sponsor_user_id,course_id) VALUES (?,?,?,?)')
        .run(cohort, 'Synthetic revoked cohort', target, 'e2e-sponsor-course-01');
      db.prepare('INSERT INTO cohort_members(cohort_id,user_id) SELECT ?,id FROM users WHERE email=?')
        .run(cohort, 'sponsor-student@test.com');
      return db.prepare('SELECT id FROM users WHERE email=?').get('sponsor-student@test.com').id as string;
    });
    const login = async () => {
      const response = await request.post(`${apiURL}/api/v1/auth/login`, { data: { email, password: 'password123' } });
      expect(response.status()).toBe(200);
      return (await response.json()).data;
    };
    const session = await login();
    expect(session.user.workspaces).toContain('sponsor');
    const read = (token: string, path: string) => request.get(`${apiURL}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const receiptPath = `/payments/${PAYMENT_A}/receipt`;
    const billingPath = '/sponsor/billing?scope=cohort';
    const rosterExportPath = '/sponsor/courses/export';
    const memberEmail = 'sponsor-student@test.com';
    const protectedPaths = [
      `/admin/cohorts/${cohort}`, '/admin/payments', '/sponsor/impact-report?format=csv',
      billingPath, rosterExportPath, receiptPath, `/badges/${BADGE_A}`,
    ];
    for (const path of protectedPaths) {
      const response = await read(session.token, path);
      expect(response.status()).toBe(200);
      expect(response.headers()['cache-control']).toBe('no-store');
    }
    const billingIds = async (token: string) => {
      const response = await read(token, billingPath);
      expect(response.status()).toBe(200);
      return (await response.json()).data.payments.map((payment: { id: string }) => payment.id);
    };
    const rosterExport = async (token: string) => {
      const response = await read(token, rosterExportPath);
      expect(response.status()).toBe(200);
      return response.text();
    };
    expect(await billingIds(session.token)).toContain(PAYMENT_A);
    expect(await rosterExport(session.token)).toContain(memberEmail);

    // Removing the delegated member scope is effective for existing and new
    // sessions, even though the sponsor role and cohort ownership remain.
    const removed = await request.delete(`${apiURL}/api/v1/admin/cohorts/${cohort}/members/${memberId}`, { headers: { Authorization: `Bearer ${session.token}` } });
    expect(removed.status()).toBe(200);
    const narrowed = await login();
    expect(narrowed.user.workspaces).toContain('sponsor');
    for (const token of [session.token, narrowed.token]) {
      expect((await read(token, receiptPath)).status()).toBe(403);
      expect((await read(token, `/badges/${BADGE_A}`)).status()).toBe(403);
      expect(await billingIds(token)).not.toContain(PAYMENT_A);
      expect(await rosterExport(token)).not.toContain(memberEmail);
    }
    const restored = await request.post(`${apiURL}/api/v1/admin/cohorts/${cohort}/members`, {
      headers: { Authorization: `Bearer ${narrowed.token}` }, data: { userIds: [memberId] },
    });
    expect(restored.status()).toBe(200);
    expect((await read(session.token, receiptPath)).status()).toBe(200);
    expect(await billingIds(session.token)).toContain(PAYMENT_A);
    expect(await rosterExport(session.token)).toContain(memberEmail);
    expect((await sponsorBPage.request.get(`${apiURL}/api/v1/admin/cohorts/${COHORT_B}`)).status()).toBe(200);
    const before = withFixtureDatabase(db => ({
      targetVersion: db.prepare('SELECT authorization_version FROM users WHERE id=?').get(target).authorization_version,
      otherVersion: db.prepare('SELECT authorization_version FROM users WHERE email=?').get('sponsor-b@test.com').authorization_version,
    }));

    const revoke = await superAdminPage.request.delete(`${apiURL}/api/v1/admin/users/${target}/roles/role_sponsor`);
    expect(revoke.status()).toBe(200);
    withFixtureDatabase(db => {
      expect(db.prepare('SELECT authorization_version FROM users WHERE id=?').get(target).authorization_version).toBe(before.targetVersion + 1);
      expect(db.prepare('SELECT COUNT(*) AS n FROM active_sessions WHERE user_id=? AND revoked_at IS NULL').get(target).n).toBe(0);
      expect(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE target_id=? AND action='rbac.role_removed'").get(target).n).toBeGreaterThan(0);
      expect(db.prepare('SELECT sponsor_user_id FROM sponsor_cohorts WHERE id=?').get(cohort).sponsor_user_id).toBe(target);
    });
    for (const path of protectedPaths) {
      const response = await read(session.token, path);
      expect(response.status()).toBe(401);
      expect(response.headers()['cache-control']).toBe('no-store');
    }

    const renewed = await login();
    expect(renewed.user.workspaces).not.toContain('sponsor');
    for (const path of protectedPaths) expect((await read(renewed.token, path)).status()).toBe(403);
    // The explicit student role remains; own billing is a separate entitlement.
    expect((await read(renewed.token, '/sponsor/billing')).status()).toBe(200);
    expect((await sponsorBPage.request.get(`${apiURL}/api/v1/admin/cohorts/${COHORT_B}`)).status()).toBe(200);
    expect((await sponsorBPage.request.get(`${apiURL}/api/v1/payments/${PAYMENT_B}/receipt`)).status()).toBe(200);
    withFixtureDatabase(db => {
      expect(db.prepare('SELECT authorization_version FROM users WHERE email=?').get('sponsor-b@test.com').authorization_version).toBe(before.otherVersion);
    });
  });
});
