import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import app from '../app.js';
import * as database from '../config/database.js';
import { db, migrateUsersToRbac } from '../config/database.js';
import { requirePermission, getRequestPermissions } from '../middleware/rbac.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { makeToken } from './helpers/auth.js';
import { getCurrentAdminTier } from '../services/administratorPolicy.js';
import { provisionAdministratorFromConsole } from '../services/roleSecurityService.js';
import * as wallet from '../services/walletService.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
function fixture(roleId = 'role_sponsor', extras = false) {
  for (const id of ['actor','other-sponsor','own-student','other-student']) {
    db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)').run(id,id,`${id}@example.invalid`,'synthetic');
  }
  db.prepare('INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES(?,?)').run('actor',roleId);
  if (extras) {
    db.exec("INSERT INTO roles(id,name,label) VALUES('delegated','delegated','Delegated'); INSERT INTO user_roles(user_id,role_id) VALUES('actor','delegated')");
    db.exec("INSERT INTO role_permissions(role_id,permission_id) SELECT 'delegated',id FROM permissions WHERE name IN ('billing.confirm','billing.waive','course.create','course.delete','course.manage','tenant.manage')");
  }
  db.exec(`INSERT INTO courses(id,title,course_code) VALUES('course','Course','A13');
    INSERT INTO sponsor_cohorts(id,name,sponsor_user_id,course_id) VALUES('own','Own','actor','course'),('other','Other','other-sponsor','course');
    INSERT INTO cohort_members(cohort_id,user_id) VALUES('own','own-student'),('other','other-student');`);
  for (const [prefix, owner] of [['own','own-student'],['other','other-student']]) {
    db.prepare("INSERT INTO course_nft_applications(id,user_id,course_id,wallet_address,status) VALUES(?,?,'course','synthetic','approved')").run(prefix+'-app',owner);
    db.prepare("INSERT INTO payments(id,user_id,course_id,application_id,amount_cents,status) VALUES(?,?,'course',?,100,'confirmed')").run(prefix+'-payment',owner,prefix+'-app');
    db.prepare("INSERT INTO certificate_badges(id,user_id,course_id,application_id,badge_svg,badge_hash) VALUES(?,?,'course',?,'<svg/>','synthetic')").run(prefix+'-badge',owner,prefix+'-app');
  }
  return makeToken({userId:'actor',email:'actor@example.invalid',role:'student'});
}

