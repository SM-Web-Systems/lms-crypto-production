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
import { Gift, RefreshCw, AlertCircle, Loader2, Send } from 'lucide-react';
import { rememberClaim, walletClaimNavigation, walletClaimUrl } from '../utils/rewardClaim';

export const StudentRewardsPanel: React.FC = () => {
  const [rewards, setRewards] = useState<StudentReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimable, setClaimable] = useState<string>('0');
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, balance] = await Promise.all([rewardService.getMyRewards(), Promise.resolve().then(() => rewardService.getClaimableBalance()).catch(() => '0')]);
      setRewards(data);
      setClaimable(balance);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load rewards'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Rewards stay in the LMS until the learner proves, in AmmaWallet, that they control their wallet.
  const claim = async () => {
    setClaiming(true); setError('');
    try {
      const started = await rewardService.startClaim(claimable);
      rememberClaim(started.claimId, started.message);
      walletClaimNavigation.go(walletClaimUrl(started.message, `${window.location.origin}/student/rewards/claim`));
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start the claim'));
      setClaiming(false);
    }
  };

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
        {claimable !== '0' && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm text-emerald-900">Ready to claim: <strong className="tabular-nums">{formatStroopsShort(Number(claimable))}</strong></p>
            <Button size="sm" type="button" onClick={claim} disabled={claiming}>
              <Send className="h-3.5 w-3.5 mr-1" aria-hidden />
              {claiming ? 'Opening AmmaWallet…' : 'Claim to my wallet'}
            </Button>
            <p className="basis-full text-xs text-emerald-800" data-testid="restore-wallet-note">
              AmmaWallet will ask you to approve with your Amma password. You need the device where your wallet was set up, or your recovery phrase to restore your wallet on this one.
            </p>
          </div>
        )}
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
          // Below the sm breakpoint the table reflows into stacked rows (type and amount, then status and date), so
          // nothing is clipped or needs sideways scrolling on a phone or at high zoom. Roles keep the table semantics.
          <div className="overflow-x-auto">
            <table className="block w-full text-sm sm:table" role="table">
              <thead className="hidden sm:table-header-group" role="rowgroup">
                <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide" role="row">
                  <th className="px-3 py-2.5 font-medium" role="columnheader">Type</th>
                  <th className="px-3 py-2.5 font-medium" role="columnheader">Amount</th>
                  <th className="px-3 py-2.5 font-medium" role="columnheader">Status</th>
                  <th className="px-3 py-2.5 font-medium" role="columnheader">Date</th>
                </tr>
              </thead>
              <tbody className="block divide-y divide-neutral-100 sm:table-row-group" data-testid="student-rewards-list" role="rowgroup">
                {rewards.map((r) => (
                  <tr key={r.allocationId} role="row"
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-3 hover:bg-neutral-50/60 transition-colors sm:table-row sm:px-0 sm:py-0">
                    <td className="capitalize text-neutral-900 sm:table-cell sm:px-3 sm:py-3" role="cell">{r.rewardType}</td>
                    <td className="tabular-nums text-neutral-700 sm:table-cell sm:px-3 sm:py-3" role="cell">
                      {formatStroopsShort(r.amountStroops)}
                    </td>
                    <td className="sm:table-cell sm:px-3 sm:py-3" role="cell">
                      <RewardStatusBadge status={r.status} />
                    </td>
                    <td className="text-xs text-neutral-500 sm:table-cell sm:px-3 sm:py-3" role="cell">
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
