import {describe,it,expect,vi,afterEach} from 'vitest';
import './setup.js';
import {Keypair,Networks} from '@stellar/stellar-sdk';
import {createHash} from 'node:crypto';
import {v4 as uuid} from 'uuid';
import {db} from '../config/database.js';
import {activateReward,createReward,fundReward,fundRewardAsync,releaseAllocation} from '../services/rewards/rewardService.js';
import {createFundingIntent,getFundingAvailability} from '../services/rewards/rewardFundingIntentService.js';
import {createBackingIntent,verifyBackingDeposit,platformPool,requestPlatformCredit,approvePlatformCredit,cancelPlatformCreditRequest,
  creditGrant,releasePlatformCreditReservation,availablePlatformCredits} from '../services/rewards/platformCreditService.js';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
function fixture(network: 'testnet' | 'public' = 'testnet') {
  const a=uuid(),b=uuid(),owner=uuid(),other=uuid(),course=uuid();
  for(const [id,role] of [[a,'admin'],[b,'admin'],[owner,'lecturer'],[other,'lecturer']]) {
    db.prepare("INSERT INTO users(id,name,email,password_hash,role) VALUES (?,'Synthetic',?,'hash',?)").run(id,`${id}@test.invalid`,role);
    if(role==='lecturer') db.prepare("INSERT INTO user_roles(user_id,role_id) VALUES (?,'role_sponsor')").run(id);
  }
  db.prepare("INSERT INTO courses(id,title,course_code) VALUES (?,'Credit',?)").run(course,course);
  const cohorts=new Map<string,string>();
  for(const id of [owner,other]) {const cohort=uuid();cohorts.set(id,cohort);db.prepare("INSERT INTO sponsor_cohorts(id,sponsor_user_id,course_id,name) VALUES (?,?,?,'Credit')").run(cohort,id,course);}
  const destination=Keypair.random().publicKey();vi.stubEnv('REWARD_STELLAR_NETWORK',network);vi.stubEnv('REWARD_STELLAR_DESTINATION',destination);
  const records=new Map<string,unknown>();records.set('/',{network_passphrase:network === 'public' ? Networks.PUBLIC : Networks.TESTNET,history_latest_ledger:50});records.set(`/accounts/${destination}`,{account_id:destination});
  const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(records.get(new URL(url).pathname)??{}),{status:records.has(new URL(url).pathname)?200:404}));vi.stubGlobal('fetch',fetcher);
  function proof(intent:{memo_hash?:string;amount_stroops:number;created_at:string},operation:string) {
    const hash=createHash('sha256').update(operation).digest('hex'),amount=BigInt(intent.amount_stroops),time=intent.created_at.includes('T')?new Date(Math.floor(Date.parse(intent.created_at)/1000)*1000).toISOString():intent.created_at.replace(' ','T')+'Z';
    records.set(`/operations/${operation}`,{id:operation,type:'payment',transaction_successful:true,to:destination,asset_type:'native',amount:`${amount/10_000_000n}.${(amount%10_000_000n).toString().padStart(7,'0')}`,transaction_hash:hash});
    records.set(`/transactions/${hash}`,{hash,successful:true,ledger:50,created_at:time,memo_type:'hash',memo:Buffer.from(intent.memo_hash!,'hex').toString('base64')});
    records.set('/ledgers/50',{sequence:50,hash:'c'.repeat(64),closed_at:time});
  }
  async function deposit(units='1000',operation='101') {const intent=await createBackingIntent(a,units,'Verified capital',uuid());proof(intent,operation);await verifyBackingDeposit(intent.id,a,operation);return intent;}
  function reward(user=owner,units='200') {return createReward(user,{scopeType:'sponsor_cohort',scopeId:cohorts.get(user)!,rewardType:'custom',amountStroops:units,idempotencyKey:uuid()});}
  function grant(units='600') {const request=requestPlatformCredit(a,owner,units,'Learner incentives',uuid());const approved=approvePlatformCredit(request.id,b,uuid(),'Approved budget') as {id:string};return {request,grant:approved};}
  return {a,b,owner,other,cohorts,deposit,reward,grant,proof,fetcher,destination};
}
const count=(table:string)=>(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as {n:number}).n;

