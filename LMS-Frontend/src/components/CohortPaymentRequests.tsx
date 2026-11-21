import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, RefreshCw, Users } from 'lucide-react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { useConfirmAction } from '../hooks/useConfirmAction';
import { useAuth } from '../context/useAuth';
import { hasCapability } from '../utils/authorization';
import { getErrorMessage } from '../utils/apiError';
import { cohortPaymentService, type CohortPaymentRequest } from '../services/cohortPaymentService';

function formatAmount(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
const learners = (n: number) => `${n} learner${n === 1 ? '' : 's'}`;
const sponsorOf = (r: CohortPaymentRequest) => r.sponsorName || r.sponsorEmail || 'The sponsor';

/**
 * Sponsor cohort payment requests waiting for an administrator (billing.confirm).
 * Approving confirms the payment and settles each learner's certificate payment; declining needs a reason
 * the sponsor sees. Nothing is charged here.
 */
export function CohortPaymentRequests() {
  const { user } = useAuth();
  const allowed = hasCapability(user, 'billing.confirm');
  const [requests, setRequests] = useState<CohortPaymentRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { ask, dialog } = useConfirmAction();
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setRequests(await cohortPaymentService.list('pending')); }
    catch (err) { setError(getErrorMessage(err, 'Could not load cohort payment requests.')); setRequests([]); }
  }, []);
  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  if (!allowed) return null;

  const approve = async (r: CohortPaymentRequest) => {
    setNotice(null);
    const amount = formatAmount(r.amountCents, r.currency);
    const done = await ask({
      title: 'Approve this cohort payment?',
      description: <>
        <strong>{sponsorOf(r)}</strong> asked to pay <strong>{amount}</strong> for <strong>{learners(r.learnerCount)}</strong> in {r.cohortName}
        {r.courseName ? <> ({r.courseName})</> : null}. Approving records the payment as paid and lets these learners receive their certificates.
        Nothing is charged here: approve only once the payment has been arranged with the sponsor.
      </>,
      confirmLabel: `Approve ${amount} for ${learners(r.learnerCount)}`,
      cancelLabel: 'Keep in queue',
      variant: 'primary',
      action: () => cohortPaymentService.approve(r.paymentId),
    });
    if (done) { setNotice(`Approved ${r.cohortName}. ${sponsorOf(r)} has been told.`); void load(); }
  };

  const decline = async (r: CohortPaymentRequest) => {
    setNotice(null);
    const done = await ask({
      title: 'Decline this cohort payment?',
      description: <>
        The request from <strong>{sponsorOf(r)}</strong> for <strong>{formatAmount(r.amountCents, r.currency)}</strong> ({learners(r.learnerCount)}, {r.cohortName}) is closed. The sponsor sees your reason and can send a new request.
        <label className="mt-3 block text-sm font-medium text-neutral-800">Reason (the sponsor sees this)
          <textarea ref={reasonRef} rows={3} maxLength={500} className="mt-1 block w-full rounded border border-neutral-300 p-2 text-sm font-normal" />
        </label>
      </>,
      confirmLabel: 'Decline request',
      cancelLabel: 'Keep in queue',
      variant: 'danger',
      action: async () => {
        const reason = reasonRef.current?.value.trim() ?? '';
        if (!reason) throw new Error('Give a reason so the sponsor knows what to change.');
        await cohortPaymentService.decline(r.paymentId, reason);
      },
    });
    if (done) { setNotice(`Declined ${r.cohortName}. ${sponsorOf(r)} has been told why.`); void load(); }
  };

  return (
    <Card>
      {dialog}
      <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-500" aria-hidden />
          <CardTitle className="border-0 p-0 text-sm">Cohort payment requests</CardTitle>
        </div>
        <Button variant="outline" size="sm" type="button" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden />Refresh
        </Button>
      </div>
      <CardContent className="p-5">
        <p className="text-sm text-neutral-600 mb-4">Sponsors asking to pay for a cohort. You cannot decide a request for a cohort you sponsor.</p>
        {notice && <p role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 mb-4"><CheckCircle className="h-5 w-5 shrink-0" aria-hidden />{notice}</p>}
        {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 mb-4"><AlertCircle className="h-5 w-5 shrink-0" aria-hidden />{error}</div>}
        {requests === null ? (
          <p role="status" className="text-sm text-neutral-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-neutral-500">No cohort payment requests are waiting.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {requests.map(r => (
              <li key={r.paymentId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 truncate">{r.cohortName}</p>
                  <p className="text-xs text-neutral-500">
                    {formatAmount(r.amountCents, r.currency)} for {learners(r.learnerCount)}
                    {r.courseName ? ` · ${r.courseName}` : ''} · requested by {sponsorOf(r)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" type="button" onClick={() => void decline(r)}>Decline</Button>
                  <Button size="sm" type="button" onClick={() => void approve(r)}>Approve</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
