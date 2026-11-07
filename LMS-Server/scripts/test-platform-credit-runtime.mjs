// Compiled application, real SQLite and separate processes; all chain data is synthetic.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
const server=fileURLToPath(new URL('..',import.meta.url));
if(process.argv[2]==='--worker') {
  const {close}=await import(pathToFileURL(path.join(server,'dist/config/database.js')).href);
  const credit=await import(pathToFileURL(path.join(server,'dist/services/rewards/platformCreditService.js')).href);
  const funding=await import(pathToFileURL(path.join(server,'dist/services/rewards/rewardFundingIntentService.js')).href);
  const rewards=await import(pathToFileURL(path.join(server,'dist/services/rewards/rewardService.js')).href);
  let deposit;
  globalThis.fetch=async url=>{
    assert.equal(new URL(url).origin,'https://horizon-testnet.stellar.org');
    const endpoint=new URL(url).pathname,time=deposit?new Date(Math.floor(Date.parse(deposit.created_at)/1000)*1000).toISOString():'';
    const body=endpoint==='/'?{network_passphrase:'Test SDF Network ; September 2015',history_latest_ledger:50}
      :endpoint.startsWith('/accounts/')?{account_id:process.env.REWARD_STELLAR_DESTINATION}
      :endpoint.startsWith('/operations/')?{id:'101',type:'payment',transaction_successful:true,to:process.env.REWARD_STELLAR_DESTINATION,asset_type:'native',amount:'0.0001000',transaction_hash:'b'.repeat(64)}
      :endpoint.startsWith('/transactions/')?{hash:'b'.repeat(64),successful:true,ledger:50,created_at:time,memo_type:'hash',memo:Buffer.from(deposit.memo_hash,'hex').toString('base64')}
      :{sequence:50,hash:'c'.repeat(64),closed_at:time};
    return new Response(JSON.stringify(body),{status:200});
  };
  process.send?.({ready:true});const [message]=await once(process,'message');
  try {
    let result;
    if(message.action==='seed') {
      deposit=await credit.createBackingIntent('admin-a','1000','Synthetic verified capital','deposit');
      await credit.verifyBackingDeposit(deposit.id,'admin-a','101');
      const proposal=credit.requestPlatformCredit('admin-a','owner','1000','Synthetic budget','request');
      const grant=credit.approvePlatformCredit(proposal.id,'admin-b','approve','Independent synthetic approval');
      result={grantId:grant.id};
    } else if(message.action==='reserve') {
      const reward=rewards.createReward('owner',{scopeType:'sponsor_cohort',scopeId:'cohort',rewardType:'custom',amountStroops:'600',idempotencyKey:`reward-${message.index}`});
      const intent=funding.createFundingIntent(reward.id,'admin-a',{type:'platform_credit',reference:message.grantId},`hold-${message.index}`);
      result={rewardId:reward.id,intentId:intent.id};
    } else if(message.action==='fund') {
      const reward=await rewards.fundRewardAsync(message.rewardId,'admin-a',{type:'platform_credit',reference:message.grantId,intentId:message.intentId},'credit-fund');
      result={status:reward.status};
    } else throw new Error('Unknown runtime action');
    process.send?.(result);
  } catch(error) {process.send?.({error:error.code??error.message});}
  finally {close();process.disconnect?.();}
} else {
  const directory=mkdtempSync(path.join(tmpdir(),'lms-platform-credit-runtime-')),file=path.join(directory,'synthetic.db');
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA'].includes(name.toUpperCase())));
  Object.assign(env,{DATABASE_PATH:file,NODE_ENV:'production',REWARD_STELLAR_NETWORK:'testnet',REWARD_STELLAR_DESTINATION:'GDJT327MIBUOVRXKDDSBOIT7J2ORZB2Y4FDIVAXM7UUVHFPVU4LW7JHE'});
  const children=new Set();let db;
  async function worker() {
    const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--worker'],{cwd:directory,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
    children.add(child);let stderr='';child.stderr.on('data',part=>{stderr+=part;});child.stdout.resume();
    const timeout=setTimeout(()=>child.kill(),60000);
    const result=new Promise((resolve,reject)=>{
      let last;child.on('message',value=>{if(!value.ready) last=value;});child.on('error',reject);
      child.on('exit',code=>{clearTimeout(timeout);children.delete(child);if(code!==0||!last)reject(new Error(`Credit worker exited ${code}: ${stderr}`));else resolve(last);});
    });
    await Promise.race([once(child,'message'),result.then(()=>{throw new Error('Worker exited before readiness');})]);
    return {child,result};
  }
  async function perform(message){const entry=await worker();entry.child.send(message);return entry.result;}
  try {
    const init=spawnSync(process.execPath,[path.join(server,'dist/scripts/initDb.js'),'--initialize-new'],{cwd:directory,env,encoding:'utf8',windowsHide:true,timeout:60000});
    assert.equal(init.status,0,init.stderr);
    db=new Database(file);
    db.exec(`INSERT INTO users(id,name,email,password_hash) VALUES
      ('admin-a','Synthetic','a@example.invalid','synthetic'),('admin-b','Synthetic','b@example.invalid','synthetic'),('owner','Synthetic','owner@example.invalid','synthetic');
      INSERT INTO user_roles(user_id,role_id) VALUES ('admin-a','role_admin'),('admin-b','role_admin'),('owner','role_sponsor');
      INSERT INTO courses(id,title,course_code) VALUES ('course','Credit','CREDIT');
      INSERT INTO sponsor_cohorts(id,sponsor_user_id,course_id,name) VALUES ('cohort','owner','course','Credit');`);
    db.close();db=undefined;
    const seeded=await perform({action:'seed'});assert.ok(seeded.grantId,JSON.stringify(seeded));
    const contenders=await Promise.all([worker(),worker(),worker()]);
    contenders.forEach((entry,index)=>entry.child.send({action:'reserve',grantId:seeded.grantId,index}));
    const reserved=await Promise.all(contenders.map(entry=>entry.result));
    const successes=reserved.filter(result=>result.intentId);assert.equal(successes.length,1,JSON.stringify(reserved));
    assert.equal(reserved.filter(result=>result.error==='INSUFFICIENT_CREDIT').length,2);
    const fundMessage={action:'fund',grantId:seeded.grantId,...successes[0]};
    const funders=await Promise.all([worker(),worker(),worker()]);funders.forEach(entry=>entry.child.send(fundMessage));
    for(const result of await Promise.all(funders.map(entry=>entry.result))) assert.deepEqual(result,{status:'funded'});
    assert.deepEqual(await perform(fundMessage),{status:'funded'},'fresh process must replay without new credit');
    assert.deepEqual(await perform({action:'seed'}),seeded,'deposit/request/approval survive process restart');
    db=new Database(file,{readonly:true});
    const count=table=>db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
    assert.equal(count('platform_backing_deposits'),1);assert.equal(count('platform_credit_grants'),1);
    assert.equal(count('platform_credit_reservations'),1);assert.equal(count('platform_credit_consumptions'),1);
    assert.equal(count('reward_transactions'),2);assert.equal(count('platform_credit_audit'),6);
    const backing=db.prepare('SELECT SUM(amount_stroops) n FROM platform_backing_deposits').get().n;
    const allocation=db.prepare('SELECT amount_stroops n FROM platform_credit_requests WHERE id=(SELECT request_id FROM platform_credit_grants WHERE id=?)').get(seeded.grantId).n;
    const consumed=db.prepare("SELECT SUM(amount_stroops) n FROM platform_credit_reservations WHERE grant_id=? AND status='consumed'").get(seeded.grantId).n;
    const held=db.prepare("SELECT COALESCE(SUM(amount_stroops),0) n FROM platform_credit_reservations WHERE grant_id=? AND status='held' AND expires_at>?").get(seeded.grantId,new Date().toISOString()).n;
    assert.equal(backing,1000);assert.equal(allocation,backing);assert.equal(consumed,600);assert.equal(held,0);assert.equal(allocation-consumed-held,400);
    assert.deepEqual(db.prepare('SELECT available_stroops,reserved_stroops FROM reward_accounts').all(),[{available_stroops:0,reserved_stroops:600}]);
    assert.equal(db.pragma('quick_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
    console.log(JSON.stringify({syntheticOnly:true,backingAndApprovalRestart:'ONE_DEPOSIT_ONE_GRANT',concurrentReservations:reserved.map(result=>result.error??'RESERVED'),
      concurrentFunding:'ONE_CREDIT_ONE_RESERVATION',freshProcessReplay:'NO_NEW_VALUE',availableCreditStroops:allocation-consumed-held,integrity:'PASS'}));
  } finally {
    db?.close();for(const child of children) child.kill();await Promise.all([...children].map(child=>once(child,'exit').catch(()=>{})));
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));assert.ok(path.basename(directory).startsWith('lms-platform-credit-runtime-'));
    rmSync(directory,{recursive:true,force:true});
  }
}
