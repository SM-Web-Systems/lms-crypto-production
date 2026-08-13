export const REWARD_STATES = [
  'draft', 'pending_funding', 'funded', 'active',
  'eligible_pending_approval', 'approved', 'eligible_auto_release',
  'partially_released', 'released',
  'cancelled', 'expired',
  'partially_refunded', 'refunded',
] as const;
export type RewardState = typeof REWARD_STATES[number];

export const ALLOCATION_STATES = ['pending', 'eligible', 'released', 'cancelled', 'refunded'] as const;
export type AllocationState = typeof ALLOCATION_STATES[number];

export const SCOPE_TYPES = ['sponsor_cohort', 'employer_team', 'parent_child', 'parent_family', 'teacher_class'] as const;
export type ScopeType = typeof SCOPE_TYPES[number];

export const TRANSACTION_TYPES = ['fund', 'reserve', 'release', 'cancel', 'refund', 'expire'] as const;
export type TransactionType = typeof TRANSACTION_TYPES[number];

export const ACCOUNT_TYPES = ['funder', 'recipient', 'platform'] as const;
export type AccountType = typeof ACCOUNT_TYPES[number];

export const FUNDING_SOURCE_TYPES = ['platform_credit', 'admin_grant', 'stellar', 'paystack'] as const;
export type FundingSourceType = typeof FUNDING_SOURCE_TYPES[number];

export interface ScopeContext {
  actorId: string;
  scopeType: ScopeType;
  scopeId: string;
  idempotencyKey: string;
  currency?: string;
  amountStroops?: number;
}

export interface RewardRow {
  id: string;
  creator_user_id: string;
  scope_type: ScopeType;
  scope_id: string;
  reward_type: string;
  amount_mode: string;
  amount_stroops: number;
  max_recipients: number | null;
  currency_code: string;
  description: string | null;
  auto_release: number;
  eligibility_config: string | null;
  status: RewardState;
  idempotency_key: string;
  expires_at: string | null;
  funded_at: string | null;
  activated_at: string | null;
  eligible_at: string | null;
  approved_at: string | null;
  released_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RewardAccountRow {
  id: string;
  user_id: string;
  account_type: AccountType;
  available_stroops: number;
  reserved_stroops: number;
  currency_code: string;
  created_at: string;
  updated_at: string;
}

export interface AllocationRow {
  id: string;
  reward_id: string;
  student_user_id: string;
  amount_stroops: number;
  currency_code: string;
  status: AllocationState;
  idempotency_key: string;
  eligible_at: string | null;
  released_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  created_at: string;
}
