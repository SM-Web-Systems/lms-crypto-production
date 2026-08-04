import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardTitle } from '../Card';
import { Button } from '../Button';
import {
  Upload,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import type { Submission } from '../../types';

interface RecentSubmissionsCardProps {
  submissions: Submission[];
}

const RecentSubmissionsCard: React.FC<RecentSubmissionsCardProps> = ({ submissions }) => {
  const navigate = useNavigate();

  return (
    <Card className="shadow-updraft overflow-hidden ring-1 ring-neutral-900/[0.04]">
      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50/90 via-white to-primary-50/40 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="border-0 p-0 text-neutral-900">Recent submissions</CardTitle>
          <Button variant="outline" size="sm" type="button" onClick={() => navigate('/student/submissions')}>
            View all
            <ArrowRight className="h-3.5 w-3.5 ml-1" aria-hidden />
          </Button>
        </div>
      </div>
      <CardContent className="p-4 sm:p-6">
        {submissions.length === 0 ? (
          <div className="text-center py-14 px-4 rounded-xl border border-dashed border-neutral-300/90 bg-neutral-50/50">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-teal/10 text-accent-teal mb-4">
              <Upload className="h-7 w-7" aria-hidden />
            </div>
            <p className="font-semibold text-neutral-800">No submissions yet</p>
            <p className="text-sm text-neutral-600 mt-2 max-w-sm mx-auto leading-relaxed">
              When you upload an assignment, it'll show up here with status updates. Start from Submissions whenever
              you're ready.
            </p>
            <Button type="button" className="mt-5" onClick={() => navigate('/student/submissions')}>
              Upload work
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {submissions.slice(0, 5).map((submission) => (
              <li
                key={submission.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-neutral-200/90 bg-white px-4 py-3 shadow-sm ring-1 ring-neutral-900/[0.02] hover:shadow-md hover:ring-neutral-900/[0.05] transition-all"
              >
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-neutral-900 truncate">{submission.title}</h4>
                  {submission.description ? (
                    <p className="text-sm text-neutral-600 mt-0.5 line-clamp-2">{submission.description}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs text-neutral-500">
                    <span className="truncate max-w-[200px]">{submission.fileName}</span>
                    <span className="hidden sm:inline" aria-hidden>
                      ·
                    </span>
                    <span className="tabular-nums">{new Date(submission.submittedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center self-start sm:self-center px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${
                    submission.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-900'
                      : submission.status === 'rejected'
                        ? 'bg-red-100 text-red-900'
                        : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {submission.status === 'pending' && <Clock className="h-3 w-3 mr-1" aria-hidden />}
                  {submission.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" aria-hidden />}
                  {submission.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" aria-hidden />}
                  {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentSubmissionsCard;
