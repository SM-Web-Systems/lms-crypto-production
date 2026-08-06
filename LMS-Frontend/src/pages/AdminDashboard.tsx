import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useData } from '../context/DataContext';
import { Card, CardContent, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import {
  Users,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  MessageCircle,
  AlertCircle,
  LayoutDashboard,
  Sparkles,
  BookOpen,
  ClipboardList,
  Mail,
  UserCircle,
  ArrowRight,
  Inbox,
  ShieldCheck,
  Library,
  Award,
} from 'lucide-react';
import { DashboardPageSkeleton } from '../components/PageSkeletons';
import { AnnouncementsPanel } from '../components/AnnouncementsPanel';
import { QuizAnalyticsPanel } from '../components/QuizAnalyticsPanel';
import { PricingManagement } from '../components/PricingManagement';
import { RbacAdminPanel } from '../components/RbacAdminPanel';
import { PaymentAnalyticsPanel } from '../components/PaymentAnalyticsPanel';
import { TenantAdminPanel } from '../components/TenantAdminPanel';
import { analyticsService, type CourseAnalytics } from '../services/analyticsService';
import { Tag } from 'lucide-react';

function greetingForHour(h: number): string {
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const ADMIN_LINES = [
  'Clearing the queue keeps learners moving — even ten minutes of review helps.',
  'A quick forum check can surface questions before they become blockers.',
  'Course content and quizzes are most useful when they stay in sync.',
  'Small updates to rosters and codes save confusion later.',
  'Students notice fast feedback — prioritize pending reviews when you can.',
];

function pickAdminLine(): string {
  const d = new Date();
  const idx = (d.getDate() + d.getMonth() * 31 + 3) % ADMIN_LINES.length;
  return ADMIN_LINES[idx];
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    students,
    submissions,
    studentsLoading,
    submissionsLoading,
    studentsError,
    submissionsError,
    fetchStudents,
    fetchSubmissions,
  } = useData();

  useEffect(() => {
    fetchStudents();
    fetchSubmissions();
  }, [fetchStudents, fetchSubmissions]);

  const [courseAnalytics, setCourseAnalytics] = useState<CourseAnalytics[]>([]);
  useEffect(() => {
    analyticsService.getCourseAnalytics().then(setCourseAnalytics).catch(() => {});
  }, []);

  const pendingSubmissions = submissions.filter((s) => s.status === 'pending').length;
  const approvedSubmissions = submissions.filter((s) => s.status === 'approved').length;
  const rejectedSubmissions = submissions.filter((s) => s.status === 'rejected').length;

  const recentSubmissions = [...submissions]
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    .slice(0, 5);

  const hour = new Date().getHours();
  const greeting = greetingForHour(hour);
  const firstName = (user?.name ?? 'there').trim().split(/\s+/)[0] || 'there';
  const dailyLine = pickAdminLine();

  const nudge = useMemo(() => {
    if (pendingSubmissions > 0) {
      return {
        text: `${pendingSubmissions} submission${pendingSubmissions === 1 ? '' : 's'} waiting for review — open Submissions to clear the queue.`,
        icon: Inbox,
      };
    }
    if (submissions.length > 0) {
      return {
        text: 'No pending reviews right now. Great time to check the forum or update course content.',
        icon: ShieldCheck,
      };
    }
    if (students.length === 0) {
      return {
        text: 'Add students from the Students tab so submissions and rosters come alive.',
        icon: Users,
      };
    }
    return { text: dailyLine, icon: Sparkles };
  }, [pendingSubmissions, submissions.length, students.length, dailyLine]);

  const NudgeIcon = nudge.icon;

  const stats = [
    {
      title: 'Students',
      subtitle: 'In directory',
      value: students.length,
      icon: Users,
      accent: 'from-primary-100 to-primary-200/70 text-primary-dark',
      ring: 'ring-primary-200/60',
    },
    {
      title: 'Submissions',
      subtitle: 'All time',
      value: submissions.length,
      icon: FileText,
      accent: 'from-violet-100 to-purple-100/80 text-violet-900',
      ring: 'ring-violet-200/70',
    },
    {
      title: 'Pending review',
      subtitle: 'Needs action',
      value: pendingSubmissions,
      icon: Clock,
      accent: 'from-amber-100 to-amber-200/60 text-amber-900',
      ring: 'ring-amber-200/70',
    },
    {
      title: 'Approved',
      subtitle: 'Completed reviews',
      value: approvedSubmissions,
      icon: CheckCircle,
      accent: 'from-emerald-100 to-teal-100 text-emerald-900',
      ring: 'ring-emerald-200/70',
    },
  ];

  const quickActions = [
    {
      to: '/admin/students',
      title: 'Students',
      blurb: 'Roster & accounts',
      icon: Users,
      gradient: 'from-primary-100/90 via-white to-neutral-50',
      iconBg: 'bg-primary-500/15 text-primary-dark',
    },
    {
      to: '/admin/submissions',
      title: 'Submissions',
      blurb: 'Review queue',
      icon: FileText,
      gradient: 'from-violet-100/80 via-white to-fuchsia-50/50',
      iconBg: 'bg-violet-500/15 text-violet-700',
    },
    {
      to: '/admin/course',
      title: 'Course',
      blurb: 'Content & structure',
      icon: BookOpen,
      gradient: 'from-accent-teal/15 via-white to-primary-50/80',
      iconBg: 'bg-accent-teal/20 text-accent-teal',
    },
    {
      to: '/admin/quizzes',
      title: 'Quizzes',
      blurb: 'Assessments',
      icon: ClipboardList,
      gradient: 'from-sky-100/80 via-white to-indigo-50/60',
      iconBg: 'bg-sky-500/15 text-sky-700',
    },
    {
      to: '/admin/documents',
      title: 'Resources',
      blurb: 'Files & docs',
      icon: Library,
      gradient: 'from-amber-100/70 via-white to-orange-50/50',
      iconBg: 'bg-amber-500/15 text-amber-800',
    },
    {
      to: '/admin/forum',
      title: 'Forum',
      blurb: 'Class discussions',
      icon: MessageCircle,
      gradient: 'from-teal-100/80 via-white to-emerald-50/60',
      iconBg: 'bg-teal-600/15 text-teal-800',
    },
    {
      to: '/admin/messages',
      title: 'Messages',
      blurb: 'Direct inbox',
      icon: Mail,
      gradient: 'from-cyan-100/70 via-white to-sky-50/50',
      iconBg: 'bg-cyan-600/15 text-cyan-900',
    },
    {
      to: '/admin/course-members',
      title: 'Course members',
      blurb: 'Rosters per course',
      icon: UserCircle,
      gradient: 'from-neutral-100 via-white to-primary-50/40',
      iconBg: 'bg-neutral-600/15 text-neutral-800',
    },
    {
      to: '/admin/certificates',
      title: 'Certificates',
      blurb: 'NFT credentials',
      icon: Award,
      gradient: 'from-violet-100/80 via-white to-purple-50/50',
      iconBg: 'bg-violet-500/15 text-violet-700',
    },
  ];

  if (studentsLoading || submissionsLoading) {
    return <DashboardPageSkeleton variant="admin" />;
  }

  const loadError = [studentsError, submissionsError].filter(Boolean).join(' · ');

  return (
    <div className="pb-10 space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-neutral-200/90 bg-gradient-to-br from-primary-dark/[0.08] via-white to-accent-teal/[0.10] shadow-updraft ring-1 ring-neutral-900/[0.04]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[length:28px_28px] bg-[linear-gradient(to_right,rgb(15_26_31/0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgb(15_26_31/0.06)_1px,transparent_1px)]"
          aria-hidden
        />
        <div className="relative px-5 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3 max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-dark ring-1 ring-neutral-200/80 shadow-sm">
                <LayoutDashboard className="h-3.5 w-3.5 text-accent-teal" aria-hidden />
                Admin control center
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight">
                {greeting}, {firstName}
              </h1>
              <p className="text-neutral-700 text-base sm:text-lg leading-relaxed">
                Students, submissions, and courses in one glance. Jump to what needs attention first.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" onClick={() => navigate('/admin/submissions')}>
                  Review submissions
                  <ArrowRight className="h-4 w-4 ml-2" aria-hidden />
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate('/admin/students')}>
                  Manage students
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/65 backdrop-blur-sm px-4 py-4 sm:px-5 sm:py-5 shadow-sm ring-1 ring-neutral-200/60 max-w-md w-full lg:shrink-0">
              <div className="flex gap-3 items-start">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-teal/15 text-accent-teal">
                  <NudgeIcon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Focus</p>
                  <p className="text-sm text-neutral-800 mt-1 leading-relaxed font-medium">{nudge.text}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {loadError ? (
        <div className="flex gap-3 rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-amber-950 shadow-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-semibold">Some data could not be loaded</p>
            <p className="text-sm mt-1 text-amber-900/90 leading-relaxed">{loadError}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button variant="outline" size="sm" type="button" onClick={() => void fetchStudents()}>
                Retry students
              </Button>
              <Button variant="outline" size="sm" type="button" onClick={() => void fetchSubmissions()}>
                Retry submissions
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-neutral-900">Shortcuts</h2>
          <p className="text-sm text-neutral-600 mt-0.5">Every admin area, one tap away.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.to}
                type="button"
                onClick={() => navigate(action.to)}
                className={`group text-left rounded-xl border border-neutral-200/90 bg-gradient-to-br ${action.gradient} p-4 shadow-card ring-1 ring-neutral-900/[0.03] transition-all hover:shadow-updraft-hover hover:-translate-y-0.5 hover:ring-neutral-900/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${action.iconBg} shrink-0`}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <ArrowRight
                    className="h-5 w-5 text-neutral-400 group-hover:text-accent-teal group-hover:translate-x-0.5 transition-transform shrink-0"
                    aria-hidden
                  />
                </div>
                <p className="mt-3 font-semibold text-neutral-900">{action.title}</p>
                <p className="text-sm text-neutral-600 mt-0.5">{action.blurb}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-neutral-900 mb-4">Overview</h2>
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
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-updraft overflow-hidden ring-1 ring-neutral-900/[0.04]">
          <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50/90 via-white to-violet-50/40 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="border-0 p-0 text-neutral-900">Recent submissions</CardTitle>
              <Button variant="outline" size="sm" type="button" onClick={() => navigate('/admin/submissions')}>
                Open queue
                <ArrowRight className="h-3.5 w-3.5 ml-1" aria-hidden />
              </Button>
            </div>
          </div>
          <CardContent className="p-4 sm:p-6">
            {recentSubmissions.length === 0 ? (
              <div className="text-center py-12 text-neutral-600 text-sm">No submissions yet.</div>
            ) : (
              <ul className="space-y-3">
                {recentSubmissions.map((submission) => (
                  <li
                    key={submission.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-neutral-200/90 bg-white px-4 py-3 shadow-sm ring-1 ring-neutral-900/[0.02] hover:shadow-md transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-neutral-900 truncate">{submission.title}</p>
                      <p className="text-sm text-neutral-600 truncate">{submission.studentName}</p>
                      <p className="text-xs text-neutral-500 mt-1 tabular-nums">
                        {new Date(submission.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`inline-flex self-start sm:self-center px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${
                        submission.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-900'
                          : submission.status === 'rejected'
                            ? 'bg-red-100 text-red-900'
                            : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {submission.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-updraft overflow-hidden ring-1 ring-neutral-900/[0.04]">
          <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50/90 via-white to-primary-50/40 px-5 py-4 sm:px-6">
            <CardTitle className="border-0 p-0 text-neutral-900">Students by department</CardTitle>
          </div>
          <CardContent className="p-4 sm:p-6">
            {students.length > 0 ? (
              <ul className="space-y-4">
                {Array.from(new Set(students.map((s) => s.department))).map((dept) => {
                  const count = students.filter((s) => s.department === dept).length;
                  const percentage = (count / students.length) * 100;
                  return (
                    <li key={dept}>
                      <div className="flex justify-between items-center mb-2 gap-2">
                        <span className="text-sm font-medium text-neutral-800 truncate">{dept}</span>
                        <span className="text-sm text-neutral-600 tabular-nums shrink-0">
                          {count} ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full bg-neutral-200/90 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-accent-teal to-primary-600 h-2 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-center py-12 text-neutral-600 text-sm">No students enrolled yet.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <AnnouncementsPanel isAdmin={true} />

      <Card className="shadow-updraft overflow-hidden ring-1 ring-neutral-900/[0.04]">
        <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-neutral-50/80 px-5 py-4 sm:px-6">
          <CardTitle className="border-0 p-0 text-neutral-900">Submission outcomes</CardTitle>
        </div>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-5 text-center ring-1 ring-amber-900/[0.04]">
              <Clock className="h-8 w-8 text-amber-700 mx-auto mb-2" aria-hidden />
              <p className="text-2xl font-bold text-neutral-900 tabular-nums">{pendingSubmissions}</p>
              <p className="text-sm font-medium text-neutral-700 mt-1">Pending</p>
            </div>
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-5 text-center ring-1 ring-emerald-900/[0.04]">
              <CheckCircle className="h-8 w-8 text-emerald-700 mx-auto mb-2" aria-hidden />
              <p className="text-2xl font-bold text-neutral-900 tabular-nums">{approvedSubmissions}</p>
              <p className="text-sm font-medium text-neutral-700 mt-1">Approved</p>
            </div>
            <div className="rounded-xl border border-red-200/80 bg-red-50/50 p-5 text-center ring-1 ring-red-900/[0.04]">
              <XCircle className="h-8 w-8 text-red-700 mx-auto mb-2" aria-hidden />
              <p className="text-2xl font-bold text-neutral-900 tabular-nums">{rejectedSubmissions}</p>
              <p className="text-sm font-medium text-neutral-700 mt-1">Rejected</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <QuizAnalyticsPanel />

      <PricingManagement />

      <RbacAdminPanel />

      <PaymentAnalyticsPanel />

      <TenantAdminPanel />

      {/* Course Analytics */}
      {courseAnalytics.length > 0 && (
        <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
          <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-violet-50/30 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-violet-500" aria-hidden />
                <CardTitle className="border-0 p-0 text-neutral-900">Course analytics</CardTitle>
              </div>
              <Button variant="outline" size="sm" type="button" onClick={() => navigate('/admin/sponsor')}>
                Sponsor portal
                <ArrowRight className="h-3.5 w-3.5 ml-1" aria-hidden />
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5 font-medium">Course</th>
                  <th className="px-4 py-2.5 font-medium">Sponsor / Cohort</th>
                  <th className="px-4 py-2.5 font-medium text-right">Enrolled</th>
                  <th className="px-4 py-2.5 font-medium text-right">Wallets</th>
                  <th className="px-4 py-2.5 font-medium text-right">NFTs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {courseAnalytics.map((c) => (
                  <tr key={c.courseId} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-900">{c.courseName}</p>
                      <p className="text-xs text-neutral-400 font-mono">{c.courseCode}</p>
                    </td>
                    <td className="px-4 py-3">
                      {c.sponsorLabel ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 text-xs font-medium">
                          {c.sponsorLabel}
                        </span>
                      ) : (
                        <span className="text-neutral-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{c.enrollmentsCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{c.walletsLinkedCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{c.nftsIssuedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AdminDashboard;
