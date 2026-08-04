import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { courseCompletionService } from '../services/courseCompletionService';
import { courseService } from '../services/courseService';
import { quizService } from '../services/quizService';
import type { MyCourseProgress, CertificateStatus } from '../types/api';
import type { Course, CourseItemQuiz } from '../types/course';
import { getCourseWeeks } from '../types/course';
import type { QuizCompletion } from '../types/quiz';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Trophy,
  AlertCircle,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';

function certLabel(status: CertificateStatus): {
  text: string;
  className: string;
} {
  switch (status) {
    case 'minted':
      return { text: 'Certificate issued', className: 'bg-green-100 text-green-800' };
    case 'approved':
      return { text: 'Approved — minting soon', className: 'bg-blue-100 text-blue-800' };
    case 'pending':
      return { text: 'Application pending', className: 'bg-amber-100 text-amber-800' };
    case 'rejected':
      return { text: 'Application rejected', className: 'bg-red-100 text-red-800' };
    case 'eligible':
      return { text: 'Eligible — apply now', className: 'bg-teal-100 text-teal-800' };
    default:
      return { text: 'In progress', className: 'bg-neutral-100 text-neutral-600' };
  }
}

const StudentProgress: React.FC = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<MyCourseProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // C3: detailed data for section bars + quiz table
  const [courseDetails, setCourseDetails] = useState<Record<string, Course>>({});
  const [completions, setCompletions] = useState<Record<string, { itemId: string; completedAt: string | null }[]>>({});
  const [quizCompletions, setQuizCompletions] = useState<QuizCompletion[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    courseCompletionService
      .getMyProgress()
      .then((data) => setCourses(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load progress'))
      .finally(() => setLoading(false));
  }, []);

  // C3: fetch course structure, completions, and quiz scores after courses load
  useEffect(() => {
    if (courses.length === 0 || !user) return;

    const fetchDetails = async () => {
      const [courseResults, completionResults, quizResults] = await Promise.all([
        Promise.all(courses.map((c) => courseService.fetchCourseById(c.courseId).catch(() => null))),
        Promise.all(courses.map((c) => courseCompletionService.getLessonCompletions(c.courseId).catch(() => []))),
        quizService.getCompletionsForUser(user.id).catch(() => []),
      ]);

      const detailMap: Record<string, Course> = {};
      courseResults.forEach((course, i) => {
        if (course) detailMap[courses[i].courseId] = course;
      });
      setCourseDetails(detailMap);

      const compMap: Record<string, { itemId: string; completedAt: string | null }[]> = {};
      completionResults.forEach((comps, i) => {
        compMap[courses[i].courseId] = comps;
      });
      setCompletions(compMap);

      setQuizCompletions(quizResults);
    };

    fetchDetails();
  }, [courses, user]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" aria-hidden />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200/90 bg-red-50 px-4 py-4 text-red-900">
        <p className="font-medium">Couldn't load progress</p>
        <p className="text-sm mt-1 text-red-800/90">{error}</p>
      </div>
    );
  }

  return (
    <div className="pb-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">My Progress</h1>
        <p className="text-sm text-neutral-600 mt-0.5">
          Track your lesson completion, quiz scores, and certificate status for each course.
        </p>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-xl border border-neutral-200/90 bg-white px-6 py-12 text-center">
          <Trophy className="h-12 w-12 text-neutral-300 mx-auto mb-3" aria-hidden />
          <p className="text-neutral-600 font-medium">No courses enrolled yet.</p>
          <p className="text-sm text-neutral-500 mt-1">Once you enrol in a course it will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {courses.map((c) => {
            const cert = certLabel(c.certificateStatus);
            const pct = Math.round(c.lessonPercentage ?? 0);

            // C3: section-level progress data
            const course = courseDetails[c.courseId];
            const allSections = course
              ? getCourseWeeks(course).flatMap((w) => w.sections).filter((s) => s.items.length > 0)
              : [];
            const completedItems = new Set(
              (completions[c.courseId] ?? [])
                .filter((comp) => comp.completedAt !== null)
                .map((comp) => comp.itemId)
            );

            // C3: quiz score table data — best attempt per quiz
            const courseQuizIds = course
              ? getCourseWeeks(course)
                  .flatMap((w) => w.sections)
                  .flatMap((s) => s.items)
                  .filter((item): item is CourseItemQuiz => item.type === 'quiz')
                  .map((item) => item.quizId)
              : [];
            const bestAttempts = new Map<string, QuizCompletion>();
            for (const qc of quizCompletions) {
              if (!courseQuizIds.includes(qc.quizId)) continue;
              const existing = bestAttempts.get(qc.quizId);
              if (!existing || qc.score > existing.score) {
                bestAttempts.set(qc.quizId, qc);
              }
            }

            return (
              <div
                key={c.courseId}
                className="rounded-xl border border-neutral-200/90 bg-white shadow-sm ring-1 ring-neutral-900/[0.03] overflow-hidden"
              >
                {/* Course header */}
                <div className="px-5 py-4 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-neutral-900">{c.courseName}</h2>
                    {c.courseCode && (
                      <p className="text-xs text-neutral-500 mt-0.5">{c.courseCode}</p>
                    )}
                  </div>
                  <span className={`self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cert.className}`}>
                    {c.certificateStatus === 'minted' && <Trophy className="h-3 w-3" aria-hidden />}
                    {c.certificateStatus === 'pending' && <Clock className="h-3 w-3" aria-hidden />}
                    {cert.text}
                  </span>
                </div>

                <div className="px-5 py-4 space-y-4">
                  {/* Lesson progress bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Lessons</p>
                      <p className="text-xs text-neutral-500 tabular-nums">
                        {c.completedLessonItems} / {c.totalLessonItems} completed
                      </p>
                    </div>
                    <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent-teal transition-all"
                        style={{ width: `${pct}%` }}
                        aria-label={`${pct}% complete`}
                      />
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">{pct}% complete</p>
                  </div>

                  {/* C3: Per-section progress bars */}
                  {allSections.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">By Section</p>
                      {allSections.map((section) => {
                        const total = section.items.length;
                        const done = section.items.filter((item) => completedItems.has(item.id)).length;
                        const sectionPct = total > 0 ? Math.round((done / total) * 100) : 0;
                        const isExpanded = expandedSections.has(section.id);
                        const allDone = done === total && total > 0;

                        return (
                          <div key={section.id}>
                            <button
                              type="button"
                              className="w-full flex items-center gap-2 text-left group"
                              onClick={() => toggleSection(section.id)}
                            >
                              <ChevronRight
                                className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                aria-hidden
                              />
                              <span className="text-sm text-neutral-700 flex-1 truncate">{section.title}</span>
                              {allDone && <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" aria-hidden />}
                              <span className="text-xs text-neutral-500 tabular-nums shrink-0">{done}/{total}</span>
                            </button>
                            <div className="ml-5 mt-1">
                              <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-accent-teal'}`}
                                  style={{ width: `${sectionPct}%` }}
                                />
                              </div>
                            </div>
                            {/* C3: Expandable item list */}
                            {isExpanded && (
                              <ul className="ml-5 mt-2 space-y-1">
                                {section.items.map((item) => {
                                  const isDone = completedItems.has(item.id);
                                  return (
                                    <li key={item.id} className="flex items-center gap-2 text-sm">
                                      {isDone ? (
                                        <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" aria-hidden />
                                      ) : (
                                        <span className="h-3.5 w-3.5 rounded-full border-2 border-neutral-300 shrink-0" />
                                      )}
                                      <span className={isDone ? 'text-neutral-700' : 'text-neutral-400'}>{item.title}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Required quizzes */}
                  {c.requiredQuizzes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">Required Quizzes</p>
                      <ul className="space-y-1.5">
                        {c.requiredQuizzes.map((q) => (
                          <li key={q.quizId} className="flex items-center gap-2 text-sm">
                            {q.passed ? (
                              <CheckCircle className="h-4 w-4 text-green-600 shrink-0" aria-hidden />
                            ) : (
                              <XCircle className="h-4 w-4 text-neutral-300 shrink-0" aria-hidden />
                            )}
                            <span className={q.passed ? 'text-neutral-800' : 'text-neutral-500'}>
                              {q.quizTitle}
                            </span>
                            {q.score !== null && (
                              <span className="ml-auto text-xs text-neutral-500 tabular-nums">
                                {q.score}% (need {q.passingScore}%)
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* C3: Quiz score table */}
                  {bestAttempts.size > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">Quiz Scores</p>
                      <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-neutral-500 border-b border-neutral-100">
                              <th className="pb-2 pr-3 font-medium">Quiz</th>
                              <th className="pb-2 pr-3 font-medium text-right">Score</th>
                              <th className="pb-2 pr-3 font-medium text-right">Passing</th>
                              <th className="pb-2 pr-3 font-medium">Status</th>
                              <th className="pb-2 font-medium text-right">Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...bestAttempts.values()].map((qc) => {
                              const scorePct = qc.total > 0 ? Math.round((qc.score / qc.total) * 100) : 0;
                              const reqQuiz = c.requiredQuizzes.find((rq) => rq.quizId === qc.quizId);
                              const passingPct = reqQuiz?.passingScore ?? 70;
                              return (
                                <tr key={qc.quizId} className="border-b border-neutral-50">
                                  <td className="py-2 pr-3 text-neutral-700">{reqQuiz?.quizTitle ?? 'Quiz'}</td>
                                  <td className="py-2 pr-3 text-right tabular-nums">{scorePct}%</td>
                                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-500">{passingPct}%</td>
                                  <td className="py-2 pr-3">
                                    <span className={`inline-flex items-center text-xs font-medium ${qc.passed ? 'text-green-700' : 'text-red-600'}`}>
                                      {qc.passed ? 'Passed' : 'Failed'}
                                    </span>
                                  </td>
                                  <td className="py-2 text-right text-xs text-neutral-500 tabular-nums">
                                    {new Date(qc.completedAt).toLocaleDateString()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Submission requirement */}
                  {!c.hasApprovedSubmission && c.requiredQuizzes.length === 0 && !c.canApplyForCertificate && (
                    <div className="flex items-start gap-2 text-sm text-amber-800">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" aria-hidden />
                      No approved submission yet. Upload your work from the Submissions tab.
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {c.certificateStatus === 'eligible' && (
                      <Link
                        to="/student"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Apply for certificate
                      </Link>
                    )}
                    {c.certificateStatus === 'minted' && c.txHash && (
                      <a
                        href={`https://stellar.expert/explorer/public/tx/${c.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:underline"
                      >
                        View on Stellar <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                    <Link
                      to="/student/course"
                      className="text-xs text-neutral-500 hover:text-neutral-800 transition-colors"
                    >
                      Go to course →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentProgress;
