import { useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { Card, CardContent } from './Card';
import { Button } from './Button';
import { courseService } from '../services/courseService';
import { useAuth } from '../context/useAuth';
import { hasCapability } from '../utils/authorization';
import { getErrorMessage } from '../utils/apiError';
import type { CourseApprovalStatus } from '../types/course';

const APPROVAL_LABELS: Record<CourseApprovalStatus, string> = {
  draft: 'Draft',
  submitted: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Sent back',
  published: 'Published',
};

const BADGE_CLASSES: Record<CourseApprovalStatus, string> = {
  draft: 'bg-neutral-100 text-neutral-700',
  submitted: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  published: 'bg-emerald-100 text-emerald-800',
};

export function ApprovalStatusBadge({ status }: { status?: CourseApprovalStatus }) {
  if (!status) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${BADGE_CLASSES[status]}`}>
      {APPROVAL_LABELS[status]}
    </span>
  );
}

/**
 * Course approval on the course editor: a lecturer submits a draft, an administrator approves it
 * or sends it back. The server enforces who may do what; this only shows the matching buttons.
 */
export default function CourseApprovalPanel({ courseId, status, onChanged }: {
  courseId: string;
  status?: CourseApprovalStatus;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [note, setNote] = useState('');
  const canSubmit = hasCapability(user, 'course.manage') && (status === 'draft' || status === 'rejected');
  const canReview = hasCapability(user, 'course.approve') && status === 'submitted';

  const run = async (action: () => Promise<void>, done: string, fallback: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(done); setNote(''); onChanged(); }
    catch (e) { setError(getErrorMessage(e, fallback)); }
    finally { setBusy(false); }
  };

  const help = status === 'draft' ? 'Learners cannot see this course yet. When it is ready, submit it for an administrator to approve.'
    : status === 'submitted' ? (canReview ? 'Check the course, then approve it or send it back to the lecturer with a note.' : 'An administrator is reviewing this course.')
    : status === 'rejected' ? 'An administrator sent this course back. Make the changes, then submit it again.'
    : status === 'approved' || status === 'published' ? 'Learners with the course code can see this course.'
    : 'Approval status is not available for this course.';

  return (
    <Card className="border border-neutral-200">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-neutral-200 bg-neutral-50/60">
        <BadgeCheck className="h-4 w-4 text-accent-teal" aria-hidden />
        <h3 className="text-sm font-semibold text-neutral-800">Course approval</h3>
        <ApprovalStatusBadge status={status} />
      </div>
      <CardContent className="space-y-3 pt-4 pb-5">
        <p className="text-xs text-neutral-500">{help}</p>
        {canSubmit && (
          <Button type="button" size="sm" disabled={busy}
            onClick={() => void run(() => courseService.submitForApproval(courseId), 'Submitted for approval.', 'Could not submit the course.')}>
            Submit for approval
          </Button>
        )}
        {canReview && (
          <div className="space-y-2">
            <label className="block text-sm text-neutral-700" htmlFor={`review-note-${courseId}`}>Note to the lecturer (only sent if you send it back)</label>
            <textarea id={`review-note-${courseId}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={busy}
                onClick={() => void run(() => courseService.approveCourse(courseId), 'Course approved.', 'Could not approve the course.')}>
                Approve
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy}
                onClick={() => void run(() => courseService.rejectCourse(courseId, note), 'Course sent back to the lecturer.', 'Could not send the course back.')}>
                Send back
              </Button>
            </div>
          </div>
        )}
        {notice && <p className="text-xs text-emerald-700" role="status">{notice}</p>}
        {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      </CardContent>
    </Card>
  );
}
