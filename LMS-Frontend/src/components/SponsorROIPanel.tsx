import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { analyticsService, type SponsorROIData } from '../services/analyticsService';
import { getErrorMessage } from '../utils/apiError';
import { DollarSign, AlertTriangle, RefreshCw } from 'lucide-react';

type ViewState = 'loading' | 'error' | 'empty' | 'data';

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SponsorROIPanel() {
  const [state, setState] = useState<ViewState>('loading');
  const [data, setData] = useState<SponsorROIData | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setState('loading');
    try {
      const result = await analyticsService.getSponsorROI();
      setData(result);
      setState(result.sponsors.length === 0 ? 'empty' : 'data');
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to load sponsor ROI data.'));
      setState('error');
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-amber-50/30 px-5 py-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-amber-500" aria-hidden />
          <CardTitle className="border-0 p-0 text-neutral-900">Sponsor ROI</CardTitle>
        </div>
      </div>
      <CardContent className="p-5">
        {state === 'loading' && (
          <div className="space-y-3 animate-pulse">
            <div className="h-6 w-48 rounded bg-neutral-200" />
            <div className="h-32 rounded bg-neutral-100" />
          </div>
        )}

        {state === 'error' && (
          <div className="text-center py-8 text-red-600">
            <AlertTriangle className="h-6 w-6 mx-auto mb-2" aria-hidden />
            <p className="mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden /> Retry
            </Button>
          </div>
        )}

        {state === 'empty' && (
          <p className="text-center text-neutral-500 py-8">No sponsor data available.</p>
        )}

        {state === 'data' && data && (
          <div className="space-y-6">
            {/* Summary totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <p className="text-xs text-amber-600 font-medium">Total Spent</p>
                <p className="text-xl font-bold text-amber-900 tabular-nums">{formatCents(data.totals.totalSpentCents)}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3 text-center">
                <p className="text-xs text-emerald-600 font-medium">Members</p>
                <p className="text-xl font-bold text-emerald-900 tabular-nums">{data.totals.totalMembers}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <p className="text-xs text-blue-600 font-medium">Cost / Completion</p>
                <p className="text-xl font-bold text-blue-900 tabular-nums">
                  {data.totals.overallCostPerCompletion != null ? formatCents(data.totals.overallCostPerCompletion) : 'N/A'}
                </p>
              </div>
              <div className="rounded-lg bg-violet-50 p-3 text-center">
                <p className="text-xs text-violet-600 font-medium">NFT Rate</p>
                <p className="text-xl font-bold text-violet-900 tabular-nums">{data.totals.overallNftRate.toFixed(1)}%</p>
              </div>
            </div>

            {/* Sponsor table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    <th className="px-3 py-2">Sponsor</th>
                    <th className="px-3 py-2 text-right">Spent</th>
                    <th className="px-3 py-2 text-right">Members</th>
                    <th className="px-3 py-2 text-right">Completed</th>
                    <th className="px-3 py-2 text-right">Cost / Completion</th>
                    <th className="px-3 py-2 text-right">NFT Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.sponsors.map((s) => (
                    <tr key={s.sponsorUserId} className="hover:bg-neutral-50/60">
                      <td className="px-3 py-2 font-medium">{s.sponsorName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCents(s.totalSpentCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.totalMembers}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.completedCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.costPerCompletionCents != null ? formatCents(s.costPerCompletionCents) : 'N/A'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.nftRate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
