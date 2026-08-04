import { useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { BarChart3, AlertCircle, ClipboardList } from 'lucide-react';
import { analyticsService, type QuizAnalytics } from '../services/analyticsService';

type PanelState = 'loading' | 'error' | 'empty' | 'data';

export function QuizAnalyticsPanel() {
  const [quizzes, setQuizzes] = useState<QuizAnalytics[]>([]);
  const [state, setState] = useState<PanelState>('loading');

  const load = () => {
    setState('loading');
    analyticsService
      .getQuizAnalytics()
      .then((data) => {
        setQuizzes(data);
        setState(data.length === 0 ? 'empty' : 'data');
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
      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-sky-50/30 px-5 py-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-sky-500" aria-hidden />
          <CardTitle className="border-0 p-0 text-neutral-900">Quiz performance</CardTitle>
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
            <p className="text-sm text-neutral-700 font-medium">Could not load quiz analytics</p>
            <Button variant="outline" size="sm" type="button" className="mt-3" onClick={load}>
              Retry
            </Button>
          </div>
        )}

        {state === 'empty' && (
          <div className="text-center py-8">
            <ClipboardList className="h-8 w-8 text-neutral-300 mx-auto mb-2" aria-hidden />
            <p className="text-sm text-neutral-500">No quiz data yet</p>
          </div>
        )}

        {state === 'data' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5 font-medium">Quiz</th>
                  <th className="px-4 py-2.5 font-medium">Course</th>
                  <th className="px-4 py-2.5 font-medium text-right">Attempts</th>
                  <th className="px-4 py-2.5 font-medium text-right">Pass rate</th>
                  <th className="px-4 py-2.5 font-medium text-right">Avg score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {quizzes.map((q) => (
                  <tr key={q.quizId} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-4 py-3 font-medium text-neutral-900 max-w-[200px] truncate" title={q.quizTitle}>
                      {q.quizTitle}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {q.courseCode ?? <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{q.attempts}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{q.passRate}%</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{q.avgScore}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