describe('backed platform credit',()=>{
  it('creates no backing from an intent or administrator assertion; only verified native deposit adds capacity',async()=>{
    const f=fixture(),intent=await createBackingIntent(f.a,'1000','Capital','deposit');
    expect(platformPool('testnet').availableStroops).toBe(0);
    expect(()=>requestPlatformCredit(f.a,f.owner,'1','Purpose','request')).toThrowError(expect.objectContaining({code:'INSUFFICIENT_CREDIT'}));
    await expect(verifyBackingDeposit(intent.id,f.a,'101')).rejects.toThrow();expect(count('platform_backing_deposits')).toBe(0);
    f.proof(intent,'101');await verifyBackingDeposit(intent.id,f.a,'101');
    expect(platformPool('testnet')).toMatchObject({depositedStroops:1000,availableStroops:1000});
    expect(count('reward_accounts')).toBe(0);expect(count('reward_transactions')).toBe(0);
  });
  it('requires current permission, a non-beneficiary requester and an independent approver',async()=>{
    const f=fixture();await f.deposit();
    await expect(createBackingIntent(f.owner,'1','Not authorized','denied')).rejects.toMatchObject({statusCode:403});
    expect(()=>requestPlatformCredit(f.a,f.a,'100','Self enrichment','self')).toThrowError(expect.objectContaining({code:'CONFLICT_OF_INTEREST'}));
    const r=requestPlatformCredit(f.a,f.owner,'600','Budget','request');
    expect(()=>approvePlatformCredit(r.id,f.a,'self-approve','No')).toThrowError(expect.objectContaining({code:'CONFLICT_OF_INTEREST'}));
    expect(()=>approvePlatformCredit(r.id,f.owner,'owner-approve','No')).toThrowError(expect.objectContaining({statusCode:403}));
    db.prepare('DELETE FROM user_roles WHERE user_id=?').run(f.b);
    expect(()=>approvePlatformCredit(r.id,f.b,'revoked','No')).toThrowError(expect.objectContaining({statusCode:403}));
    expect(count('platform_credit_grants')).toBe(0);expect(platformPool('testnet').reservedStroops).toBe(600);
  });
  it('reserves pool backing, approves once with an audit trail and binds all idempotency inputs',async()=>{
    const f=fixture();await f.deposit();const r=requestPlatformCredit(f.a,f.owner,'600','Budget','request');
    expect(requestPlatformCredit(f.a,f.owner,'600','Budget','request').id).toBe(r.id);
    expect(()=>requestPlatformCredit(f.a,f.owner,'601','Budget','request')).toThrowError(expect.objectContaining({code:'IDEMPOTENCY_CONFLICT'}));
    expect(()=>requestPlatformCredit(f.a,f.other,'600','Budget','request')).toThrowError(expect.objectContaining({code:'IDEMPOTENCY_CONFLICT'}));
    expect(()=>requestPlatformCredit(f.a,f.other,'401','Too much','overspend')).toThrowError(expect.objectContaining({code:'INSUFFICIENT_CREDIT'}));
    const g=approvePlatformCredit(r.id,f.b,'approve','Reviewed') as {id:string};
    expect((approvePlatformCredit(r.id,f.b,'approve','Reviewed') as {id:string}).id).toBe(g.id);
    expect(()=>approvePlatformCredit(r.id,f.b,'approve','Changed')).toThrowError(expect.objectContaining({code:'IDEMPOTENCY_CONFLICT'}));
    expect(creditGrant(g.id)).toMatchObject({availableStroops:600,reservedStroops:0,consumedStroops:0});
    expect(platformPool('testnet')).toMatchObject({availableStroops:400,reservedStroops:0,allocatedStroops:600});
    expect(count('platform_credit_audit')).toBe(4);
    expect(()=>db.exec("UPDATE platform_credit_grants SET reason='changed'")).toThrow(/immutable/);
    expect(()=>db.exec('DELETE FROM platform_credit_audit')).toThrow(/immutable/);
  });
  it('releases cancelled or expired pool reservations without granting value',async()=>{
    const f=fixture();await f.deposit();const r=requestPlatformCredit(f.a,f.owner,'1000','Budget','request');
    cancelPlatformCreditRequest(r.id,f.b,'Not proceeding');cancelPlatformCreditRequest(r.id,f.b,'Retry');
    expect(platformPool('testnet').availableStroops).toBe(1000);
    expect(()=>approvePlatformCredit(r.id,f.b,'approve','No')).toThrowError(expect.objectContaining({statusCode:409}));
    const expired=requestPlatformCredit(f.a,f.owner,'1000','Budget','expiry');
    vi.spyOn(Date,'now').mockReturnValue(Date.parse(expired.expires_at)+1);
    expect(platformPool('testnet').availableStroops).toBe(1000);
    expect(()=>approvePlatformCredit(expired.id,f.b,'late','No')).toThrowError(expect.objectContaining({statusCode:409}));
    expect(count('platform_credit_grants')).toBe(0);
  });
  it('funds the creator from reserved backed credit and consumes exactly once on sync/async retries',async()=>{
    const f=fixture();await f.deposit();const g=f.grant(),r=f.reward();
    const intent=createFundingIntent(r.id,f.a,{type:'platform_credit',reference:g.grant.id},'prepare');
    expect(creditGrant(g.grant.id)).toMatchObject({availableStroops:400,reservedStroops:200});
    const source={type:'platform_credit' as const,reference:g.grant.id,intentId:intent.id};
    expect(fundReward(r.id,f.a,source,'fund').status).toBe('funded');
    await expect(fundRewardAsync(r.id,f.a,source,'fund')).resolves.toMatchObject({status:'funded'});
    expect(creditGrant(g.grant.id)).toMatchObject({availableStroops:400,reservedStroops:0,consumedStroops:200});
    expect(count('platform_credit_consumptions')).toBe(1);expect(count('reward_transactions')).toBe(2);
    expect(db.prepare('SELECT available_stroops,reserved_stroops FROM reward_accounts WHERE user_id=?').get(f.owner)).toEqual({available_stroops:0,reserved_stroops:200});
    expect(count('reward_funding_evidence')).toBe(1);
    expect(()=>fundReward(r.id,f.a,{...source,reference:'another-grant'},'fund')).toThrowError(expect.objectContaining({code:'IDEMPOTENCY_CONFLICT'}));
    expect(()=>releasePlatformCreditReservation(intent.id,f.a)).toThrowError(expect.objectContaining({statusCode:409}));
  });
  it('rejects cross-owner, self-authorized and overcommitted grants before funding',async()=>{
    const f=fixture();await f.deposit();const g=f.grant('300'),r=f.reward();
    expect(()=>createFundingIntent(f.reward(f.other).id,f.a,{type:'platform_credit',reference:g.grant.id},'cross')).toThrowError(expect.objectContaining({code:'INSUFFICIENT_CREDIT'}));
    expect(()=>createFundingIntent(r.id,f.owner,{type:'platform_credit',reference:g.grant.id},'self')).toThrowError(expect.objectContaining({statusCode:403}));
    createFundingIntent(r.id,f.a,{type:'platform_credit',reference:g.grant.id},'one');
    expect(()=>createFundingIntent(f.reward().id,f.a,{type:'platform_credit',reference:g.grant.id},'two')).toThrowError(expect.objectContaining({code:'INSUFFICIENT_CREDIT'}));
    expect(creditGrant(g.grant.id)?.availableStroops).toBe(100);expect(count('reward_transactions')).toBe(0);
  });
  it('makes held credit available after cancellation/expiry and refuses stale consumption',async()=>{
    const f=fixture();await f.deposit();const g=f.grant('200'),r=f.reward();
    const intent=createFundingIntent(r.id,f.a,{type:'platform_credit',reference:g.grant.id},'hold');
    releasePlatformCreditReservation(intent.id,f.a);releasePlatformCreditReservation(intent.id,f.b);
    expect(creditGrant(g.grant.id)?.availableStroops).toBe(200);
    expect(()=>fundReward(r.id,f.a,{type:'platform_credit',reference:g.grant.id,intentId:intent.id},'released')).toThrowError(expect.objectContaining({code:'INSUFFICIENT_CREDIT'}));
    const next=createFundingIntent(r.id,f.a,{type:'platform_credit',reference:g.grant.id},'next');
    vi.spyOn(Date,'now').mockReturnValue(Date.parse(next.expires_at)+1);
    expect(creditGrant(g.grant.id)?.availableStroops).toBe(200);
    expect(()=>fundReward(r.id,f.a,{type:'platform_credit',reference:g.grant.id,intentId:next.id},'late')).toThrowError(expect.objectContaining({statusCode:409}));
  });
  it('rolls back fund/reserve/evidence/consumption together on storage failure, then retries safely',async()=>{
    const f=fixture();await f.deposit();const g=f.grant('200'),r=f.reward();
    const intent=createFundingIntent(r.id,f.a,{type:'platform_credit',reference:g.grant.id},'hold'),source={type:'platform_credit' as const,reference:g.grant.id,intentId:intent.id};
    db.exec("CREATE TRIGGER synthetic_credit_failure BEFORE INSERT ON platform_credit_consumptions BEGIN SELECT RAISE(ABORT,'synthetic disk failure'); END");
    expect(()=>fundReward(r.id,f.a,source,'fund')).toThrow('synthetic disk failure');
    expect(count('reward_transactions')).toBe(0);expect(count('reward_accounts')).toBe(0);expect(count('reward_funding_evidence')).toBe(0);
    expect(creditGrant(g.grant.id)).toMatchObject({availableStroops:0,reservedStroops:200,consumedStroops:0});
    db.exec('DROP TRIGGER synthetic_credit_failure');
    expect(fundReward(r.id,f.a,source,'fund').status).toBe('funded');
  });
  it('serializes duplicate verified deposits and funding callbacks without creating or overspending value',async()=>{
    const f=fixture(),intent=await createBackingIntent(f.a,'200','Capital','deposit');f.proof(intent,'101');
    await Promise.all(Array.from({length:5},()=>verifyBackingDeposit(intent.id,f.a,'101')));
    expect(count('platform_backing_deposits')).toBe(1);
    const g=f.grant('200'),r=f.reward(),hold=createFundingIntent(r.id,f.a,{type:'platform_credit',reference:g.grant.id},'hold');
    await Promise.all(Array.from({length:5},()=>fundRewardAsync(r.id,f.a,{type:'platform_credit',reference:g.grant.id,intentId:hold.id},'fund')));
    expect(count('reward_transactions')).toBe(2);expect(count('platform_credit_consumptions')).toBe(1);
    expect(creditGrant(g.grant.id)).toMatchObject({availableStroops:0,reservedStroops:0,consumedStroops:200});
  });
  it('enforces a shared database boundary against reusing a direct reward operation as backing',async()=>{
    const f=fixture(),r=f.reward(),intent=createFundingIntent(r.id,f.owner,{type:'stellar'},'direct');f.proof(intent,'703');
    await fundRewardAsync(r.id,f.owner,{type:'stellar',reference:'703',intentId:intent.id},'direct-fund');
    const backing=await createBackingIntent(f.a,'200','Attempted replay','backing');
    expect(()=>db.prepare(`INSERT INTO platform_backing_deposits(id,intent_id,verified_by_user_id,network,operation_id,amount_stroops,transaction_hash,ledger_sequence,ledger_hash,created_at) VALUES (?,?,?,'testnet','703',200,?,50,?,?)`).run(uuid(),backing.id,f.a,'b'.repeat(64),'c'.repeat(64),new Date().toISOString())).toThrow('funding_operation_already_consumed');
    expect(platformPool('testnet').availableStroops).toBe(0);
  });
  it('keeps testnet backing separate from public-network credit availability',async()=>{
    const f=fixture();await f.deposit();f.grant();
    vi.stubEnv('REWARD_STELLAR_NETWORK','public');
    vi.stubEnv('REWARD_TREASURY_PILOT_TOTAL_STROOPS','1000');
    expect(platformPool('public').availableStroops).toBe(0);expect(availablePlatformCredits(f.owner)).toEqual([]);
    expect(()=>requestPlatformCredit(f.a,f.owner,'1','No conversion','public')).toThrowError(expect.objectContaining({code:'INSUFFICIENT_CREDIT'}));
    expect(getFundingAvailability(f.reward().id,f.a).find(o=>o.sourceType==='platform_credit')?.available).toBe(false);
  });
  it('requires a public budget and caps pending requests and approved grants independently of backing', async () => {
    const f = fixture('public');
    await f.deposit('2000000');
    const request = (owner: string, units: string, key: string) => requestPlatformCredit(f.a, owner, units, 'Pilot', key);
    const configure = (units: string) => vi.stubEnv('REWARD_TREASURY_PILOT_TOTAL_STROOPS', units);
    for (const units of ['', '0', '0.1', '1000\n', '9007199254740992']) {
      configure(units);
      expect(() => request(f.owner, '1', 'first')).toThrowError(expect.objectContaining({code:'TREASURY_PILOT_UNAVAILABLE'}));
    }
    configure('1000000');
    const reserved = request(f.owner, '700000', 'first');
    expect(() => request(f.other, '300001', 'over')).toThrowError(expect.objectContaining({code:'TREASURY_PILOT_LIMIT_EXCEEDED'}));
    const pending = request(f.other, '300000', 'second');
    configure('750000');
    const approved = approvePlatformCredit(reserved.id, f.b, 'approve-first', 'Reviewed');
    expect(() => approvePlatformCredit(pending.id, f.b, 'approve-second', 'Reviewed'))
      .toThrowError(expect.objectContaining({code:'TREASURY_PILOT_LIMIT_EXCEEDED'}));
    configure('');
    expect(approvePlatformCredit(reserved.id, f.b, 'approve-first', 'Reviewed')).toEqual(approved);
    expect(() => approvePlatformCredit(pending.id, f.b, 'approve-second', 'Reviewed'))
      .toThrowError(expect.objectContaining({code:'TREASURY_PILOT_UNAVAILABLE'}));
    expect(platformPool('public')).toMatchObject({allocatedStroops:700000, reservedStroops:300000});
  });
  it('caps a learner across two public credit funders at activation and release', async () => {
    const f = fixture('public');
    vi.stubEnv('REWARD_TREASURY_PILOT_TOTAL_STROOPS', '3000000');
    await f.deposit('3000000');
    const learner = uuid();
    db.prepare("INSERT INTO users(id,name,email,password_hash,role) VALUES (?,'Synthetic learner',?,'hash','student')")
      .run(learner, `${learner}@test.invalid`);
    for (const cohort of f.cohorts.values()) {
      db.prepare('INSERT INTO cohort_members(cohort_id,user_id) VALUES (?,?)').run(cohort, learner);
    }
    function funded(owner: string, units: string) {
      const request = requestPlatformCredit(f.a, owner, units, 'Pilot', uuid());
      const grant = approvePlatformCredit(request.id, f.b, uuid(), 'Reviewed') as {id:string};
      const reward = f.reward(owner, units);
      const intent = createFundingIntent(reward.id, f.a, {type:'platform_credit',reference:grant.id}, uuid());
      return fundReward(reward.id, f.a, {type:'platform_credit',reference:grant.id,intentId:intent.id}, uuid());
    }
    const first = funded(f.owner, '700000'), over = funded(f.other, '300001'), exact = funded(f.other, '300000');
    activateReward(first.id, f.owner, uuid());
    expect(() => activateReward(over.id, f.other, uuid()))
      .toThrowError(expect.objectContaining({code:'TREASURY_PILOT_LIMIT_EXCEEDED'}));
    expect(count('reward_allocations')).toBe(1);
    activateReward(exact.id, f.other, uuid());
    vi.stubEnv('REWARD_STELLAR_NETWORK', 'testnet');
    db.exec("UPDATE reward_allocations SET status='eligible'");
    const allocationId = (rewardId: string) => (db.prepare('SELECT id FROM reward_allocations WHERE reward_id=?').get(rewardId) as {id:string}).id;
    releaseAllocation(allocationId(first.id), f.owner, uuid(), first.id);
    // Model an oversized allocation that predates enforcement and reaches the release path.
    db.prepare('UPDATE reward_allocations SET amount_stroops=300001 WHERE reward_id=?').run(exact.id);
    expect(() => releaseAllocation(allocationId(exact.id), f.other, uuid(), exact.id))
      .toThrowError(expect.objectContaining({code:'TREASURY_PILOT_LIMIT_EXCEEDED'}));
    db.prepare('UPDATE reward_allocations SET amount_stroops=300000 WHERE reward_id=?').run(exact.id);
    expect(releaseAllocation(allocationId(exact.id), f.other, uuid(), exact.id).status).toBe('released');
    expect(db.prepare("SELECT SUM(amount_stroops) AS n FROM reward_allocations WHERE status='released'").get()).toEqual({n:1000000});
  });
  it('refuses a backing operation at the direct reward evidence database boundary too',async()=>{
    const f=fixture();await f.deposit();const r=f.reward(),intent=createFundingIntent(r.id,f.owner,{type:'stellar'},'direct');
    expect(()=>db.transaction(()=>{
      const ledger=uuid();
      // Simulate an older writer reaching the SQL boundary. The entire forged
      // write is rolled back when the cross-domain operation claim is refused.
      db.prepare(`INSERT INTO reward_transactions(id,reward_id,source_account_type,destination_account_type,destination_bucket,destination_user_id,actor_type,actor_user_id,transaction_type,amount_stroops,previous_state,new_state,funding_source_type,funding_reference,idempotency_key)
        VALUES (?,?,'external','funder','available',?,'user',?,'fund',200,'draft','pending_funding','stellar','stellar:testnet:101',?)`).run(ledger,r.id,f.owner,f.owner,uuid());
      db.prepare(`INSERT INTO reward_funding_evidence(id,intent_id,ledger_transaction_id,source_type,network,reference,verification_method)
        VALUES (?,?,?,'stellar','testnet','101','synthetic_old_writer')`).run(uuid(),intent.id,ledger);
    }).immediate()).toThrow('funding_operation_already_consumed');
    expect(count('reward_transactions')).toBe(0);expect(count('reward_funding_evidence')).toBe(0);
    expect(platformPool('testnet').availableStroops).toBe(1000);
  });
  it('rejects noninteger, unsafe and missing authorization inputs',async()=>{
    const f=fixture();
    for(const value of ['0','-1','1.1','1e3','0x10','9007199254740992',100]) await expect(createBackingIntent(f.a,value,'Capital',uuid())).rejects.toMatchObject({code:'INVALID_AMOUNT'});
    await expect(createBackingIntent(f.a,'1','','bad-reason')).rejects.toMatchObject({statusCode:400});
    await expect(createBackingIntent(f.a,'1','Capital',' ')).rejects.toMatchObject({statusCode:400});
    expect(count('platform_backing_intents')).toBe(0);
  });
  it('rechecks account deletion restrictions after an asynchronous backing verification',async()=>{
    const f=fixture(),intent=await createBackingIntent(f.a,'1000','Capital','deposit');f.proof(intent,'101');
    const original=f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async url=>{
      if(new URL(url).pathname==='/ledgers/50') db.prepare("UPDATE users SET deletion_status='pending_deletion' WHERE id=?").run(f.a);
      return original(url);
    });
    await expect(verifyBackingDeposit(intent.id,f.a,'101')).rejects.toMatchObject({statusCode:403});
    expect(count('platform_backing_deposits')).toBe(0);expect(platformPool('testnet').availableStroops).toBe(0);
  });
  it('preserves legal-hold access while refusing credit allocation to a pending-deletion beneficiary',async()=>{
    const f=fixture();await f.deposit();
    db.prepare("UPDATE users SET deletion_status='legal_hold' WHERE id=?").run(f.owner);
    const approved=f.grant('200');expect(creditGrant(approved.grant.id)?.availableStroops).toBe(200);
    db.prepare("UPDATE users SET deletion_status='pending_deletion' WHERE id=?").run(f.owner);
    expect(availablePlatformCredits(f.owner)).toEqual([]);
    expect(()=>requestPlatformCredit(f.a,f.owner,'100','No','denied')).toThrowError(expect.objectContaining({statusCode:403}));
    expect(platformPool('testnet').allocatedStroops).toBe(200);
  });
});
