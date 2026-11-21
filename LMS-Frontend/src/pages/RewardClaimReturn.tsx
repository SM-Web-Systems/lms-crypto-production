import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { rewardService, type VerifiedClaim } from '../services/rewardService';
import { takeClaim } from '../utils/rewardClaim';
import { getErrorMessage } from '../utils/apiError';

type View = { kind: 'working' } | { kind: 'verified'; paid: boolean; notSent?: string } | { kind: 'declined' } | { kind: 'error'; message: string };

/** What AmmaWallet says when it cannot approve: #claim=<id>&error=expired|unavailable, or #error=invalid (no claim id). Never with a signature. */
const WALLET_ERRORS: Record<string, string> = {
  expired: 'This claim expired. Start a new claim from your rewards. Your rewards are still safe in your LMS balance.',
  unavailable: 'AmmaWallet cannot approve this claim right now. Try again in a moment from your rewards.',
  invalid: 'AmmaWallet could not read this claim. Start a new claim from your rewards.',
};

/** A payout that a rule refused, or that could not be sent, is never shown as sent: the learner sees why. */
function notSentReason(payout: VerifiedClaim['payout']): string | undefined {
  if (!payout || (payout.status !== 'refused' && payout.status !== 'pending')) return undefined;
  return 'message' in payout && payout.message ? payout.message : 'The payment could not be sent yet. Your claim is saved.';
}

/** AmmaWallet returns here with #claim=<id>&signature=<base64> (or &declined=1, or &error=...). */
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
    // A reason from the wallet is shown as it is and never verified; an unknown value falls through like a bare return.
    const reason = WALLET_ERRORS[params.get('error') ?? ''];
    if (reason) { setView({ kind: 'error', message: reason }); return; }
    const signature = params.get('signature') ?? '';
    if (!claimId || !signature || !message) {
      setView({ kind: 'error', message: 'This claim link is incomplete or expired. Start the claim again from your rewards.' });
      return;
    }
    rewardService.verifyClaim(claimId, message, signature)
      .then(v => setView({ kind: 'verified', paid: v.payout?.status === 'paid', notSent: notSentReason(v.payout) }))
      .catch(err => setView({ kind: 'error', message: getErrorMessage(err, 'Could not verify the claim. Start it again from your rewards.') }));
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-10" aria-live="polite">
      <h1 className="text-xl font-semibold text-neutral-900">Reward claim</h1>
      {view.kind === 'working' && (
        <p className="flex items-center gap-2 text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Checking your wallet's signature…</p>
      )}
      {view.kind === 'verified' && view.notSent && (
        <div role="status" data-testid="claim-payout-not-sent" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
          <p>Your wallet is confirmed, but the reward has <strong>not been sent</strong> to it. {view.notSent}</p>
        </div>
      )}
      {view.kind === 'verified' && !view.notSent && (
        <div role="status" className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <CheckCircle className="h-5 w-5 shrink-0" aria-hidden />
          <p>{view.paid
            ? 'Your wallet is confirmed and the reward has been sent to it.'
            : 'Your wallet is confirmed. The claimed amount is reserved for payment to that wallet.'}</p>
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
