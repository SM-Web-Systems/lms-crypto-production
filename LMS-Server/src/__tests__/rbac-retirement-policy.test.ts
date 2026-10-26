import { seedTestAccount } from './helpers/rbacFixtures.js';
/** RBAC-only production contracts; every target is an ordinary regression. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import app from '../app.js';
import { db } from '../config/database.js';
import { generateToken, verifyToken } from '../config/jwt.js';
import { getUserRoles } from '../middleware/rbac.js';
import { getAuthorizationContext } from '../services/authorizationService.js';
import { resolveAmmaAccount } from '../services/ammaAccountService.js';
import { createBroadcast } from '../services/notificationService.js';
import * as wallet from '../services/walletService.js';
type UntrustedRoleHint = 'student' | 'lecturer' | 'admin';

const PASSWORD = 'synthetic-rbac-only-password';
const HASH = bcrypt.hashSync(PASSWORD,4);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
beforeEach(()=>{
  // The shared reset loads base schema; SSO columns are runtime additions.
  db.exec("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'; ALTER TABLE users ADD COLUMN ammawallet_user_id TEXT");
});

function account(legacy: UntrustedRoleHint, grants: string[]) {
  const id = randomUUID(), email = id+'@rbac-retirement.invalid';
  seedTestAccount(db, `INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)`, [id,'Synthetic user',email,HASH], []);
  db.prepare('DELETE FROM user_roles WHERE user_id=?').run(id);
  for (const grant of grants) db.prepare('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)').run(id,grant);
  return {id,email,token:generateToken({userId:id,email,role:legacy})};
}
function course() {
  const id=randomUUID();
  db.prepare("INSERT INTO courses(id,title,course_code,sections) VALUES(?,'Synthetic course',?,'[]')").run(id,id);
  return id;
}
function learner(user: ReturnType<typeof account>) {
  const id=randomUUID();
  db.prepare("INSERT INTO students(id,user_id,name,email,enrollment_number,department,semester) VALUES(?,?,'Synthetic',?,?,'Test',1)")
    .run(id,user.id,user.email,id);
  return id;
}
function identity() {
  return {userId:randomUUID(),email:randomUUID()+'@rbac-retirement.invalid',firstName:'Synthetic',lastName:'Learner',
    isEmailVerified:true,mainnetWalletAddress:null};
}
function targetContract(name:string,observe:()=>unknown|Promise<unknown>,target:unknown) {
  it(name,async()=>{ expect(await observe()).toEqual(target); });
}

targetContract('assign a current RBAC instructor whose legacy label is student',async()=>{
  const actor=account('student',['role_admin']);
  const teacher=account('student',['role_instructor']), id=course();
  const response=await request(app).post('/api/v1/courses/'+id+'/lecturers').auth(actor.token,{type:'bearer'}).send({userId:teacher.id});
  return {status:response.status,assigned:!!db.prepare('SELECT 1 FROM course_lecturers WHERE course_id=? AND user_id=?').get(id,teacher.id)};
},{status:201,assigned:true});

targetContract('allow delegated teaching capability without a built-in instructor role name',async()=>{
  db.exec("INSERT INTO roles(id,name,label) VALUES('delegated-teaching','curriculum-editor','Editor'); INSERT INTO role_permissions(role_id,permission_id) SELECT 'delegated-teaching',id FROM permissions WHERE name IN ('course.view','course.manage')");
  const actor=account('student',['role_admin']), teacher=account('student',['delegated-teaching']), id=course();
  const response=await request(app).post('/api/v1/courses/'+id+'/lecturers').auth(actor.token,{type:'bearer'}).send({userId:teacher.id});
  return response.status;
},201);

targetContract('reject a legacy lecturer with no current teaching grants',async()=>{
  const actor=account('student',['role_admin']), teacher=account('lecturer',[]), id=course();
  const response=await request(app).post('/api/v1/courses/'+id+'/lecturers').auth(actor.token,{type:'bearer'}).send({userId:teacher.id});
  return response.status;
},422);

for(const legacy of ['admin','lecturer'] as const) {
  targetContract('require enrollment for self-certificate applications even with legacy '+legacy,async()=>{
    const user=account(legacy,['role_student']),id=course(); learner(user);
    const response=await request(app).post('/api/v1/courses/'+id+'/completions/apply').auth(user.token,{type:'bearer'}).send({selectedTier:'free'});
      return {status:response.status,applications:db.prepare('SELECT COUNT(*) AS total FROM course_nft_applications WHERE user_id=?').get(user.id)};
  },{status:403,applications:{total:0}});
}

targetContract('deny certificate self-application for a zero-grant account even if enrolled',async()=>{
  const user=account('lecturer',[]),id=course();
  db.prepare('INSERT INTO user_course_codes(user_id,course_code) VALUES(?,?)').run(user.id,id);
  const response=await request(app).post('/api/v1/courses/'+id+'/completions/apply').auth(user.token,{type:'bearer'}).send({selectedTier:'free'});
  return response.status;
},403);

targetContract('select sponsor broadcast recipients from current RBAC',()=>{
  const sponsor=account('student',['role_sponsor']); account('student',['role_student']);
  const count=createBroadcast({title:'Synthetic broadcast',body:'Synthetic',target:'sponsor'});
  return {count,sponsorReceived:!!db.prepare('SELECT 1 FROM notifications WHERE user_id=?').get(sponsor.id)};
},{count:1,sponsorReceived:true});

targetContract('map the lecturer broadcast audience to current instructor grants',()=>{
  const teacher=account('student',['role_instructor']); account('lecturer',[]);
  createBroadcast({title:'Synthetic broadcast',body:'Synthetic',target:'lecturer'});
  const recipients=db.prepare('SELECT user_id FROM notifications ORDER BY user_id').all() as {user_id:string}[];
  expect(recipients).toHaveLength(1);
  return recipients.some(row=>row.user_id===teacher.id);
},true);

targetContract('include enhanced learners once in the student audience regardless of legacy label',()=>{
  const user=account('admin',['role_supporter_student','role_student']);
  const count=createBroadcast({title:'Synthetic broadcast',body:'Synthetic',target:'student'});
  return {count,received:db.prepare('SELECT COUNT(*) AS total FROM notifications WHERE user_id=?').get(user.id)};
},{count:1,received:{total:1}});

targetContract('supply learner profile in password-login tokens for a multi-role account',async()=>{
  const user=account('admin',['role_student','role_instructor']),studentId=learner(user);
  const response=await request(app).post('/api/v1/auth/login').send({email:user.email,password:PASSWORD});
  expect(response.status).toBe(200);
  expect(response.body.data.user.rbacRoles).toEqual(expect.arrayContaining(['student','instructor']));
  const payload=verifyToken(response.body.data.token);
  return payload.studentId===studentId;
},true);

for(const [initial,expected] of [['role_student','student'],['role_instructor','instructor']] as const) {
  targetContract('explicitly grant '+expected+' on verified Wallet creation without the legacy trigger',()=>{
    const created=resolveAmmaAccount(identity(),initial);
    expect(db.prepare('SELECT COUNT(*) AS total FROM users WHERE id=?').get(created.user.id)).toEqual({total:1});
    return getUserRoles(created.user.id);
  },[expected]);
}

targetContract('explicitly grant student during public registration without the legacy trigger',async()=>{
  vi.spyOn(wallet,'createUserWallet').mockRejectedValue(new Error('Synthetic unavailable Wallet'));
  const response=await request(app).post('/api/v1/auth/register').send({
    name:'Synthetic learner',email:randomUUID()+'@rbac-retirement.invalid',password:PASSWORD,role:'admin',
  });
  expect(db.prepare('SELECT COUNT(*) AS total FROM students WHERE user_id=?').get(response.body.data.user.id)).toEqual({total:1});
  return getUserRoles(response.body.data.user.id);
},['student']);

describe('RBAC-only retirement safeguards already supported',()=>{
  it('current grants determine effective context despite a conflicting legacy admin label',()=>{
    const user=account('admin',['role_student']);
    const context=getAuthorizationContext(user.id);
    expect(context.rbacRoles).toEqual(['student']);
    expect(context.adminTier).toBeNull();
    expect(context.workspaces).toEqual(['student']);
    expect(context.permissions).not.toContain('system.manage_roles');
  });
  it('zero grants do not become student or administrator workspaces',()=>{
    const user=account('admin',[]);
    expect(getAuthorizationContext(user.id)).toMatchObject({permissions:[],workspaces:[],defaultWorkspace:null,adminTier:null});
  });
  it('signed obsolete role and roles claims cannot authorize an administrative API',async()=>{
    const user=account('student',['role_student']);
    const token=jwt.sign({userId:user.id,email:user.email,role:'admin',roles:['super-admin'],authorizationVersion:0},
      process.env.JWT_SECRET!,{expiresIn:'1h'});
    expect((await request(app).get('/api/v1/admin/payments').auth(token,{type:'bearer'})).status).toBe(403);
    const response=await request(app).get('/api/v1/auth/me').auth(token,{type:'bearer'});
    expect(response.status).toBe(200);
    expect(response.body.data.rbacRoles).toEqual(['student']);
    expect(response.body.data.adminTier).toBeNull();
  });
  it('explicit current administrator works with a legacy student label',async()=>{
    const user=account('student',['role_admin']);
    expect((await request(app).get('/api/v1/admin/payments').auth(user.token,{type:'bearer'})).status).toBe(200);
  });
  it('reading current context preserves a managed role removal',()=>{
    const user=account('admin',[]);
    db.prepare('UPDATE users SET authorization_version=1 WHERE id=?').run(user.id);
    getAuthorizationContext(user.id);
    expect(getUserRoles(user.id)).toEqual([]);
  });
  it('repeated Wallet sign-in cannot restore a demoted existing user',()=>{
    const provider=identity(),user=account('admin',[]);
    db.prepare("UPDATE users SET ammawallet_user_id=?,auth_provider='ammawallet',authorization_version=1 WHERE id=?").run(provider.userId,user.id);
    expect(resolveAmmaAccount(provider,'role_admin').user.id).toBe(user.id);
    expect(getUserRoles(user.id)).toEqual([]);
  });
  it('unverified provider identity creates no user or grant',()=>{
    expect(()=>resolveAmmaAccount({...identity(),isEmailVerified:false},'role_admin')).toThrow('email_unverified');
    expect(db.prepare('SELECT COUNT(*) AS total FROM users').get()).toEqual({total:0});
    expect(db.prepare('SELECT COUNT(*) AS total FROM user_roles').get()).toEqual({total:0});
  });
  it('parent child creation already assigns a student grant and profile without the legacy trigger',async()=>{
    const parent=account('student',['role_parent']);
    const response=await request(app).post('/api/v1/parent/children').auth(parent.token,{type:'bearer'}).send({
      name:'Synthetic child',email:randomUUID()+'@rbac-retirement.invalid',password:PASSWORD,
    });
      const childId=response.body.data.id;
    expect(getUserRoles(childId)).toEqual(['student']);
    expect(db.prepare('SELECT COUNT(*) AS total FROM students WHERE user_id=?').get(childId)).toEqual({total:1});
    expect(db.prepare("SELECT COUNT(*) AS total FROM user_links WHERE parent_user_id=? AND child_user_id=? AND link_type='parent'").get(parent.id,childId)).toEqual({total:1});
  });
});
