import { test, expect } from '../fixtures/auth';
import { apiURL } from '../playwright.config';
import { withFixtureDatabase } from '../helpers/fixture-db';
import { randomUUID } from 'node:crypto';

for (const width of [320, 390, 768]) {
  test(`LMS-030: ${width}px funding availability and independent grant reconcile`, async ({sponsorAPage: page, adminPage}) => {
    const id = `e2e-funding-${randomUUID()}`;
    withFixtureDatabase(db => {
      const owner = db.prepare('SELECT id FROM users WHERE email=?').get('sponsor-a@test.com').id;
      db.prepare(`INSERT INTO rewards(id,creator_user_id,scope_type,scope_id,reward_type,amount_stroops,max_recipients,description,idempotency_key)
        VALUES (?,?,'sponsor_cohort','e2e-cohort-a','custom',1234567,3,?,?)`).run(id, owner, id, id);
    });
    await page.setViewportSize({width, height: 844});
    await page.goto('/sponsor/rewards');
    const row = page.getByRole('row').filter({hasText: id});
    const options = row.getByRole('button', {name: 'Funding options'});
    await options.click();
    const dialog = page.getByRole('dialog', {name: 'Reward funding'});
    await expect(dialog.getByText('Card payments are available for course purchases only.')).toBeVisible();
    await expect(dialog.getByText('An independent reward administrator must authorize this grant.')).toBeVisible();
    await expect(dialog.getByRole('button', {name: 'Prepare grant'})).toHaveCount(0);
    await dialog.getByRole('button', {name: 'Close'}).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', {name: 'Close'})).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(options).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const prepared = await adminPage.request.post(`${apiURL}/api/v1/sponsor/rewards/${id}/funding-intents`,
      {data: {sourceType: 'admin_grant', idempotencyKey: `${id}-prepare`}});
    expect(prepared.status()).toBe(201);
    const intent = (await prepared.json()).data;
    expect(intent.amount_stroops).toBe(3703701);
    for (let retry = 0; retry < 2; retry++) {
      const funded = await adminPage.request.post(`${apiURL}/api/v1/sponsor/rewards/${id}/fund`,
        {data: {sourceType: 'admin_grant', intentId: intent.id, idempotencyKey: `${id}-fund`}});
      expect(funded.status()).toBe(200);
    }
    await page.reload();
    await expect(page.getByRole('row').filter({hasText: id}).getByRole('button', {name: 'Activate', exact: true})).toBeVisible();
    withFixtureDatabase(db => {
      expect(db.prepare('SELECT COUNT(*) AS n FROM reward_transactions WHERE reward_id=?').get(id).n).toBe(2);
      expect(db.prepare('SELECT COUNT(*) AS n FROM reward_funding_evidence WHERE intent_id=?').get(intent.id).n).toBe(1);
    });
  });
}
