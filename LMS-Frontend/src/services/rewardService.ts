/**
 * rewardService — R14: Frontend API client for reward system.
 *
 * Role-scoped reward CRUD, lifecycle actions, and student received view.
 * All amounts are in stroops (1 XLM = 10,000,000 stroops).
 */

import api from './api';

// ──── Types ────

export type RewardState =
  | 'draft' | 'pending_funding' | 'funded' | 'active'
  | 'eligible_pending_approval' | 'approved' | 'eligible_auto_release'
  | 'partially_released' | 'released'
  | 'cancelled' | 'expired'
  | 'partially_refunded' | 'refunded';

export type AllocationState = 'pending' | 'eligible' | 'released' | 'cancelled' | 'refunded';

export type ScopeType = 'sponsor_cohort' | 'employer_team' | 'parent_child' | 'parent_family' | 'teacher_class';

export interface Reward {
  id: string;
  creator_user_id: string;
  scope_type: ScopeType;
  scope_id: string;
  reward_type: string;
  amount_stroops: number;
  max_recipients: number | null;
  currency_code: string;
  description: string | null;
  auto_release: number;
  status: RewardState;
  expires_at: string | null;
  funded_at: string | null;
  activated_at: string | null;
  released_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RewardAllocation {
  id: string;
  reward_id: string;
  student_user_id: string;
  amount_stroops: number;
  currency_code: string;
  status: AllocationState;
  eligible_at: string | null;
  released_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  created_at: string;
}

export interface RewardTransaction {
  id: string;
  reward_id: string;
  transaction_type: string;
  amount_stroops: number;
  currency_code: string;
  actor_user_id: string | null;
  actor_type: string;
  created_at: string;
}

export interface StudentReward {
  allocationId: string;
  rewardType: string;
  amountStroops: number;
  currencyCode: string;
  status: AllocationState;
  releasedAt: string | null;
  createdAt: string;
}

export interface CreateRewardParams {
  scopeId: string;
  rewardType: string;
  amountStroops: string;
  maxRecipients?: number;
  autoRelease?: boolean;
  description?: string;
  eligibilityConfig?: Record<string, unknown>;
  expiresAt?: string;
  idempotencyKey: string;
}

type ApiRes<T> = { success: boolean; data: T };

// ──── Role prefix mapping ────

const ROLE_PREFIX: Record<string, string> = {
  sponsor: '/sponsor',
  employer: '/employer',
  parent: '/parent',
  teacher: '/teacher',
};

function prefix(role: string): string {
  return ROLE_PREFIX[role] || '/sponsor';
}

// ──── Service ────

export const rewardService = {
  /** List rewards for a scope */
  async listRewards(role: string, scopeId: string): Promise<Reward[]> {
    const res = await api.get<ApiRes<Reward[]>>(`${prefix(role)}/rewards`, {
      params: { scopeId },
    });
    return res.data.data;
  },

  /** Get single reward */
  async getReward(role: string, rewardId: string): Promise<Reward> {
    const res = await api.get<ApiRes<Reward>>(`${prefix(role)}/rewards/${rewardId}`);
    return res.data.data;
  },

  /** Get allocations for a reward */
  async getAllocations(role: string, rewardId: string): Promise<RewardAllocation[]> {
    const res = await api.get<ApiRes<RewardAllocation[]>>(
      `${prefix(role)}/rewards/${rewardId}/allocations`,
    );
    return res.data.data;
  },

  /** Get transactions for a reward */
  async getTransactions(role: string, rewardId: string): Promise<RewardTransaction[]> {
    const res = await api.get<ApiRes<RewardTransaction[]>>(
      `${prefix(role)}/rewards/${rewardId}/transactions`,
    );
    return res.data.data;
  },

  /** Create a new reward */
  async createReward(role: string, params: CreateRewardParams): Promise<Reward> {
    const res = await api.post<ApiRes<Reward>>(`${prefix(role)}/rewards`, params);
    return res.data.data;
  },

  /** Fund a reward */
  async fundReward(
    role: string, rewardId: string,
    sourceType: string, reference: string | undefined, idempotencyKey: string,
  ): Promise<Reward> {
    const res = await api.post<ApiRes<Reward>>(
      `${prefix(role)}/rewards/${rewardId}/fund`,
      { sourceType, reference, idempotencyKey },
    );
    return res.data.data;
  },

  /** Activate a reward */
  async activateReward(role: string, rewardId: string, idempotencyKey: string): Promise<Reward> {
    const res = await api.post<ApiRes<Reward>>(
      `${prefix(role)}/rewards/${rewardId}/activate`,
      { idempotencyKey },
    );
    return res.data.data;
  },

  /** Cancel a reward */
  async cancelReward(role: string, rewardId: string, reason: string, idempotencyKey: string): Promise<Reward> {
    const res = await api.post<ApiRes<Reward>>(
      `${prefix(role)}/rewards/${rewardId}/cancel`,
      { reason, idempotencyKey },
    );
    return res.data.data;
  },

  /** Approve a reward */
  async approveReward(role: string, rewardId: string, idempotencyKey: string): Promise<Reward> {
    const res = await api.post<ApiRes<Reward>>(
      `${prefix(role)}/rewards/${rewardId}/approve`,
      { idempotencyKey },
    );
    return res.data.data;
  },

  /** Release an allocation */
  async releaseAllocation(
    role: string, rewardId: string, allocationId: string, idempotencyKey: string,
  ): Promise<RewardAllocation> {
    const res = await api.post<ApiRes<RewardAllocation>>(
      `${prefix(role)}/rewards/${rewardId}/allocations/${allocationId}/release`,
      { idempotencyKey },
    );
    return res.data.data;
  },

  /** Refund an allocation (sponsor/employer only) */
  async refundAllocation(
    role: string, rewardId: string, allocationId: string, idempotencyKey: string,
  ): Promise<RewardAllocation | { blocked: true; reason: string }> {
    const res = await api.post<ApiRes<RewardAllocation | { blocked: true; reason: string }>>(
      `${prefix(role)}/rewards/${rewardId}/allocations/${allocationId}/refund`,
      { idempotencyKey },
    );
    return res.data.data;
  },

  /** Student: get my received rewards (privacy-safe — no funder data) */
  async getMyRewards(): Promise<StudentReward[]> {
    const res = await api.get<ApiRes<StudentReward[]>>('/students/me/rewards');
    return res.data.data;
  },
};
