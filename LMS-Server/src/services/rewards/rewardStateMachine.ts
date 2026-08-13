import type { RewardState, AllocationState } from './rewardTypes.js';
import { RewardError } from './rewardErrors.js';

// Transition map: from → [allowed to states]
const TRANSITIONS: Record<string, RewardState[]> = {
  draft: ['pending_funding'],
  pending_funding: ['funded'],
  funded: ['active', 'cancelled'],
  active: ['eligible_pending_approval', 'eligible_auto_release', 'cancelled', 'expired'],
  eligible_pending_approval: ['approved', 'cancelled'],
  approved: ['released', 'partially_released'],
  eligible_auto_release: ['released', 'partially_released', 'cancelled'],
  partially_released: ['partially_released', 'released'],
  released: ['partially_refunded', 'refunded'],
  partially_refunded: ['partially_refunded', 'refunded'],
  // Terminal states
  cancelled: [],
  expired: [],
  refunded: [],
};

interface TransitionContext {
  autoRelease?: boolean;
}

/**
 * Validate whether a state transition is allowed.
 */
export function validateTransition(
  currentState: RewardState,
  targetState: RewardState,
  context?: TransitionContext
): boolean {
  const allowed = TRANSITIONS[currentState];
  if (!allowed || !allowed.includes(targetState)) return false;

  // Guard: auto_release=0 cannot go to eligible_auto_release
  if (targetState === 'eligible_auto_release' && context?.autoRelease === false) {
    return false;
  }
  // Guard: auto_release=1 cannot go to eligible_pending_approval
  if (targetState === 'eligible_pending_approval' && context?.autoRelease === true) {
    return false;
  }
  // Guard: auto_release=1 should not go to approved (it skips approval)
  if (targetState === 'approved' && context?.autoRelease === true) {
    return false;
  }

  return true;
}

/**
 * Assert a transition is valid, throwing RewardError if not.
 */
export function assertTransition(
  currentState: RewardState,
  targetState: RewardState,
  context?: TransitionContext
): void {
  if (!validateTransition(currentState, targetState, context)) {
    throw new RewardError(
      'INVALID_STATE_TRANSITION',
      `Cannot transition from '${currentState}' to '${targetState}'`
    );
  }
}

/**
 * Get all valid next states from the current state.
 */
export function getNextStates(
  currentState: RewardState,
  context?: TransitionContext
): RewardState[] {
  const allowed = TRANSITIONS[currentState] || [];
  return allowed.filter(s => validateTransition(currentState, s, context));
}

/**
 * Derive the aggregate reward status from its allocation states.
 * Used to determine if reward should move to released/partially_released/refunded etc.
 */
export function deriveAggregateStatus(
  allocations: Array<{ status: AllocationState }>,
  maxRecipients?: number | null
): RewardState | null {
  if (allocations.length === 0) return null;

  const released = allocations.filter(a => a.status === 'released').length;
  const refunded = allocations.filter(a => a.status === 'refunded').length;
  const terminal = allocations.filter(a => ['released', 'cancelled', 'refunded'].includes(a.status)).length;
  const total = maxRecipients ?? allocations.length;

  // All released allocations have been refunded
  if (released === 0 && refunded > 0) return 'refunded';
  if (refunded > 0 && refunded < (released + refunded)) return 'partially_refunded';
  if (refunded > 0 && refunded === (released + refunded)) return 'refunded';

  // All slots resolved
  if (terminal === total && released > 0) return 'released';

  // Some released but not all resolved
  if (released > 0) return 'partially_released';

  return null;
}
