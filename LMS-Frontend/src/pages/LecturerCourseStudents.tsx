import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { courseCompletionService } from '../services/courseCompletionService';
import { courseService } from '../services/courseService';
import { Card, CardContent, CardTitle } from '../components/Card';
import TextInputModal from '../components/TextInputModal';
import { Button } from '../components/Button';
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Award,
  Users,
  MessageSquare,
} from 'lucide-react';
import type { CourseProgress, NftApplication } from '../types/api';
import type { Course } from '../types/course';
import { getErrorMessage } from '../utils/apiError';

const STATUS_CLS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900',
  approved: 'bg-emerald-100 text-emerald-900',
  rejected: 'bg-red-100 text-red-900',
  minted: 'bg-violet-100 text-violet-900',
};

const LecturerCourseStudents: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [applications, setApplications] = useState<NftApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendLoading, setRecommendLoading] = useState<string | null>(null);
  const [recommendErrors, setRecommendErrors] = useState<Record<string, string>>({});
  const [recommendModal, setRecommendModal] = useState<{ appId: string; existing: string } | null>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const [courseList, prog, apps] = await Promise.all([
        courseService.fetchCourses(),
        courseCompletionService.getAllProgress(courseId),
        courseCompletionService.getCourseApplications(courseId).catch(() => [] as NftApplication[]),
      ]);
      setCourse(courseList.find((c) => c.id === courseId) ?? null);
      setProgress(prog);
      setApplications(apps);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load student data.'));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const submitRecommendation = useCallback(
    async (appId: string, text: string) => {
      if (!courseId) return;
      setRecommendModal(null);
      setRecommendLoading(appId);
      setRecommendErrors((e) => ({ ...e, [appId]: '' }));
      try {
        const updated = await courseCompletionService.recommendApplication(courseId, appId, text);
        setApplications((prev) =>
          prev.map((a) => (a.applicationId === updated.applicationId ? updated : a))
        );
      } catch (e) {
        setRecommendErrors((err) => ({
          ...err,
          [appId]: getErrorMessage(e, 'Recommendation failed.'),
        }));
      } finally {
        setRecommendLoading(null);
      }
    },
    [courseId]
  );

  /** Index applications by userId for quick lookup */
  const appByUser: Record<string, NftApplication> = {};
  for (const app of applications) {
    appByUser[app.userId] = app;
  }

  return (
    <div className="pb-10 space-y-6">
      {/* Recommendation modal */}
      <TextInputModal
        isOpen={recommendModal !== null}
        title={recommendModal?.existing ? 'Edit recommendation' : 'Add recommendation'}
        description="Your recommendation will be visible to the admin when reviewing this application."
        label="Recommendation"
        initialValue={recommendModal?.existing ?? ''}
        placeholder="Write your recommendation for this student…"
        required
        confirmLabel="Save recommendation"
        onConfirm={(text) => recommendModal && submitRecommendation(recommendModal.appId, text)}
        onCancel={() => setRecommendModal(null)}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" type="button" onClick={() => navigate('/lecturer')}>
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">
              {course?.title ?? 'Course'}
            </h1>
            <p className="text-sm text-neutral-600 mt-0.5">
              Student progress &amp; certificate applications
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" type="button" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
        <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-primary-50/30 px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent-teal" aria-hidden />
            <CardTitle className="border-0 p-0 text-neutral-900">
              {loading
                ? 'Loading…'
                : `${progress.length} enrolled student${progress.length === 1 ? '' : 's'}`}
            </CardTitle>
          </div>
        </div>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-neutral-500 text-sm">Loading…</div>
          ) : progress.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="h-10 w-10 text-neutral-300 mx-auto mb-3" aria-hidden />
              <p className="text-neutral-500 text-sm">No enrolled students found.</p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {progress.map((prog) => {
                const app = appByUser[prog.userId];
                const isRecommending = recommendLoading === app?.applicationId;

                return (
                  <li key={prog.userId} className="px-5 py-4">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      {/* Left: progress info */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-neutral-900 font-mono truncate">
                            {app?.userName ?? app?.userEmail ?? prog.userId}
                          </p>
                          {app?.userEmail && app.userName && (
                            <p className="text-xs text-neutral-500 truncate">{app.userEmail}</p>
                          )}
                          {prog.meetsAllRequirements && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium">
                              <CheckCircle className="h-3 w-3" aria-hidden />
                              Eligible
                            </span>
                          )}
                          {app && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[app.status] ?? 'bg-neutral-100 text-neutral-800'}`}
                            >
                              <Award className="h-3 w-3" aria-hidden />
                              {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                            </span>
                          )}
                        </div>

                        {/* Progress stats */}
                        <div className="flex flex-wrap gap-4 text-xs text-neutral-500">
                          <span>
                            Lessons:{' '}
                            <strong className="text-neutral-800">
                              {prog.completedLessonItems}/{prog.totalLessonItems}
                            </strong>
                          </span>
                          <span>
                            Quizzes:{' '}
                            <strong className="text-neutral-800">
                              {prog.allRequiredQuizzesPassed
                                ? 'All passed'
                                : `${prog.requiredQuizzes.filter((q) => q.passed).length}/${prog.requiredQuizzes.length}`}
                            </strong>
                          </span>
                          <span>
                            Submission:{' '}
                            <strong
                              className={prog.hasApprovedSubmission ? 'text-emerald-700' : 'text-neutral-500'}
                            >
                              {prog.hasApprovedSubmission ? 'Approved' : 'N/A'}
                            </strong>
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full max-w-xs">
                          <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                            <div
                              className="h-1.5 rounded-full bg-gradient-to-r from-accent-teal to-primary-600 transition-all"
                              style={{ width: `${prog.lessonPercentage}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-neutral-400 mt-0.5 tabular-nums">
                            {prog.lessonPercentage}% lessons complete
                          </p>
                        </div>

                        {/* Existing recommendation */}
                        {app?.lecturerRecommendation && (
                          <p className="text-xs text-blue-700 italic">
                            Recommendation: &ldquo;{app.lecturerRecommendation}&rdquo;
                          </p>
                        )}

                        {/* Recommendation error */}
                        {recommendErrors[app?.applicationId ?? ''] && (
                          <p className="text-xs text-red-600">
                            {recommendErrors[app?.applicationId ?? '']}
                          </p>
                        )}
                      </div>

                      {/* Right: action */}
                      <div className="shrink-0">
                        {app && app.status === 'pending' && (
                          <Button
                            size="sm"
                            type="button"
                            variant={app.lecturerRecommendation ? 'outline' : undefined}
                            disabled={isRecommending}
                            onClick={() =>
                              setRecommendModal({
                                appId: app.applicationId,
                                existing: app.lecturerRecommendation ?? '',
                              })
                            }
                            className="text-xs"
                          >
                            <MessageSquare className="h-3.5 w-3.5 mr-1" aria-hidden />
                            {isRecommending
                              ? 'Saving…'
                              : app.lecturerRecommendation
                              ? 'Edit recommendation'
                              : 'Recommend'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LecturerCourseStudents;
