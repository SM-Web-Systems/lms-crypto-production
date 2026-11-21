/**
 * StudentRewardsPanel — R14: Read-only panel showing rewards received by the student.
 * Privacy: no funder data exposed (no sponsor/employer/parent names or IDs).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { RewardStatusBadge } from './RewardStatusBadge';
import { useXlmUsdcPrice } from '../hooks/useXlmUsdcPrice';
import { formatXlm } from '../utils/xlmAmount';
import { rewardService, type MyRewardClaim, type StudentReward } from '../services/rewardService';
import { getErrorMessage } from '../utils/apiError';
import { Gift, RefreshCw, AlertCircle, Loader2, Send } from 'lucide-react';
import { rememberClaim, walletClaimNavigation, walletClaimUrl } from '../utils/rewardClaim';

/** What really happened to each claim. Only 'paid' says the reward reached the wallet. */
const CLAIM_PAYOUT: Record<MyRewardClaim['payout'], { label: string; tone: string; note?: string }> = {
  paid: { label: 'Paid to wallet', tone: 'bg-green-100 text-green-800' },
  submitted: { label: 'Sending', tone: 'bg-blue-100 text-blue-800', note: 'The payment is on its way. Refresh in a minute.' },
  failed: { label: 'Payment failed', tone: 'bg-red-100 text-red-800', note: 'The network did not accept the payment. Nothing was sent; try again.' },
  not_sent: { label: 'Not paid yet', tone: 'bg-amber-100 text-amber-900', note: 'Your claim is saved, but the payment has not been sent to your wallet.' },
};

const shortAddress = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

export const StudentRewardsPanel: React.FC = () => {
  const [rewards, setRewards] = useState<StudentReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimable, setClaimable] = useState<string>('0');
  const [maxClaim, setMaxClaim] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claims, setClaims] = useState<MyRewardClaim[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);
  // What happened to the last payment retry. Kept outside the list: a refused claim can leave the list (back in the balance).
  const [paymentNotice, setPaymentNotice] = useState<{ text: string; failed: boolean } | null>(null);
  // A payments list that failed to load is shown as failed, never as no payments.
  const [claimsError, setClaimsError] = useState('');
  const xlmUsdc = useXlmUsdcPrice();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setClaimsError('');
    try {
      const [data, balance, myClaims, limit] = await Promise.all([
        rewardService.getMyRewards(),
        Promise.resolve().then(() => rewardService.getClaimableBalance()).catch(() => '0'),
        Promise.resolve().then(() => rewardService.listMyClaims())
          .catch((err) => { setClaimsError(getErrorMessage(err, 'Could not load your payments.')); return [] as MyRewardClaim[]; }),
        Promise.resolve().then(() => rewardService.getMaxClaimStroops()).catch(() => null),
      ]);
      setRewards(data);
      setClaimable(balance);
      setMaxClaim(typeof limit === 'string' && /^[1-9][0-9]*$/.test(limit) ? limit : null);
      setClaims(Array.isArray(myClaims) ? myClaims : []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load rewards'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A claim above the per-payment limit can never be paid, so claim at most the limit; the rest stays claimable.
  const claimAmount = maxClaim !== null && BigInt(claimable) > BigInt(maxClaim) ? maxClaim : claimable;

  // Rewards stay in the LMS until the learner proves, in AmmaWallet, that they control their wallet.
  const claim = async () => {
    setClaiming(true); setError('');
    try {
      const started = await rewardService.startClaim(claimAmount);
      rememberClaim(started.claimId, started.message);
      walletClaimNavigation.go(walletClaimUrl(started.message, `${window.location.origin}/student/rewards/claim`));
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start the claim'));
      setClaiming(false);
    }
  };

  const retry = async (claimId: string) => {
    setRetrying(claimId);
    setPaymentNotice(null);
    try {
      const paid = await rewardService.retryPayout(claimId);
      setPaymentNotice(paid.status === 'paid' ? { text: 'The reward has been sent to your wallet.', failed: false }
        : paid.status === 'submitted' ? { text: 'The payment is on its way. Refresh in a minute.', failed: false }
        : { text: 'The payment was not sent. Your claim is saved; try again.', failed: true });
    } catch (err) {
      setPaymentNotice({ text: `The payment was not sent. ${getErrorMessage(err, 'Your claim is saved.')}`, failed: true });
    } finally {
      // Reload either way: a refusal can close the claim and put the amount back in the balance, so the list must not go stale.
      await load();
      setRetrying(null);
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
            <p className="text-sm text-emerald-900">Ready to claim: <strong className="tabular-nums">{formatXlm(claimable, xlmUsdc)}</strong></p>
            <Button size="sm" type="button" onClick={claim} disabled={claiming}>
              <Send className="h-3.5 w-3.5 mr-1" aria-hidden />
              {claiming ? 'Opening AmmaWallet…' : claimAmount === claimable ? 'Claim to my wallet' : `Claim ${formatXlm(claimAmount, xlmUsdc)} to my wallet`}
            </Button>
            {claimAmount !== claimable && (
              <p className="basis-full text-xs text-emerald-800" data-testid="claim-limit-note">
                One payment can be at most {formatXlm(claimAmount, xlmUsdc)}. Claim again for the rest.
              </p>
            )}
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
                      {formatXlm(r.amountStroops, xlmUsdc, r.currencyCode)}
                    </td>
                    <td className="sm:table-cell sm:px-3 sm:py-3" role="cell">
                      <RewardStatusBadge status={r.status} label={r.status === 'released' ? 'Earned' : undefined} />
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

        {paymentNotice && (
          <p role="status" data-testid="payment-retry-notice"
            className={`mt-5 rounded-xl border px-4 py-3 text-sm ${paymentNotice.failed ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
            {paymentNotice.text}
          </p>
        )}
        {claimsError && !error && (
          <div role="alert" className="mt-5 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
            <p className="flex-1 text-sm">{claimsError}</p>
            <Button variant="outline" size="sm" type="button" onClick={load}>Try again</Button>
          </div>
        )}
        {claims.length > 0 && (
          <div className="mt-5" data-testid="student-reward-claims">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Payments to your wallet</h3>
            <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
              {claims.map((c) => {
                const p = c.status === 'cancelled'
                  ? { label: 'Cancelled', tone: 'bg-neutral-100 text-neutral-700', note: 'The payment failed, so this amount went back to your LMS balance.' }
                  : CLAIM_PAYOUT[c.payout];
                const canRetry = c.status === 'verified' && (c.payout === 'not_sent' || c.payout === 'failed');
                return (
                  <li key={c.claimId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-3" data-testid="student-reward-claim">
                    <span className="tabular-nums text-sm text-neutral-900">{formatXlm(c.amountStroops, xlmUsdc)}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${p.tone}`} data-testid="claim-payout-status">{p.label}</span>
                    <span className="text-xs text-neutral-500">to {shortAddress(c.destination)}{c.verifiedAt ? ` · ${new Date(c.verifiedAt).toLocaleDateString()}` : ''}</span>
                    {p.note && <p className="basis-full text-xs text-neutral-600">{p.note}</p>}
                    {canRetry && (
                      <Button variant="outline" size="sm" type="button" onClick={() => retry(c.claimId)} disabled={retrying === c.claimId}>
                        {retrying === c.claimId ? 'Trying…' : 'Try payment again'}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
};
