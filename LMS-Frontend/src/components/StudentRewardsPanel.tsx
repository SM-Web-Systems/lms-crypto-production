/**
 * StudentRewardsPanel — R14: Read-only panel showing rewards received by the student.
 * Privacy: no funder data exposed (no sponsor/employer/parent names or IDs).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { RewardStatusBadge, formatStroopsShort } from './RewardStatusBadge';
import { rewardService, type StudentReward } from '../services/rewardService';
import { getErrorMessage } from '../utils/apiError';
import { Gift, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';

export const StudentRewardsPanel: React.FC = () => {
  const [rewards, setRewards] = useState<StudentReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await rewardService.getMyRewards();
      setRewards(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load rewards'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="student-rewards-panel">
    <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-primary-50/30 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-emerald-500" aria-hidden />
          <CardTitle className="border-0 p-0 text-neutral-900 text-sm">My Rewards</CardTitle>
        </div>
        <Button variant="outline" size="sm" type="button" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Refresh
        </Button>
      </div>

      <CardContent className="p-5">
        {error && (
          <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900 mb-4">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-neutral-500 text-sm">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" aria-hidden />
            Loading rewards...
          </div>
        ) : rewards.length === 0 ? (
          <div className="py-8 text-center">
            <Gift className="h-10 w-10 text-neutral-300 mx-auto mb-3" aria-hidden />
            <p className="text-neutral-500 text-sm">No rewards received yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100" data-testid="student-rewards-list">
                {rewards.map((r) => (
                  <tr key={r.allocationId} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-3 py-3 capitalize text-neutral-900">{r.rewardType}</td>
                    <td className="px-3 py-3 tabular-nums text-neutral-700">
                      {formatStroopsShort(r.amountStroops)}
                    </td>
                    <td className="px-3 py-3">
                      <RewardStatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-3 text-xs text-neutral-500">
                      {new Date(r.releasedAt ?? r.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
};
