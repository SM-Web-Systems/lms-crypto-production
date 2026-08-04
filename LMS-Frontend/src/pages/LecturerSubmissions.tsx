import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/useAuth';
import { useData } from '../context/DataContext';
import { Card, CardContent, CardTitle } from '../components/Card';
import Button from '../components/Button';
import { TextArea } from '../components/Input';
import Modal from '../components/Modal';
import {
  FileText, CheckCircle, XCircle, Eye, Download,
  Loader2, BookOpen, AlertCircle,
} from 'lucide-react';
import type { Submission } from '../types/api';
import { courseService } from '../services/courseService';
import { getErrorMessage } from '../utils/apiError';
import { StatusBadge, fmtSize } from '../components/StatusBadge';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CourseItem {
  id: string;
  title: string;
  courseCode?: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

const LecturerSubmissions: React.FC = () => {
  const { user } = useAuth();
  const {
    submissions, submissionsLoading, submissionsError,
    fetchSubmissions, reviewSubmission, downloadSubmission,
  } = useData();

  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');

  const [reviewingSubmission, setReviewingSubmission] = useState<Submission | null>(null);
  const [feedback, setFeedback] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Load initial data
  useEffect(() => {
    fetchSubmissions();
    courseService.fetchCourses()
      .then((cs) => {
        setCourses(cs);
        if (cs.length > 0) setSelectedCourseId(cs[0].id);
        setCoursesLoading(false);
      })
      .catch((err) => {
        setCoursesError(getErrorMessage(err, 'Could not load courses.'));
        setCoursesLoading(false);
      });
  }, [fetchSubmissions]);

  // Filter submissions by selected course
  const filteredSubmissions = useMemo(() => {
    if (!selectedCourseId) return [];
    return submissions.filter((s) => s.courseId === selectedCourseId);
  }, [submissions, selectedCourseId]);

  const handleReview = (sub: Submission) => {
    setReviewingSubmission(sub);
    setFeedback(sub.feedback || '');
    setReviewError('');
  };

  const handleApprove = async () => {
    if (!reviewingSubmission || !user) return;
    setReviewing(true);
    setReviewError('');
    try {
      await reviewSubmission(reviewingSubmission.id, 'approved', feedback, user.name);
      setReviewingSubmission(null);
    } catch (err) {
      setReviewError(getErrorMessage(err, 'Could not approve.'));
    } finally {
      setReviewing(false);
    }
  };

  const handleReject = async () => {
    if (!feedback.trim()) { setReviewError('Please provide feedback before rejecting.'); return; }
    if (!reviewingSubmission || !user) return;
    setReviewing(true);
    setReviewError('');
    try {
      await reviewSubmission(reviewingSubmission.id, 'rejected', feedback, user.name);
      setReviewingSubmission(null);
    } catch (err) {
      setReviewError(getErrorMessage(err, 'Could not reject.'));
    } finally {
      setReviewing(false);
    }
  };

  const handleDownload = async (id: string) => {
    try { await downloadSubmission(id); }
    catch (err) { alert(getErrorMessage(err, 'Could not download.')); }
  };

  const isLoading = submissionsLoading || coursesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        <span className="ml-2 text-gray-600">Loading…</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Submission Review</h1>
        <p className="text-gray-600 mt-1">Review and grade student submissions for your courses</p>
      </div>

      {/* Error banners */}
      {submissionsError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" aria-hidden />
          <span>{submissionsError}</span>
        </div>
      )}
      {coursesError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" aria-hidden />
          <span>{coursesError}</span>
        </div>
      )}

      {/* Empty: no courses */}
      {courses.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" aria-hidden />
          <p className="text-gray-500 text-sm">No courses assigned yet.</p>
        </div>
      ) : (
        <>
          {/* Course filter tabs */}
          <div className="mb-6 flex items-center gap-2 flex-wrap">
            {courses.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCourseId(c.id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                  selectedCourseId === c.id
                    ? 'bg-primary-dark text-white border-primary-dark'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                {c.courseCode ?? c.title}
              </button>
            ))}
          </div>

          {/* Submissions list */}
          <Card>
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-4">
              <CardTitle className="border-0 p-0 text-gray-900">
                {courses.find((c) => c.id === selectedCourseId)?.title ?? 'Course'} — Submissions ({filteredSubmissions.length})
              </CardTitle>
            </div>
            <CardContent>
              {filteredSubmissions.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">No submissions for this course yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Student', 'Submission', 'File', 'Status', 'Date', 'Actions'].map((h) => (
                          <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredSubmissions.map((sub) => (
                        <tr key={sub.id} className="hover:bg-gray-50">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                                <span className="text-primary-600 font-semibold text-sm">
                                  {sub.studentName.split(' ').map((n) => n[0]).join('').toUpperCase()}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-gray-900">{sub.studentName}</p>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-gray-900">{sub.title}</p>
                            <p className="text-xs text-gray-500 line-clamp-1">{sub.description}</p>
                          </td>
                          <td className="px-5 py-4 text-sm text-gray-700">
                            <div className="flex items-center gap-1"><FileText className="h-4 w-4 text-gray-400" />{sub.fileName}</div>
                            <p className="text-xs text-gray-400">{fmtSize(sub.fileSize)}</p>
                          </td>
                          <td className="px-5 py-4"><StatusBadge status={sub.status} /></td>
                          <td className="px-5 py-4 text-sm text-gray-500">{new Date(sub.submittedAt).toLocaleDateString()}</td>
                          <td className="px-5 py-4">
                            <div className="flex gap-2">
                              <Button variant="primary" size="sm" onClick={() => handleReview(sub)}>
                                <Eye className="h-3 w-3 mr-1" />Review
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => handleDownload(sub.id)}>
                                <Download className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Review Modal */}
      <Modal isOpen={!!reviewingSubmission} onClose={() => setReviewingSubmission(null)} title="Review Submission">
        {reviewingSubmission && (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg text-sm grid grid-cols-2 gap-4">
              <div><p className="text-gray-500">Student</p><p className="font-semibold">{reviewingSubmission.studentName}</p></div>
              <div><p className="text-gray-500">Submitted</p><p className="font-semibold">{new Date(reviewingSubmission.submittedAt).toLocaleDateString()}</p></div>
              <div><p className="text-gray-500">Title</p><p className="font-semibold">{reviewingSubmission.title}</p></div>
              <div><p className="text-gray-500">Status</p><StatusBadge status={reviewingSubmission.status} /></div>
              <div className="col-span-2"><p className="text-gray-500 mb-1">Description</p><p>{reviewingSubmission.description}</p></div>
            </div>
            <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">{reviewingSubmission.fileName}</p>
                  <p className="text-xs text-gray-400">{fmtSize(reviewingSubmission.fileSize)}</p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => handleDownload(reviewingSubmission.id)}>
                <Download className="h-3 w-3 mr-1" />Download
              </Button>
            </div>
            <TextArea label="Feedback" placeholder="Provide feedback for the student…" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={4} />
            {reviewingSubmission.reviewedBy && (
              <p className="text-xs text-gray-500">Reviewed by {reviewingSubmission.reviewedBy} on {new Date(reviewingSubmission.reviewedAt!).toLocaleString()}</p>
            )}
            {reviewError && <div className="p-3 bg-red-50 border border-red-200 rounded-md"><p className="text-sm text-red-600">{reviewError}</p></div>}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setReviewingSubmission(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleReject} disabled={reviewing}>
                <XCircle className="h-4 w-4 mr-1" />{reviewing ? 'Processing…' : 'Reject'}
              </Button>
              <Button variant="success" onClick={handleApprove} disabled={reviewing}>
                <CheckCircle className="h-4 w-4 mr-1" />{reviewing ? 'Processing…' : 'Approve'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LecturerSubmissions;
