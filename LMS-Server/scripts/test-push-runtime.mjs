// Real compiled application + SQLite + process death. Every push provider is synthetic.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash,randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
const server=fileURLToPath(new URL('..',import.meta.url));
if(process.argv[2]==='--worker') {
  globalThis.fetch=async()=>{throw Error('Real network forbidden in synthetic push acceptance');};
  const {db,close}=await import(pathToFileURL(path.join(server,'dist/config/database.js')).href);
  const {registerInstallation,unregisterInstallation}=await import(pathToFileURL(path.join(server,'dist/services/pushInstallationService.js')).href);
  const {createNotification}=await import(pathToFileURL(path.join(server,'dist/services/notificationService.js')).href);
  const {processPushOutbox}=await import(pathToFileURL(path.join(server,'dist/services/pushDeliveryService.js')).href);
  process.send?.({ready:true});const [message]=await once(process,'message');
  try {
    let result;
    if(message.action==='register')result=registerInstallation(message.binding,message.token);
    else if(message.action==='unregister')result=unregisterInstallation(message.binding);
    else if(message.action==='notify'){
      createNotification({userId:message.owner,type:'course_enrolled',title:'PRIVATE synthetic course',body:'PRIVATE synthetic details'});result={created:true};
    } else if(message.action==='tick'||message.action==='crash') {
      result=await processPushOutbox({now:()=>message.now??Date.now(),limit:message.action==='crash'?1:20,provider:{
        async send(payload){
          assert.equal(payload.title,'LMS update');assert.ok(!JSON.stringify(payload).includes('PRIVATE'));
          if(message.action==='crash'){process.send?.({claimed:true});await new Promise(()=>{});}
          await new Promise(resolve=>setTimeout(resolve,20));
          db.prepare('INSERT INTO synthetic_push_sends(notification_id,installation_id,generation) VALUES (?,?,?)').run(payload.data.notificationId,payload.data.installationId,payload.data.generation);
          return {status:'ok',id:randomUUID()};
        },
        async receipt(){return {status:'ok'};},
      }});
    } else throw Error('Unknown synthetic push action');
    process.send?.({result});
  } catch(error){process.send?.({error:error.code??error.message});}
  finally{close();process.disconnect?.();}
} else {
  const directory=mkdtempSync(path.join(tmpdir(),'lms-push-runtime-')),file=path.join(directory,'synthetic.db');
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA'].includes(name.toUpperCase())));
  Object.assign(env,{DATABASE_PATH:file,NODE_ENV:'production',JWT_SECRET:'synthetic-runtime-jwt-secret',PUSH_NOTIFICATIONS_ENABLED:'true',EXPO_PUSH_PROJECT_ID:'a1111111-1111-4111-8111-111111111111',EXPO_PUSH_ACCESS_TOKEN:'synthetic-never-sent-access-token'});
  const children=new Set();let db;
  async function worker(){
    const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--worker'],{cwd:directory,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});children.add(child);
    let stderr='';child.stderr.on('data',part=>{stderr+=part;});child.stdout.resume();const timeout=setTimeout(()=>child.kill(),60_000);
    const result=new Promise((resolve,reject)=>{
      let last;child.on('message',value=>{if('result' in value||value.error)last=value;});child.on('error',reject);
      child.on('exit',code=>{clearTimeout(timeout);children.delete(child);if(code!==0||!last)reject(Error(`Push worker exited ${code}: ${stderr}`));else resolve(last);});
    });
    // A crash is deliberately observed as a rejected result later.
    result.catch(()=>{});
    await Promise.race([once(child,'message'),result.then(()=>{throw Error('Worker exited before readiness');})]);return {child,result};
  }
  async function perform(message){const entry=await worker();entry.child.send(message);return entry.result;}
  try{
    const init=spawnSync(process.execPath,[path.join(server,'dist/scripts/initDb.js'),'--initialize-new'],{cwd:directory,env,encoding:'utf8',windowsHide:true,timeout:60_000});assert.equal(init.status,0,init.stderr);
    db=new Database(file);db.exec(`CREATE TABLE synthetic_push_sends(notification_id TEXT,installation_id TEXT,generation INTEGER);`);
    const tokens={};
    for(const owner of ['owner-a','owner-b']){
      db.prepare("INSERT INTO users(id,name,email,password_hash,role) VALUES (?,'Synthetic',?,'hash','student')").run(owner,`${owner}@example.invalid`);
      db.prepare("INSERT INTO user_roles(user_id,role_id) VALUES (?,'role_student')").run(owner);
      const token=jwt.sign({userId:owner,role:'student',authorizationVersion:0},env.JWT_SECRET,{expiresIn:'2h',jwtid:randomUUID()});tokens[owner]=token;
      db.prepare('INSERT INTO active_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,?)').run(randomUUID(),owner,createHash('sha256').update(token).digest('hex'),new Date(Date.now()+7_200_000).toISOString());
    }
    const bindings=Array.from({length:3},()=>({installationId:randomUUID(),credential:'a'.repeat(64),generation:1,projectId:env.EXPO_PUSH_PROJECT_ID,platform:'android',expoToken:`ExpoPushToken[${randomUUID()}]`}));
    for(const binding of bindings)assert.equal((await perform({action:'register',binding,token:tokens['owner-a']})).result.generation,1);
    await perform({action:'notify',owner:'owner-a'});
    const contenders=await Promise.all([worker(),worker(),worker()]);contenders.forEach(entry=>entry.child.send({action:'tick'}));
    for(const result of await Promise.all(contenders.map(entry=>entry.result)))assert.ok(result.result);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM synthetic_push_sends').get().n,3);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM push_outbox WHERE state='awaiting_receipt'").get().n,3);
    await perform({action:'tick',now:Date.now()+16*60_000});
    assert.equal(db.prepare("SELECT COUNT(*) n FROM push_outbox WHERE state='delivered'").get().n,3);
    await perform({action:'tick'});assert.equal(db.prepare('SELECT COUNT(*) n FROM synthetic_push_sends').get().n,3);
    await perform({action:'notify',owner:'owner-a'});
    const crash=await worker();const claimed=once(crash.child,'message');crash.child.send({action:'crash'});assert.deepEqual((await claimed)[0],{claimed:true});
    const abandoned=db.prepare("SELECT id,lease_until FROM push_outbox WHERE state='sending'").get();assert.ok(abandoned);
    crash.child.kill();await assert.rejects(crash.result,/Push worker exited/);
    await perform({action:'tick'});
    assert.equal(db.prepare('SELECT state FROM push_outbox WHERE id=?').get(abandoned.id).state,'sending','lease survives death and other workers');
    await perform({action:'tick',now:abandoned.lease_until+1});
    assert.equal(db.prepare('SELECT state,attempts FROM push_outbox WHERE id=?').get(abandoned.id).state,'awaiting_receipt');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM synthetic_push_sends').get().n,6);
    assert.deepEqual(db.prepare('SELECT COUNT(*) n FROM (SELECT notification_id,installation_id,generation,COUNT(*) c FROM synthetic_push_sends GROUP BY 1,2,3 HAVING c<>1)').get(),{n:0});
    await perform({action:'notify',owner:'owner-a'});
    const switched=await perform({action:'register',binding:{...bindings[0],generation:2},token:tokens['owner-b']});assert.equal(switched.result.generation,2);
    assert.equal((await perform({action:'unregister',binding:bindings[0]})).error,'STALE_INSTALLATION');
    db.prepare('UPDATE users SET authorization_version=authorization_version+1 WHERE id=?').run('owner-a');
    await perform({action:'tick'});
    assert.equal(db.prepare('SELECT COUNT(*) n FROM synthetic_push_sends').get().n,6,'revocation and switch cancel old work');
    await perform({action:'notify',owner:'owner-b'});await perform({action:'tick'});
    assert.equal(db.prepare('SELECT COUNT(*) n FROM synthetic_push_sends').get().n,7);
    assert.equal(db.pragma('quick_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
    console.log(JSON.stringify({syntheticOnly:true,networkForbidden:true,concurrentProcesses:3,initialDeliveries:3,receiptAfterRestart:'THREE_DELIVERED',actualKilledWorkerLeaseRecovery:'PASS',duplicateSyntheticSends:0,oldAccountAndRevocation:'CANCELLED',newAccount:'ONE_NEW_DELIVERY',integrity:'PASS'}));
  } finally{
    db?.close();const pending=[...children];for(const child of pending)child.kill();await Promise.all(pending.map(child=>once(child,'exit').catch(()=>{})));
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));assert.ok(path.basename(directory).startsWith('lms-push-runtime-'));rmSync(directory,{recursive:true,force:true});
  }
}
