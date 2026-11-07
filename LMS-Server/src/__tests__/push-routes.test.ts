import { seedTestAccount } from './helpers/rbacFixtures.js';
import {it,expect,afterEach,vi} from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
import {db,hashToken} from '../config/database.js';
import app from '../app.js';
import {createNotification} from '../services/notificationService.js';

afterEach(()=>vi.unstubAllEnvs());
function fixture(){
  vi.stubEnv('PUSH_NOTIFICATIONS_ENABLED','true');vi.stubEnv('EXPO_PUSH_PROJECT_ID','a1111111-1111-4111-8111-111111111111');vi.stubEnv('EXPO_PUSH_ACCESS_TOKEN','synthetic-test-access-token');
  const accounts=Array.from({length:2},()=>{
    const id=randomUUID();seedTestAccount(db, "INSERT INTO users(id,name,email,password_hash) VALUES (?,'Synthetic',?,'hash')", [id,`${id}@test.invalid`], ["role_student"]);
    const token=jwt.sign({userId:id,role:'student',authorizationVersion:0},process.env.JWT_SECRET!,{expiresIn:'1h',jwtid:randomUUID()});
    db.prepare('INSERT INTO active_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,?)').run(randomUUID(),id,hashToken(token),new Date(Date.now()+3_600_000).toISOString());return {id,token};
  });
  const binding={installationId:randomUUID(),credential:'a'.repeat(64),generation:1,platform:'ios',projectId:process.env.EXPO_PUSH_PROJECT_ID,expoToken:`ExpoPushToken[${randomUUID()}]`};
  return {a:accounts[0],b:accounts[1],binding};
}
const base='/api/v1/notifications';
it('authenticates registration, uses the session owner and never echoes the credential or token',async()=>{
  const f=fixture();
  expect((await request(app).put(`${base}/push/installation`).send(f.binding)).status).toBe(401);
  const response=await request(app).put(`${base}/push/installation`).set('Authorization',`Bearer ${f.a.token}`).send({...f.binding,userId:f.b.id});
  expect(response.status).toBe(200);expect(response.body.data).toMatchObject({generation:1});
  expect(JSON.stringify(response.body)).not.toMatch(/credential|ExpoPushToken|access-token/);
  expect(db.prepare('SELECT user_id FROM push_installations').get()).toEqual({user_id:f.a.id});
  const config=await request(app).get(`${base}/push/config`).set('Authorization',`Bearer ${f.a.token}`);
  expect(config.body.data).toEqual({enabled:true,projectId:f.binding.projectId});
});
it('allows credential-only cleanup after session revocation and fences delayed registration',async()=>{
  const f=fixture();const auth=`Bearer ${f.a.token}`;
  expect((await request(app).put(`${base}/push/installation`).set('Authorization',auth).send(f.binding)).status).toBe(200);
  expect((await request(app).post('/api/v1/auth/logout').set('Authorization',auth)).status).toBe(200);
  expect((await request(app).post(`${base}/push/unregister`).send({...f.binding,credential:'b'.repeat(64),generation:2})).status).toBe(403);
  expect((await request(app).post(`${base}/push/unregister`).send({...f.binding,generation:2})).status).toBe(200);
  expect((await request(app).put(`${base}/push/installation`).set('Authorization',auth).send(f.binding)).status).toBe(401);
  expect((await request(app).post(`${base}/push/unregister`).send(f.binding)).status).toBe(409);
});
it('authorizes notification details to the current owner and preserves list/preferences routes',async()=>{
  const f=fixture();createNotification({userId:f.a.id,type:'course_enrolled',title:'Private title',body:'Private details'});
  const notification=db.prepare('SELECT id FROM notifications WHERE user_id=?').get(f.a.id) as {id:string};
  expect((await request(app).get(`${base}/${notification.id}`)).status).toBe(401);
  const own=await request(app).get(`${base}/${notification.id}`).set('Authorization',`Bearer ${f.a.token}`);
  expect(own.status).toBe(200);expect(own.body.data.notification.title).toBe('Private title');
  const denied=await request(app).get(`${base}/${notification.id}`).set('Authorization',`Bearer ${f.b.token}`);
  expect(denied.status).toBe(404);expect(JSON.stringify(denied.body)).not.toContain('Private title');
  expect((await request(app).get(`${base}/preferences`).set('Authorization',`Bearer ${f.a.token}`)).body.data.preferences).toBeInstanceOf(Array);
  expect((await request(app).get(base).set('Authorization',`Bearer ${f.a.token}`)).body.data.notifications).toHaveLength(1);
});
it('refuses new installations for pending-deletion accounts while permitting existing credential cleanup',async()=>{
  const f=fixture();const auth=`Bearer ${f.a.token}`;
  expect((await request(app).put(`${base}/push/installation`).set('Authorization',auth).send(f.binding)).status).toBe(200);
  db.prepare("UPDATE users SET deletion_status='pending_deletion' WHERE id=?").run(f.a.id);
  expect((await request(app).put(`${base}/push/installation`).set('Authorization',auth).send({...f.binding,generation:2})).status).toBe(403);
  expect((await request(app).post(`${base}/push/unregister`).send({...f.binding,generation:2})).status).toBe(200);
});
