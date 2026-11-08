import { seedTestAccount } from './helpers/rbacFixtures.js';
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { expectedSponsorImpact, seedSponsorReporting } from './helpers/sponsorReportingFixture.js';

const owner = 'report-owner', other = 'report-other';
let token: string;
beforeEach(() => {
  for (const id of [owner, other]) {
    seedTestAccount(db, "INSERT INTO users(id,name,email,password_hash) VALUES (?,?,?,'synthetic')", [id, id, `${id}@example.invalid`], ["role_student"]);
    db.prepare("INSERT INTO user_roles(user_id,role_id) VALUES (?,'role_sponsor')").run(id);
  }
  token = makeToken({ userId: owner, email: `${owner}@example.invalid`, role: 'student' });
  seedSponsorReporting(db, owner, other);
});
const get = (url: string) => request(app).get('/api/v1/sponsor/' + url).set('Authorization', `Bearer ${token}`);

describe('LMS-021 quantitative reporting', () => {
  it('matches independently computed 0/partial/full completion and issued certificates', async () => {
    const expected = expectedSponsorImpact(db, owner);
    expect(expected.map(r => [r.member_count, r.completed_count, r.certificate_count])).toEqual([[0,0,0],[2,2,2],[3,1,1],[2,0,0]]);
    const response = await get('impact-report');
    expect(response.status).toBe(200);
    expect(response.body.data.cohorts.sort((a: any, b: any) => a.cohort_id.localeCompare(b.cohort_id))).toEqual(expected);
    expect(response.body.data).toMatchObject({ totalMembers: 7, totalCompleted: 3, totalCertificates: 3, completionPct: 43 });
  });
  it('reports confirmed spending per currency without a mixed-currency scalar', async () => {
    const expected = db.prepare(`SELECT p.currency,SUM(p.amount_cents) AS amountCents FROM payments p
      WHERE p.status='confirmed' AND EXISTS (SELECT 1 FROM sponsor_cohorts sc WHERE sc.sponsor_user_id=? AND sc.payment_id=p.id)
      GROUP BY p.currency ORDER BY p.currency`).all(owner);
    expect(expected).toEqual([{currency:'USD',amountCents:10000},{currency:'ZAR',amountCents:25000}]);
    const response = await get('spending-report');
    expect(response.status).toBe(200);
    expect(response.body.data.totalsByCurrency).toEqual(expected);
    expect(response.body.data.totalSpentCents).toBeNull();
    expect(response.body.data.cohorts.map((r: any) => r.currency).sort()).toEqual(['USD','USD','ZAR','ZAR']);
  });
  it('includes both timestamp styles on one day and excludes adjacent days/other owners', async () => {
    const impact = await get('impact-report?from=2026-03-15&to=2026-03-15');
    expect(impact.body.data).toMatchObject({totalMembers:5,totalCompleted:1,totalCertificates:1,completionPct:20});
    const billing = await get('billing?from=2026-03-15&to=2026-03-15');
    expect(billing.body.data.payments.map((p: any) => p.id).sort()).toEqual(['e2e-report-usd-payment','e2e-report-zar-payment']);
  });
  it('counts a shared payment once even when two cohorts reference it', async () => {
    db.prepare('UPDATE sponsor_cohorts SET payment_id=? WHERE id=?').run('e2e-report-usd-payment','e2e-report-empty');
    expect((await get('spending-report')).body.data.totalsByCurrency).toEqual([
      {currency:'USD',amountCents:10000},{currency:'ZAR',amountCents:25000},
    ]);
  });
  it('creates cohort billing in the configured course currency', async () => {
    db.prepare('INSERT INTO course_pricing(id,course_id,price_cents,currency) VALUES (?,?,?,?)').run('zar-pricing','e2e-report-a',2500,'ZAR');
    db.prepare("UPDATE sponsor_cohorts SET selected_tier='paid',payment_id=NULL WHERE id=?").run('e2e-report-partial');
    const response = await request(app).post('/api/v1/admin/cohorts/e2e-report-partial/pay').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({currency:'ZAR',amountCents:2500,memberCount:1,status:'pending'});
    expect(db.prepare('SELECT currency,amount_cents FROM payments WHERE id=?').get(response.body.data.paymentId)).toEqual({currency:'ZAR',amount_cents:2500});
  });
  it('does not expose a mismatched owner/course payment through a legacy cohort link', async () => {
    db.prepare('UPDATE sponsor_cohorts SET payment_id=? WHERE id=?').run('e2e-report-hidden-payment','e2e-report-zero');
    const result = (await get('spending-report')).body.data;
    expect(result).toMatchObject({totalSpentCents:25000,currency:'ZAR',totalsByCurrency:[{currency:'ZAR',amountCents:25000}]});
    expect(result.cohorts.find((c: any) => c.cohortId==='e2e-report-zero')).toMatchObject({amountCents:0,currency:null,paymentStatus:null});
  });
  it('counts badge plus NFT once, ignores another course credential and leaves cohort states unchanged', async () => {
    db.prepare('INSERT INTO certificate_badges(id,user_id,course_id,application_id,badge_svg,badge_hash) VALUES (?,?,?,?,?,?)')
      .run('duplicate-kind','e2e-report-full-1','e2e-report-b','e2e-report-full-1','<svg/>','synthetic');
    db.prepare("INSERT INTO nft_credentials(id,user_id,course_id,wallet_address,contract_id,mint_status) VALUES (?,?,?,?,?,'minted')")
      .run('wrong-course','e2e-report-zero-1','e2e-report-b','SYNTHETIC','SYNTHETIC');
    const before = db.prepare('SELECT id,status FROM sponsor_cohorts ORDER BY id').all();
    expect((await get('impact-report')).body.data.totalCertificates).toBe(3);
    expect(db.prepare('SELECT id,status FROM sponsor_cohorts ORDER BY id').all()).toEqual(before);
  });
});
