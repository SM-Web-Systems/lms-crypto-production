import { useEffect, useState } from 'react';
import { sponsorService, type SponsorBilling, type DateRange } from '../services/sponsorService';
import { useAuth } from '../context/useAuth';
import { hasCapability } from '../utils/authorization';
import { getErrorMessage } from '../utils/apiError';
import { Button } from './Button';

function BillingHistory({
  scope,
  dateRange,
  refreshTick,
}: {
  scope: 'own' | 'cohort';
  dateRange?: DateRange;
  refreshTick: number;
}) {
  const [data, setData] = useState<SponsorBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    setReceiptError('');
    const request =
      scope === 'own' ? sponsorService.getBilling(dateRange) : sponsorService.getBilling(dateRange, 'cohort');
    request
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load billing history.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, dateRange, refreshTick, retry]);
  const title = scope === 'own' ? 'Your payments' : 'Cohort member payments';
  async function receipt(id: string) {
    setReceiptId(id);
    setReceiptError('');
    try {
      await sponsorService.downloadReceipt(id);
    } catch (err) {
      setReceiptError(getErrorMessage(err, 'Could not download receipt.'));
    } finally {
      setReceiptId(null);
    }
  }
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-neutral-600">
        {scope === 'own'
          ? 'Payments made by your account, including bulk cohort payments. Member payments are listed separately.'
          : 'Payments made by members of your owned cohorts for the matching courses. These are not amounts paid by you.'}
      </p>
      {loading ? (
        <p role="status">Loading billing history…</p>
      ) : error ? (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3">
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </Button>
        </div>
      ) : !data?.payments.length ? (
        <p className="py-5 text-sm text-neutral-500">
          {scope === 'own'
            ? 'No payment history for your account in this date range.'
            : 'No cohort member payments in this date range.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <p className="p-3 text-sm text-neutral-500">
            {data.total} payment{data.total !== 1 ? 's' : ''}
          </p>
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b text-left">
                <th className="p-3">Date</th>
                <th className="p-3">Course</th>
                {scope === 'cohort' && <th className="p-3">Payer</th>}
                <th className="p-3">Amount</th>
                <th className="p-3">Method</th>
                <th className="p-3">Status</th>
                <th className="p-3">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="p-3 whitespace-nowrap">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="p-3">{p.courseName ?? p.courseId}</td>
                  {scope === 'cohort' && <td className="p-3">{p.payerName}</td>}
                  <td className="p-3 whitespace-nowrap">{formatPayment(p.amountCents, p.currency)}</td>
                  <td className="p-3">{p.paymentMethod}</td>
                  <td className="p-3">{p.status}</td>
                  <td className="p-3">
                    {['confirmed', 'waived'].includes(p.status) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={receiptId !== null}
                        aria-label={`Download receipt for ${p.courseName ?? p.courseId} payment ${p.id}`}
                        onClick={() => void receipt(p.id)}
                      >
                        {receiptId === p.id ? 'Downloading…' : 'Download receipt'}
                      </Button>
                    ) : (
                      'Not available'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {receiptError && (
        <p role="alert" className="text-sm text-red-700">
          {receiptError}
        </p>
      )}
    </section>
  );
}

function formatPayment(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export function SponsorBillingPanel({
  dateRange,
  refreshTick = 0,
}: {
  dateRange?: DateRange;
  refreshTick?: number;
}) {
  const { user } = useAuth();
  return (
    <div className="space-y-8">
      <BillingHistory scope="own" dateRange={dateRange} refreshTick={refreshTick} />
      {hasCapability(user, 'billing.view_all') && hasCapability(user, 'cohort.view_own') && (
        <BillingHistory scope="cohort" dateRange={dateRange} refreshTick={refreshTick} />
      )}
    </div>
  );
}
