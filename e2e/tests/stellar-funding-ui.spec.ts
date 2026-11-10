import {test, expect} from '../fixtures/auth';
import {withFixtureDatabase} from '../helpers/fixture-db';
import {randomUUID} from 'node:crypto';

// UI contract only: provider timeout is simulated. Actual provider verification
// and atomic credit are covered by the API integration/runtime tests.
for (const width of [320,390,768]) {
  test(`LMS-031: ${width}px public deposit instructions retain the same retry reference`, async ({sponsorAPage: page}) => {
    const id = `e2e-stellar-ui-${randomUUID()}`;
    withFixtureDatabase(db => {
      const owner = db.prepare('SELECT id FROM users WHERE email=?').get('sponsor-a@test.com').id;
      db.prepare(`INSERT INTO rewards(id,creator_user_id,scope_type,scope_id,reward_type,amount_stroops,description,idempotency_key)
        VALUES (?,?,'sponsor_cohort','e2e-cohort-a','custom',1234567,?,?)`).run(id,owner,id,id);
    });
    const destination = 'GDJT327MIBUOVRXKDDSBOIT7J2ORZB2Y4FDIVAXM7UUVHFPVU4LW7JHE';
    await page.route(`**/rewards/${id}/funding-options`, route => route.fulfill({json: {success: true, data: [{sourceType: 'stellar',available: true,reason: null}]}}));
    await page.route(`**/rewards/${id}/funding-intents`, route => route.fulfill({status: 201, json: {success: true, data: {
      id: `${id}-intent`,amount_stroops: 1234567,currency_code: 'XLM',network: 'public',destination,memo_hash: 'a'.repeat(64),expires_at: new Date(Date.now()+60000).toISOString(),
    }}}));
    const attempts: any[] = [];
    await page.route(`**/rewards/${id}/fund`, route => {
      attempts.push(route.request().postDataJSON());
      return route.fulfill({status: 503,json: {success: false,error: {code: 'FUNDING_UNVERIFIED',message: 'Synthetic provider timeout'}}});
    });
    await page.setViewportSize({width,height: 844});
    await page.goto('/sponsor/rewards');
    const opener = page.getByRole('row').filter({hasText: id}).getByRole('button',{name: 'Funding options'});
    await opener.click();
    const dialog = page.getByRole('dialog',{name: 'Reward funding'});
    await dialog.getByRole('button',{name: 'Prepare Stellar payment'}).click();
    await expect(dialog.getByText('Public network — real XLM')).toBeVisible();
    await expect(dialog.getByText('Send exactly 0.1234567 XLM as native XLM from your wallet.')).toBeVisible();
    await expect(dialog.getByText(destination)).toBeVisible();
    await expect(dialog.getByText('a'.repeat(64))).toBeVisible();
    const operation = dialog.getByLabel('Stellar payment operation ID');
    await operation.fill('123');
    for (let retry=0;retry<2;retry++) {
      await dialog.getByRole('button',{name: 'Verify payment'}).click();
      await expect(dialog.getByRole('alert')).toContainText('Payment was not confirmed');
      await expect(operation).toBeDisabled();
    }
    expect(attempts).toHaveLength(2); expect(attempts[0]).toEqual(attempts[1]);
    expect(attempts[0]).toMatchObject({sourceType: 'stellar',reference: '123',intentId: `${id}-intent`});
    await dialog.getByRole('button',{name: 'Close'}).focus(); await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button',{name: 'Verify payment'})).toBeFocused();
    await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
