// Manual acceptance only. All signing keys are fresh, memory-only testnet keys.
// This script cannot submit a public-network transaction or use an existing DB.
import assert from 'node:assert/strict';
import {Keypair,Account,TransactionBuilder,Operation,Asset,Memo,Networks,BASE_FEE} from '@stellar/stellar-sdk';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';

const server=fileURLToPath(new URL('..',import.meta.url));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
if(process.argv[2]==='--worker') {
  const directory=path.resolve(process.cwd());
  assert.equal(process.env.LMS_TESTNET_ACCEPTANCE,'fresh-synthetic-only');
  assert.equal(path.dirname(directory),path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith('lms-real-testnet-'));
  assert.equal(path.resolve(process.env.DATABASE_PATH),path.join(directory,'synthetic.db'));
  const sender=Keypair.random(),receiver=Keypair.random(),allowedAccounts=new Set([sender.publicKey(),receiver.publicKey()]);
  const originalFetch=globalThis.fetch;
  const report={version:1,status:'running',network:'testnet',syntheticOnly:true,keysPersisted:false,publicTransfersSubmitted:0,
    sourceCommit:process.env.LMS_ACCEPTANCE_SOURCE_COMMIT,scriptSha256:hash(fileURLToPath(import.meta.url)),
    compiledVerifierSha256:hash(path.join(server,'dist/services/rewards/stellarFundingVerification.js')),
    compiledRewardServiceSha256:hash(path.join(server,'dist/services/rewards/rewardService.js')),
    compiledCreditServiceSha256:hash(path.join(server,'dist/services/rewards/platformCreditService.js')),
    lockfileSha256:hash(path.join(server,'package-lock.json')),nodeVersion:process.version,
    startedAt:new Date().toISOString(),payments:[],verificationRetries:[],checks:{}};
  let stage='network-guard',close;
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(String(input)),method=(options.method??'GET').toUpperCase();
    assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');
    if(url.hostname==='friendbot.stellar.org') {
      assert.equal(method,'GET');assert.ok(allowedAccounts.has(url.searchParams.get('addr')));
    } else if(url.hostname==='horizon-testnet.stellar.org') {
      assert.ok(method==='GET'||(method==='POST'&&url.pathname==='/transactions'));
    } else {assert.equal(url.hostname,'horizon.stellar.org');assert.equal(method,'GET');}
    return originalFetch(input,{...options,redirect:'error'});
  };
  async function json(url,options={}) {
    const response=await fetch(url,{signal:AbortSignal.timeout(30000),...options});
    if(!response.ok) {const error=new Error('Provider HTTP failure');error.code='TESTNET_HTTP_FAILURE';error.httpStatus=response.status;throw error;}
    const text=await response.text();assert.ok(Buffer.byteLength(text)<1024*1024);return JSON.parse(text);
  }
  async function fundFreshAccount(account) {
    const response=await fetch(`https://friendbot.stellar.org/?addr=${account}`,{signal:AbortSignal.timeout(30000)});
    const friendbotStatus=response.status;await response.body?.cancel();
    for(let attempt=0;attempt<10;attempt++) {
      try {const result=await json(`https://horizon-testnet.stellar.org/accounts/${account}`);assert.equal(result.account_id,account);return {account,friendbotStatus};}
      catch(error){if(attempt===9) throw error;await new Promise(resolve=>setTimeout(resolve,1000));}
    }
  }
  async function payment(stroops,memoHash,label) {
    const state=await json(`https://horizon-testnet.stellar.org/accounts/${sender.publicKey()}`);
    const units=BigInt(stroops),amount=`${units/10_000_000n}.${(units%10_000_000n).toString().padStart(7,'0')}`;
    const transaction=new TransactionBuilder(new Account(sender.publicKey(),state.sequence),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
      .addOperation(Operation.payment({destination:receiver.publicKey(),asset:Asset.native(),amount}))
      .addMemo(Memo.hash(Buffer.from(memoHash,'hex'))).setTimeout(120).build();
    transaction.sign(sender);
    const transactionHash=transaction.hash().toString('hex');
    const submitted=await json('https://horizon-testnet.stellar.org/transactions',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({tx:transaction.toXDR()})});
    assert.equal(submitted.hash,transactionHash);assert.equal(submitted.successful,true);
    const operations=await json(`https://horizon-testnet.stellar.org/transactions/${transactionHash}/operations`);
    assert.equal(operations._embedded.records.length,1);const operation=operations._embedded.records[0];
    assert.equal(operation.type,'payment');assert.equal(operation.to,receiver.publicKey());
    for(let attempt=0;attempt<10;attempt++) {
      const root=await json('https://horizon-testnet.stellar.org/');
      if(root.history_latest_ledger>=submitted.ledger) break;
      if(attempt===9) throw new Error('Ledger ingestion did not catch up');
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    const entry={label,transactionHash,operationId:operation.id,ledger:submitted.ledger,amountStroops:stroops};report.payments.push(entry);return entry;
  }
  async function verifyWithRetry(label,action) {
    for(let attempt=0;attempt<3;attempt++) {
      try {return await action();}
      catch(error){if(error.statusCode!==503||attempt===2)throw error;report.verificationRetries.push({label,attempt:attempt+1,code:error.code});await new Promise(resolve=>setTimeout(resolve,1000));}
    }
  }
  try {
    stage='testnet-network';const root=await json('https://horizon-testnet.stellar.org/');assert.equal(root.network_passphrase,Networks.TESTNET);
    stage='friendbot';report.accounts=[await fundFreshAccount(sender.publicKey()),await fundFreshAccount(receiver.publicKey())];
    process.env.REWARD_STELLAR_NETWORK='testnet';process.env.REWARD_STELLAR_DESTINATION=receiver.publicKey();
    const database=await import(pathToFileURL(path.join(server,'dist/config/database.js')).href);const {db}=database;close=database.close;
    const rewards=await import(pathToFileURL(path.join(server,'dist/services/rewards/rewardService.js')).href);
    const funding=await import(pathToFileURL(path.join(server,'dist/services/rewards/rewardFundingIntentService.js')).href);
    const credit=await import(pathToFileURL(path.join(server,'dist/services/rewards/platformCreditService.js')).href);
    const verifier=await import(pathToFileURL(path.join(server,'dist/services/rewards/stellarFundingVerification.js')).href);
    db.exec(`INSERT INTO users(id,name,email,password_hash,role) VALUES
      ('owner','Synthetic','owner@example.invalid','synthetic','student'),('admin-a','Synthetic','a@example.invalid','synthetic','admin'),('admin-b','Synthetic','b@example.invalid','synthetic','admin');
      INSERT INTO user_roles(user_id,role_id) VALUES ('owner','role_sponsor'),('admin-a','role_admin'),('admin-b','role_admin');
      INSERT INTO courses(id,title,course_code) VALUES ('course','Testnet acceptance','TESTNET');
      INSERT INTO sponsor_cohorts(id,sponsor_user_id,course_id,name) VALUES ('cohort','owner','course','Synthetic testnet acceptance');`);
    const makeReward=key=>rewards.createReward('owner',{scopeType:'sponsor_cohort',scopeId:'cohort',rewardType:'custom',amountStroops:'200',idempotencyKey:key});
    stage='direct-intent';const reward=makeReward('direct'),intent=await funding.createFundingIntentVerified(reward.id,'owner',{type:'stellar'},'direct-intent');
    stage='underpayment';const underpaid=await payment('199',intent.memo_hash,'underpayment');
    await assert.rejects(()=>verifyWithRetry('underpayment',()=>rewards.fundRewardAsync(reward.id,'owner',{type:'stellar',intentId:intent.id,reference:underpaid.operationId},'underpaid')),
      error=>error.code==='FUNDING_AMOUNT_MISMATCH');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM reward_transactions').get().n,0);report.checks.underpayment='DENIED_WITHOUT_CREDIT';
    stage='direct-payment';const paid=await payment('200',intent.memo_hash,'direct-reward');
    stage='direct-verification';await verifyWithRetry('direct',()=>rewards.fundRewardAsync(reward.id,'owner',{type:'stellar',intentId:intent.id,reference:paid.operationId},'direct-fund'));
    await rewards.fundRewardAsync(reward.id,'owner',{type:'stellar',intentId:intent.id,reference:paid.operationId},'direct-fund');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM reward_transactions').get().n,2);report.checks.directReplay='ONE_CREDIT_ONE_RESERVATION';
    stage='wrong-network';await assert.rejects(()=>verifier.verifyStellarFunding({network:'public',destination:receiver.publicKey(),memoHash:intent.memo_hash,amountStroops:200,
      createdAt:intent.created_at.replace(' ','T')+'Z',expiresAt:intent.expires_at},paid.operationId));report.checks.wrongNetwork='DENIED';
    stage='provider-timeout';const extra=makeReward('timeout'),extraIntent=await funding.createFundingIntentVerified(extra.id,'owner',{type:'stellar'},'timeout-intent');
    const realGuardedFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Synthetic provider timeout');};
    try {await assert.rejects(()=>rewards.fundRewardAsync(extra.id,'owner',{type:'stellar',intentId:extraIntent.id,reference:paid.operationId},'timeout'),error=>error.statusCode===503);}
    finally {globalThis.fetch=realGuardedFetch;}
    assert.equal(db.prepare('SELECT COUNT(*) n FROM reward_transactions').get().n,2);report.checks.providerTimeout='INJECTED_NO_CREDIT';
    stage='backing-intent';const backing=await verifyWithRetry('backing-intent',()=>credit.createBackingIntent('admin-a','1000','Synthetic testnet capital','backing'));
    stage='backing-payment';const capital=await payment('1000',backing.memo_hash,'platform-backing');
    stage='backing-verification';await verifyWithRetry('backing',()=>credit.verifyBackingDeposit(backing.id,'admin-a',capital.operationId));
    await credit.verifyBackingDeposit(backing.id,'admin-a',capital.operationId);
    stage='credit-approval';const proposal=credit.requestPlatformCredit('admin-a','owner','1000','Synthetic testnet budget','request');
    const grant=credit.approvePlatformCredit(proposal.id,'admin-b','approve','Independent synthetic approval');
    const creditReward=makeReward('credit'),creditIntent=funding.createFundingIntent(creditReward.id,'admin-a',{type:'platform_credit',reference:grant.id},'credit-intent');
    stage='credit-consumption';await rewards.fundRewardAsync(creditReward.id,'admin-a',{type:'platform_credit',reference:grant.id,intentId:creditIntent.id},'credit-fund');
    await rewards.fundRewardAsync(creditReward.id,'admin-a',{type:'platform_credit',reference:grant.id,intentId:creditIntent.id},'credit-fund');
    const balance=credit.creditGrant(grant.id);assert.equal(balance.availableStroops,800);assert.equal(balance.consumedStroops,200);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM platform_backing_deposits').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM platform_credit_consumptions').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM reward_transactions').get().n,4);assert.equal(db.pragma('quick_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);
    report.checks.backingAndCredit='ONE_DEPOSIT_ONE_APPROVAL_ONE_CONSUMPTION';report.checks.remainingCreditStroops=800;report.checks.integrity='PASS';report.status='passed';
  } catch(error) {report.status='failed';report.failure={stage,code:typeof error.code==='string'?error.code:'ASSERTION_OR_PROVIDER_FAILURE',httpStatus:error.httpStatus??null};process.exitCode=1;}
  finally {close?.();report.finishedAt=new Date().toISOString();process.send?.(report);process.disconnect?.();}
} else if(process.argv.length===3&&process.argv[2]==='--execute-testnet') {
  const clean=spawnSync('git',['status','--porcelain'],{cwd:server,encoding:'utf8',windowsHide:true});
  assert.equal(clean.status,0);assert.equal(clean.stdout.trim(),'','Commit source before real testnet acceptance.');
  const directory=mkdtempSync(path.join(tmpdir(),'lms-real-testnet-'));let child,timeout,terminal=false;
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA'].includes(name.toUpperCase())));
  const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:server,encoding:'utf8',windowsHide:true});assert.equal(revision.status,0);
  Object.assign(env,{DATABASE_PATH:path.join(directory,'synthetic.db'),NODE_ENV:'production',LMS_TESTNET_ACCEPTANCE:'fresh-synthetic-only',LMS_ACCEPTANCE_SOURCE_COMMIT:revision.stdout.trim()});
  try {
    const init=spawnSync(process.execPath,[path.join(server,'dist/scripts/initDb.js'),'--initialize-new'],{cwd:directory,env,encoding:'utf8',windowsHide:true,timeout:60000});
    assert.equal(init.status,0,'Disposable database initialization failed');
    child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--worker'],{cwd:directory,env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
    child.stdout.resume();child.stderr.resume();let receipt;
    timeout=setTimeout(()=>child.kill(),300000);
    child.on('message',value=>{receipt=value;});
    const code=await new Promise((resolve,reject)=>{child.on('error',error=>{terminal=true;reject(error);});child.on('exit',code=>{terminal=true;resolve(code);});});clearTimeout(timeout);
    if(receipt) console.log(JSON.stringify(receipt,null,2));else console.log(JSON.stringify({status:'failed',stage:'worker',network:'testnet',publicTransfersSubmitted:0}));
    process.exitCode=code===0&&receipt?.status==='passed'?0:1;
  } finally {
    clearTimeout(timeout);
    if(child&&!terminal) {const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));assert.ok(path.basename(directory).startsWith('lms-real-testnet-'));
    rmSync(directory,{recursive:true,force:true});
  }
} else {console.log('Manual only: node scripts/accept-funding-testnet.mjs --execute-testnet. Uses fresh testnet accounts, test XLM and a disposable database.');process.exitCode=2;}
