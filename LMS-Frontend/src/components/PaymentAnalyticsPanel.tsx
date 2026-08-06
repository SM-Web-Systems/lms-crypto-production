import { useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { DollarSign, AlertCircle, CreditCard } from 'lucide-react';
import { analyticsService, type PaymentAnalyticsData } from '../services/analyticsService';

type PanelState = 'loading' | 'error' | 'empty' | 'data';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatMethod(method: string): string {
  switch (method) {
    case 'paystack': return 'Paystack';
    case 'stellar_xlm': return 'Stellar XLM';
    case 'stellar_usdc': return 'Stellar USDC';
    case 'manual': return 'Manual';
    case 'waived': return 'Waived';
    default: return method.charAt(0).toUpperCase() + method.slice(1);
  }
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split('-');
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function PaymentAnalyticsPanel() {
  const [data, setData] = useState<PaymentAnalyticsData | null>(null);
  const [state, setState] = useState<PanelState>('loading');

  const load = () => {
    setState('loading');
    analyticsService
      .getPaymentAnalytics()
      .then((result) => {
        setData(result);
        setState(result.summary.totalPayments === 0 ? 'empty' : 'data');
      })
      .catch(() => {
        setState('error');
      });
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-emerald-50/30 px-5 py-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-500" aria-hidden />
          <CardTitle className="border-0 p-0 text-neutral-900">Payment analytics</CardTitle>
        </div>
      </div>
      <CardContent className="p-4 sm:p-6">
        {state === 'loading' && (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-neutral-100" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <div className="text-center py-8">
            <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" aria-hidden />
            <p className="text-sm text-neutral-700 font-medium">Could not load payment analytics</p>
            <Button variant="outline" size="sm" type="button" className="mt-3" onClick={load}>
              Retry
            </Button>
          </div>
        )}

        {state === 'empty' && (
          <div className="text-center py-8">
            <CreditCard className="h-8 w-8 text-neutral-300 mx-auto mb-2" aria-hidden />
            <p className="text-sm text-neutral-500">No payment data yet</p>
          </div>
        )}

        {state === 'data' && data && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="text-lg font-bold text-emerald-700 tabular-nums">{formatCents(data.summary.totalRevenueCents)}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Total Revenue</p>
              </div>
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                <p className="text-lg font-bold text-green-700 tabular-nums">{data.summary.confirmedPayments}</p>
                <p className="text-xs text-green-600 mt-0.5">Confirmed</p>
              </div>
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-center">
                <p className="text-lg font-bold text-yellow-700 tabular-nums">{data.summary.pendingPayments}</p>
                <p className="text-xs text-yellow-600 mt-0.5">Pending</p>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
                <p className="text-lg font-bold text-red-700 tabular-nums">{data.summary.failedPayments}</p>
                <p className="text-xs text-red-600 mt-0.5">Failed</p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
                <p className="text-lg font-bold text-blue-700 tabular-nums">{data.summary.waivedPayments}</p>
                <p className="text-xs text-blue-600 mt-0.5">Waived</p>
              </div>
            </div>

            {/* Revenue by Course */}
            {data.byCourse.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Revenue by course</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                        <th className="px-4 py-2.5 font-medium">Course</th>
                        <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                        <th className="px-4 py-2.5 font-medium text-right">Payments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {data.byCourse.map((c) => (
                        <tr key={c.courseId} className="hover:bg-neutral-50/60 transition-colors">
                          <td className="px-4 py-3 font-medium text-neutral-900">{c.courseName}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{formatCents(c.revenueCents)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{c.paymentCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Revenue by Method */}
            {data.byMethod.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Revenue by method</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                        <th className="px-4 py-2.5 font-medium">Method</th>
                        <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                        <th className="px-4 py-2.5 font-medium text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {data.byMethod.map((m) => (
                        <tr key={m.method} className="hover:bg-neutral-50/60 transition-colors">
                          <td className="px-4 py-3 font-medium text-neutral-900">{formatMethod(m.method)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{formatCents(m.revenueCents)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{m.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Revenue by Month */}
            {data.byMonth.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Revenue by month</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                        <th className="px-4 py-2.5 font-medium">Month</th>
                        <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                        <th className="px-4 py-2.5 font-medium text-right">Payments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {data.byMonth.map((m) => (
                        <tr key={m.month} className="hover:bg-neutral-50/60 transition-colors">
                          <td className="px-4 py-3 font-medium text-neutral-900">{formatMonth(m.month)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{formatCents(m.revenueCents)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{m.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
