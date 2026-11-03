import { describe,it,expect } from 'vitest';
import request from 'supertest';
import {randomUUID,createHash} from 'node:crypto';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import {execute,queryOne,hashToken} from '../config/database.js';
import {generateToken} from '../config/jwt.js';

const password='audit-password';
const hash=bcrypt.hashSync(password,4);
function actor(){
  const id=randomUUID(),email=`${id}@account.invalid`;
  execute("INSERT INTO users (id,name,email,password_hash,role) VALUES (?,'Audit learner',?,?,'student')",[id,email,hash]);
  const token=generateToken({userId:id,email,role:'student'});
  const session=randomUUID();
  execute("INSERT INTO active_sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,datetime('now','+1 day'))",[session,id,hashToken(token)]);
  return{id,email,token,session};
}
describe('A13/A14 account and session contracts',()=>{
  it('password reset immediately invalidates tracked and untracked tokens, including the current issue second',async()=>{
    const a=actor(),untracked=generateToken({userId:a.id,email:a.email,role:'student'}),reset='private-reset-token';
    execute("UPDATE users SET password_reset_token=?,password_reset_expires_at=datetime('now','+1 hour') WHERE id=?",[createHash('sha256').update(reset).digest('hex'),a.id]);
    expect((await request(app).post('/api/v1/auth/reset-password').send({token:reset,password:'new-audit-password'})).status).toBe(200);
    expect(queryOne<{authorization_version:number}>('SELECT authorization_version FROM users WHERE id=?',[a.id])?.authorization_version).toBe(1);
    for(const token of [a.token,untracked])expect((await request(app).get('/api/v1/auth/me').auth(token,{type:'bearer'})).status).toBe(401);
  });
  it('effective administrators cannot self-delete even with a legacy student role',async()=>{
    const a=actor();execute("INSERT INTO user_roles (user_id,role_id) VALUES (?,'role_admin')",[a.id]);
    expect((await request(app).post('/api/v1/account/delete').auth(a.token,{type:'bearer'}).send({confirmation:'DELETE MY ACCOUNT'})).status).toBe(403);
  });
  it('identifies the current session and never exposes token hashes',async()=>{
    const a=actor();
    const res=await request(app).get('/api/v1/sessions').auth(a.token,{type:'bearer'});
    expect(res.status).toBe(200);
    expect(res.body.data.sessions).toEqual([expect.objectContaining({id:a.session,current:true})]);
    expect(res.body.data.sessions[0]).not.toHaveProperty('token_hash');
  });
  it('self-revocation invalidates the revoked token while retaining its tombstone',async()=>{
    const a=actor();
    expect((await request(app).delete(`/api/v1/sessions/${a.session}`).auth(a.token,{type:'bearer'})).status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').auth(a.token,{type:'bearer'})).status).toBe(401);
    expect(queryOne<{revoked_at:string}>('SELECT revoked_at FROM active_sessions WHERE id=?',[a.session])?.revoked_at).toBeTruthy();
  });
  it('cannot revoke another account session',async()=>{
    const a=actor(),b=actor();
    expect((await request(app).delete(`/api/v1/sessions/${b.session}`).auth(a.token,{type:'bearer'})).status).toBe(404);
    expect((await request(app).get('/api/v1/auth/me').auth(b.token,{type:'bearer'})).status).toBe(200);
  });
  it('logout revokes both tracked and legacy tokens',async()=>{
    const a=actor();
    for(const token of [a.token,generateToken({userId:a.id,email:a.email,role:'student'})]){
      expect((await request(app).post('/api/v1/auth/logout').auth(token,{type:'bearer'})).status).toBe(200);
      expect((await request(app).get('/api/v1/auth/me').auth(token,{type:'bearer'})).status).toBe(401);
    }
  });
  it('rejects a session whose server expiry predates its JWT expiry',async()=>{
    const a=actor();execute("UPDATE active_sessions SET expires_at=datetime('now','-1 minute') WHERE id=?",[a.session]);
    expect((await request(app).get('/api/v1/auth/me').auth(a.token,{type:'bearer'})).status).toBe(401);
  });
  it('restores pending-deletion accounts into account management and permits cancellation',async()=>{
    const a=actor();
    expect((await request(app).post('/api/v1/account/delete').auth(a.token,{type:'bearer'}).send({confirmation:'DELETE MY ACCOUNT'})).status).toBe(200);
    const me=await request(app).get('/api/v1/auth/me').auth(a.token,{type:'bearer'});
    expect(me.status).toBe(200);expect(me.body.data.deletionStatus).toBe('pending_deletion');
    const login=await request(app).post('/api/v1/auth/login').send({email:a.email,password});
    expect(login.body.data.user.deletionStatus).toBe('pending_deletion');
    expect((await request(app).get('/api/v1/courses').auth(a.token,{type:'bearer'})).status).toBe(403);
    expect((await request(app).get('/api/v1/sessions').auth(a.token,{type:'bearer'})).status).toBe(200);
    expect((await request(app).post('/api/v1/account/delete/cancel').auth(a.token,{type:'bearer'})).status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').auth(a.token,{type:'bearer'})).body.data.deletionStatus).toBeNull();
  });
  it('lists only personal exports and offers JSON status without changing the existing download route',async()=>{
    const a=actor(),b=actor(),id=randomUUID();
    execute("INSERT INTO data_exports (id,user_id,status) VALUES (?,?,'processing')",[id,a.id]);
    expect((await request(app).get('/api/v1/data-export').auth(a.token,{type:'bearer'})).body.data.exports).toEqual([expect.objectContaining({id,status:'processing'})]);
    expect((await request(app).get('/api/v1/data-export').auth(b.token,{type:'bearer'})).body.data.exports).toEqual([]);
    expect((await request(app).get(`/api/v1/data-export/${id}?download=false`).auth(a.token,{type:'bearer'})).body.data.status).toBe('processing');
    expect((await request(app).get(`/api/v1/data-export/${id}`).auth(b.token,{type:'bearer'})).status).toBe(404);
  });
});
