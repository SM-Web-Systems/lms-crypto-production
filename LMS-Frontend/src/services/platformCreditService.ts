import api from './api';

/**
 * Administrator client for backed platform credit: real XLM is deposited from the treasury account into the reward pool
 * (a backing deposit), an administrator requests part of it as credit for a funder, a different administrator approves,
 * and the credit then funds a reward through the funding dialog.
 */
const base = '/admin/rewards/platform-credit';
type ApiRes<T> = { success: boolean; data: T };

export interface Pool {
  network: 'public' | 'testnet'; currency: string;
  depositedStroops: number; allocatedStroops: number; reservedStroops: number; availableStroops: number;
}
export interface CreditRequest {
  id: string; requester_user_id: string; beneficiary_user_id: string; network: string; amount_stroops: number; reason: string;
  status: string; effective_status: string; expires_at: string; created_at: string;
}
export interface BackingIntent {
  id: string; network: string; destination: string; memo_hash: string; text_memo?: string | null; amount_stroops: number; reason: string;
  expires_at: string; created_at: string; effective_status: 'awaiting_deposit' | 'verified' | 'expired'; operation_id?: string | null;
}
export interface CreditReservation {
  intent_id: string; status: string; effective_status: string; amount_stroops: number; reward_id: string; owner_user_id: string; actor_user_id: string; expires_at: string;
}
export interface AuditRow { id: string; event_type: string; actor_user_id: string; network: string; amount_stroops: number; reason: string; created_at: string }
export interface Summary { pools: Pool[]; requests: CreditRequest[]; backingIntents: BackingIntent[]; reservations: CreditReservation[]; audit: AuditRow[] }
export interface Beneficiary { id: string; name: string; email: string }
export interface Reconciliation { depositedStroops?: number; [key: string]: unknown }

const key = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const platformCreditService = {
  async summary(): Promise<Summary> { return (await api.get<ApiRes<Summary>>(base)).data.data; },
  async beneficiaries(): Promise<Beneficiary[]> { return (await api.get<ApiRes<Beneficiary[]>>(`${base}/beneficiaries`)).data.data; },
  async reconcile(network: 'public' | 'testnet'): Promise<Reconciliation> { return (await api.get<ApiRes<Reconciliation>>(`${base}/reconciliation/${network}`)).data.data; },
  async createBackingIntent(amountStroops: string, reason: string, idempotencyKey = key()): Promise<BackingIntent> {
    return (await api.post<ApiRes<BackingIntent>>(`${base}/deposit-intents`, { amountStroops, reason, idempotencyKey })).data.data;
  },
  async verifyBackingDeposit(id: string, operationId: string): Promise<unknown> {
    return (await api.post<ApiRes<unknown>>(`${base}/deposit-intents/${encodeURIComponent(id)}/verify`, { operationId })).data.data;
  },
  async requestCredit(beneficiaryUserId: string, amountStroops: string, reason: string, idempotencyKey = key()): Promise<CreditRequest> {
    return (await api.post<ApiRes<CreditRequest>>(`${base}/requests`, { beneficiaryUserId, amountStroops, reason, idempotencyKey })).data.data;
  },
  async approve(id: string, reason: string, idempotencyKey = key()): Promise<unknown> {
    return (await api.post<ApiRes<unknown>>(`${base}/requests/${encodeURIComponent(id)}/approve`, { reason, idempotencyKey })).data.data;
  },
  async cancel(id: string, reason: string): Promise<unknown> {
    return (await api.post<ApiRes<unknown>>(`${base}/requests/${encodeURIComponent(id)}/cancel`, { reason })).data.data;
  },
  async releaseReservation(intentId: string): Promise<unknown> {
    return (await api.post<ApiRes<unknown>>(`${base}/reservations/${encodeURIComponent(intentId)}/release`, {})).data.data;
  },
};

/** "0.1" or "1.5" XLM to whole stroops as a string, or null when it is not a positive amount with at most 7 decimals. */
export function xlmToStroops(value: string): string | null {
  const m = /^(\d{1,9})(?:\.(\d{1,7}))?$/.exec(value.trim());
  if (!m) return null;
  const stroops = BigInt(m[1]) * 10_000_000n + BigInt((m[2] ?? '').padEnd(7, '0'));
  return stroops > 0n ? stroops.toString() : null;
}

export function stroopsToXlm(stroops: number | string): string {
  const s = BigInt(stroops);
  const frac = (s % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '');
  return `${s / 10_000_000n}${frac ? `.${frac}` : ''}`;
}
