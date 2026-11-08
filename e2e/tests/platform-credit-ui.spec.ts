import {test,expect} from '../fixtures/auth';
import {withFixtureDatabase} from '../helpers/fixture-db';
import {randomUUID} from 'node:crypto';

// This isolates the credit-selection/confirmation contract. Administrative
// authorization and real SQLite consumption are tested by API/runtime drills.
for(const width of [320,390,768]) {
  test(`LMS-032: ${width}px backed credit confirmation retains its allocation on retry`,async({sponsorAPage:page})=>{
    const id=`e2e-credit-ui-${randomUUID()}`;
    withFixtureDatabase(db=>{
      const owner=db.prepare('SELECT id FROM users WHERE email=?').get('sponsor-a@test.com').id;
      db.prepare(`INSERT INTO rewards(id,creator_user_id,scope_type,scope_id,reward_type,amount_stroops,description,idempotency_key)
        VALUES (?,?,'sponsor_cohort','e2e-cohort-a','custom',1234567,?,?)`).run(id,owner,id,id);
    });
    const grant=`${id}-grant`,intent=`${id}-intent`;
    await page.route(`**/rewards/${id}/funding-options`,route=>route.fulfill({json:{success:true,data:[{sourceType:'platform_credit',available:true,reason:null,creditGrants:[{id:grant,availableStroops:2000000}]}]}}));
    await page.route(`**/rewards/${id}/funding-intents`,route=>{
      expect(route.request().postDataJSON()).toMatchObject({sourceType:'platform_credit',reference:grant});
      return route.fulfill({status:201,json:{success:true,data:{id:intent,reference:grant,network:'testnet',amount_stroops:1234567,expires_at:new Date(Date.now()+60000).toISOString()}}});
    });
    const attempts:any[]=[];
    await page.route(`**/rewards/${id}/fund`,route=>{
      attempts.push(route.request().postDataJSON());
      return route.fulfill({status:attempts.length===2?402:503,json:{success:false,error:{code:'INSUFFICIENT_CREDIT',message:'Synthetic retry condition'}}});
    });
    await page.setViewportSize({width,height:844});await page.goto('/sponsor/rewards');
    const opener=page.getByRole('row').filter({hasText:id}).getByRole('button',{name:'Funding options'});await opener.click();
    const dialog=page.getByRole('dialog',{name:'Reward funding'});
    await expect(dialog.getByLabel('Available platform credit')).toHaveValue(grant);
    await dialog.getByRole('button',{name:'Reserve platform credit'}).click();
    await expect(dialog.getByText('Testnet — test XLM')).toBeVisible();
    await expect(dialog.getByText('Authorize 0.1234567 XLM from the reserved platform credit to fund this reward.')).toBeVisible();
    const authorize=dialog.getByRole('button',{name:'Authorize platform credit'});
    for(let retry=0;retry<3;retry++){await authorize.click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(authorize).toBeEnabled();}
    expect(attempts).toHaveLength(3);expect(attempts[0]).toEqual(attempts[1]);expect(attempts[1]).toEqual(attempts[2]);
    expect(attempts[0]).toMatchObject({sourceType:'platform_credit',reference:grant,intentId:intent});
    await dialog.getByRole('button',{name:'Close'}).focus();await page.keyboard.press('Tab');await expect(authorize).toBeFocused();
    await page.keyboard.press('Escape');await expect(opener).toBeFocused();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
