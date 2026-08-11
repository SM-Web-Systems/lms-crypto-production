import { useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { analyticsService, type CohortInsightsData } from '../services/analyticsService';
import { getErrorMessage } from '../utils/apiError';
import { Users, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';

type ViewState = 'loading' | 'error' | 'empty' | 'data';

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleString('default', { month: 'short', year: 'numeric' });
}

export function CohortInsightsPanel() {
  const [state, setState] = useState<ViewState>('loading');
  const [data, setData] = useState<CohortInsightsData | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setState('loading');
    try {
      const result = await analyticsService.getCohortInsights();
      setData(result);
      setState(result.cohorts.length === 0 ? 'empty' : 'data');
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to load cohort insights.'));
      setState('error');
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-indigo-50/30 px-5 py-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-500" aria-hidden />
          <CardTitle className="border-0 p-0 text-neutral-900">Cohort Insights</CardTitle>
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
          <p className="text-center text-neutral-500 py-8">No cohort data available.</p>
        )}

        {state === 'data' && data && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-lg bg-indigo-50 p-3 text-center">
                <p className="text-xs text-indigo-600 font-medium">Total Cohorts</p>
                <p className="text-2xl font-bold text-indigo-900 tabular-nums">{data.cohorts.length}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3 text-center">
                <p className="text-xs text-emerald-600 font-medium">Avg Completion Rate</p>
                <p className="text-2xl font-bold text-emerald-900 tabular-nums">
                  {data.cohorts.length > 0
                    ? (data.cohorts.reduce((s, c) => s + c.completionRate, 0) / data.cohorts.length).toFixed(1)
                    : 0}%
                </p>
              </div>
              <div className="rounded-lg bg-violet-50 p-3 text-center">
                <p className="text-xs text-violet-600 font-medium">Total Members</p>
                <p className="text-2xl font-bold text-violet-900 tabular-nums">
                  {data.cohorts.reduce((s, c) => s + c.totalMembers, 0)}
                </p>
              </div>
            </div>

            {/* Enrollment trends */}
            {data.enrollmentsByMonth.length > 0 && (
              <div>
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700 mb-2">
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Enrollment Trends
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        <th className="px-3 py-2">Month</th>
                        <th className="px-3 py-2 text-right">Enrollments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {data.enrollmentsByMonth.map((r) => (
                        <tr key={r.month} className="hover:bg-neutral-50/60">
                          <td className="px-3 py-2">{formatMonth(r.month)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Cohort completion rates */}
            <div>
              <h4 className="text-sm font-semibold text-neutral-700 mb-2">Cohort Completion Rates</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      <th className="px-3 py-2">Cohort</th>
                      <th className="px-3 py-2">Course</th>
                      <th className="px-3 py-2 text-right">Members</th>
                      <th className="px-3 py-2 text-right">Completed</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">NFTs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {data.cohorts.map((c) => (
                      <tr key={c.cohortId} className="hover:bg-neutral-50/60">
                        <td className="px-3 py-2 font-medium">{c.cohortName}</td>
                        <td className="px-3 py-2 text-neutral-600">{c.courseName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.totalMembers}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.completedCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.completionRate.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.nftCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
