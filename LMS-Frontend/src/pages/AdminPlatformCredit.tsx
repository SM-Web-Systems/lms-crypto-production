import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, RefreshCw, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { getErrorMessage } from '../utils/apiError';
import { useConfirmAction, type ConfirmActionOptions } from '../hooks/useConfirmAction';
import {
  platformCreditService, stroopsToXlm, xlmToStroops,
  type Beneficiary, type BackingIntent, type Summary,
} from '../services/platformCreditService';

const when = (iso: string) => new Date(iso).toLocaleString();
const field = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm';

/** web+stellar:pay link (SEP-7): wallets that support it pre-fill destination, amount and memo. */
export function stellarPayLink(i: Pick<BackingIntent, 'destination' | 'amount_stroops' | 'memo_hash' | 'text_memo' | 'network'>): string {
  const q = new URLSearchParams({ destination: i.destination, amount: stroopsToXlm(i.amount_stroops) });
  if (i.text_memo) { q.set('memo', i.text_memo); q.set('memo_type', 'MEMO_TEXT'); }
  else { q.set('memo', btoa(String.fromCharCode(...(i.memo_hash.match(/../g) ?? []).map(h => parseInt(h, 16))))); q.set('memo_type', 'MEMO_HASH'); }
  if (i.network === 'public') q.set('network_passphrase', 'Public Global Stellar Network ; September 2015');
  return `web+stellar:pay?${q.toString()}`;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* user can still select the text */ }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-28 shrink-0 text-xs font-medium text-amber-900">{label}</span>
      <input readOnly aria-label={label} value={value} onFocus={e => e.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-2 py-1 font-mono text-xs" />
      <Button type="button" size="sm" variant="outline" onClick={copy} aria-label={`Copy ${label}`}>{copied ? 'Copied' : 'Copy'}</Button>
    </div>
  );
}

function DepositInstructions({ intent }: { intent: BackingIntent }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm space-y-2" data-testid="deposit-instructions">
      <p className="font-medium text-amber-900">Send exactly this from the configured treasury wallet ({intent.network === 'public' ? 'real XLM' : 'test XLM'}). Expires {when(intent.expires_at)}.</p>
      <CopyField label="Send to" value={intent.destination} />
      <CopyField label="Amount (XLM)" value={stroopsToXlm(intent.amount_stroops)} />
      {intent.text_memo && <CopyField label="Memo (text)" value={intent.text_memo} />}
      <CopyField label="Memo (hash, hex)" value={intent.memo_hash} />
      <p className="text-xs text-amber-900">Use <strong>either</strong> memo, not both: the text memo for ordinary wallets, or the hash memo (memo type "hash") where the wallet supports it. Then paste the payment's operation ID below.</p>
      <a href={stellarPayLink(intent)} className="inline-block text-xs underline text-amber-900" data-testid="pay-link">Open in a wallet that supports payment links</a>
    </div>
  );
}

/**
 * Backed platform credit, in four steps:
 *  1. Deposit: a backing request names an amount; the treasury wallet sends exactly that to the pool with the memo shown; an operation ID verifies it.
 *  2. Request: an administrator asks for part of the verified backing as credit for a person who funds rewards.
 *  3. Approve: a different administrator approves (never the requester, never the beneficiary).
 *  4. Use: the credit funds a reward from Rewards to authorize, Funding options, Platform credit.
 */
