import { useEffect, useRef, useState } from 'react';
import { rewardService, type FundingOption } from '../services/rewardService';
import { Button } from './Button';

const labels: Record<string, string> = {
  stellar: 'Stellar transfer', paystack: 'Card payment', platform_credit: 'Platform credit', admin_grant: 'Administrator grant',
};

export function RewardFundingDialog({role, rewardId, onClose, onFunded, returnFocus}: {
  role: string; rewardId: string; onClose: () => void; onFunded: () => void; returnFocus?: HTMLElement | null;
}) {
  const [options, setOptions] = useState<FundingOption[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [exposure, setExposure] = useState<number | null>(null);
  const [prepared, setPrepared] = useState(false);
  const alive = useRef(true);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // WebKit pointer activation may leave document.body active. The dashboard
    // records the actual opening control so keyboard users return to that row.
    const previous = returnFocus ?? document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [returnFocus]);
  // Reuse across retries, including an ambiguous network failure after commit.
  const key = useRef(`fund-${crypto.randomUUID()}`);
  const intent = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    setOptions(null);
    setError('');
    rewardService.getFundingOptions(role, rewardId).then(result => {
      if (!cancelled) setOptions(result);
    }).catch(() => { if (!cancelled) setError('Could not load funding methods.'); });
    return () => { cancelled = true; alive.current = false; };
  }, [role, rewardId, attempt]);

  const prepare = async () => {
    setBusy(true); setError('');
    try {
      const result = await rewardService.createFundingIntent(role, rewardId, 'admin_grant', key.current);
      if (!alive.current) return;
      intent.current = result.id;
      setExposure(result.amount_stroops);
      setPrepared(true);
    } catch { if (alive.current) setError('Could not prepare this grant. Please retry.'); }
    finally { if (alive.current) setBusy(false); }
  };
  const authorize = async () => {
    if (!intent.current) return;
    setBusy(true); setError('');
    try {
      await rewardService.fundReward(role, rewardId, 'admin_grant', undefined, key.current, intent.current);
      if (alive.current) onFunded();
    } catch { if (alive.current) setError('Grant was not confirmed. Retry to check the same request.'); }
    finally { if (alive.current) setBusy(false); }
  };

  const exactAmount = exposure === null ? '' : `${BigInt(exposure) / 10_000_000n}.${(BigInt(exposure) % 10_000_000n).toString().padStart(7, '0')} XLM`;
  return <div ref={dialog} tabIndex={-1} className="fixed inset-0 bg-neutral-900/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Reward funding"
    onKeyDown={event => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault(); first.focus();
      }
    }}>
    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
      <h3 className="text-lg font-bold">Reward funding</h3>
      {!options && !error && <p role="status">Loading funding methods…</p>}
      {options && <ul className="space-y-3">{options.map(option => <li key={option.sourceType}>
        <span className="font-medium">{labels[option.sourceType] ?? option.sourceType}</span>
        {!option.available && <p className="text-sm text-neutral-600">{option.reason ?? 'Unavailable'}</p>}
        {option.available && option.sourceType === 'admin_grant' && !prepared && <Button type="button" size="sm" disabled={busy} onClick={prepare}>Prepare grant</Button>}
      </li>)}</ul>}
      {prepared && <div>
        <p>Authorize a grant of {exactAmount} to fund and reserve this reward.</p>
        <Button type="button" size="sm" disabled={busy} onClick={authorize}>Authorize grant</Button>
      </div>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!options && error && <Button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Close</Button>
    </div>
  </div>;
}
