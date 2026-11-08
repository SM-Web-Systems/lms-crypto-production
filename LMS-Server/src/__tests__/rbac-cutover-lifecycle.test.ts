import jwt from 'jsonwebtoken';
import { seedTestAccount } from './helpers/rbacFixtures.js';
import { beforeEach,describe,it,expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import app from '../app.js';
import { db } from '../config/database.js';
import { generateToken,verifyToken } from '../config/jwt.js';
import { createRbacAccount } from '../services/rbacAccountService.js';
import { getUserRoles } from '../middleware/rbac.js';

function raw(grants:string[]=[]){
  const id=randomUUID(),email=id+'@rbac-lifecycle.invalid';
  seedTestAccount(db, `INSERT INTO users(id,name,email,password_hash,authorization_version) VALUES(?,'Synthetic',?,'synthetic',1)`, [id,email], []);
  for(const role of grants) db.prepare('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)').run(id,role);
  return {id,email,token:generateToken({userId:id,email,role:'admin'})};
}
const version=(id:string)=>(db.prepare('SELECT authorization_version FROM users WHERE id=?').get(id) as {authorization_version:number}).authorization_version;
const AUTH={type:'bearer' as const};

describe('RBAC cutover lifecycle and transaction boundaries',()=>{
  it('raw legacy-labelled inserts confer no role; explicit new administrator creation does not add student',()=>{
    const noGrant=raw();
    expect(getUserRoles(noGrant.id)).toEqual([]);
    const created=createRbacAccount({name:'Synthetic admin',email:randomUUID()+'@rbac-lifecycle.invalid',passwordHash:'synthetic',initialRoleId:'role_admin'});
    expect(getUserRoles(created.id)).toEqual(['admin']);
    expect(version(created.id)).toBe(1);
    expect(created.studentId).toBeTypeOf('string'); // Capability, not a second student role.
    expect(db.pragma('table_info(users)').some((column:any)=>column.name==='role')).toBe(false);
  });
  it('failed initial grant/profile creation rolls user and grants back',()=>{
    db.exec("CREATE TRIGGER fail_profile BEFORE INSERT ON students BEGIN SELECT RAISE(ABORT,'synthetic profile failure'); END");
    const email=randomUUID()+'@rbac-lifecycle.invalid';
    expect(()=>createRbacAccount({name:'Synthetic',email,passwordHash:'synthetic',initialRoleId:'role_student'})).toThrow();
    expect(db.prepare('SELECT id FROM users WHERE email=?').get(email)).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) AS total FROM user_roles').get()).toEqual({total:0});
  });
  it('assignment creates a missing learner profile, revokes old tokens and is idempotent on repeat',async()=>{
    const actor=raw(['role_admin2']),target=raw();
    const assign=()=>request(app).post('/api/v1/admin/users/'+target.id+'/roles').auth(actor.token,AUTH).send({roleId:'role_student'});
    expect((await assign()).status).toBe(201);
    expect(version(target.id)).toBe(2);
    expect(db.prepare('SELECT COUNT(*) AS total FROM students WHERE user_id=?').get(target.id)).toEqual({total:1});
    expect((await request(app).get('/api/v1/auth/me').auth(target.token,AUTH)).status).toBe(401);
    expect((await assign()).status).toBe(201);
    expect(version(target.id)).toBe(2);
  });
  it('assignment/profile/session/audit updates roll back as one transaction',async()=>{
    const actor=raw(['role_admin2']),target=raw();
    db.exec("CREATE TRIGGER fail_authorization BEFORE UPDATE OF authorization_version ON users BEGIN SELECT RAISE(ABORT,'synthetic'); END");
    const result=await request(app).post('/api/v1/admin/users/'+target.id+'/roles').auth(actor.token,AUTH).send({roleId:'role_student'});
    expect(result.status).toBe(500);
    expect(getUserRoles(target.id)).toEqual([]); expect(version(target.id)).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS total FROM students WHERE user_id=?').get(target.id)).toEqual({total:0});
  });
  it('custom permission replacement invalidates all affected users and makes learner profiles available',async()=>{
    db.exec("INSERT INTO roles(id,name,label) VALUES('custom','delegated-editor','Editor')");
    const actor=raw(['role_admin2']),target=raw(['custom']);
    const response=await request(app).put('/api/v1/admin/roles/custom/permissions').auth(actor.token,AUTH).send({permissionIds:['perm_course_submit','perm_course_view']});
    expect(response.status).toBe(200); expect(version(target.id)).toBe(2);
    expect(db.prepare('SELECT COUNT(*) AS total FROM students WHERE user_id=?').get(target.id)).toEqual({total:1});
    expect((await request(app).get('/api/v1/auth/me').auth(target.token,AUTH)).status).toBe(401);
    const repeat=await request(app).put('/api/v1/admin/roles/custom/permissions').auth(actor.token,AUTH).send({permissionIds:['perm_course_view','perm_course_submit']});
    expect(repeat.status).toBe(200); expect(version(target.id)).toBe(2);
  });
  it('invalid custom permissions do not remove existing permissions or revoke sessions',async()=>{
    db.exec("INSERT INTO roles(id,name,label) VALUES('custom','delegated-editor','Editor'); INSERT INTO role_permissions(role_id,permission_id) VALUES('custom','perm_course_view')");
    const actor=raw(['role_admin2']),target=raw(['custom']);
    const result=await request(app).put('/api/v1/admin/roles/custom/permissions').auth(actor.token,AUTH).send({permissionIds:['missing-permission']});
    expect(result.status).toBe(400); expect(version(target.id)).toBe(1);
    expect(db.prepare('SELECT permission_id FROM role_permissions WHERE role_id=?').all('custom')).toEqual([{permission_id:'perm_course_view'}]);
  });
  it('deleting a custom role revokes member sessions while preserving their other grants',async()=>{
    db.exec("INSERT INTO roles(id,name,label) VALUES('custom','delegated-editor','Editor')");
    const actor=raw(['role_admin2']),target=raw(['custom','role_sponsor']);
    const result=await request(app).delete('/api/v1/admin/roles/custom').auth(actor.token,AUTH);
    expect(result.status).toBe(200); expect(getUserRoles(target.id)).toEqual(['sponsor']); expect(version(target.id)).toBe(2);
    expect((await request(app).get('/api/v1/auth/me').auth(target.token,AUTH)).status).toBe(401);
  });
  it('minted tokens contain no role hints or cached role list',()=>{
    const user=raw(['role_student']);
    const untrusted={userId:user.id,email:user.email,role:'admin',roles:['super-admin']};
    const token=generateToken(untrusted);
    const payload=jwt.decode(token);
    expect(verifyToken(token)).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('role'); expect(payload).not.toHaveProperty('roles');
  });
  it('certificate self-application requires certificate capability even when enrolled',async()=>{
    db.exec("INSERT INTO roles(id,name,label) VALUES('limited','limited-learner','Limited'); INSERT INTO role_permissions(role_id,permission_id) VALUES('limited','perm_course_view')");
    const user=raw(['limited']);
    db.exec("INSERT INTO courses(id,title,course_code) VALUES('course','Synthetic','CODE')");
    db.prepare("INSERT INTO user_course_codes(user_id,course_code) VALUES(?,'CODE')").run(user.id);
    const result=await request(app).post('/api/v1/courses/course/completions/apply').auth(user.token,AUTH).send({selectedTier:'free'});
    expect(result.status).toBe(403); expect(db.prepare('SELECT COUNT(*) AS total FROM course_nft_applications').get()).toEqual({total:0});
  });
});
