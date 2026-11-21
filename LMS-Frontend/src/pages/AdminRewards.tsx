import { useCallback, useEffect, useRef, useState } from 'react';
import { Gift, RefreshCw, AlertCircle, Loader2, CheckCircle, LifeBuoy } from 'lucide-react';
import { Card, CardContent, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { RewardFundingDialog } from '../components/RewardFundingDialog';
import { useXlmUsdcPrice } from '../hooks/useXlmUsdcPrice';
import { useConfirmAction } from '../hooks/useConfirmAction';
import { useAuth } from '../context/useAuth';
import { hasCapability } from '../utils/authorization';
import { formatXlm } from '../utils/xlmAmount';
import { rewardService, type AwaitingFundingReward, type RefundAttempt, type StuckPayout } from '../services/rewardService';
import { getErrorMessage } from '../utils/apiError';

const rewardName = (r: AwaitingFundingReward) => r.description || 'Reward';
const networkName = (n: StuckPayout['network']) => n === 'public' ? 'Public network' : n === 'testnet' ? 'Testnet' : 'Not sent';

/**
 * Administrators authorize funding for rewards that someone else created (an administrator grant or platform credit),
 * or send them back with a reason. Refund reviewers also see learner payouts and refunds that are stuck (UX-019).
 */
export default function AdminRewards() {
  const { user } = useAuth();
  const [rewards, setRewards] = useState<AwaitingFundingReward[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [funding, setFunding] = useState<AwaitingFundingReward | null>(null);
  const xlmUsdc = useXlmUsdcPrice();
  const { ask, dialog } = useConfirmAction();
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setRewards(await rewardService.listAwaitingFunding()); }
    catch (err) { setError(getErrorMessage(err, 'Could not load rewards waiting for authorization.')); setRewards([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sendBack = async (r: AwaitingFundingReward) => {
    setNotice(null);
    const done = await ask({
      title: 'Send this reward back?',
      description: <>
        <strong>{rewardName(r)}</strong> ({formatXlm(r.amountStroops, xlmUsdc)}) is not funded and is closed. <strong>{r.creatorName}</strong> sees your reason and can create a corrected reward.
        <label className="mt-3 block text-sm font-medium text-neutral-800">Reason (the creator sees this)
          <textarea ref={reasonRef} rows={3} maxLength={500} className="mt-1 block w-full rounded border border-neutral-300 p-2 text-sm font-normal" />
        </label>
      </>,
      confirmLabel: 'Send back reward',
      cancelLabel: 'Keep in queue',
      variant: 'danger',
      action: async () => {
        const reason = reasonRef.current?.value.trim() ?? '';
        if (!reason) throw new Error('Give a reason so the creator knows what to change.');
        await rewardService.declineReward(r.id, reason);
      },
    });
    if (done) { setNotice(`Sent back to ${r.creatorName}. They have been told why.`); void load(); }
  };

  return (
    <div className="space-y-4">
      {dialog}
      <Card>
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-emerald-500" aria-hidden />
            <CardTitle className="border-0 p-0 text-sm">Rewards to authorize</CardTitle>
          </div>
          <Button variant="outline" size="sm" type="button" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden />Refresh
          </Button>
        </div>
        <CardContent className="p-5">
          <p className="text-sm text-neutral-600 mb-4">Draft rewards created by someone else. You cannot authorize or send back a reward you created.</p>
          {notice && <p role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 mb-4"><CheckCircle className="h-5 w-5 shrink-0" aria-hidden />{notice}</p>}
          {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 mb-4"><AlertCircle className="h-5 w-5 shrink-0" aria-hidden />{error}</div>}
          {rewards === null ? (
            <p role="status" className="text-sm text-neutral-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading…</p>
          ) : rewards.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing is waiting for authorization.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {rewards.map(r => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-900 truncate">{rewardName(r)}</p>
                    <p className="text-xs text-neutral-500">
                      {formatXlm(r.amountStroops, xlmUsdc)}{r.maxRecipients ? ` for up to ${r.maxRecipients} learner${r.maxRecipients === 1 ? '' : 's'}` : ' per learner'}
                      {r.scopeName ? ` · ${r.scopeName}` : ''} · created by {r.creatorName}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" type="button" onClick={() => void sendBack(r)}>Send back</Button>
                    <Button size="sm" type="button" onClick={() => { setNotice(null); setFunding(r); }}>Funding options</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {hasCapability(user, 'reward.refund_review') && <PayoutProblems xlmUsdc={xlmUsdc} ask={ask} />}
      {funding && (
        <RewardFundingDialog role="teacher" rewardId={funding.id} rewardName={rewardName(funding)} onClose={() => setFunding(null)}
          onFunded={() => {
            setNotice(`Funded “${rewardName(funding)}”. ${funding.creatorName} has been told to press Activate so learners can start earning it.`);
            setFunding(null);
            void load();
          }} />
      )}
    </div>
  );
}

/** UX-019: blocked refunds ("recorded for admin review") and learner payouts that did not reach the network. */
function PayoutProblems({ xlmUsdc, ask }: { xlmUsdc: number | null; ask: ReturnType<typeof useConfirmAction>['ask'] }) {
  const [payouts, setPayouts] = useState<StuckPayout[] | null>(null);
  const [refunds, setRefunds] = useState<RefundAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, r] = await Promise.all([rewardService.listStuckPayouts(), rewardService.listRefundAttempts()]);
      setPayouts(p); setRefunds(r);
    } catch (err) { setError(getErrorMessage(err, 'Could not load payout problems.')); setPayouts([]); setRefunds([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const retry = async (a: RefundAttempt) => {
    const amount = formatXlm(a.attempted_amount_stroops, xlmUsdc, a.currency_code);
    const key = `refund-retry-${crypto.randomUUID()}`;
    const done = await ask({
      title: 'Retry this refund?',
      description: <>Take back <strong>{amount}</strong> from <strong>{a.learner_name || 'this learner'}</strong> for {a.reward_description || 'this reward'}. It works only if the learner still has the money in the LMS.</>,
      confirmLabel: `Retry refund of ${amount}`,
      variant: 'danger',
      action: () => rewardService.retryRefundAttempt(a.id, key),
    });
    if (done) void load();
  };

  return (
    <Card>
      <section aria-labelledby="payout-problems-title">
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-amber-500" aria-hidden />
            <h2 id="payout-problems-title" className="text-sm font-semibold text-neutral-900">Payout problems</h2>
          </div>
          <Button variant="outline" size="sm" type="button" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden />Refresh
          </Button>
        </div>
        <CardContent className="p-5 space-y-5">
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div>
            <h3 className="text-sm font-medium text-neutral-800 mb-2">Learner payouts that did not arrive</h3>
            {payouts === null ? <p role="status" className="text-sm text-neutral-500">Loading…</p>
              : payouts.length === 0 ? <p className="text-sm text-neutral-500">None. Every verified claim was paid or is on its way.</p>
              : <ul className="divide-y divide-neutral-100">{payouts.map(p => (
                <li key={p.claimId} className="py-2 text-sm">
                  <p className="font-medium text-neutral-900">{p.learnerName} · {formatXlm(p.amountStroops, xlmUsdc)}</p>
                  <p className="text-xs text-neutral-500 break-words">
                    {networkName(p.network)} · {p.payoutStatus === 'failed' ? `Failed${p.error ? `: ${p.error}` : ''}` : p.payoutStatus === 'submitted' ? 'Sent but not confirmed in time' : 'Never sent'}
                    {p.txHash ? ` · transaction ${p.txHash}` : ''}
                  </p>
                </li>))}</ul>}
          </div>
          <div>
            <h3 className="text-sm font-medium text-neutral-800 mb-2">Blocked refunds</h3>
            {refunds === null ? <p role="status" className="text-sm text-neutral-500">Loading…</p>
              : refunds.length === 0 ? <p className="text-sm text-neutral-500">None.</p>
              : <ul className="divide-y divide-neutral-100">{refunds.map(a => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-900">{a.reward_description || 'Reward'} · {formatXlm(a.attempted_amount_stroops, xlmUsdc, a.currency_code)}</p>
                    <p className="text-xs text-neutral-500">{a.learner_name || 'Unnamed learner'} had already moved the money · {new Date(a.created_at.replace(' ', 'T') + (a.created_at.includes('Z') ? '' : 'Z')).toLocaleString()}</p>
                  </div>
                  <Button size="sm" variant="outline" type="button" onClick={() => void retry(a)}>Retry refund</Button>
                </li>))}</ul>}
          </div>
        </CardContent>
      </section>
    </Card>
  );
}
