import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useData } from '../context/DataContext';
import { Card, CardContent, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { quizService } from '../services/quizService';
import type { QuizCompletion } from '../types/quiz';
import {
  FileText,
  Upload,
  CheckCircle,
  XCircle,
  Clock,
  MessageCircle,
  Sparkles,
  BookOpen,
  ClipboardList,
  Library,
  Mail,
  ArrowRight,
  Trophy,
  Zap,
  Target,
} from 'lucide-react';
import { DashboardPageSkeleton } from '../components/PageSkeletons';
import { AnnouncementsPanel } from '../components/AnnouncementsPanel';
import NftCard from '../components/NftCard';  
import { getUserNfts }  from '../services/walletService';
import type { NFTResponse } from '../types/api';

function greetingForHour(h: number): string {
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const DAY_LINES = [
  "Small steps today add up to big wins tomorrow.",
  "Curiosity is your superpower — keep exploring the course.",
  "You've got this. Open a lesson and make a little progress.",
  "Learning is a sport: show up, practice, celebrate the reps.",
  "Stuck on something? The forum and messages are your teammates.",
  "Progress beats perfection. One submission, one quiz, one win.",
  "Your future self will thank you for what you do today.",
];

function pickDailyLine(): string {
  const d = new Date();
  const idx = (d.getDate() + d.getMonth() * 31) % DAY_LINES.length;
  return DAY_LINES[idx];
}

const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { submissions, submissionsLoading, submissionsError, fetchSubmissions } = useData();
  const [quizCompletions, setQuizCompletions] = useState<QuizCompletion[] | null>(null);
  const [nftBadges, setNftBadges] = useState<NFTResponse | null>(null);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  useEffect(() => {
    let cancelled = false;
    const loadNfts = async () => {
      if (!user) return;
      try {
        const nfts = await getUserNfts(user.walletAddress);
        if (!cancelled) {
          setNftBadges(nfts);
          console.log('NFT Badges:', nfts);
        }
      } catch (error) {
        console.error('Failed to load NFT badges:', error);
      }
    };

    loadNfts();

    return () => {
      cancelled = true;
    };
  }, [user, getUserNfts]);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    let cancelled = false;
    quizService
      .getCompletionsForUser(uid)
      .then((list) => {
        if (!cancelled) setQuizCompletions(list);
      })
      .catch(() => {
        if (!cancelled) setQuizCompletions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const pendingCount = submissions.filter((s) => s.status === 'pending').length;
  const approvedCount = submissions.filter((s) => s.status === 'approved').length;
  const rejectedCount = submissions.filter((s) => s.status === 'rejected').length;

  const quizTaken = quizCompletions?.length ?? 0;
  const quizPassed = useMemo(() => (quizCompletions ?? []).filter((c) => c.passed).length, [quizCompletions]);

  const hour = new Date().getHours();
  const greeting = greetingForHour(hour);
  const firstName = (user?.name ?? 'there').trim().split(/\s+/)[0] || 'there';
  const dailyLine = pickDailyLine();
  const nftTokens = nftBadges?.indexed.tokens.map((t) => t.token) ?? [];

  const engagementHint = useMemo(() => {
    if (approvedCount >= 3) return { text: "You're on a roll — keep shipping great work!", icon: Trophy };
    if (quizPassed >= 2) return { text: 'Nice quiz streak — knowledge unlocked!', icon: Trophy };
    if (pendingCount > 0) return { text: 'Something you sent is in review — check back soon.', icon: Zap };
    if (submissions.length === 0) return { text: 'Ready when you are: upload your first submission anytime.', icon: Target };
    return { text: dailyLine, icon: Sparkles };
  }, [approvedCount, quizPassed, pendingCount, submissions.length, dailyLine]);

  const HintIcon = engagementHint.icon;

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

  const quickActions = [
    {
      to: '/student/course',
      title: 'Course',
      blurb: 'Lessons & progress',
      icon: BookOpen,
      gradient: 'from-accent-teal/15 via-white to-primary-50/80',
      iconBg: 'bg-accent-teal/20 text-accent-teal',
    },
    {
      to: '/student/quizzes',
      title: 'Quizzes',
      blurb: 'Practice & checks',
      icon: ClipboardList,
      gradient: 'from-sky-100/80 via-white to-indigo-50/60',
      iconBg: 'bg-sky-500/15 text-sky-700',
    },
    {
      to: '/student/submissions',
      title: 'Submissions',
      blurb: 'Upload work',
      icon: Upload,
      gradient: 'from-violet-100/70 via-white to-fuchsia-50/50',
      iconBg: 'bg-violet-500/15 text-violet-700',
    },
    {
      to: '/student/documents',
      title: 'Resources',
      blurb: 'Files & readings',
      icon: Library,
      gradient: 'from-amber-100/70 via-white to-orange-50/50',
      iconBg: 'bg-amber-500/15 text-amber-800',
    },
    {
      to: '/student/messages',
      title: 'Messages',
      blurb: 'Chat with classmates',
      icon: Mail,
      gradient: 'from-teal-100/80 via-white to-emerald-50/60',
      iconBg: 'bg-teal-600/15 text-teal-800',
    },
    {
      to: '/student/forum',
      title: 'Forum',
      blurb: 'Discuss & ask',
      icon: MessageCircle,
      gradient: 'from-primary-100/90 via-white to-neutral-50',
      iconBg: 'bg-primary-500/15 text-primary-dark',
    },
  ];

  if (submissionsLoading) {
    return <DashboardPageSkeleton variant="student" />;
  }

  if (submissionsError) {
    return (
      <div className="rounded-xl border border-red-200/90 bg-red-50 px-4 py-4 text-red-900 shadow-sm">
        <p className="font-medium">Couldn’t load your dashboard</p>
        <p className="text-sm mt-1 text-red-800/90">{submissionsError}</p>
        <Button variant="outline" className="mt-3 border-red-200" onClick={() => fetchSubmissions()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-neutral-200/90 bg-gradient-to-br from-accent-teal/[0.12] via-white to-primary-50/90 shadow-updraft ring-1 ring-neutral-900/[0.04]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[length:28px_28px] bg-[linear-gradient(to_right,rgb(15_26_31/0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgb(15_26_31/0.06)_1px,transparent_1px)]"
          aria-hidden
        />
        <div className="relative px-5 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3 max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-dark ring-1 ring-neutral-200/80 shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-accent-teal" aria-hidden />
                Your learning hub
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight">
                {greeting}, {firstName}!
              </h1>
              <p className="text-neutral-700 text-base sm:text-lg leading-relaxed">
                Pick up where you left off — course, quizzes, and classmates are one tap away.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" onClick={() => navigate('/student/course')}>
                  Go to course
                  <ArrowRight className="h-4 w-4 ml-2" aria-hidden />
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate('/student/quizzes')}>
                  Take a quiz
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/60 backdrop-blur-sm px-4 py-4 sm:px-5 sm:py-5 shadow-sm ring-1 ring-neutral-200/60 max-w-md w-full lg:shrink-0">
              <div className="flex gap-3 items-start">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-teal/15 text-accent-teal">
                  <HintIcon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Today’s nudge</p>
                  <p className="text-sm text-neutral-800 mt-1 leading-relaxed font-medium">{engagementHint.text}</p>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Jump in</h2>
            <p className="text-sm text-neutral-600 mt-0.5">Everything you need, no hunting in the menu.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
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

      {/* NFT Badges */}
      <section>
        <h2 className="text-lg font-bold text-neutral-900 mb-4">Your NFT Badges</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ul className="grid grid-cols-1 m:grid-cols-2 gap-2 mt-2">
            {nftTokens.length > 0 ? (
              nftTokens.map((token) => (<li key={token.id}><NftCard token={token} /></li>))
            ) : (
              <li className={`group text-left rounded-xl border border-neutral-200/90 bg-gradient-to-br p-4 shadow-card ring-1 ring-neutral-900/[0.03] transition-all hover:shadow-updraft-hover hover:-translate-y-0.5 hover:ring-neutral-900/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2`}
              >
                No NFT badges yet
              </li>
            )}
          </ul>
        </div>
      </section>

      {/* Stats */}
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

      <AnnouncementsPanel isAdmin={false} />

      {/* Recent submissions */}
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
                When you upload an assignment, it’ll show up here with status updates. Start from Submissions whenever
                you’re ready.
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
    </div>
  );
};

export default StudentDashboard;
