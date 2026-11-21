import { useCallback, useEffect, useState } from 'react';
import { Gift, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { RewardFundingDialog } from '../components/RewardFundingDialog';
import { useXlmUsdcPrice } from '../hooks/useXlmUsdcPrice';
import { formatXlm } from '../utils/xlmAmount';
import { rewardService, type AwaitingFundingReward } from '../services/rewardService';
import { getErrorMessage } from '../utils/apiError';

/**
 * Administrators authorize funding for rewards that someone else created (an administrator grant or platform credit).
 * The existing funding dialog does the work; the funding routes already accept anyone with the reward-manage permission.
 */
export default function AdminRewards() {
  const [rewards, setRewards] = useState<AwaitingFundingReward[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [funding, setFunding] = useState<AwaitingFundingReward | null>(null);
  const xlmUsdc = useXlmUsdcPrice();

  const load = useCallback(async () => {
    setError(null);
    try { setRewards(await rewardService.listAwaitingFunding()); }
    catch (err) { setError(getErrorMessage(err, 'Could not load rewards waiting for authorization.')); setRewards([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
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
          <p className="text-sm text-neutral-600 mb-4">Draft rewards created by someone else. You cannot authorize a reward you created.</p>
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
                    <p className="font-medium text-neutral-900 truncate">{r.description || 'Reward'}</p>
                    <p className="text-xs text-neutral-500">
                      {formatXlm(r.amountStroops, xlmUsdc)}{r.maxRecipients ? ` for up to ${r.maxRecipients} learner${r.maxRecipients === 1 ? '' : 's'}` : ' per learner'}
                      {r.scopeName ? ` · ${r.scopeName}` : ''} · created by {r.creatorName}
                    </p>
                  </div>
                  <Button size="sm" type="button" onClick={() => setFunding(r)}>Funding options</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {funding && (
        <RewardFundingDialog role="teacher" rewardId={funding.id} onClose={() => setFunding(null)} onFunded={() => { setFunding(null); void load(); }} />
      )}
    </div>
  );
}
