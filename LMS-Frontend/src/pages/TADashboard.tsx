/**
 * TADashboard — Phase G: Teaching Assistant dashboard.
 * Shows assigned courses, submissions to grade, and pending approval statuses.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/useAuth';
import { taService, type TACourse, type TASubmission } from '../services/taService';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import {
  BookOpen,
  FileText,
  RefreshCw,
  AlertCircle,
  LayoutDashboard,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { getErrorMessage } from '../utils/apiError';

const TADashboard: React.FC = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<TACourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<TASubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [gradeSuccess, setGradeSuccess] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await taService.getCourses();
      setCourses(list);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load assigned courses.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSubmissions = useCallback(async (courseId: string) => {
    setSubmissionsLoading(true);
    setError(null);
    try {
      const subs = await taService.getCourseSubmissions(courseId);
      setSubmissions(subs);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load submissions.'));
    } finally {
      setSubmissionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    if (selectedCourseId) {
      loadSubmissions(selectedCourseId);
    }
  }, [selectedCourseId, loadSubmissions]);

  const handleGrade = async (submissionId: string, status: 'approved' | 'rejected') => {
    try {
      await taService.gradeSubmission(submissionId, { status, feedback: feedback || undefined });
      setGradeSuccess(`Submission graded as ${status} (pending instructor approval).`);
      setGradingId(null);
      setFeedback('');
      if (selectedCourseId) loadSubmissions(selectedCourseId);
    } catch (e) {
      setError(getErrorMessage(e, 'Grading failed.'));
    }
  };

  const firstName = (user?.name ?? 'there').trim().split(/\s+/)[0] || 'there';
  const pendingCount = submissions.filter((s) => s.status === 'pending').length;
  const gradedCount = submissions.filter((s) => s.grade_status === 'pending_approval').length;

  return (
    <div className="pb-10 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-dark ring-1 ring-neutral-200/80 shadow-sm mb-2">
            <LayoutDashboard className="h-3.5 w-3.5 text-accent-teal" aria-hidden />
            Teaching Assistant Portal
          </p>
          <h1 className="text-2xl font-bold text-neutral-900">Welcome, {firstName}</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Grade submissions and assist instructors with course management.
          </p>
        </div>
        <Button variant="outline" size="sm" type="button" onClick={loadCourses}>
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

      {gradeSuccess && (
        <div className="flex gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-900">
          <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm">{gradeSuccess}</p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-neutral-500">Assigned Courses</p>
            <p className="text-2xl font-bold text-neutral-900">{courses.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-neutral-500">Pending Submissions</p>
            <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-neutral-500">Awaiting Approval</p>
            <p className="text-2xl font-bold text-blue-600">{gradedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Course list */}
      {loading ? (
        <div className="py-16 text-center text-neutral-500 text-sm">Loading courses...</div>
      ) : courses.length === 0 ? (
        <div className="py-16 text-center">
          <BookOpen className="h-10 w-10 text-neutral-300 mx-auto mb-3" aria-hidden />
          <p className="text-neutral-500 text-sm">No courses assigned yet.</p>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-bold text-neutral-900">Assigned Courses</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((course) => (
              <Card
                key={course.id}
                className={`cursor-pointer transition-shadow hover:shadow-md ${selectedCourseId === course.id ? 'ring-2 ring-accent-teal' : ''}`}
              >
                <CardContent className="py-4">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setSelectedCourseId(course.id)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <BookOpen className="h-4 w-4 text-accent-teal" aria-hidden />
                      <span className="font-semibold text-neutral-900 truncate">{course.title}</span>
                    </div>
                    {course.course_code && (
                      <p className="text-xs text-neutral-500 ml-6">{course.course_code}</p>
                    )}
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Submissions for selected course */}
      {selectedCourseId && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-neutral-900">
            Submissions
            {courses.find((c) => c.id === selectedCourseId)?.title
              ? ` — ${courses.find((c) => c.id === selectedCourseId)!.title}`
              : ''}
          </h2>
          {submissionsLoading ? (
            <div className="py-8 text-center text-neutral-500 text-sm">Loading submissions...</div>
          ) : submissions.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="h-8 w-8 text-neutral-300 mx-auto mb-2" aria-hidden />
              <p className="text-neutral-500 text-sm">No submissions for this course.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {submissions.map((sub) => (
                <Card key={sub.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900 truncate">{sub.title}</p>
                        <p className="text-xs text-neutral-500">
                          {sub.file_name} | {new Date(sub.submitted_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {sub.grade_status === 'pending_approval' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
                            <Clock className="h-3 w-3" aria-hidden />
                            Awaiting Approval
                          </span>
                        ) : sub.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                            <CheckCircle className="h-3 w-3" aria-hidden />
                            Approved
                          </span>
                        ) : sub.status === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-medium">
                            <XCircle className="h-3 w-3" aria-hidden />
                            Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
                            <Clock className="h-3 w-3" aria-hidden />
                            Pending
                          </span>
                        )}
                        {sub.status === 'pending' && sub.grade_status !== 'pending_approval' && (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => {
                              setGradingId(gradingId === sub.id ? null : sub.id);
                              setFeedback('');
                            }}
                          >
                            Grade
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Inline grading form */}
                    {gradingId === sub.id && (
                      <div className="mt-3 pt-3 border-t border-neutral-200 space-y-3">
                        <div>
                          <label htmlFor={`feedback-${sub.id}`} className="block text-sm font-medium text-neutral-700 mb-1">
                            Feedback (optional)
                          </label>
                          <textarea
                            id={`feedback-${sub.id}`}
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-accent-teal focus:border-accent-teal"
                            placeholder="Provide feedback for the student..."
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            type="button"
                            onClick={() => handleGrade(sub.id, 'approved')}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" aria-hidden />
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => handleGrade(sub.id, 'rejected')}
                          >
                            <XCircle className="h-4 w-4 mr-1" aria-hidden />
                            Reject
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => { setGradingId(null); setFeedback(''); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TADashboard;
