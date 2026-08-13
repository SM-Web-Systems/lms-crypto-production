import { describe, it, expect } from 'vitest';
import {
  validateTransition,
  assertTransition,
  getNextStates,
  deriveAggregateStatus,
} from '../services/rewards/rewardStateMachine.js';
import { RewardError } from '../services/rewards/rewardErrors.js';

describe('Reward State Machine', () => {
  it('R-SM-1: draft → pending_funding allowed', () => {
    expect(validateTransition('draft', 'pending_funding')).toBe(true);
  });

  it('R-SM-2: pending_funding → funded allowed', () => {
    expect(validateTransition('pending_funding', 'funded')).toBe(true);
  });

  it('R-SM-3: funded → active allowed', () => {
    expect(validateTransition('funded', 'active')).toBe(true);
  });

  it('R-SM-4: active → eligible_pending_approval when auto_release=0', () => {
    expect(validateTransition('active', 'eligible_pending_approval', { autoRelease: false })).toBe(true);
    expect(validateTransition('active', 'eligible_auto_release', { autoRelease: false })).toBe(false);
  });

  it('R-SM-5: active → eligible_auto_release when auto_release=1', () => {
    expect(validateTransition('active', 'eligible_auto_release', { autoRelease: true })).toBe(true);
    expect(validateTransition('active', 'eligible_pending_approval', { autoRelease: true })).toBe(false);
  });

  it('R-SM-6: blocked — partially_released → cancelled not allowed', () => {
    expect(validateTransition('partially_released', 'cancelled')).toBe(false);
  });

  it('R-SM-7: blocked — released → cancelled not allowed', () => {
    expect(validateTransition('released', 'cancelled')).toBe(false);
  });

  it('R-SM-8: assertTransition throws RewardError on invalid transition', () => {
    expect(() => assertTransition('released', 'draft')).toThrow(RewardError);
  });

  it('R-SM-9: getNextStates returns correct options', () => {
    const fromActive = getNextStates('active');
    expect(fromActive).toContain('eligible_pending_approval');
    expect(fromActive).toContain('eligible_auto_release');
    expect(fromActive).toContain('cancelled');
    expect(fromActive).toContain('expired');
    expect(fromActive).not.toContain('draft');

    const fromReleased = getNextStates('released');
    expect(fromReleased).toContain('partially_refunded');
    expect(fromReleased).toContain('refunded');
    expect(fromReleased).not.toContain('cancelled');
  });

  it('R-SM-10: terminal states have no next states', () => {
    expect(getNextStates('cancelled')).toEqual([]);
    expect(getNextStates('expired')).toEqual([]);
    expect(getNextStates('refunded')).toEqual([]);
  });

  it('R-SM-11: funded → cancelled allowed (before activation)', () => {
    expect(validateTransition('funded', 'cancelled')).toBe(true);
  });
});

describe('Aggregate Status', () => {
  it('R-AGG-1: all released → released', () => {
    const status = deriveAggregateStatus([
      { status: 'released' },
      { status: 'released' },
    ]);
    expect(status).toBe('released');
  });

  it('R-AGG-2: some released, some pending → partially_released', () => {
    const status = deriveAggregateStatus([
      { status: 'released' },
      { status: 'pending' },
    ]);
    expect(status).toBe('partially_released');
  });

  it('R-AGG-3: released + cancelled = released (all terminal)', () => {
    const status = deriveAggregateStatus([
      { status: 'released' },
      { status: 'cancelled' },
    ]);
    expect(status).toBe('released');
  });

  it('R-AGG-4: all refunded → refunded', () => {
    const status = deriveAggregateStatus([
      { status: 'refunded' },
      { status: 'refunded' },
    ]);
    expect(status).toBe('refunded');
  });

  it('R-AGG-5: some refunded → partially_refunded', () => {
    const status = deriveAggregateStatus([
      { status: 'released' },
      { status: 'refunded' },
    ]);
    expect(status).toBe('partially_refunded');
  });

  it('R-AGG-6: empty allocations → null', () => {
    expect(deriveAggregateStatus([])).toBeNull();
  });
});
