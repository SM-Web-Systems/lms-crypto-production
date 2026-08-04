import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useData } from '../context/DataContext';
import { Button } from '../components/Button';
import { quizService } from '../services/quizService';
import { courseService } from '../services/courseService';
import { courseCompletionService } from '../services/courseCompletionService';
import type { QuizCompletion } from '../types/quiz';
import type { CourseProgress, NftApplication } from '../types/api';
import type { Course } from '../types/course';
import { Trophy, Zap, Target, Sparkles } from 'lucide-react';
import { DashboardPageSkeleton } from '../components/PageSkeletons';
import { AnnouncementsPanel } from '../components/AnnouncementsPanel';
import StudentWalletStatusCard from '../components/StudentWalletStatusCard';
import QuickActionsGrid from '../components/dashboard/QuickActionsGrid';
import DashboardHero from '../components/dashboard/DashboardHero';
import RecentSubmissionsCard from '../components/dashboard/RecentSubmissionsCard';
import EngagementStats from '../components/dashboard/EngagementStats';
import NftBadgesSection from '../components/dashboard/NftBadgesSection';
import LmsCertificatesSection from '../components/dashboard/LmsCertificatesSection';
import OnboardingChecklist from '../components/dashboard/OnboardingChecklist';
import CertEligibilitySection from '../components/dashboard/CertEligibilitySection';

const StudentDashboard: React.FC = () => {
  const { user } = useAuth();
  const { submissions, submissionsLoading, submissionsError, fetchSubmissions } = useData();

  // Quiz completions — needed by checklist + stats + engagement hint
  const [quizCompletions, setQuizCompletions] = useState<QuizCompletion[] | null>(null);

  // Course data — needed by cert eligibility + checklist (D1: orchestrator owns fetch)
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [progressMap, setProgressMap] = useState<Record<string, CourseProgress>>({});
  const [appStatusMap, setAppStatusMap] = useState<Record<string, NftApplication | null>>({});

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

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

  // Load enrolled courses + progress + existing application status
  useEffect(() => {
    if (!user) {
      setCoursesLoading(false);
      return;
    }
    let cancelled = false;
    courseService.fetchCourses().then(async (list) => {
      if (cancelled) return;
      setCourses(list);
      const results = await Promise.all(
        list.map(async (c) => {
          const [prog, apps] = await Promise.all([
            courseCompletionService.getCourseProgress(c.id).catch(() => null),
            courseCompletionService.getCourseApplications(c.id).catch(() => [] as NftApplication[]),
          ]);
          return { id: c.id, prog, app: apps.length > 0 ? apps[0] : null };
        })
      );
      if (!cancelled) {
        const newProg: Record<string, CourseProgress> = {};
        const newApps: Record<string, NftApplication | null> = {};
        for (const { id, prog, app } of results) {
          if (prog) newProg[id] = prog;
          newApps[id] = app;
        }
        setProgressMap(newProg);
        setAppStatusMap(newApps);
      }
    }).catch(() => {}).finally(() => {
      if (!cancelled) setCoursesLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  const quizPassed = useMemo(() => (quizCompletions ?? []).filter((c) => c.passed).length, [quizCompletions]);

  const engagementHint = useMemo(() => {
    const pendingCount = submissions.filter((s) => s.status === 'pending').length;
    const approvedCount = submissions.filter((s) => s.status === 'approved').length;
    const pickDailyLine = (): string => {
      const d = new Date();
      const lines = [
        "Small steps today add up to big wins tomorrow.",
        "Curiosity is your superpower — keep exploring the course.",
        "You've got this. Open a lesson and make a little progress.",
        "Learning is a sport: show up, practice, celebrate the reps.",
        "Stuck on something? The forum and messages are your teammates.",
        "Progress beats perfection. One submission, one quiz, one win.",
        "Your future self will thank you for what you do today.",
      ];
      return lines[(d.getDate() + d.getMonth() * 31) % lines.length];
    };
    if (approvedCount >= 3) return { text: "You're on a roll — keep shipping great work!", icon: Trophy };
    if (quizPassed >= 2) return { text: 'Nice quiz streak — knowledge unlocked!', icon: Trophy };
    if (pendingCount > 0) return { text: 'Something you sent is in review — check back soon.', icon: Zap };
    if (submissions.length === 0) return { text: 'Ready when you are: upload your first submission anytime.', icon: Target };
    return { text: pickDailyLine(), icon: Sparkles };
  }, [submissions, quizPassed]);

  const handleAppStatusChange = (courseId: string, app: NftApplication) => {
    setAppStatusMap((m) => ({ ...m, [courseId]: app }));
  };

  if (submissionsLoading) {
    return <DashboardPageSkeleton variant="student" />;
  }

  if (submissionsError) {
    return (
      <div className="rounded-xl border border-red-200/90 bg-red-50 px-4 py-4 text-red-900 shadow-sm">
        <p className="font-medium">Couldn't load your dashboard</p>
        <p className="text-sm mt-1 text-red-800/90">{submissionsError}</p>
        <Button variant="outline" className="mt-3 border-red-200" onClick={() => fetchSubmissions()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-8">
      {user && <StudentWalletStatusCard user={user} />}

      {user?.id && (
        <OnboardingChecklist
          userId={user.id}
          walletConnected={Boolean(user.walletAddress)}
          enrolled={courses.length > 0}
          hasCompletedLesson={Object.values(progressMap).some((p) => p.completedLessonItems > 0)}
          quizPassed={quizPassed > 0}
          hasApplied={Object.values(appStatusMap).some((app) => app !== null)}
        />
      )}

      <DashboardHero userName={user?.name ?? 'there'} engagementHint={engagementHint} />

      <QuickActionsGrid />

      <NftBadgesSection walletAddress={user?.walletAddress} />

      <LmsCertificatesSection />

      <CertEligibilitySection
        userWalletAddress={user?.walletAddress}
        courses={courses}
        coursesLoading={coursesLoading}
        progressMap={progressMap}
        appStatusMap={appStatusMap}
        onAppStatusChange={handleAppStatusChange}
      />

      <EngagementStats submissions={submissions} quizCompletions={quizCompletions} />

      <AnnouncementsPanel isAdmin={false} />

      <RecentSubmissionsCard submissions={submissions} />
    </div>
  );
};

export default StudentDashboard;
