/**
 * RewardDashboard — R14: Shared reward management panel for sponsor/employer/parent/teacher.
 *
 * Displays rewards list with status badges, expandable allocations,
 * and lifecycle action buttons based on current state.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { RewardStatusBadge, formatStroopsShort } from './RewardStatusBadge';
import {
  rewardService,
  type Reward,
  type RewardAllocation,
  type CreateRewardParams,
  type RewardType,
  type ParentTargetType,
} from '../services/rewardService';
import { getErrorMessage } from '../utils/apiError';
import {
  Gift,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  X,
  DollarSign,
  Play,
  XCircle,
  Check,
  Send,
  Undo2,
} from 'lucide-react';

// ──── Types ────

interface RewardDashboardProps {
  /** The user's role — determines API prefix */
  role: 'sponsor' | 'employer' | 'parent' | 'teacher';
  /** Scope ID (cohort, team, family, or class) to fetch rewards for */
  scopeId: string;
  /** Human label for scope (e.g., "Alpha Cohort") */
  scopeLabel?: string;
  /** Whether to show refund button (sponsor/employer only) */
  canRefund?: boolean;
  /** W06: parent role only — 'child' or 'family'. Omit for legacy parent_child behavior. */
  targetType?: ParentTargetType;
}

type ViewState = 'loading' | 'error' | 'empty' | 'data';

// Actions available per reward state
const ACTIONS: Record<string, Array<{ key: string; label: string; icon: typeof Play }>> = {
  draft:                     [{ key: 'fund', label: 'Fund', icon: DollarSign }],
  pending_funding:           [{ key: 'fund', label: 'Fund', icon: DollarSign }],
  funded:                    [{ key: 'activate', label: 'Activate', icon: Play }, { key: 'cancel', label: 'Cancel', icon: XCircle }],
  active:                    [{ key: 'cancel', label: 'Cancel', icon: XCircle }],
  eligible_pending_approval: [{ key: 'approve', label: 'Approve', icon: Check }],
};

// ──── Create Reward Modal ────

