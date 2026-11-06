import {v4 as uuid} from 'uuid';
import {createHash} from 'node:crypto';
import {db} from '../../config/database.js';
import {hasPermission} from '../../middleware/rbac.js';
import {RewardError} from './rewardErrors.js';
import {MAX_SAFE_STROOPS} from './currencyConfig.js';
import {stellarFundingConfiguration} from './stellarFundingConfig.js';
import {stellarReceiverReadiness, verifyStellarFunding} from './stellarFundingVerification.js';

type Network = 'public' | 'testnet';
type BackingIntent = {id:string;requester_user_id:string;network:Network;destination:string;memo_hash:string;amount_stroops:number;reason:string;idempotency_key:string;created_at:string;expires_at:string};
type CreditRequest = {id:string;requester_user_id:string;beneficiary_user_id:string;network:Network;amount_stroops:number;reason:string;idempotency_key:string;status:string;expires_at:string};
export type CreditGrant = {id:string;request_id:string;beneficiary_user_id:string;network:Network;amount_stroops:number;availableStroops:number;reservedStroops:number;consumedStroops:number};
const now = () => new Date(Date.now()).toISOString();
const expires = () => new Date(Date.now()+30*60_000).toISOString();
function activeUser(user:string):boolean {
  const row=db.prepare('SELECT deletion_status FROM users WHERE id=?').get(user) as {deletion_status:string|null}|undefined;
  return !!row && row.deletion_status!=='pending_deletion' && row.deletion_status!=='finalized';
}
function manage(actor:string) {if (!activeUser(actor) || !hasPermission(actor,'reward.manage')) throw new RewardError('SCOPE_DENIED','Current reward management access is required.',403);}
function text(value:unknown, label:string, max=200): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length>max) throw new RewardError('INVALID_FUNDING_SOURCE',`Provide a valid ${label}.`,400);
}
function amount(value:unknown):number {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || value.length>16 || BigInt(value)>MAX_SAFE_STROOPS) throw new RewardError('INVALID_AMOUNT','Use positive integer stroops within the safe limit.',400);
  return Number(value);
}
function conflict():never {throw new RewardError('IDEMPOTENCY_CONFLICT','The key is already bound to another financial operation.',409);}
function audit(event:string, object:string, actor:string, network:Network, quantity:number, reason:string) {
  db.prepare('INSERT INTO platform_credit_audit(id,event_type,object_id,actor_user_id,network,amount_stroops,reason,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(uuid(),event,object,actor,network,quantity,reason,now());
}
function total(sql:string,...params:unknown[]):number {return (db.prepare(sql).get(...params) as {n:number}).n;}
function beneficiary(user:string) {
  if (!activeUser(user) || !hasPermission(user,'reward.fund')) throw new RewardError('SCOPE_DENIED','Beneficiary must have current reward funding access.',403);
}

// Backing is an asset pool, not another user reward balance. Approved grants
// partition that capital; reward consumption moves an entitlement into the
// existing fund/reserve ledger, never back into the unallocated pool.
export function platformPool(network:Network) {
  const deposited=total('SELECT COALESCE(SUM(amount_stroops),0) n FROM platform_backing_deposits WHERE network=?',network);
  const allocated=total(`SELECT COALESCE(SUM(r.amount_stroops),0) n FROM platform_credit_grants g JOIN platform_credit_requests r ON r.id=g.request_id WHERE r.network=?`,network);
  const reserved=total("SELECT COALESCE(SUM(amount_stroops),0) n FROM platform_credit_requests WHERE network=? AND status='pending' AND expires_at>?",network,now());
  return {network,currency:'XLM',depositedStroops:deposited,allocatedStroops:allocated,reservedStroops:reserved,availableStroops:deposited-allocated-reserved};
}
export function platformCreditSummary(actor:string) {
  manage(actor);
  return {
    pools:[platformPool('testnet'),platformPool('public')],
    requests:db.prepare(`SELECT *,CASE WHEN status='pending' AND expires_at<=? THEN 'expired' ELSE status END effective_status
      FROM platform_credit_requests ORDER BY created_at DESC,id DESC LIMIT 100`).all(now()),
    backingIntents:db.prepare(`SELECT i.*,d.id deposit_id,d.operation_id,
      CASE WHEN d.id IS NOT NULL THEN 'verified' WHEN i.expires_at<=? THEN 'expired' ELSE 'awaiting_deposit' END effective_status
      FROM platform_backing_intents i LEFT JOIN platform_backing_deposits d ON d.intent_id=i.id ORDER BY i.created_at DESC,i.id DESC LIMIT 100`).all(now()),
    reservations:db.prepare(`SELECT c.*,i.reward_id,i.owner_user_id,i.actor_user_id,
      CASE WHEN c.status='held' AND c.expires_at<=? THEN 'expired' ELSE c.status END effective_status
      FROM platform_credit_reservations c JOIN reward_funding_intents i ON i.id=c.intent_id ORDER BY c.created_at DESC,c.intent_id DESC LIMIT 100`).all(now()),
    audit:db.prepare('SELECT * FROM platform_credit_audit ORDER BY created_at DESC,id DESC LIMIT 100').all(),
  };
}

export async function createBackingIntent(actor:string, quantity:unknown, reason:unknown, key:unknown):Promise<BackingIntent> {
  manage(actor);const units=amount(quantity);text(reason,'reason',500);text(key,'idempotency key');
  const existing=db.prepare('SELECT * FROM platform_backing_intents WHERE requester_user_id=? AND idempotency_key=?').get(actor,key) as BackingIntent|undefined;
  if (existing) {if(existing.amount_stroops!==units || existing.reason!==reason) conflict();return existing;}
  const config=stellarFundingConfiguration();
  if (!config) throw new RewardError('FUNDING_UNVERIFIED','Stellar backing deposits are not configured.',402);
  const ready=await stellarReceiverReadiness(config), current=stellarFundingConfiguration();
  if (!ready.ready || current?.network!==config.network || current.destination!==config.destination) throw new RewardError('FUNDING_UNVERIFIED',ready.reason??'Funding configuration changed.',503);
  return db.transaction(()=>{
    manage(actor);
    const prior=db.prepare('SELECT * FROM platform_backing_intents WHERE requester_user_id=? AND idempotency_key=?').get(actor,key) as BackingIntent|undefined;
    if(prior){if(prior.amount_stroops!==units || prior.reason!==reason) conflict();return prior;}
    const id=uuid(), memo=createHash('sha256').update(JSON.stringify(['platform-backing-v1',id,actor,config.network,config.destination,units])).digest('hex');
    db.prepare(`INSERT INTO platform_backing_intents(id,requester_user_id,network,destination,memo_hash,amount_stroops,reason,idempotency_key,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id,actor,config.network,config.destination,memo,units,reason,key,expires(),now());
    audit('deposit_intent',id,actor,config.network,units,reason);
    return db.prepare('SELECT * FROM platform_backing_intents WHERE id=?').get(id) as BackingIntent;
  }).immediate();
}

export async function verifyBackingDeposit(id:string, actor:string, operationId:string) {
  manage(actor);text(id,'backing intent');text(operationId,'operation ID');
  const intent=db.prepare('SELECT * FROM platform_backing_intents WHERE id=?').get(id) as BackingIntent|undefined;
  if(!intent) throw new RewardError('FUNDING_UNVERIFIED','Backing intent not found.',404);
  const prior=db.prepare('SELECT * FROM platform_backing_deposits WHERE intent_id=?').get(id) as {operation_id:string}|undefined;
  if(prior){if(prior.operation_id!==operationId) conflict();return prior;}
  const proof=await verifyStellarFunding({network:intent.network,destination:intent.destination,memoHash:intent.memo_hash,amountStroops:intent.amount_stroops,createdAt:intent.created_at,expiresAt:intent.expires_at},operationId);
  return db.transaction(()=>{
    manage(actor);
    const replay=db.prepare('SELECT * FROM platform_backing_deposits WHERE intent_id=?').get(id) as {operation_id:string}|undefined;
    if(replay){if(replay.operation_id!==operationId) conflict();return replay;}
    if(intent.expires_at<=now()) throw new RewardError('FUNDING_UNVERIFIED','Backing intent expired.',409);
    if(BigInt(platformPool(intent.network).depositedStroops)+BigInt(intent.amount_stroops)>MAX_SAFE_STROOPS) throw new RewardError('AMOUNT_EXCEEDS_MAXIMUM','Backing pool exceeds the safe integer limit.',400);
    const deposit=uuid();
    try {
      db.prepare(`INSERT INTO platform_backing_deposits(id,intent_id,verified_by_user_id,network,operation_id,amount_stroops,transaction_hash,ledger_sequence,ledger_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(deposit,id,actor,intent.network,proof.operationId,intent.amount_stroops,proof.transactionHash,proof.ledger,proof.ledgerHash,now());
    } catch(err) {
      if((err as {code?:string}).code==='SQLITE_CONSTRAINT_UNIQUE' || (err instanceof Error && err.message==='funding_operation_already_consumed')) throw new RewardError('DUPLICATE_REFERENCE','This verified operation was already consumed.',409);
      throw err;
    }
    audit('deposit_verified',deposit,actor,intent.network,intent.amount_stroops,intent.reason);
    return db.prepare('SELECT * FROM platform_backing_deposits WHERE id=?').get(deposit);
  }).immediate();
}

export function requestPlatformCredit(actor:string, owner:unknown, quantity:unknown, reason:unknown, key:unknown) {
  manage(actor);text(owner,'beneficiary');const units=amount(quantity);text(reason,'reason',500);text(key,'idempotency key');
  if(actor===owner) throw new RewardError('CONFLICT_OF_INTEREST','The requester cannot be the beneficiary.',403);
  beneficiary(owner);
  return db.transaction(()=>{
    manage(actor);beneficiary(owner);
    const previous=db.prepare('SELECT * FROM platform_credit_requests WHERE requester_user_id=? AND idempotency_key=?').get(actor,key) as CreditRequest|undefined;
    if(previous){if(previous.beneficiary_user_id!==owner || previous.amount_stroops!==units || previous.reason!==reason) conflict();return previous;}
    const config=stellarFundingConfiguration();if(!config) throw new RewardError('INSUFFICIENT_CREDIT','No backing network is configured.',402);
    if(platformPool(config.network).availableStroops<units) throw new RewardError('INSUFFICIENT_CREDIT','Insufficient unallocated verified backing.',402);
    const id=uuid();
    db.prepare(`INSERT INTO platform_credit_requests(id,requester_user_id,beneficiary_user_id,network,amount_stroops,reason,idempotency_key,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id,actor,owner,config.network,units,reason,key,expires(),now());
    audit('credit_requested',id,actor,config.network,units,reason);
    return db.prepare('SELECT * FROM platform_credit_requests WHERE id=?').get(id) as CreditRequest;
  }).immediate();
}

export function approvePlatformCredit(id:string,actor:string,key:unknown,reason:unknown) {
  manage(actor);text(key,'approval key');text(reason,'approval reason',500);
  return db.transaction(()=>{
    manage(actor);const request=db.prepare('SELECT * FROM platform_credit_requests WHERE id=?').get(id) as CreditRequest|undefined;
    if(!request) throw new RewardError('FUNDING_UNVERIFIED','Credit request not found.',404);
    if(actor===request.requester_user_id || actor===request.beneficiary_user_id) throw new RewardError('CONFLICT_OF_INTEREST','Approval requires an independent administrator.',403);
    beneficiary(request.beneficiary_user_id);
    const previous=db.prepare('SELECT * FROM platform_credit_grants WHERE approved_by_user_id=? AND approval_key=?').get(actor,key) as {request_id:string;reason:string}|undefined;
    if(previous){if(previous.request_id!==id || previous.reason!==reason) conflict();return previous;}
    if(request.status!=='pending' || request.expires_at<=now()) throw new RewardError('FUNDING_UNVERIFIED','Credit request is closed or expired.',409);
    const grant=uuid();db.prepare('INSERT INTO platform_credit_grants(id,request_id,approved_by_user_id,approval_key,reason,created_at) VALUES (?,?,?,?,?,?)').run(grant,id,actor,key,reason,now());
    db.prepare("UPDATE platform_credit_requests SET status='approved' WHERE id=?").run(id);
    audit('credit_approved',grant,actor,request.network,request.amount_stroops,reason);
    return db.prepare('SELECT * FROM platform_credit_grants WHERE id=?').get(grant);
  }).immediate();
}

export function cancelPlatformCreditRequest(id:string,actor:string,reason:unknown) {
  manage(actor);text(reason,'cancellation reason',500);
  return db.transaction(()=>{
    manage(actor);const request=db.prepare('SELECT * FROM platform_credit_requests WHERE id=?').get(id) as CreditRequest|undefined;
    if(!request) throw new RewardError('FUNDING_UNVERIFIED','Credit request not found.',404);
    if(request.status==='cancelled') return request;
    if(request.status!=='pending') throw new RewardError('FUNDING_UNVERIFIED','Credit request is already approved.',409);
    db.prepare("UPDATE platform_credit_requests SET status='cancelled' WHERE id=?").run(id);
    audit('request_cancelled',id,actor,request.network,request.amount_stroops,reason);return {...request,status:'cancelled'};
  }).immediate();
}

export function creditGrant(id:string):CreditGrant|undefined {
  const grant=db.prepare(`SELECT g.id,g.request_id,r.beneficiary_user_id,r.network,r.amount_stroops FROM platform_credit_grants g JOIN platform_credit_requests r ON r.id=g.request_id WHERE g.id=?`).get(id) as CreditGrant|undefined;
  if(!grant) return;
  const consumed=total("SELECT COALESCE(SUM(amount_stroops),0) n FROM platform_credit_reservations WHERE grant_id=? AND status='consumed'",id);
  const held=total("SELECT COALESCE(SUM(amount_stroops),0) n FROM platform_credit_reservations WHERE grant_id=? AND status='held' AND expires_at>?",id,now());
  return {...grant,availableStroops:grant.amount_stroops-consumed-held,reservedStroops:held,consumedStroops:consumed};
}
export function availablePlatformCredits(owner:string):CreditGrant[] {
  if(!activeUser(owner) || !hasPermission(owner,'reward.fund')) return [];
  const network=stellarFundingConfiguration()?.network;if(!network) return [];
  const ids=db.prepare(`SELECT g.id FROM platform_credit_grants g JOIN platform_credit_requests r ON r.id=g.request_id WHERE r.beneficiary_user_id=? AND r.network=?`).all(owner,network) as {id:string}[];
  return ids.map(row=>creditGrant(row.id)!).filter(row=>row.availableStroops>0);
}
export function listPlatformCredits(actor:string,owner:string) {
  manage(actor);text(owner,'beneficiary');
  const ids=db.prepare(`SELECT g.id FROM platform_credit_grants g JOIN platform_credit_requests r ON r.id=g.request_id WHERE r.beneficiary_user_id=?`).all(owner) as {id:string}[];
  return ids.map(row=>creditGrant(row.id)!);
}
export function assertPlatformCredit(actor:string,owner:string,reference:string|undefined,units?:number) {
  manage(actor);if(actor===owner) throw new RewardError('CONFLICT_OF_INTEREST','Funding requires an independent administrator.',403);
  beneficiary(owner);
  const grant=typeof reference==='string'?creditGrant(reference):undefined;
  if(!grant || grant.beneficiary_user_id!==owner || grant.network!==stellarFundingConfiguration()?.network || (units!==undefined && grant.availableStroops<units)) throw new RewardError('INSUFFICIENT_CREDIT','Insufficient backed platform credit for this owner and network.',402);
  return grant;
}
export function reservePlatformCredit(intent:{id:string;actor_user_id:string;owner_user_id:string;reference:string|null;amount_stroops:number;expires_at:string}) {
  if(!db.inTransaction) throw new Error('Credit reservation requires the funding transaction');
  const grant=assertPlatformCredit(intent.actor_user_id,intent.owner_user_id,intent.reference??undefined,intent.amount_stroops);
  db.prepare('INSERT INTO platform_credit_reservations(intent_id,grant_id,amount_stroops,expires_at,created_at) VALUES (?,?,?,?,?)')
    .run(intent.id,grant.id,intent.amount_stroops,intent.expires_at,now());
  audit('credit_reserved',intent.id,intent.actor_user_id,grant.network,intent.amount_stroops,'Reward funding intent reservation');
}
export function checkPlatformReservation(intent:{id:string;actor_user_id:string;owner_user_id:string;reference:string|null;amount_stroops:number;network:string}) {
  manage(intent.actor_user_id);if(intent.actor_user_id===intent.owner_user_id) throw new RewardError('CONFLICT_OF_INTEREST','Funding requires an independent administrator.',403);
  beneficiary(intent.owner_user_id);
  const row=db.prepare('SELECT * FROM platform_credit_reservations WHERE intent_id=?').get(intent.id) as {grant_id:string;status:string;amount_stroops:number;expires_at:string}|undefined;
  const grant=row?creditGrant(row.grant_id):undefined;
  if(!row || !grant || row.status!=='held' || row.expires_at<=now() || grant.beneficiary_user_id!==intent.owner_user_id || grant.id!==intent.reference || grant.network!==intent.network || row.amount_stroops!==intent.amount_stroops) throw new RewardError('INSUFFICIENT_CREDIT','Credit reservation is unavailable or expired.',402);
  return row;
}
export function consumePlatformCredit(intent:Parameters<typeof checkPlatformReservation>[0],evidenceId:string,transactionId:string) {
  if(!db.inTransaction) throw new Error('Credit consumption requires the funding transaction');
  checkPlatformReservation(intent);
  db.prepare('INSERT INTO platform_credit_consumptions(intent_id,evidence_id,fund_transaction_id,created_at) VALUES (?,?,?,?)').run(intent.id,evidenceId,transactionId,now());
  db.prepare("UPDATE platform_credit_reservations SET status='consumed' WHERE intent_id=?").run(intent.id);
  audit('credit_consumed',intent.id,intent.actor_user_id,intent.network as Network,intent.amount_stroops,'Backed reward funding committed');
}
export function releasePlatformCreditReservation(id:string,actor:string) {
  manage(actor);return db.transaction(()=>{
    manage(actor);const row=db.prepare(`SELECT c.*,i.actor_user_id,i.owner_user_id,i.network FROM platform_credit_reservations c JOIN reward_funding_intents i ON i.id=c.intent_id WHERE c.intent_id=?`).get(id) as {status:string;amount_stroops:number;network:Network}|undefined;
    if(!row) throw new RewardError('FUNDING_UNVERIFIED','Credit reservation not found.',404);
    if(row.status==='released') return {released:true};
    if(row.status!=='held') throw new RewardError('FUNDING_UNVERIFIED','Consumed credit cannot be released.',409);
    db.prepare("UPDATE platform_credit_reservations SET status='released' WHERE intent_id=?").run(id);
    audit('reservation_released',id,actor,row.network,row.amount_stroops,'Unconsumed funding reservation cancelled');return {released:true};
  }).immediate();
}
