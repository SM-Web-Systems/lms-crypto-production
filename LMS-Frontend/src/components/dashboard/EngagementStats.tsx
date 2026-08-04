import React, { useMemo } from 'react';
import { Card, CardContent } from '../Card';
import {
  FileText,
  Clock,
  CheckCircle,
  ClipboardList,
  XCircle,
} from 'lucide-react';
import type { Submission } from '../../types';
import type { QuizCompletion } from '../../types/quiz';

interface EngagementStatsProps {
  submissions: Submission[];
  quizCompletions: QuizCompletion[] | null;
}

const EngagementStats: React.FC<EngagementStatsProps> = ({ submissions, quizCompletions }) => {
  const pendingCount = submissions.filter((s) => s.status === 'pending').length;
  const approvedCount = submissions.filter((s) => s.status === 'approved').length;
  const rejectedCount = submissions.filter((s) => s.status === 'rejected').length;

  const quizTaken = quizCompletions?.length ?? 0;
  const quizPassed = useMemo(() => (quizCompletions ?? []).filter((c) => c.passed).length, [quizCompletions]);

  const stats = [
    {
      title: 'Your uploads',
      subtitle: 'Total submissions',
      value: submissions.length,
      icon: FileText,
      accent: 'from-primary-100 to-primary-200/70 text-primary-dark',
      ring: 'ring-primary-200/60',
    },
    {
      title: 'In the queue',
      subtitle: 'Awaiting review',
      value: pendingCount,
      icon: Clock,
      accent: 'from-amber-100 to-amber-200/60 text-amber-900',
      ring: 'ring-amber-200/70',
    },
    {
      title: 'Approved',
      subtitle: 'Nice work!',
      value: approvedCount,
      icon: CheckCircle,
      accent: 'from-emerald-100 to-teal-100 text-emerald-900',
      ring: 'ring-emerald-200/70',
    },
    {
      title: 'Quizzes passed',
      subtitle: quizTaken ? `${quizTaken} attempt${quizTaken === 1 ? '' : 's'} total` : 'Take your first quiz',
      value: quizPassed,
      icon: ClipboardList,
      accent: 'from-sky-100 to-cyan-100 text-sky-900',
      ring: 'ring-sky-200/70',
    },
  ];

  return (
    <section>
      <h2 className="text-lg font-bold text-neutral-900 mb-4">Your numbers</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="overflow-hidden shadow-card hover:shadow-updraft transition-shadow ring-1 ring-neutral-900/[0.03]">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${stat.accent} ring-2 ${stat.ring} shadow-sm`}
                  >
                    <Icon className="h-6 w-6" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide truncate">{stat.title}</p>
                    <p className="text-2xl font-bold text-neutral-900 tabular-nums">{stat.value}</p>
                    <p className="text-xs text-neutral-600 mt-0.5 truncate">{stat.subtitle}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {rejectedCount > 0 ? (
        <p className="mt-3 text-xs text-neutral-500 flex items-center gap-1.5">
          <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" aria-hidden />
          {rejectedCount} submission{rejectedCount === 1 ? '' : 's'} need a revision — open Submissions for details.
        </p>
      ) : null}
    </section>
  );
};

export default EngagementStats;
