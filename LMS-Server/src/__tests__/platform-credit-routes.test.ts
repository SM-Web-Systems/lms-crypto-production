import {describe,it,expect,vi,afterEach} from 'vitest';
import './setup.js';
import request from 'supertest';
import {Keypair,Networks} from '@stellar/stellar-sdk';
import {v4 as uuid} from 'uuid';
import app from '../app.js';
import {db} from '../config/database.js';
import {makeToken} from './helpers/auth.js';
import {createReward} from '../services/rewards/rewardService.js';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function fixture(){
  const a=uuid(),b=uuid(),owner=uuid(),course=uuid(),cohort=uuid(),destination=Keypair.random().publicKey();
  for(const [id,role] of [[a,'admin'],[b,'admin'],[owner,'lecturer']]) {
    db.prepare("INSERT INTO users(id,name,email,password_hash,role) VALUES (?,'Synthetic',?,'hash',?)").run(id,`${id}@test.invalid`,role);
  }
  db.prepare("INSERT INTO user_roles(user_id,role_id) VALUES (?,'role_sponsor')").run(owner);
  db.prepare("INSERT INTO courses(id,title,course_code) VALUES (?,'Credit',?)").run(course,course);
  db.prepare("INSERT INTO sponsor_cohorts(id,sponsor_user_id,course_id,name) VALUES (?,?,?,'Credit')").run(cohort,owner,course);
  vi.stubEnv('REWARD_STELLAR_NETWORK','testnet');vi.stubEnv('REWARD_STELLAR_DESTINATION',destination);
  let intent:any;
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    const path=new URL(url).pathname,time=intent?new Date(Math.floor(Date.parse(intent.created_at)/1000)*1000).toISOString():'';
    const body=path==='/'?{network_passphrase:Networks.TESTNET,history_latest_ledger:50}:path.startsWith('/accounts/')?{account_id:destination}
      :path==='/operations/101'?{id:'101',type:'payment',transaction_successful:true,to:destination,asset_type:'native',amount:'0.0001000',transaction_hash:'b'.repeat(64)}
      :path.startsWith('/transactions/')?{hash:'b'.repeat(64),successful:true,ledger:50,created_at:time,memo_type:'hash',memo:Buffer.from(intent.memo_hash,'hex').toString('base64')}
      :{sequence:50,hash:'c'.repeat(64),closed_at:time};
    return new Response(JSON.stringify(body),{status:200});
  }));
  const token=(id:string)=>`Bearer ${makeToken({userId:id,email:`${id}@test.invalid`,role:id===owner?'lecturer':'admin'})}`;
  return {a,b,owner,cohort,token,setIntent:(value:unknown)=>{intent=value;}};
}
const base='/api/v1/admin/rewards/platform-credit';
describe('platform credit administrative API',()=>{
  it('denies anonymous and non-management users without exposing treasury state',async()=>{
    const f=fixture();
    expect((await request(app).get(base)).status).toBe(401);
    expect((await request(app).get(base).set('Authorization',f.token(f.owner))).status).toBe(403);
    expect((await request(app).get(`${base}/reconciliation/testnet`)).status).toBe(401);
    expect((await request(app).get(`${base}/reconciliation/testnet`).set('Authorization',f.token(f.owner))).status).toBe(403);
    expect((await request(app).post(`${base}/deposit-intents`).set('Authorization',f.token(f.owner)).send({amountStroops:'1000',reason:'Not authorized',idempotencyKey:'no'})).status).toBe(403);
    expect(db.prepare('SELECT COUNT(*) n FROM platform_backing_intents').get()).toEqual({n:0});
  });
  it('provisions only from verified backing, requires independent approval and funds through the existing portal contract',async()=>{
    const f=fixture(),post=(path:string,actor:string,data:unknown)=>request(app).post(path).set('Authorization',f.token(actor)).send(data);
    const deposit=await post(`${base}/deposit-intents`,f.a,{amountStroops:'1000',reason:'Capital',idempotencyKey:'deposit',verified:true,availableStroops:1000000});
    expect(deposit.status).toBe(200);f.setIntent(deposit.body.data);
    const noBacking=await post(`${base}/requests`,f.a,{beneficiaryUserId:f.owner,amountStroops:'600',reason:'Budget',idempotencyKey:'request'});
    expect(noBacking.status).toBe(402);
    expect((await post(`${base}/deposit-intents/${deposit.body.data.id}/verify`,f.a,{operationId:'101'})).status).toBe(200);
    const proposal=await post(`${base}/requests`,f.a,{beneficiaryUserId:f.owner,amountStroops:'600',reason:'Budget',idempotencyKey:'request'});
    expect(proposal.status).toBe(200);
    expect((await post(`${base}/requests/${proposal.body.data.id}/approve`,f.a,{idempotencyKey:'approve',reason:'Self'})).status).toBe(403);
    const approved=await post(`${base}/requests/${proposal.body.data.id}/approve`,f.b,{idempotencyKey:'approve',reason:'Independent review'});
    expect(approved.status).toBe(200);
    const reward=createReward(f.owner,{scopeType:'sponsor_cohort',scopeId:f.cohort,rewardType:'custom',amountStroops:'200',idempotencyKey:uuid()});
    const url=`/api/v1/sponsor/rewards/${reward.id}`;
    const options=await request(app).get(`${url}/funding-options`).set('Authorization',f.token(f.a));
    expect(options.body.data.find((o:any)=>o.sourceType==='platform_credit')).toMatchObject({available:true,creditGrants:[{id:approved.body.data.id,availableStroops:600}]});
    const intent=await post(`${url}/funding-intents`,f.a,{sourceType:'platform_credit',reference:approved.body.data.id,idempotencyKey:'reserve'});
    expect(intent.status).toBe(201);
    for(let retry=0;retry<2;retry++) expect((await post(`${url}/fund`,f.a,{sourceType:'platform_credit',reference:approved.body.data.id,intentId:intent.body.data.id,idempotencyKey:'fund'})).status).toBe(200);
    const grants=await request(app).get(`${base}/credits/${f.owner}`).set('Authorization',f.token(f.b));
    expect(grants.body.data[0]).toMatchObject({availableStroops:400,reservedStroops:0,consumedStroops:200});
    const summary=await request(app).get(base).set('Authorization',f.token(f.b));
    expect(summary.status).toBe(200);
    expect(summary.body.data.pools.find((pool:any)=>pool.network==='testnet')).toMatchObject({depositedStroops:1000,allocatedStroops:600,availableStroops:400});
    expect(summary.body.data.backingIntents[0].effective_status).toBe('verified');
    expect(summary.body.data.reservations[0].effective_status).toBe('consumed');
    expect(summary.body.data.audit).toHaveLength(6);
    expect(db.prepare('SELECT COUNT(*) n FROM reward_transactions').get()).toEqual({n:2});

    const reconcile = (network: string) => request(app).get(`${base}/reconciliation/${network}`).set('Authorization',f.token(f.b));
    expect((await reconcile('unknown')).status).toBe(400);
    const report = await reconcile('testnet');
    expect(report.status).toBe(200);
    expect(report.headers['cache-control']).toBe('no-store');
    expect(report.body.data).toMatchObject({
      network:'testnet', depositedStroops:1000, allocatedStroops:600, reservedStroops:0,
      availableStroops:400, heldGrantStroops:'0', consumedGrantStroops:'200',
      unreservedGrantStroops:'400', internalLedgerBalanced:true,
    });
    for (const value of [f.owner, f.a, f.b, f.token(f.b), approved.body.data.id, intent.body.data.id]) {
      expect(report.text).not.toContain(value);
    }
    expect((await reconcile('public')).body.data).toMatchObject({
      depositedStroops:0, consumedGrantStroops:'0', internalLedgerBalanced:true,
    });

    // Model pre-existing bad evidence in this disposable database only.
    db.exec('DROP TRIGGER reward_funding_evidence_no_update');
    db.prepare("UPDATE reward_funding_evidence SET reference='misbound' WHERE intent_id=?").run(intent.body.data.id);
    const anomaly = await reconcile('testnet');
    expect(anomaly.body.data).toMatchObject({
      internalLedgerBalanced:false, exceptionCounts:{consumptionBinding:1},
    });
    expect(anomaly.text).not.toContain('misbound');
    expect(db.prepare('SELECT COUNT(*) n FROM reward_transactions').get()).toEqual({n:2});
  });
});
