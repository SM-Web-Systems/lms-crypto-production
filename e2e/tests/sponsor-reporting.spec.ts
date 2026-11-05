import { test, expect } from '../fixtures/auth';
import { apiURL } from '../playwright.config';
import { withFixtureDatabase } from '../helpers/fixture-db';
import { expectedSponsorImpact } from '../../LMS-Server/src/__tests__/helpers/sponsorReportingFixture';
import { readFile } from 'node:fs/promises';

test('LMS-021: independently computed impact equals API, UI and the downloaded CSV', async ({ reportingSponsorPage: page }) => {
  const expected = withFixtureDatabase(db => {
    const owner = db.prepare('SELECT id FROM users WHERE email=?').get('sponsor-reporting@test.com').id;
    return expectedSponsorImpact(db, owner);
  });
  const response = await page.request.get(`${apiURL}/api/v1/sponsor/impact-report`);
  expect(response.ok()).toBeTruthy();
  const data = (await response.json()).data;
  expect(data.cohorts.sort((a: any, b: any) => a.cohort_id.localeCompare(b.cohort_id))).toEqual(expected);
  expect(data).toMatchObject({ totalMembers: 7, totalCompleted: 3, totalCertificates: 3, completionPct: 43 });
  await page.goto('/sponsor/impact');
  for (const row of expected) {
    const cells = page.getByRole('row').filter({ has: page.getByRole('cell', { name: row.cohort_name, exact: true }) }).getByRole('cell');
    const rate = row.member_count ? Math.round(100 * row.completed_count / row.member_count) : 0;
    await expect(cells).toHaveText([row.cohort_name, String(row.member_count), String(row.completed_count), String(row.certificate_count), `${rate}%`]);
  }
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export impact report as CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^impact-report-\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = (await readFile((await file.path())!, 'utf8')).trim().split('\n');
  expect(lines[0]).toBe('Cohort,Members,Completed,Certificates,Rate %');
  expect(lines.slice(1).sort()).toEqual([
    '"Empty cohort","0","0","0","0"', '"Zero cohort","2","0","0","0"',
    '"Partial, ""quoted"" cohort","3","1","1","33"', '"Full cohort","2","2","2","100"',
  ].sort());
});

test('LMS-021: currency totals, date edges and receipt permissions remain distinct', async ({ reportingSponsorPage: page }) => {
  await page.goto('/sponsor/cohorts');
  const total = page.getByTestId('total-spent');
  await expect(total).toContainText('USD 100.00');
  await expect(total).toContainText('ZAR 250.00');
  await expect(total).not.toContainText('$');
  const billing = await page.request.get(`${apiURL}/api/v1/sponsor/billing?from=2026-03-15&to=2026-03-15`);
  expect((await billing.json()).data.payments.map((p: any) => p.id).sort()).toEqual(['e2e-report-usd-payment','e2e-report-zar-payment']);
  for (const id of ['usd','zar']) {
    const receipt = await page.request.get(`${apiURL}/api/v1/payments/e2e-report-${id}-payment/receipt`);
    expect(receipt.status()).toBe(200);
    expect(receipt.headers()['content-type']).toContain('application/pdf');
    expect((await receipt.body()).subarray(0, 4).toString()).toBe('%PDF');
  }
  for (const [id, status] of [['hidden',403],['pending',400],['refunded',400]] as const) {
    expect((await page.request.get(`${apiURL}/api/v1/payments/e2e-report-${id}-payment/receipt`)).status()).toBe(status);
  }
});

test('LMS-021: report retries a failed request and date filtering reaches the empty state', async ({ reportingSponsorPage: page }) => {
  let requests = 0;
  await page.route('**/api/v1/sponsor/impact-report', route => ++requests === 1
    ? route.fulfill({ status: 503, json: { success: false, error: { message: 'Synthetic reporting outage' } } }) : route.continue());
  await page.goto('/sponsor/impact');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Full cohort', exact: true })).toBeVisible();
  await page.getByLabel('From').fill('2026-04-01');
  await page.getByLabel('To').fill('2026-04-30');
  await page.getByRole('button', { name: 'Apply date filter', exact: true }).click();
  await expect(page.getByText('No cohort data yet. Create a cohort to see impact metrics.')).toBeVisible();
});
