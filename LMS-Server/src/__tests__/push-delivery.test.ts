import { describe,it,expect,vi,afterEach } from 'vitest';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {db,hashToken} from '../config/database.js';
import {validateDatabase} from '../config/databaseBootstrap.js';
import {pushSchema,pushSchemaTables} from '../config/pushSchema.js';
import {registerInstallation,unregisterInstallation,pushConfiguration} from '../services/pushInstallationService.js';
import {createNotification,updatePreferences} from '../services/notificationService.js';
import {processPushOutbox,expoPushProvider,type PushMessage,type PushResult} from '../services/pushDeliveryService.js';

const project='a1111111-1111-4111-8111-111111111111';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function account() {
  const id=randomUUID();
  db.prepare("INSERT INTO users(id,name,email,password_hash,role) VALUES (?,'Synthetic',?,'hash','student')").run(id,`${id}@test.invalid`);
  const token=jwt.sign({userId:id,role:'student',authorizationVersion:0},process.env.JWT_SECRET!,{expiresIn:'2h',jwtid:randomUUID()});
  db.prepare('INSERT INTO active_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,?)').run(randomUUID(),id,hashToken(token),new Date(Date.now()+7_200_000).toISOString());
  return {id,token};
}
function fixture() {
  vi.stubEnv('PUSH_NOTIFICATIONS_ENABLED','true');vi.stubEnv('EXPO_PUSH_PROJECT_ID',project);vi.stubEnv('EXPO_PUSH_ACCESS_TOKEN','synthetic-expo-access-token');
  const owner=account(),other=account();
  const binding={installationId:randomUUID(),credential:'a'.repeat(64),generation:1,projectId:project,platform:'android',expoToken:`ExpoPushToken[${randomUUID()}]`};
  const note=()=>{createNotification({userId:owner.id,type:'course_enrolled',title:'PRIVATE course title',body:'PRIVATE learner details',link:'https://private.invalid/secret'});return db.prepare('SELECT id FROM notifications WHERE user_id=? ORDER BY rowid DESC LIMIT 1').get(owner.id) as {id:string};};
  const provider={send:vi.fn(async(_message:PushMessage)=>({status:'ok' as const,id:randomUUID()})),receipt:vi.fn(async(_ticket:string):Promise<PushResult|null>=>({status:'ok'}))};
  const state=()=>db.prepare('SELECT * FROM push_outbox ORDER BY rowid').all() as any[];
  const register=()=>registerInstallation(binding,owner.token);
  return {owner,other,binding,note,provider,state,register};
}
describe('installation ownership and monotonic lifecycle',()=>{
  it('defaults off, requires complete project configuration, and creates no binding when unavailable',()=>{
    const f=fixture();vi.stubEnv('PUSH_NOTIFICATIONS_ENABLED','false');
    expect(pushConfiguration().enabled).toBe(false);expect(()=>f.register()).toThrow('not configured');
    vi.stubEnv('PUSH_NOTIFICATIONS_ENABLED','true');vi.stubEnv('EXPO_PUSH_PROJECT_ID','not-a-project');
    expect(pushConfiguration().enabled).toBe(false);
    expect(db.prepare('SELECT COUNT(*) n FROM push_installations').get()).toEqual({n:0});
  });
  it('requires a durable active session, current authorization, project and valid native token',()=>{
    const f=fixture();
    expect(()=>registerInstallation({...f.binding,projectId:randomUUID()},f.owner.token)).toThrow('Invalid push');
    expect(()=>registerInstallation({...f.binding,expoToken:'https://other.invalid'},f.owner.token)).toThrow('Invalid push');
    expect(()=>registerInstallation({...f.binding,generation:1.5},f.owner.token)).toThrow('Invalid installation');
    db.prepare('DELETE FROM active_sessions WHERE user_id=?').run(f.owner.id);
    expect(()=>f.register()).toThrow('Sign in again');
    db.prepare('INSERT INTO active_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,?)').run(randomUUID(),f.owner.id,hashToken(f.owner.token),new Date(Date.now()+7_200_000).toISOString());
    db.prepare('UPDATE users SET authorization_version=authorization_version+1 WHERE id=?').run(f.owner.id);
    expect(()=>f.register()).toThrow('Sign in again');
  });
  it('protects the installation credential, prevents token stealing and binds idempotently',()=>{
    const f=fixture();f.register();f.register();
    expect(()=>registerInstallation({...f.binding,credential:'b'.repeat(64),generation:2},f.other.token)).toThrow('does not match');
    expect(()=>registerInstallation({...f.binding,installationId:randomUUID()},f.other.token)).toThrow('already bound');
    expect(()=>registerInstallation(f.binding,f.other.token)).toThrow('new generation');
    const row=db.prepare('SELECT * FROM push_installations').get() as any;
    expect(row.credential_hash).not.toBe(f.binding.credential);expect(row.lease_expires_at).toBeLessThanOrEqual(Date.now()+7_200_000);
    expect(db.prepare('SELECT COUNT(*) n FROM push_installations').get()).toEqual({n:1});
  });
  it('persists a logout tombstone even before registration; delayed requests cannot resurrect it',()=>{
    const f=fixture();unregisterInstallation({...f.binding,generation:2});
    expect(()=>f.register()).toThrow('newer installation');
    expect(()=>registerInstallation({...f.binding,generation:2},f.owner.token)).toThrow('new generation');
    unregisterInstallation({...f.binding,generation:2});
    registerInstallation({...f.binding,generation:3},f.other.token);
    expect(()=>unregisterInstallation({...f.binding,generation:2})).toThrow('newer installation');
    expect(db.prepare('SELECT enabled,user_id,generation FROM push_installations').get()).toEqual({enabled:1,user_id:f.other.id,generation:3});
  });
  it('cancels queued old-account deliveries atomically when rebinding a device',async()=>{
    const f=fixture();f.register();f.note();
    registerInstallation({...f.binding,generation:2},f.other.token);
    await processPushOutbox({provider:f.provider});
    expect(f.state()[0].state).toBe('cancelled');expect(f.provider.send).not.toHaveBeenCalled();
    f.note();expect(f.state()).toHaveLength(1);
  });
  it('disables push while keeping the credential-authenticated generation fence after logout',async()=>{
    const f=fixture();f.register();f.note();unregisterInstallation({...f.binding,generation:2});
    await processPushOutbox({provider:f.provider});expect(f.provider.send).not.toHaveBeenCalled();
    expect(db.prepare('SELECT enabled,user_id,expo_token,session_hash FROM push_installations').get()).toEqual({enabled:0,user_id:null,expo_token:null,session_hash:null});
  });
});
describe('durable outbox and current authorization',()=>{
  it('atomically captures notifications, including direct SQL writers, without leaking their content',async()=>{
    const f=fixture();f.register();
    expect(()=>db.transaction(()=>{f.note();throw Error('rollback');})()).toThrow('rollback');expect(f.state()).toHaveLength(0);
    const n=f.note();
    await processPushOutbox({provider:f.provider});
    expect(f.provider.send).toHaveBeenCalledTimes(1);
    const message=f.provider.send.mock.calls[0][0];
    expect(message.data).toEqual({notificationId:n.id,installationId:f.binding.installationId,generation:1});
    expect(JSON.stringify(message)).not.toMatch(/PRIVATE|private\.invalid|secret/);
    expect(f.state()[0]).toMatchObject({state:'awaiting_receipt',attempts:1});
    await processPushOutbox({provider:f.provider});expect(f.provider.receipt).not.toHaveBeenCalled();
    await processPushOutbox({provider:f.provider,now:()=>Date.now()+16*60_000});
    expect(f.state()[0]).toMatchObject({state:'delivered',receipt_attempts:1});
  });
  it('never replays historical notifications when a device registers later',async()=>{
    const f=fixture();f.note();f.register();expect(f.state()).toHaveLength(0);
    await processPushOutbox({provider:f.provider});expect(f.provider.send).not.toHaveBeenCalled();
  });
  it.each(['revoked session','missing session','expired session','changed role','changed password','pending deletion','finalized','expired binding','read notification','preference disabled'])(
    'cancels delivery after %s before contacting a provider',async(reason)=>{
      const f=fixture();f.register();const n=f.note();
      if(reason==='revoked session')db.prepare("UPDATE active_sessions SET revoked_at=datetime('now') WHERE user_id=?").run(f.owner.id);
      if(reason==='missing session')db.prepare('DELETE FROM active_sessions WHERE user_id=?').run(f.owner.id);
      if(reason==='expired session')db.prepare("UPDATE active_sessions SET expires_at=datetime('now','-1 second') WHERE user_id=?").run(f.owner.id);
      if(reason==='changed role')db.prepare('UPDATE users SET authorization_version=1 WHERE id=?').run(f.owner.id);
      if(reason==='changed password')db.prepare("UPDATE users SET password_changed_at=datetime('now','+1 second') WHERE id=?").run(f.owner.id);
      if(reason==='pending deletion'||reason==='finalized')db.prepare('UPDATE users SET deletion_status=? WHERE id=?').run(reason==='finalized'?'finalized':'pending_deletion',f.owner.id);
      if(reason==='expired binding')db.prepare('UPDATE push_installations SET lease_expires_at=0').run();
      if(reason==='read notification')db.prepare('UPDATE notifications SET read=1 WHERE id=?').run(n.id);
      if(reason==='preference disabled')updatePreferences(f.owner.id,[{type:'course_enrolled',enabled:false}]);
      await processPushOutbox({provider:f.provider});expect(f.provider.send).not.toHaveBeenCalled();expect(f.state()[0].state).toBe('cancelled');
    });
  it('respects opt-out at creation and the legal-hold account policy',async()=>{
    const f=fixture();f.register();updatePreferences(f.owner.id,[{type:'course_enrolled',enabled:false}]);
    createNotification({userId:f.owner.id,type:'course_enrolled',title:'Forced in-app',body:'Body',force:true});expect(f.state()).toHaveLength(0);
    updatePreferences(f.owner.id,[{type:'course_enrolled',enabled:true}]);db.prepare("UPDATE users SET deletion_status='legal_hold' WHERE id=?").run(f.owner.id);
    f.note();await processPushOutbox({provider:f.provider});expect(f.provider.send).toHaveBeenCalledTimes(1);
  });
  it('prevents overlapping workers from sending a claimed notification twice',async()=>{
    const f=fixture();f.register();f.note();let resolve!:(value:any)=>void;
    f.provider.send.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    const first=processPushOutbox({provider:f.provider});
    await processPushOutbox({provider:f.provider});expect(f.provider.send).toHaveBeenCalledTimes(1);
    resolve({status:'ok',id:'ticket'});await first;expect(f.state()[0].state).toBe('awaiting_receipt');
  });
  it('recovers abandoned sends after their durable lease expires, with bounded retries',async()=>{
    const f=fixture();f.register();f.note();const now=Date.now();
    db.prepare("UPDATE push_outbox SET state='sending',attempts=1,claim_id='dead-process',lease_until=?").run(now+60_000);
    await processPushOutbox({provider:f.provider,now:()=>now});expect(f.provider.send).not.toHaveBeenCalled();
    await processPushOutbox({provider:f.provider,now:()=>now+61_000});expect(f.provider.send).toHaveBeenCalledTimes(1);
    expect(f.state()[0]).toMatchObject({state:'awaiting_receipt',attempts:2});
  });
  it('retries ambiguous provider failure without marking delivery and stops after five attempts',async()=>{
    const f=fixture();f.register();f.note();f.provider.send.mockRejectedValue(Error('PRIVATE provider response'));
    let now=Date.now();
    for(let i=0;i<5;i++){await processPushOutbox({provider:f.provider,now:()=>now});now+=16*60_000;}
    expect(f.state()[0]).toMatchObject({state:'failed',attempts:5,last_error:'ProviderUnavailable'});
    await processPushOutbox({provider:f.provider,now:()=>now});expect(f.provider.send).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(f.state())).not.toContain('PRIVATE provider');
  });
  it('cleans an unregistered token after a receipt and cancels remaining work for that binding',async()=>{
    const f=fixture();f.register();f.note();await processPushOutbox({provider:f.provider});f.note();
    f.provider.receipt.mockResolvedValue({status:'error',details:{error:'DeviceNotRegistered'}} as any);
    const now=Date.now()+16*60_000;db.prepare("UPDATE push_outbox SET next_attempt_at=? WHERE ticket_id IS NULL").run(now+1);
    await processPushOutbox({provider:f.provider,now:()=>now});
    expect(db.prepare('SELECT enabled,expo_token FROM push_installations').get()).toEqual({enabled:0,expo_token:null});
    expect(f.state().map(r=>r.state)).toEqual(['failed','cancelled']);
  });
  it('does not let a delayed old-account receipt disable the newer binding',async()=>{
    const f=fixture();f.register();f.note();await processPushOutbox({provider:f.provider});
    let resolve!:(value:any)=>void;f.provider.receipt.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    const pending=processPushOutbox({provider:f.provider,now:()=>Date.now()+16*60_000});
    registerInstallation({...f.binding,generation:2,expoToken:'ExpoPushToken[new-token]'},f.other.token);
    resolve({status:'error',details:{error:'DeviceNotRegistered'}});await pending;
    expect(db.prepare('SELECT enabled,user_id,expo_token FROM push_installations').get()).toEqual({enabled:1,user_id:f.other.id,expo_token:'ExpoPushToken[new-token]'});
    expect(f.state()[0].state).toBe('cancelled');
  });
  it('ignores a late device removal after another worker completes the same claim', async () => {
    const f = fixture();
    f.register();
    f.note();
    const startedAt = Date.now() + 1000;
    await processPushOutbox({ provider: f.provider, now: () => startedAt });
    let release!: () => void;
    f.provider.receipt.mockImplementationOnce(() => new Promise(resolve => {
      release = () => resolve({ status: 'error', details: { error: 'DeviceNotRegistered' } });
    }));
    let now = startedAt + 16 * 60_000;
    const original = processPushOutbox({ provider: f.provider, now: () => now, limit: 1 });
    now += 61_000;
    try {
      await processPushOutbox({ provider: f.provider, now: () => now, limit: 1 });
      expect(f.state()[0]).toMatchObject({ state: 'delivered', receipt_attempts: 2 });
      f.note();
    } finally {
      release();
      await original;
    }
    expect(db.prepare('SELECT enabled,expo_token,generation FROM push_installations').get())
      .toEqual({ enabled: 1, expo_token: f.binding.expoToken, generation: 1 });
    expect(f.state().map(row => row.state)).toEqual(['delivered', 'pending']);
  });
  it('retries cleanup without partially disabling the installation if its transaction fails', async () => {
    const f = fixture();
    f.register();
    f.note();
    const startedAt = Date.now() + 1000;
    await processPushOutbox({ provider: f.provider, now: () => startedAt });
    f.note();
    const now = startedAt + 16 * 60_000;
    db.prepare("UPDATE push_outbox SET next_attempt_at=? WHERE ticket_id IS NULL").run(now + 1);
    db.exec(`CREATE TRIGGER refuse_test_cleanup BEFORE UPDATE OF state ON push_outbox
      WHEN NEW.state='cancelled' AND NEW.last_error='DeviceNotRegistered'
      BEGIN SELECT RAISE(ABORT,'synthetic cleanup failure'); END;`);
    f.provider.receipt.mockResolvedValue({ status: 'error', details: { error: 'DeviceNotRegistered' } });
    await processPushOutbox({ provider: f.provider, now: () => now, limit: 1 });
    expect(db.prepare('SELECT enabled,expo_token FROM push_installations').get())
      .toEqual({ enabled: 1, expo_token: f.binding.expoToken });
    expect(f.state().map(row => row.state)).toEqual(['awaiting_receipt', 'pending']);
    db.exec('DROP TRIGGER refuse_test_cleanup');
    const retryAt = f.state()[0].next_attempt_at as number;
    db.prepare("UPDATE push_outbox SET next_attempt_at=? WHERE ticket_id IS NULL").run(retryAt + 1);
    await processPushOutbox({ provider: f.provider, now: () => retryAt, limit: 1 });
    expect(db.prepare('SELECT enabled,expo_token FROM push_installations').get())
      .toEqual({ enabled: 0, expo_token: null });
    expect(f.state().map(row => row.state)).toEqual(['failed', 'cancelled']);
  });
  it('keeps missing receipts pending and expires the delivery without replaying a submitted payment-like event',async()=>{
    const f=fixture();f.register();f.note();await processPushOutbox({provider:f.provider});
    f.provider.receipt.mockResolvedValue(null as any);
    await processPushOutbox({provider:f.provider,now:()=>Date.now()+16*60_000});
    expect(f.state()[0]).toMatchObject({state:'awaiting_receipt',last_error:'ReceiptUnavailable'});
    await processPushOutbox({provider:f.provider,now:()=>Date.now()+25*60*60_000});
    expect(f.state()[0].state).toBe('cancelled');expect(f.provider.send).toHaveBeenCalledTimes(1);
  });
  it('performs no writes or sends while held, including when the hold appears during provider await',async()=>{
    const f=fixture();f.register();f.note();const hold=process.env.WRITER_HOLD_FILE!;
    try{
      fs.writeFileSync(hold,'');const before=JSON.stringify(f.state());
      await processPushOutbox({provider:f.provider});expect(JSON.stringify(f.state())).toBe(before);expect(f.provider.send).not.toHaveBeenCalled();fs.unlinkSync(hold);
      f.provider.send.mockImplementation(async()=>{fs.writeFileSync(hold,'');return {status:'ok',id:'ticket'};});
      await processPushOutbox({provider:f.provider});expect(f.state()[0]).toMatchObject({state:'sending',attempts:1,ticket_id:null});
    }finally{fs.rmSync(hold,{force:true});}
  });
});
describe('provider transport and schema contracts',()=>{
  it('uses only official Expo endpoints, authenticated JSON and a deadline; ignores provider messages',async()=>{
    fixture();const fetcher=vi.fn(async()=>new Response(JSON.stringify({data:{status:'ok',id:'ticket'}})));vi.stubGlobal('fetch',fetcher);
    const message={to:'ExpoPushToken[test]',title:'LMS update',body:'Generic',data:{notificationId:randomUUID(),installationId:randomUUID(),generation:1},sound:'default',channelId:'lms-updates',ttl:60} as PushMessage;
    await expect(expoPushProvider.send(message)).resolves.toEqual({status:'ok',id:'ticket'});
    expect(fetcher.mock.calls[0]).toMatchObject(['https://exp.host/--/api/v2/push/send',{redirect:'error',headers:{Authorization:'Bearer synthetic-expo-access-token'}}]);
    expect((fetcher.mock.calls[0] as any)[1].signal).toBeInstanceOf(AbortSignal);
    fetcher.mockResolvedValue(new Response(JSON.stringify({data:{ticket:{status:'ok'}}})));
    await expect(expoPushProvider.receipt('ticket')).resolves.toEqual({status:'ok'});
    expect(fetcher.mock.calls[1][0]).toBe('https://exp.host/--/api/v2/push/getReceipts');
  });
  it.each(['oversize','bad JSON','missing ticket','HTTP outage'])('bounds and rejects %s without returning raw bodies',async(mode)=>{
    fixture();vi.stubGlobal('fetch',vi.fn(async()=>mode==='oversize'?new Response('x'.repeat(50*1024)):mode==='bad JSON'?new Response('PRIVATE invalid body'):mode==='missing ticket'?new Response('{"data":{"status":"ok"}}'):new Response('PRIVATE outage',{status:503})));
    await expect(expoPushProvider.send({} as PushMessage)).rejects.toThrow(/InvalidProviderResponse|ProviderUnavailable/);
  });
  it('adds only absent push tables, rejects partial DDL, and verifies the notification trigger',()=>{
    // Unit schema. The compiled runtime harness separately exercises every startup migration.
    const copy=new Database(db.serialize());
    try{
      copy.exec('DROP TRIGGER push_notification_outbox; DROP TABLE push_outbox; DROP TABLE push_installations;');
      expect(()=>validateDatabase(copy)).not.toThrow();copy.exec(pushSchema);expect(()=>validateDatabase(copy)).not.toThrow();
      copy.exec('DROP TRIGGER push_notification_outbox;');expect(()=>validateDatabase(copy,true)).toThrow(/push_notification_outbox/);
      copy.exec(pushSchema);copy.exec('DROP TRIGGER push_notification_outbox; DROP TABLE push_outbox; CREATE TABLE push_outbox(id TEXT PRIMARY KEY);');
      expect(()=>validateDatabase(copy)).toThrow(/changed push schema/);
      expect(pushSchemaTables).toHaveLength(2);
    }finally{copy.close();}
  });
});