const RewardCreateForm: React.FC<{
  role: string;
  scopeId: string;
  targetType?: ParentTargetType;
  onCreated: () => void;
  onClose: () => void;
}> = ({ role, scopeId, targetType, onCreated, onClose }) => {
  const [rewardType, setRewardType] = useState<RewardType>('custom');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [autoRelease, setAutoRelease] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const xlm = parseFloat(amount);
    if (isNaN(xlm) || xlm <= 0) {
      setError('Amount must be a positive number');
      return;
    }
    if (xlm > 922337203685) {
      setError('Amount exceeds maximum');
      return;
    }

    const stroops = Math.round(xlm * 10_000_000);
    if (stroops === 0) {
      setError('Amount too small');
      return;
    }

    setSubmitting(true);
    try {
      const params: CreateRewardParams = {
        scopeId,
        rewardType,
        amountStroops: String(stroops),
        autoRelease,
        description: description || undefined,
        idempotencyKey: `create-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...(targetType !== undefined && { targetType }),
      };
      await rewardService.createReward(role, params);
      onCreated();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create reward'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-900/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Create Reward">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-neutral-900">Create Reward</h3>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reward-type" className="block text-sm font-medium text-neutral-700 mb-1">Type</label>
            <select
              id="reward-type"
              value={rewardType}
              onChange={(e) => setRewardType(e.target.value as RewardType)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              {/* W05: Only canonical DB types. course_completion and grade require
                  eligibilityConfig inputs (course/grade binding) not present in this form.
                  FOLLOW-UP(course-grade-form-inputs): expose course_completion and grade
                  only after adding requiredCourseId / grade-config fields. This is separate
                  from W06 (parent child/family discriminator). */}
              <option value="custom">Custom</option>
              <option value="individual">Individual Achievement</option>
              <option value="milestone">Milestone</option>
            </select>
          </div>

          <div>
            <label htmlFor="reward-amount" className="block text-sm font-medium text-neutral-700 mb-1">Amount (XLM)</label>
            <input
              id="reward-amount"
              type="number"
              step="0.0000001"
              min="0.0000001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="1.0"
              required
            />
          </div>

          <div>
            <label htmlFor="reward-description" className="block text-sm font-medium text-neutral-700 mb-1">Description (optional)</label>
            <input
              id="reward-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              placeholder="Course completion reward"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={autoRelease}
              onChange={(e) => setAutoRelease(e.target.checked)}
              className="rounded border-neutral-300"
            />
            Auto-release when eligible
          </label>

          {error && (
            <p className="text-sm text-red-600" data-testid="create-error">{error}</p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" aria-hidden /> : <Plus className="h-4 w-4 mr-1" aria-hidden />}
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ──── Main Component ────

export const RewardDashboard: React.FC<RewardDashboardProps> = ({
  role,
  scopeId,
  scopeLabel,
  canRefund = false,
  targetType,
}) => {
  const [state, setState] = useState<ViewState>('loading');
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, RewardAllocation[] | 'loading'>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // W06-R1: monotonic request counter — incremented at the start of every load() call.
  // Each invocation captures its generation; state is only committed when
  // reqIdRef.current still matches, guarding against stale responses from prior targets
  // or superseded same-target refreshes. Effect cleanup also increments on target change
  // and unmount so any pending promise from the previous identity is invalidated.
  const reqIdRef = useRef(0);

  // W06-R1: current target identity key for performAction post-mutation guards.
  // Kept current on every render so performAction can detect a target switch that
  // occurred while its mutation was in flight.
  const targetKey = `${role}|${scopeId}|${targetType ?? ''}`;
  const targetKeyRef = useRef(targetKey);
  targetKeyRef.current = targetKey;

  // W06-R2: target epoch — incremented ONLY in useEffect cleanup (target change / unmount).
  // Unlike reqIdRef (incremented every load()), epoch changes only when the target identity
  // changes. Callbacks capture capturedEpoch at render time; if epoch advanced before the
  // callback fires, the callback is from a prior target visit and is silently dropped.
  const targetEpochRef = useRef(0);
  const capturedEpoch = targetEpochRef.current;

  const load = useCallback(async () => {
    // Increment first: invalidates any outstanding request for the previous identity.
    const myReqId = ++reqIdRef.current;
    if (!scopeId) { setState('empty'); return; }
    setState('loading');
    setError('');
    setExpanded({});
    try {
      // W06: pass targetType so parent child/family list uses the correct scope
      const data = await rewardService.listRewards(role, scopeId, targetType);
      // Guard: discard if a newer request superseded this one (target switch or refresh)
      if (reqIdRef.current !== myReqId) return;
      setRewards(data);
      setState(data.length > 0 ? 'data' : 'empty');
    } catch (err) {
      if (reqIdRef.current !== myReqId) return;
      setError(getErrorMessage(err, 'Could not load rewards'));
      setState('error');
    }
  }, [role, scopeId, targetType]);

  // Cleanup invalidates any pending load when deps change (target switch) or on unmount.
  // W06-R2: also increments epoch so stale callbacks from the old target are silenced,
  // and resets form + spinner state so neither leaks into the new target's render.
  useEffect(() => {
    load();
    return () => {
      ++reqIdRef.current;
      ++targetEpochRef.current;
      setShowCreate(false);
      setActionLoading(null);
    };
  }, [load]);

  const toggleAllocations = useCallback(async (rewardId: string) => {
    if (expanded[rewardId]) {
      setExpanded((prev) => { const next = { ...prev }; delete next[rewardId]; return next; });
      return;
    }
    // W06-R2: capture epoch so async success/error can verify they're still on the same target.
    const myEpoch = targetEpochRef.current;
    setExpanded((prev) => ({ ...prev, [rewardId]: 'loading' }));
    try {
      const allocs = await rewardService.getAllocations(role, rewardId);
      // Existing guard: only apply if still loading (reqId guard discards via setExpanded({}));
      // W06-R2: also discard if target switched since this call started.
      setExpanded((prev) => (prev[rewardId] === 'loading' && targetEpochRef.current === myEpoch ? { ...prev, [rewardId]: allocs } : prev));
    } catch {
      // W06-R2: epoch guard — don't mutate new target's expansion state on old target's error.
      if (targetEpochRef.current === myEpoch) {
        setExpanded((prev) => { const next = { ...prev }; delete next[rewardId]; return next; });
      }
    }
  }, [expanded, role]);

  const performAction = useCallback(async (action: string, rewardId: string, allocId?: string) => {
    const key = `${action}-${rewardId}-${allocId ?? ''}`;
    setActionLoading(key);
    const idem = `${action}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // W06-R1: capture target identity at action start.
    // If the target changes while the mutation is in flight, we skip the post-mutation
    // load and error-set — the mutation itself is preserved on the original target.
    const myTargetKey = targetKey;
    // W06-R2: capture epoch at action start so the finally spinner-clear can be guarded
    // against old-target operations clearing a new-target operation's spinner.
    const myEpoch = targetEpochRef.current;
    try {
      switch (action) {
        case 'fund':
          await rewardService.fundReward(role, rewardId, 'platform_credit', undefined, idem);
          break;
        case 'activate':
          await rewardService.activateReward(role, rewardId, idem);
          break;
        case 'cancel':
          await rewardService.cancelReward(role, rewardId, '', idem);
          break;
        case 'approve':
          await rewardService.approveReward(role, rewardId, idem);
          break;
        case 'release':
          if (allocId) await rewardService.releaseAllocation(role, rewardId, allocId, idem);
          break;
        case 'refund':
          if (allocId) {
            const refundResult = await rewardService.refundAllocation(role, rewardId, allocId, idem);
            if (refundResult && 'blocked' in refundResult && refundResult.blocked) {
              if (targetKeyRef.current === myTargetKey) {
                setError('Refund blocked — the recipient has insufficient available balance. The attempt has been recorded for admin review.');
              }
              // W06-R2: removed setActionLoading(null) here — finally handles it with epoch guard.
              return;
            }
          }
          break;
      }
      // W06-R1+R2: only reload if still on the same target (key) AND same target visit (epoch).
      if (targetKeyRef.current === myTargetKey && targetEpochRef.current === myEpoch) {
        await load();
      }
    } catch (err) {
      // W06-R1+R2: only surface error if still on the same target key and epoch.
      if (targetKeyRef.current === myTargetKey && targetEpochRef.current === myEpoch) {
        setError(getErrorMessage(err, `Failed to ${action} reward`));
      }
    } finally {
      // W06-R2: only clear spinner if still on the same target visit.
      // Without this guard an old operation's finally would clear a new operation's spinner.
      if (targetEpochRef.current === myEpoch) {
        setActionLoading(null);
      }
    }
  }, [role, scopeId, targetType, targetKey, load]);

  return (
    <div data-testid="reward-dashboard">
    <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-primary-50/30 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-accent-teal" aria-hidden />
          <CardTitle className="border-0 p-0 text-neutral-900 text-sm">
            Rewards{scopeLabel ? ` — ${scopeLabel}` : ''}
          </CardTitle>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" type="button" onClick={load} disabled={state === 'loading'}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${state === 'loading' ? 'animate-spin' : ''}`} aria-hidden />
            Refresh
          </Button>
          <Button variant="primary" size="sm" type="button" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" aria-hidden />
            New Reward
          </Button>
        </div>
      </div>

      <CardContent className="p-5">
        {error && (
          <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900 mb-4">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {state === 'loading' && (
          <div className="py-12 text-center text-neutral-500 text-sm">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" aria-hidden />
            Loading rewards...
          </div>
        )}

        {state === 'empty' && (
          <div className="py-12 text-center">
            <Gift className="h-10 w-10 text-neutral-300 mx-auto mb-3" aria-hidden />
            <p className="text-neutral-500 text-sm">No rewards yet. Create one to get started.</p>
          </div>
        )}

        {state === 'error' && !error && (
          <div className="py-12 text-center">
            <Button variant="outline" size="sm" type="button" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-1" aria-hidden />
              Retry
            </Button>
          </div>
        )}

        {state === 'data' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                  <th className="px-3 py-2.5 font-medium w-6" />
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Created</th>
                  <th className="px-3 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rewards.map((r) => {
                  const exp = expanded[r.id];
                  const isExpanded = !!exp;
                  const isAllocLoading = exp === 'loading';
                  const allocs = Array.isArray(exp) ? exp : [];
                  const actions = ACTIONS[r.status] ?? [];

                  return (
                    <React.Fragment key={r.id}>
                      <tr className="hover:bg-neutral-50/60 transition-colors">
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            className="text-neutral-400 hover:text-neutral-600"
                            onClick={() => toggleAllocations(r.id)}
                            aria-label={isExpanded ? 'Collapse allocations' : 'Expand allocations'}
                          >
                            {isAllocLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : isExpanded ? (
                              <ChevronDown className="h-4 w-4" aria-hidden />
                            ) : (
                              <ChevronRight className="h-4 w-4" aria-hidden />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-neutral-900 capitalize">{r.reward_type}</p>
                          {r.description && (
                            <p className="text-xs text-neutral-400 truncate max-w-[200px]">{r.description}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-neutral-700">
                          {formatStroopsShort(r.amount_stroops)}
                        </td>
                        <td className="px-3 py-3">
                          <RewardStatusBadge status={r.status} />
                        </td>
                        <td className="px-3 py-3 text-xs text-neutral-500">
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {actions.map((a) => {
                              const loadKey = `${a.key}-${r.id}-`;
                              const isLoading = actionLoading === loadKey;
                              return (
                                <Button
                                  key={a.key}
                                  variant="outline"
                                  size="sm"
                                  type="button"
                                  disabled={!!actionLoading}
                                  onClick={() => performAction(a.key, r.id)}
                                >
                                  {isLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                  ) : (
                                    <a.icon className="h-3 w-3 mr-1" aria-hidden />
                                  )}
                                  {a.label}
                                </Button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded allocations */}
                      {isExpanded && !isAllocLoading && (
                        <tr>
                          <td colSpan={6} className="px-0 py-0">
                            <div className="bg-neutral-50/80 border-t border-neutral-100 px-8 py-3">
                              {allocs.length === 0 ? (
                                <p className="text-sm text-neutral-400 italic py-2">No allocations yet</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-left text-neutral-500 uppercase tracking-wide">
                                      <th className="pb-2 font-medium">Student</th>
                                      <th className="pb-2 font-medium">Amount</th>
                                      <th className="pb-2 font-medium">Status</th>
                                      <th className="pb-2 font-medium">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-100">
                                    {allocs.map((a) => (
                                      <tr key={a.id}>
                                        <td className="py-1.5 text-neutral-600 font-mono text-xs">
                                          {a.student_user_id.slice(0, 8)}...
                                        </td>
                                        <td className="py-1.5 tabular-nums text-neutral-700">
                                          {formatStroopsShort(a.amount_stroops)}
                                        </td>
                                        <td className="py-1.5">
                                          <RewardStatusBadge status={a.status} />
                                        </td>
                                        <td className="py-1.5">
                                          <div className="flex gap-1">
                                            {a.status === 'eligible' && (
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                type="button"
                                                disabled={!!actionLoading}
                                                onClick={() => performAction('release', r.id, a.id)}
                                              >
                                                <Send className="h-3 w-3 mr-1" aria-hidden />
                                                Release
                                              </Button>
                                            )}
                                            {a.status === 'released' && canRefund && (
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                type="button"
                                                disabled={!!actionLoading}
                                                onClick={() => performAction('refund', r.id, a.id)}
                                              >
                                                <Undo2 className="h-3 w-3 mr-1" aria-hidden />
                                                Refund
                                              </Button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {showCreate && (
        <RewardCreateForm
          role={role}
          scopeId={scopeId}
          targetType={targetType}
          onCreated={() => {
            // W06-R2: capturedEpoch was snapshotted at render time. If the target changed
            // since this render, the epoch advanced and this callback is stale — drop it.
            if (targetEpochRef.current !== capturedEpoch) return;
            setShowCreate(false);
            load();
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </Card>
    </div>
  );
};

export default RewardDashboard;
