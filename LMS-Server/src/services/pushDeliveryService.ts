import { randomUUID } from 'node:crypto';
import { db } from '../config/database.js';
import { isWriterHoldActive } from './writerHold.js';
import { pushConfiguration } from './pushInstallationService.js';
import logger from '../utils/logger.js';

export interface PushMessage {
  to: string; title: string; body: string; sound: 'default'; channelId: 'lms-updates'; ttl: number;
  data: { notificationId: string; installationId: string; generation: number };
}
export interface PushResult { status: 'ok'|'error'; id?: string; details?: {error?: string} }
export interface PushProvider {
  send(message: PushMessage): Promise<PushResult>;
  receipt(ticket: string): Promise<PushResult|null>;
}
class ProviderError extends Error {
  constructor(public code: string, public retryable = true) { super(code); }
}
const safeErrors = new Set(['DeviceNotRegistered','MessageRateExceeded','MessageTooBig','InvalidCredentials','InvalidProviderResponse','ProviderUnavailable','ReceiptUnavailable','DeliveryExpired']);
function errorCode(value: unknown) { return typeof value === 'string' && safeErrors.has(value) ? value : 'ProviderUnavailable'; }
/** Fixed official endpoints, no redirects, bounded response and deadline. Never log tokens or provider bodies. */
async function expoRequest(endpoint: 'send'|'getReceipts', body: unknown): Promise<unknown> {
  try {
    const res = await fetch(`https://exp.host/--/api/v2/push/${endpoint}`, {
      method:'POST', redirect:'error', signal:AbortSignal.timeout(10_000),
      headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:`Bearer ${pushConfiguration().accessToken}`},
      body:JSON.stringify(body),
    });
    if (!res.ok) throw new ProviderError('ProviderUnavailable', res.status === 429 || res.status >= 500);
    if (!res.body) throw new ProviderError('InvalidProviderResponse');
    const reader = res.body.getReader(); const chunks:Uint8Array[]=[]; let length=0;
    try {
      for (;;) {
        const {done,value}=await reader.read(); if(done)break;
        length+=value.length; if(length>48*1024)throw new ProviderError('InvalidProviderResponse'); chunks.push(value);
      }
    } finally { await reader.cancel().catch(()=>{}); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { if(error instanceof ProviderError)throw error; throw new ProviderError('ProviderUnavailable'); }
}
function result(value: unknown): PushResult {
  if (!value || typeof value !== 'object' || !('status' in value) || !['ok','error'].includes(String(value.status))) throw new ProviderError('InvalidProviderResponse');
  return value as PushResult;
}
export const expoPushProvider: PushProvider = {
  async send(message) {
    const response=await expoRequest('send',message) as {data?:unknown};
    const ticket=result(response?.data);
    if(ticket.status==='ok' && (typeof ticket.id!=='string' || ticket.id.length>200 || !ticket.id.length))throw new ProviderError('InvalidProviderResponse');
    return ticket;
  },
  async receipt(ticket) {
    const response=await expoRequest('getReceipts',{ids:[ticket]}) as {data?:Record<string,unknown>};
    if(!response?.data || typeof response.data!=='object' || Array.isArray(response.data))throw new ProviderError('InvalidProviderResponse');
    return response.data[ticket] ? result(response.data[ticket]) : null;
  },
};
type Delivery = {id:string;notification_id:string;installation_id:string;generation:number;state:string;attempts:number;
  receipt_attempts:number;ticket_id:string|null;expires_at:number;claim_id:string;lease_until:number};
function destination(row:Delivery, now:number): {expo_token:string}|undefined {
  return db.prepare(`SELECT i.expo_token FROM push_installations i
    JOIN users u ON u.id=i.user_id JOIN active_sessions s ON s.token_hash=i.session_hash AND s.user_id=u.id
    JOIN notifications n ON n.id=? AND n.user_id=u.id
    WHERE i.id=? AND i.generation=? AND i.enabled=1 AND i.lease_expires_at>?
      AND i.project_id=? AND u.authorization_version=i.authorization_version
      AND (u.deletion_status IS NULL OR u.deletion_status='legal_hold')
      AND (u.password_changed_at IS NULL OR unixepoch(u.password_changed_at)<=i.token_issued_at)
      AND s.revoked_at IS NULL AND unixepoch(s.expires_at)*1000>?
      AND n.read=0 AND NOT EXISTS (SELECT 1 FROM notification_preferences p WHERE p.user_id=u.id AND p.type=n.type AND p.enabled=0)`)
    .get(row.notification_id,row.installation_id,row.generation,now,pushConfiguration().projectId,now) as {expo_token:string}|undefined;
}
function claim(now:number):Delivery|undefined {
  return db.transaction(()=>{
    const row=db.prepare(`SELECT * FROM push_outbox WHERE state IN ('pending','sending','awaiting_receipt')
      AND next_attempt_at<=? AND lease_until<=? ORDER BY next_attempt_at,id LIMIT 1`).get(now,now) as Delivery|undefined;
    if(!row)return;
    const claimId=randomUUID();
    db.prepare(`UPDATE push_outbox SET claim_id=?,lease_until=?,state=CASE WHEN ticket_id IS NULL THEN 'sending' ELSE 'awaiting_receipt' END WHERE id=?`).run(claimId,now+60_000,row.id);
    return {...row,claim_id:claimId,lease_until:now+60_000};
  }).immediate();
}
function finish(row:Delivery,state:string,code:string|null,next:number,ticket:string|null=row.ticket_id) {
  return db.prepare(`UPDATE push_outbox SET state=?,last_error=?,next_attempt_at=?,ticket_id=?,lease_until=0,claim_id=NULL
    WHERE id=? AND claim_id=?`).run(state,code,next,ticket,row.id,row.claim_id).changes === 1;
}
function retry(row:Delivery,code:string,now:number,retryable=true) {
  const attempts=row.ticket_id ? row.receipt_attempts+1 : row.attempts+1;
  const next=now+Math.min(15*60_000,30_000*2**Math.min(attempts,5));
  const exhausted=!retryable || (!row.ticket_id && attempts>=5) || next>=row.expires_at;
  finish(row,exhausted?'failed':row.ticket_id?'awaiting_receipt':'pending',code,next);
}
function deviceGone(row: Delivery, now: number) {
  db.transaction(() => {
    // Fence device cleanup as well as the receipt. A replacement worker can
    // complete the same delivery without changing the installation generation.
    if (!finish(row, 'failed', 'DeviceNotRegistered', now)) return;
    db.prepare(`UPDATE push_installations SET enabled=0,expo_token=NULL,user_id=NULL,session_hash=NULL,lease_expires_at=0
      WHERE id=? AND generation=?`).run(row.installation_id,row.generation);
    db.prepare(`UPDATE push_outbox SET state='cancelled',last_error='DeviceNotRegistered',claim_id=NULL,lease_until=0
      WHERE installation_id=? AND generation=? AND id<>? AND state IN ('pending','sending','awaiting_receipt')`).run(row.installation_id,row.generation,row.id);
  }).immediate();
}
/** Leased per-delivery work survives restarts. Unknown send outcomes can repeat a generic alert; no exactly-once delivery claim. */
export async function processPushOutbox(options:{provider?:PushProvider;now?:()=>number;limit?:number;shouldContinue?:()=>boolean}={}) {
  let processed=0;
  if(!pushConfiguration().enabled || isWriterHoldActive())return {processed};
  const clock=options.now??Date.now; const provider=options.provider??expoPushProvider;
  for(let index=0;index<Math.min(50,options.limit??20);index++) {
    if(isWriterHoldActive() || !pushConfiguration().enabled || options.shouldContinue?.()===false)break;
    const now=clock(); const row=claim(now); if(!row)break;
    if(!row.ticket_id && row.attempts>=5) { finish(row,'failed','ProviderUnavailable',now);continue; }
    const target=destination(row,now);
    if(!target || row.expires_at<=now) { finish(row,'cancelled',row.expires_at<=now?'DeliveryExpired':'binding_inactive',now); continue; }
    // Check immediately before the external call. An already submitted generic alert cannot be recalled.
    const live=db.prepare('SELECT 1 FROM push_outbox WHERE id=? AND claim_id=?').get(row.id,row.claim_id);
    if(!live)continue;
    if(isWriterHoldActive())break;
    db.prepare(`UPDATE push_outbox SET ${row.ticket_id?'receipt_attempts':'attempts'}=${row.ticket_id?'receipt_attempts':'attempts'}+1 WHERE id=? AND claim_id=?`).run(row.id,row.claim_id);
    try {
      const reply=row.ticket_id ? await provider.receipt(row.ticket_id) : await provider.send({
        to:target.expo_token,title:'LMS update',body:'You have a new LMS notification. Open the app to view it.',
        sound:'default',channelId:'lms-updates',ttl:Math.max(1,Math.floor((row.expires_at-now)/1000)),
        data:{notificationId:row.notification_id,installationId:row.installation_id,generation:row.generation},
      });
      // Holding the writer pauses result application too; the durable lease lets the next worker recover it.
      if(isWriterHoldActive())break;
      const completed=clock();
      if(!reply){retry(row,'ReceiptUnavailable',completed);continue;}
      if(reply.status==='ok') {
        if(row.ticket_id)finish(row,'delivered',null,completed);
        else if(typeof reply.id==='string' && reply.id.length>0 && reply.id.length<=200)finish(row,'awaiting_receipt',null,completed+15*60_000,reply.id);
        else retry(row,'InvalidProviderResponse',completed);
      } else {
        const code=errorCode(reply.details?.error);
        if (code === 'DeviceNotRegistered') deviceGone(row, completed);
        else retry(row,code,completed,code==='MessageRateExceeded' || code==='ProviderUnavailable');
      }
      processed++;
    } catch(error) {
      if(isWriterHoldActive())break;
      retry(row,error instanceof ProviderError?error.code:'ProviderUnavailable',clock(),!(error instanceof ProviderError)||error.retryable);
    }
  }
  return {processed};
}
let interval:ReturnType<typeof setInterval>|undefined;
let working:Promise<unknown>|undefined;
let stopping=false;
export function startPushWorker() {
  if(interval || !pushConfiguration().enabled)return;
  stopping=false;
  interval=setInterval(()=>{
    if(working || stopping)return;
    working=processPushOutbox({shouldContinue:()=>!stopping}).catch(()=>logger.error({module:'push-worker'},'Push outbox tick failed')).finally(()=>{working=undefined;});
  },15_000);
}
export async function stopPushWorker() {
  stopping=true;if(interval)clearInterval(interval);interval=undefined;
  await working;
}
