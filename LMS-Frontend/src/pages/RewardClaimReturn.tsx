import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { rewardService } from '../services/rewardService';
import { takeClaim } from '../utils/rewardClaim';
import { getErrorMessage } from '../utils/apiError';

type View = { kind: 'working' } | { kind: 'verified' } | { kind: 'declined' } | { kind: 'error'; message: string };

/** AmmaWallet returns here with #claim=<id>&signature=<base64> (or &declined=1). */
export default function RewardClaimReturn() {
  const [view, setView] = useState<View>({ kind: 'working' });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, '', window.location.pathname);
    const claimId = params.get('claim') ?? '';
    const message = takeClaim(claimId);
    if (params.get('declined') === '1') { setView({ kind: 'declined' }); return; }
    const signature = params.get('signature') ?? '';
    if (!claimId || !signature || !message) {
      setView({ kind: 'error', message: 'This claim link is incomplete or expired. Start the claim again from your rewards.' });
      return;
    }
    rewardService.verifyClaim(claimId, message, signature)
      .then(() => setView({ kind: 'verified' }))
      .catch(err => setView({ kind: 'error', message: getErrorMessage(err, 'Could not verify the claim. Start it again from your rewards.') }));
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-10" aria-live="polite">
      <h1 className="text-xl font-semibold text-neutral-900">Reward claim</h1>
      {view.kind === 'working' && (
        <p className="flex items-center gap-2 text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Checking your wallet's signature…</p>
      )}
      {view.kind === 'verified' && (
        <div role="status" className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <CheckCircle className="h-5 w-5 shrink-0" aria-hidden />
          <p>Your wallet is confirmed. The claimed amount is reserved for payment to that wallet.</p>
        </div>
      )}
      {view.kind === 'declined' && (
        <p role="status" className="text-neutral-700">You declined the claim in AmmaWallet. Your rewards stay in your LMS balance.</p>
      )}
      {view.kind === 'error' && (
        <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden /><p>{view.message}</p>
        </div>
      )}
      <Link to="/student/rewards" className="text-sm font-semibold text-primary-600 hover:underline">Back to my rewards</Link>
    </div>
  );
}