describe('AUTH-13 explicit administrator boundaries', () => {
  it.each(['role_admin','role_admin2','role_super_admin'])('preserves %s access with explicit current grants', async role => {
    const token = fixture(role);
    expect((await request(app).get('/api/v1/admin/payments').auth(token,{type:'bearer'})).body.data.payments).toHaveLength(2);
    expect((await request(app).get('/api/v1/payments/other-payment/status').auth(token,{type:'bearer'})).status).toBe(200);
  });
  it('keeps sponsors scoped despite unrelated powerful permissions', async () => {
    const token = fixture('role_sponsor',true);
    const payments = await request(app).get('/api/v1/admin/payments').auth(token,{type:'bearer'});
    expect(payments.body.data.payments.map((p:any)=>p.paymentId)).toEqual(['own-payment']);
    const cohorts = await request(app).get('/api/v1/admin/cohorts').auth(token,{type:'bearer'});
    expect(cohorts.body.data.cohorts.map((c:any)=>c.cohortId)).toEqual(['own']);
  });
  it.each(['/payments/other-payment/status','/payments/other-payment/receipt','/badges/other-badge','/badges/other-badge/download'])('denies cross-cohort %s even with billing.confirm', async route => {
    const token = fixture('role_sponsor',true);
    expect((await request(app).get('/api/v1'+route).auth(token,{type:'bearer'})).status).toBe(403);
  });
  it('denies cross-cohort mutation with course.delete', async () => {
    const token = fixture('role_sponsor',true);
    expect((await request(app).delete('/api/v1/admin/cohorts/other/members/other-student').auth(token,{type:'bearer'})).status).toBe(403);
    expect(db.prepare("SELECT name FROM sponsor_cohorts WHERE id='other'").get()).toEqual({name:'Other'});
  });
  it('does not confer unassigned course management through course.delete', async () => {
    const token = fixture('role_sponsor',true);
    expect((await request(app).delete('/api/v1/courses/course').auth(token,{type:'bearer'})).status).toBe(403);
    expect(db.prepare("SELECT id FROM courses WHERE id='course'").get()).toBeDefined();
  });
  it.each(['confirm','waive','refund'])('requires administrator identity for global payment %s', async operation => {
    const token = fixture('role_sponsor',true);
    db.prepare("UPDATE payments SET status='pending' WHERE id='other-payment'").run();
    expect((await request(app).post(`/api/v1/admin/payments/other-payment/${operation}`).auth(token,{type:'bearer'}).send({})).status).toBe(403);
    expect(db.prepare("SELECT status FROM payments WHERE id='other-payment'").get()).toEqual({status:'pending'});
  });
  it.each(['role_sponsor','role_admin'])('preserves a %s creator access to its new course with course.delete', async role => {
    const token = fixture(role,true);
    const created = await request(app).post('/api/v1/courses').auth(token,{type:'bearer'}).send({title:'Created',courseCode:'A13-NEW',sections:[]});
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect((await request(app).get(`/api/v1/courses/${id}`).auth(token,{type:'bearer'})).status).toBe(200);
    expect((await request(app).put(`/api/v1/courses/${id}`).auth(token,{type:'bearer'}).send({title:'Updated'})).status).toBe(200);
  });
  it('does not resurrect administrator identity after the grant is removed', async () => {
    const token = fixture('role_admin');
    db.exec("DELETE FROM user_roles WHERE user_id='actor' AND role_id='role_admin'; INSERT INTO user_roles(user_id,role_id) VALUES('actor','role_sponsor')");
    expect((await request(app).get('/api/v1/payments/other-payment/status').auth(token,{type:'bearer'})).status).toBe(403);
  });
  it('never creates super-admin from a hardcoded email during migration', () => {
    db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)').run('email-claim','Claim','mukhtar.meer@smwebsystems.com','synthetic');
    migrateUsersToRbac();
    expect(db.prepare("SELECT 1 FROM user_roles WHERE user_id='email-claim' AND role_id='role_super_admin'").get()).toBeUndefined();
  });
  it('public registration ignores role and unverified provisioning email claims', async () => {
    vi.stubEnv('ADMIN_EMAILS','claimed@example.invalid');
    vi.spyOn(wallet,'createUserWallet').mockRejectedValue(new Error('synthetic provider unavailable'));
    const response = await request(app).post('/api/v1/auth/register').send({name:'Claim',email:'claimed@example.invalid',password:'SyntheticPassword123!',role:'admin'});
    expect(response.status).toBe(201);
    const user = db.prepare("SELECT id,role FROM users WHERE email='claimed@example.invalid'").get() as {id:string;role:string};
    expect(user.role).toBe('student');
    expect(db.prepare("SELECT role_id FROM user_roles WHERE user_id=?").all(user.id)).toEqual([{role_id:'role_student'}]);
  });
  it('does not trust unowned cached permissions supplied before the RBAC middleware', async () => {
    fixture();
    const boundary = express();
    boundary.use((req:any,_res,next)=>{req.user={userId:'actor'};req._permissions=new Set(['system.manage_roles']);next();});
    boundary.get('/',requirePermission('system.manage_roles'),(_req,res)=>res.json({success:true}));
    boundary.use(errorHandler);
    expect((await request(boundary).get('/')).status).toBe(403);
  });
  it('rebinds the permission cache when request identity changes', () => {
    fixture('role_admin');
    const req = {user:{userId:'actor'}} as any;
    expect(getRequestPermissions(req).has('billing.confirm')).toBe(true);
    req.user = {userId:'other-student'};
    expect(getRequestPermissions(req).has('billing.confirm')).toBe(false);
  });
  it('operator provisioning grants effective access immediately and invalidates sessions', () => {
    fixture();
    db.exec("INSERT INTO active_sessions(id,user_id,token_hash,expires_at) VALUES('session','actor','synthetic','2099-01-01')");
    expect(provisionAdministratorFromConsole('actor')).toBe(true);
    expect(getCurrentAdminTier('actor')).toBe('admin');
    expect(db.prepare("SELECT authorization_version FROM users WHERE id='actor'").get()).toEqual({authorization_version:1});
    expect(db.prepare("SELECT revoked_at FROM active_sessions WHERE id='session'").get()).toEqual({revoked_at:expect.any(String)});
    expect(provisionAdministratorFromConsole('actor')).toBe(false);
  });
  it('fails closed if explicit administrator classification cannot be loaded', async () => {
    const token = fixture('role_admin'); const original = database.queryOne;
    vi.spyOn(database,'queryOne').mockImplementation((sql, params) => {
      if (sql.includes('SELECT r.name FROM user_roles')) throw Object.assign(new Error('synthetic role lookup failure'),{code:'SQLITE_IOERR'});
      return original(sql,params);
    });
    const response = await request(app).get('/api/v1/admin/payments').auth(token,{type:'bearer'});
    expect(response.status).toBe(500); expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error.message).not.toContain('synthetic');
  });
  it('fails closed with a structured error if capability loading fails', async () => {
    const token = fixture();
    const original = database.query;
    vi.spyOn(database,'query').mockImplementation((sql, params) => {
      if (sql.includes('SELECT DISTINCT p.name')) throw Object.assign(new Error('synthetic lookup failure'),{code:'SQLITE_IOERR'});
      return original(sql,params);
    });
    const response = await request(app).get('/api/v1/admin/payments').auth(token,{type:'bearer'});
    expect(response.status).toBe(500); expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error.message).not.toContain('synthetic');
  });
});