export default function AdminPlatformCredit() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [people, setPeople] = useState<Beneficiary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<BackingIntent | null>(null);
  const [depositXlm, setDepositXlm] = useState('');
  const [depositReason, setDepositReason] = useState('');
  const [operationIds, setOperationIds] = useState<Record<string, string>>({});
  const [beneficiary, setBeneficiary] = useState('');
  const [creditXlm, setCreditXlm] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [recon, setRecon] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [verifyErrors, setVerifyErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([platformCreditService.summary(), platformCreditService.beneficiaries()]);
      setSummary(s); setPeople(p); setError(null);
    } catch (err) { setError(getErrorMessage(err, 'Could not load platform credit.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // While a deposit request is waiting for its payment the server watches the network; keep the page in step so it flips to verified by itself.
  const waiting = summary?.backingIntents.some(i => i.effective_status === 'awaiting_deposit') ?? false;
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(t);
  }, [waiting, load]);

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); setNotice(label); await load(); }
    catch (err) { setError(getErrorMessage(err, 'That did not work.')); }
    finally { setBusy(false); }
  };

  const { ask, dialog, busy: confirming } = useConfirmAction();
  /** Money moves only after the person confirms in the dialog (UX-001). */
  const confirmRun = (label: string, opts: ConfirmActionOptions) => {
    void ask(opts).then(async ok => { if (ok) { setError(null); setNotice(label); await load(); } });
  };
  // Credit is only requested on the public pool (reservations carry no network of their own).
  const amountOf = (stroops: number, network: string) =>
    `${stroopsToXlm(stroops)} ${summary?.pools.find(p => p.network === network)?.currency ?? ''}`.trim();

  const nameOf = useMemo(() => {
    const m = new Map(people.map(p => [p.id, p.name || p.email]));
    return (id: string) => m.get(id) ?? `${id.slice(0, 8)}…`;
  }, [people]);

  const depositStroops = xlmToStroops(depositXlm);
  const creditStroops = xlmToStroops(creditXlm);
  const pool = summary?.pools.find(p => p.network === 'public');

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
          <div className="flex items-center gap-2"><Coins className="h-5 w-5 text-emerald-500" aria-hidden /><CardTitle className="border-0 p-0 text-sm">Platform credit</CardTitle></div>
          <Button variant="outline" size="sm" type="button" onClick={load} disabled={busy}><RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden />Refresh</Button>
        </div>
        <CardContent className="p-5 space-y-3">
          <p className="text-sm text-neutral-600">Real XLM held in the reward pool backs credit that administrators give to people who fund rewards. Every step is recorded, and two different administrators must take part.</p>
          {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"><AlertCircle className="h-5 w-5 shrink-0" aria-hidden />{error}</div>}
          {notice && <div role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><CheckCircle className="h-5 w-5 shrink-0" aria-hidden />{notice}</div>}
          {summary === null && !error && <p role="status" className="text-sm text-neutral-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading…</p>}
          {summary && (
            <table className="w-full text-sm" aria-label="Backing pools">
              <thead><tr className="text-left text-xs uppercase text-neutral-500"><th className="py-1">Network</th><th>Deposited</th><th>Credit given</th><th>On hold</th><th>Available</th></tr></thead>
              <tbody>{summary.pools.map(p => (
                <tr key={p.network} className="border-t border-neutral-100">
                  <td className="py-2">{p.network === 'public' ? 'Public (real XLM)' : 'Testnet'}</td>
                  <td>{stroopsToXlm(p.depositedStroops)} XLM</td><td>{stroopsToXlm(p.allocatedStroops)} XLM</td>
                  <td>{stroopsToXlm(p.reservedStroops)} XLM</td><td className="font-medium">{stroopsToXlm(p.availableStroops)} XLM</td>
                </tr>))}</tbody>
            </table>
          )}
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" type="button" disabled={busy}
              onClick={() => void run('Reconciliation finished.', async () => { const r = await platformCreditService.reconcile('public'); setRecon(JSON.stringify(r)); })}>Reconcile public ledger</Button>
            {recon && <code className="text-xs break-all text-neutral-600" data-testid="recon-result">{recon}</code>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="px-5 py-3 border-b border-neutral-200"><CardTitle className="border-0 p-0 text-sm">1. Deposit backing</CardTitle></div>
        <CardContent className="p-5 space-y-3">
          <form className="grid gap-3 sm:grid-cols-[10rem,1fr,auto] items-end" onSubmit={e => { e.preventDefault(); if (!depositStroops) return;
            setCreateError(null);
            setBusy(true); setError(null); setNotice(null);
            void platformCreditService.createBackingIntent(depositStroops, depositReason.trim())
              .then(async (intent) => { setCreated(intent); setNotice('Deposit request created. Send exactly that amount with the memo shown. It is matched automatically once the payment is on the network.'); await load(); })
              .catch(err => setCreateError(getErrorMessage(err, 'Could not create the deposit request.')))
              .finally(() => setBusy(false)); }}>
            <label className="text-sm">Amount (XLM)<input className={field} inputMode="decimal" value={depositXlm} onChange={e => setDepositXlm(e.target.value)} placeholder="1.0" /></label>
            <label className="text-sm">Reason<input className={field} value={depositReason} onChange={e => setDepositReason(e.target.value)} placeholder="Back platform credit for reward funding" /></label>
            <Button type="submit" size="sm" disabled={busy || !depositStroops || !depositReason.trim()}>Create deposit request</Button>
          </form>
          {createError && <p role="alert" data-testid="create-error" className="text-sm text-red-700">{createError}</p>}
          {waiting && <p aria-live="polite" data-testid="waiting-note" className="text-sm text-neutral-700 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Waiting for the payment. This page updates by itself when it arrives (usually within a minute).</p>}
          {created && <DepositInstructions intent={created} />}
          {summary && summary.backingIntents.length > 0 && (
            <ul className="divide-y divide-neutral-100">
              {summary.backingIntents.slice(0, 10).map(i => (
                <li key={i.id} className="py-3 space-y-2">
                  <p className="text-sm"><span className="font-medium">{stroopsToXlm(i.amount_stroops)} XLM</span> on {i.network} · {i.reason} · <span data-testid={`intent-${i.id}`}>{i.effective_status.replace('_', ' ')}</span> · {when(i.created_at)}</p>
                  {i.effective_status === 'awaiting_deposit' && created?.id !== i.id && <DepositInstructions intent={i} />}
                  {i.effective_status === 'awaiting_deposit' && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-neutral-600">Payment sent but not picked up after a few minutes? Enter its operation ID</summary>
                      <div className="mt-2 flex flex-wrap gap-2 items-end">
                        <label className="text-sm flex-1 min-w-[12rem]">Operation ID<input className={field} value={operationIds[i.id] ?? ''} onChange={e => { setOperationIds(o => ({ ...o, [i.id]: e.target.value })); setVerifyErrors(v => ({ ...v, [i.id]: '' })); }} /></label>
                        <Button size="sm" type="button" disabled={busy || !(operationIds[i.id] ?? '').trim()}
                          onClick={() => {
                            const id = (operationIds[i.id] ?? '').trim();
                            if (/^[a-f0-9]{64}$/i.test(id)) { setVerifyErrors(v => ({ ...v, [i.id]: 'That is a transaction hash. Enter the payment operation ID instead: a number of about 18 digits.' })); return; }
                            if (!/^[1-9][0-9]{0,19}$/.test(id)) { setVerifyErrors(v => ({ ...v, [i.id]: 'The operation ID is a number (digits only).' })); return; }
                            setBusy(true); setError(null); setNotice(null);
                            void platformCreditService.verifyBackingDeposit(i.id, id)
                              .then(async () => { setNotice('Deposit verified against the network.'); setVerifyErrors(v => ({ ...v, [i.id]: '' })); await load(); })
                              .catch(err => setVerifyErrors(v => ({ ...v, [i.id]: getErrorMessage(err, 'That did not match this request.') })))
                              .finally(() => setBusy(false));
                          }}>Verify deposit</Button>
                      </div>
                      {verifyErrors[i.id] && <p role="alert" data-testid={`verify-error-${i.id}`} className="mt-1 text-sm text-red-700">{verifyErrors[i.id]}</p>}
                    </details>
                  )}
                </li>))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <div className="px-5 py-3 border-b border-neutral-200"><CardTitle className="border-0 p-0 text-sm">2. Request credit for a person</CardTitle></div>
        <CardContent className="p-5 space-y-3">
          <p className="text-sm text-neutral-600">{pool ? `Available verified backing on the public network: ${stroopsToXlm(pool.availableStroops)} XLM.` : ''} You cannot request credit for yourself, and you cannot approve your own request.</p>
          <form className="grid gap-3 sm:grid-cols-[1fr,8rem,1fr,auto] items-end" onSubmit={e => { e.preventDefault(); if (!creditStroops || !beneficiary) return;
            void run('Credit requested. A different administrator must approve it.', () => platformCreditService.requestCredit(beneficiary, creditStroops, creditReason.trim())); }}>
            <label className="text-sm">Person<select className={field} value={beneficiary} onChange={e => setBeneficiary(e.target.value)}>
              <option value="">Choose…</option>{people.map(p => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}</select></label>
            <label className="text-sm">Amount (XLM)<input className={field} inputMode="decimal" value={creditXlm} onChange={e => setCreditXlm(e.target.value)} placeholder="0.1" /></label>
            <label className="text-sm">Reason<input className={field} value={creditReason} onChange={e => setCreditReason(e.target.value)} /></label>
            <Button type="submit" size="sm" disabled={busy || !creditStroops || !beneficiary || !creditReason.trim()}>Request credit</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <div className="px-5 py-3 border-b border-neutral-200"><CardTitle className="border-0 p-0 text-sm">3. Approve credit requests</CardTitle></div>
        <CardContent className="p-5">
          {summary && summary.requests.length === 0 && <p className="text-sm text-neutral-500">No credit requests yet.</p>}
          <ul className="divide-y divide-neutral-100">
            {summary?.requests.slice(0, 10).map(r => (
              <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm"><span className="font-medium">{stroopsToXlm(r.amount_stroops)} XLM</span> for {nameOf(r.beneficiary_user_id)} · requested by {nameOf(r.requester_user_id)} · {r.reason} · <span data-testid={`request-${r.id}`}>{r.effective_status}</span></p>
                {r.effective_status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" type="button" disabled={busy || confirming} onClick={() => confirmRun('Credit approved.', {
                      title: 'Approve platform credit?',
                      description: <>Approve <strong>{amountOf(r.amount_stroops, r.network)}</strong> for <strong>{nameOf(r.beneficiary_user_id)}</strong>. Requested by {nameOf(r.requester_user_id)}.</>,
                      confirmLabel: `Approve ${amountOf(r.amount_stroops, r.network)}`, variant: 'primary',
                      action: () => platformCreditService.approve(r.id, `Approved ${amountOf(r.amount_stroops, r.network)} platform credit`),
                    })}>Approve</Button>
                    <Button size="sm" variant="outline" type="button" disabled={busy || confirming} onClick={() => confirmRun('Request cancelled.', {
                      title: 'Cancel credit request?',
                      description: <>Cancel this request. {amountOf(r.amount_stroops, r.network)} for {nameOf(r.beneficiary_user_id)} will not be given.</>,
                      confirmLabel: 'Cancel request', cancelLabel: 'Keep request',
                      action: () => platformCreditService.cancel(r.id, 'Cancelled by an administrator'),
                    })}>Cancel</Button>
                  </div>
                )}
              </li>))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <div className="px-5 py-3 border-b border-neutral-200"><CardTitle className="border-0 p-0 text-sm">4. Credit in use</CardTitle></div>
        <CardContent className="p-5 space-y-3">
          <p className="text-sm text-neutral-600">Approved credit funds a reward from <strong>Rewards to authorize</strong>, Funding options, Platform credit, by an administrator who is not the reward's creator. Credit that is on hold for a reward can be released here.</p>
          {summary && summary.reservations.length === 0 && <p className="text-sm text-neutral-500">No credit reservations yet.</p>}
          <ul className="divide-y divide-neutral-100">
            {summary?.reservations.slice(0, 10).map(c => (
              <li key={c.intent_id} className="py-2 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>{stroopsToXlm(c.amount_stroops)} XLM for {nameOf(c.owner_user_id)} · {c.effective_status}</span>
                {c.effective_status === 'held' && <Button size="sm" variant="outline" type="button" disabled={busy || confirming} onClick={() => confirmRun('Reservation released.', {
                  title: 'Release held credit?',
                  description: <>Release <strong>{amountOf(c.amount_stroops, 'public')}</strong> held for <strong>{nameOf(c.owner_user_id)}</strong>.</>,
                  confirmLabel: `Release ${amountOf(c.amount_stroops, 'public')}`,
                  action: () => platformCreditService.releaseReservation(c.intent_id),
                })}>Release</Button>}
              </li>))}
          </ul>
          {summary && summary.audit.length > 0 && (
            <details className="text-sm"><summary className="cursor-pointer font-medium">Recent activity</summary>
              <ul className="mt-2 space-y-1">{summary.audit.slice(0, 15).map(a => <li key={a.id} className="text-neutral-600">{when(a.created_at)} · {a.event_type.replace(/_/g, ' ')} · {stroopsToXlm(a.amount_stroops)} XLM · {nameOf(a.actor_user_id)}</li>)}</ul>
            </details>
          )}
        </CardContent>
      </Card>
      {dialog}
    </div>
  );
}
