import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/useAuth';
import { useData } from '../context/DataContext';
import { Card, CardHeader, CardContent, CardTitle } from '../components/Card';
import Button from '../components/Button';
import { TextArea } from '../components/Input';
import Modal from '../components/Modal';
import {
  FileText, CheckCircle, XCircle, Clock, Eye, Download,
  Loader2, ChevronDown, ChevronRight, Users, BookOpen,
} from 'lucide-react';
import { Submission } from '../types/api';
import { courseService } from '../services/courseService';
import { studentsService } from '../services/studentsService';
import { getErrorMessage } from '../utils/apiError';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CourseMember {
  id: string;   // user.id
  name: string;
  email: string;
  role: string;
}

interface CourseItem {
  id: string;
  title: string;
  courseCode?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const base = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
  if (status === 'approved') return <span className={`${base} bg-green-100 text-green-800`}><CheckCircle className="h-3 w-3 mr-1" />Approved</span>;
  if (status === 'rejected') return <span className={`${base} bg-red-100 text-red-800`}><XCircle className="h-3 w-3 mr-1" />Rejected</span>;
  return <span className={`${base} bg-yellow-100 text-yellow-800`}><Clock className="h-3 w-3 mr-1" />Pending</span>;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ─── MemberRow: expandable submissions for one member ────────────────────────

function MemberRow({
  member,
  submissions,
  onReview,
  onDownload,
  onDelete,
}: {
  member: CourseMember;
  submissions: Submission[];
  onReview: (s: Submission) => void;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const initials = member.name.split(' ').map((n) => n[0]).join('').toUpperCase();

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-gray-50 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
            <span className="text-primary-700 font-semibold text-sm">{initials}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{member.name}</p>
            <p className="text-xs text-gray-500">{member.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-medium">
            {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
            {submissions.filter((s) => s.status === 'pending').length > 0 && (
              <span className="ml-1.5 bg-yellow-100 text-yellow-700 rounded-full px-1.5 py-0.5 font-semibold">
                {submissions.filter((s) => s.status === 'pending').length} pending
              </span>
            )}
          </span>
          {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 bg-gray-50">
          {submissions.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-500 italic">No submissions from this member yet.</p>
          ) : (
            <div className="divide-y divide-gray-200">
              {submissions.map((sub) => (
                <div key={sub.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 bg-white">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{sub.title}</p>
                    <p className="text-xs text-gray-500 truncate">{sub.description}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <StatusBadge status={sub.status} />
                      <span className="text-xs text-gray-400">
                        {new Date(sub.submittedAt).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <FileText className="h-3 w-3" />{sub.fileName} · {fmtSize(sub.fileSize)}
                      </span>
                    </div>
                    {sub.feedback && (
                      <p className="text-xs text-gray-600 mt-1"><strong>Feedback:</strong> {sub.feedback}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="primary" size="sm" onClick={() => onReview(sub)}>
                      <Eye className="h-3 w-3 mr-1" />Review
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => onDownload(sub.id)}>
                      <Download className="h-3 w-3" />
                    </Button>
                    {sub.status === 'pending' && (
                      <Button variant="danger" size="sm" onClick={() => onDelete(sub.id)}>Delete</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const AdminSubmissions: React.FC = () => {
  const { user } = useAuth();
  const { submissions, submissionsLoading, submissionsError, fetchSubmissions, reviewSubmission, deleteSubmission, downloadSubmission } = useData();

  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('__all__');
  const [members, setMembers] = useState<CourseMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // user.id → student.id map for filtering submissions
  const [userIdToStudentId, setUserIdToStudentId] = useState<Record<string, string>>({});

  const [reviewingSubmission, setReviewingSubmission] = useState<Submission | null>(null);
  const [feedback, setFeedback] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Load initial data
  useEffect(() => {
    fetchSubmissions();
    courseService.fetchCourses().then((cs) => {
      setCourses(cs);
      setCoursesLoading(false);
    }).catch(() => setCoursesLoading(false));
    studentsService.getAll({ limit: 500 }).then(({ students }) => {
      const map: Record<string, string> = {};
      students.forEach((s) => { if (s.userId) map[s.userId] = s.id; });
      setUserIdToStudentId(map);
    }).catch(() => {});
  }, [fetchSubmissions]);

  // Load members when course changes
  useEffect(() => {
    if (selectedCourseId === '__all__') {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    courseService.fetchCourseMembers(selectedCourseId)
      .then((m) => setMembers(m.filter((x) => x.role === 'student')))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, [selectedCourseId]);

  // Submissions grouped by studentId for quick lookup
  const submissionsByStudentId = useMemo(() => {
    const map: Record<string, Submission[]> = {};
    submissions.forEach((s) => {
      if (!map[s.studentId]) map[s.studentId] = [];
      map[s.studentId].push(s);
    });
    return map;
  }, [submissions]);

  const handleReview = (s: Submission) => {
    setReviewingSubmission(s);
    setFeedback(s.feedback || '');
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

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this submission?')) return;
    try { await deleteSubmission(id); }
    catch (err) { alert(getErrorMessage(err, 'Could not delete.')); }
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

  // ── "All submissions" flat view ──
  const allPending = submissions.filter((s) => s.status === 'pending').length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Submission Review</h1>
        <p className="text-gray-600 mt-1">Browse by course, then select a member to see what they've submitted</p>
      </div>

      {(submissionsError) && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{submissionsError}</p>
        </div>
      )}

      {/* ── Course tabs ── */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setSelectedCourseId('__all__')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
            selectedCourseId === '__all__'
              ? 'bg-primary-dark text-white border-primary-dark'
              : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
          }`}
        >
          All submissions
          {allPending > 0 && (
            <span className={`rounded-full px-1.5 text-xs font-bold ${selectedCourseId === '__all__' ? 'bg-white text-primary-dark' : 'bg-yellow-100 text-yellow-800'}`}>
              {allPending}
            </span>
          )}
        </button>
        {courses.map((c) => {
          return (
            <button
              key={c.id}
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
          );
        })}
      </div>

      {/* ── All submissions flat list ── */}
      {selectedCourseId === '__all__' && (
        <Card>
          <CardHeader>
            <CardTitle>All Submissions ({submissions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {submissions.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No submissions yet</p>
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
                    {submissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-gray-50">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                              <span className="text-primary-600 font-semibold text-sm">{sub.studentName.split(' ').map((n) => n[0]).join('')}</span>
                            </div>
                            <p className="text-sm font-medium text-gray-900">{sub.studentName}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-gray-900">{sub.title}</p>
                          <p className="text-xs text-gray-500">{sub.description}</p>
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
                            {sub.status === 'pending' && (
                              <Button variant="danger" size="sm" onClick={() => handleDelete(sub.id)}>Delete</Button>
                            )}
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
      )}

      {/* ── Course → members → submissions ── */}
      {selectedCourseId !== '__all__' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary-600" />
              {courses.find((c) => c.id === selectedCourseId)?.title ?? 'Course'} — Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            {membersLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
                <span className="text-sm text-gray-500">Loading members…</span>
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-10">
                <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No students are enrolled in this course yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => {
                  // member.id is user_id — resolve to student_id for filtering
                  const studentId = userIdToStudentId[member.id];
                  const memberSubs = studentId ? (submissionsByStudentId[studentId] ?? []) : [];
                  return (
                    <MemberRow
                      key={member.id}
                      member={member}
                      submissions={memberSubs}
                      onReview={handleReview}
                      onDownload={handleDownload}
                      onDelete={handleDelete}
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Review Modal ── */}
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

export default AdminSubmissions;
