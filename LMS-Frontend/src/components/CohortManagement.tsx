/**
 * CohortManagement — Phase 11 C3: cohort tab in SponsorDashboard.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { cohortService } from '../services/cohortService';
import type { SponsorCohortSummary, CohortMemberDetail, CohortCompletionStats, BulkApplyResult, CertificateTier } from '../types/api';
import { Card, CardContent } from './Card';
import { Button } from './Button';
import { getErrorMessage } from '../utils/apiError';
import {
  Users,
  Plus,
  Play,
  CreditCard,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle,
  Mail,
  Bell,
} from 'lucide-react';

// ─── Create Cohort Modal ────────────────────────────────────────────────────

interface CreateCohortModalProps {
  courses: { id: string; title: string; tiersEnabled: string }[];
  onCreated: () => void;
  onClose: () => void;
}

const CreateCohortModal: React.FC<CreateCohortModalProps> = ({ courses, onCreated, onClose }) => {
  const [name, setName] = useState('');
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [tier, setTier] = useState<CertificateTier>('free');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCourse = courses.find((c) => c.id === courseId);
  const canFree = !selectedCourse || selectedCourse.tiersEnabled !== 'paid_only';
  const canPaid = !selectedCourse || selectedCourse.tiersEnabled !== 'free_only';

  // Reset tier when course changes and current tier becomes unavailable
  const handleCourseChange = (newCourseId: string) => {
    setCourseId(newCourseId);
    const newCourse = courses.find((c) => c.id === newCourseId);
    if (newCourse) {
      if (tier === 'paid' && newCourse.tiersEnabled === 'free_only') setTier('free');
      if (tier === 'free' && newCourse.tiersEnabled === 'paid_only') setTier('paid');
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !courseId) return;
    setSubmitting(true);
    setError(null);
    try {
      await cohortService.createCohort({ name: name.trim(), courseId, selectedTier: tier });
      onCreated();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="cohort-dialog-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 id="cohort-dialog-title" className="text-lg font-semibold mb-4">Create Cohort</h3>
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label htmlFor="cohort-name" className="block text-sm font-medium mb-1">Name</label>
            <input id="cohort-name" className="w-full border rounded px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Corp Q3 2026" />
          </div>
          <div>
            <label htmlFor="cohort-course" className="block text-sm font-medium mb-1">Course</label>
            <select id="cohort-course" className="w-full border rounded px-3 py-2 text-sm" value={courseId} onChange={(e) => handleCourseChange(e.target.value)}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Certificate Tier</label>
            <div className="flex gap-3">
              {canFree && (
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="tier" value="free" checked={tier === 'free'} onChange={() => setTier('free')} /> Free Badge
                </label>
              )}
              {canPaid && (
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="tier" value="paid" checked={tier === 'paid'} onChange={() => setTier('paid')} /> Paid NFT
                </label>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Cohort Detail ──────────────────────────────────────────────────────────

interface CohortDetailProps {
  cohortId: string;
  selectedTier: CertificateTier;
  cohortStatus: string;
  onRefresh: () => void;
}

const CohortDetail: React.FC<CohortDetailProps> = ({ cohortId, selectedTier, cohortStatus, onRefresh }) => {
  const [members, setMembers] = useState<CohortMemberDetail[]>([]);
  const [completionStats, setCompletionStats] = useState<CohortCompletionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyResult, setApplyResult] = useState<BulkApplyResult | null>(null);
  const [payResult, setPayResult] = useState<{ paymentId: string; amountCents: number } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<Array<{ id: string; fromStatus: string; toStatus: string; triggeredBy: string; reason: string | null; createdAt: string }>>([]);
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteResult, setInviteResult] = useState<{ added: number; invited: number; alreadyInCohort: number; errors: string[] } | null>(null);
  const [reminderResult, setReminderResult] = useState<{ sent: number } | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const [data, log] = await Promise.all([
        cohortService.getCohort(cohortId),
        cohortService.getStatusLog(cohortId),
      ]);
      setMembers(data.members);
      setCompletionStats(data.completionStats);
      setStatusLog(log);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleBulkApply = async () => {
    setActionLoading('apply');
    setError(null);
    try {
      const result = await cohortService.bulkApply(cohortId);
      setApplyResult(result);
      loadMembers();
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkPay = async () => {
    setActionLoading('pay');
    setError(null);
    try {
      const result = await cohortService.bulkPay(cohortId);
      setPayResult(result);
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await cohortService.removeMember(cohortId, userId);
      loadMembers();
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleTransition = async (toStatus: 'active' | 'completed') => {
    setActionLoading('transition');
    setError(null);
    try {
      await cohortService.transitionStatus(cohortId, toStatus);
      loadMembers();
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleInvite = async () => {
    const emails = inviteEmails.split(/[,\n]+/).map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) return;
    setActionLoading('invite');
    setError(null);
    setInviteResult(null);
    try {
      const result = await cohortService.bulkInviteToCohort(cohortId, emails);
      setInviteResult(result);
      setInviteEmails('');
      loadMembers();
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendReminders = async () => {
    setActionLoading('reminder');
    setError(null);
    setReminderResult(null);
    try {
      const result = await cohortService.sendPaymentReminder(cohortId);
      setReminderResult(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <div className="p-3 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading members...</div>;

  return (
    <div className="p-3 bg-gray-50 border-t">
      {error && <div className="mb-2 p-2 bg-red-50 text-red-700 rounded text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4" />{error}</div>}

      {applyResult && (
        <div className="mb-2 p-2 bg-green-50 text-green-800 rounded text-sm flex items-center gap-1">
          <CheckCircle className="w-4 h-4" /> Applied: {applyResult.applied}, Skipped: {applyResult.skipped.length}
        </div>
      )}

      {payResult && (
        <div className="mb-2 p-2 bg-blue-50 text-blue-800 rounded text-sm flex items-center gap-1">
          <CreditCard className="w-4 h-4" /> Payment created: ${(payResult.amountCents / 100).toFixed(2)} (pending)
        </div>
      )}

      {inviteResult && (
        <div className="mb-2 p-2 bg-green-50 text-green-800 rounded text-sm flex items-center gap-1" data-testid="invite-result">
          <Mail className="w-4 h-4" /> Added: {inviteResult.added}, Invited: {inviteResult.invited}, Already in cohort: {inviteResult.alreadyInCohort}
          {inviteResult.errors.length > 0 && <span className="text-red-600 ml-1">, Errors: {inviteResult.errors.length}</span>}
        </div>
      )}

      {reminderResult && (
        <div className="mb-2 p-2 bg-yellow-50 text-yellow-800 rounded text-sm flex items-center gap-1" data-testid="reminder-result">
          <Bell className="w-4 h-4" /> Sent {reminderResult.sent} reminder(s)
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <Button size="sm" variant="outline" onClick={handleBulkApply} disabled={actionLoading !== null}>
          {actionLoading === 'apply' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
          Apply for All
        </Button>
        {selectedTier === 'paid' && (
          <Button size="sm" variant="outline" onClick={handleBulkPay} disabled={actionLoading !== null}>
            {actionLoading === 'pay' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CreditCard className="w-3 h-3 mr-1" />}
            Create Payment
          </Button>
        )}
        {cohortStatus === 'draft' && (
          <Button size="sm" variant="primary" onClick={() => handleTransition('active')} disabled={actionLoading !== null} data-testid="btn-mark-active">
            {actionLoading === 'transition' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
            Mark Active
          </Button>
        )}
        {cohortStatus === 'active' && (
          <Button size="sm" variant="success" onClick={() => handleTransition('completed')} disabled={actionLoading !== null} data-testid="btn-mark-completed">
            {actionLoading === 'transition' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
            Mark Completed
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={handleSendReminders} disabled={actionLoading !== null} data-testid="btn-send-reminders">
          {actionLoading === 'reminder' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Bell className="w-3 h-3 mr-1" />}
          Send Reminders
        </Button>
      </div>

      <div className="mb-3" data-testid="invite-form">
        <label htmlFor={`invite-emails-${cohortId}`} className="block text-xs font-medium text-gray-600 mb-1">Invite by Email</label>
        <textarea
          id={`invite-emails-${cohortId}`}
          className="w-full border rounded px-2 py-1.5 text-sm"
          rows={2}
          placeholder="Enter emails, one per line or comma-separated"
          value={inviteEmails}
          onChange={(e) => setInviteEmails(e.target.value)}
          data-testid="invite-emails-input"
        />
        <Button size="sm" className="mt-1" onClick={handleInvite} disabled={actionLoading !== null || !inviteEmails.trim()} data-testid="btn-invite">
          {actionLoading === 'invite' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Mail className="w-3 h-3 mr-1" />}
          Invite
        </Button>
      </div>

      {completionStats && completionStats.totalMembers > 0 && (
        <div className="mb-3 flex gap-4 text-xs text-gray-600" data-testid="completion-stats">
          <span>Completed: <strong>{completionStats.completedCount}/{completionStats.totalMembers}</strong></span>
          <span>Certified: <strong>{completionStats.certifiedCount}/{completionStats.totalMembers}</strong></span>
          <span>Avg Progress: <strong>{completionStats.avgLessonProgress}%</strong></span>
        </div>
      )}

      {members.length === 0 ? (
        <p className="text-sm text-gray-500">No members yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-1 pr-2">Name</th><th className="py-1 pr-2">Email</th>
            <th className="py-1 pr-2">Enrolled</th><th className="py-1 pr-2">Progress</th>
            <th className="py-1 pr-2">Certificate</th><th className="py-1 pr-2">Application</th><th className="py-1"></th>
          </tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="border-b last:border-0">
                <td className="py-1.5 pr-2">{m.userName}</td>
                <td className="py-1.5 pr-2 text-gray-600">{m.userEmail}</td>
                <td className="py-1.5 pr-2">
                  {m.isEnrolled ? <span className="text-green-600 text-xs font-medium">Yes</span> : <span className="text-red-500 text-xs font-medium">No</span>}
                </td>
                <td className="py-1.5 pr-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden" data-testid="progress-bar">
                      <div className={`h-full rounded-full ${m.meetsRequirements ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${m.lessonProgress}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">{m.lessonProgress}%</span>
                  </div>
                </td>
                <td className="py-1.5 pr-2">
                  {m.certificateStatus === 'nft' ? (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">NFT</span>
                  ) : m.certificateStatus === 'badge' ? (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Badge</span>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
                <td className="py-1.5 pr-2">
                  {m.applicationStatus ? (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      m.applicationStatus === 'approved' ? 'bg-green-100 text-green-800' :
                      m.applicationStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      m.applicationStatus === 'minted' ? 'bg-purple-100 text-purple-800' :
                      'bg-gray-100 text-gray-600'
                    }`}>{m.applicationStatus}</span>
                  ) : <span className="text-gray-400 text-xs">—</span>}
                </td>
                <td className="py-1.5 text-right">
                  <button onClick={() => handleRemoveMember(m.userId)} className="text-red-400 hover:text-red-600" title="Remove">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {statusLog.length > 0 && (
        <div className="mt-3 pt-3 border-t" data-testid="status-log">
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Transition History</h4>
          <div className="space-y-1">
            {statusLog.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 text-xs text-gray-600">
                <span className="text-gray-400">{new Date(entry.createdAt).toLocaleString()}</span>
                <span className="font-medium">{entry.fromStatus}</span>
                <span aria-hidden="true">&rarr;</span>
                <span className="font-medium">{entry.toStatus}</span>
                <span className="text-gray-400">by {entry.triggeredBy}</span>
                {entry.reason && <span className="italic text-gray-400">({entry.reason})</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main CohortManagement ──────────────────────────────────────────────────

interface CohortManagementProps {
  courses: { id: string; title: string; tiersEnabled: string }[];
}

export const CohortManagement: React.FC<CohortManagementProps> = ({ courses }) => {
  const [cohorts, setCohorts] = useState<SponsorCohortSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await cohortService.listCohorts();
      setCohorts(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Users className="w-5 h-5" /> Cohorts</h3>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" /> Create Cohort</Button>
      </div>

      {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

      {showCreate && <CreateCohortModal courses={courses} onCreated={() => { setShowCreate(false); load(); }} onClose={() => setShowCreate(false)} />}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading cohorts...</div>
      ) : cohorts.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-gray-500">No cohorts yet. Create one to get started.</CardContent></Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left text-gray-600 border-b">
              <th className="py-2 px-3"></th><th className="py-2 px-3">Name</th><th className="py-2 px-3">Course</th>
              <th className="py-2 px-3">Tier</th><th className="py-2 px-3">Members</th><th className="py-2 px-3">Applied</th>
              <th className="py-2 px-3">Status</th><th className="py-2 px-3">Payment</th>
            </tr></thead>
            <tbody>
              {cohorts.map((c) => (
                <React.Fragment key={c.cohortId}>
                  <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(expanded === c.cohortId ? null : c.cohortId)}>
                    <td className="py-2 px-3">
                      {expanded === c.cohortId ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </td>
                    <td className="py-2 px-3 font-medium">{c.name}</td>
                    <td className="py-2 px-3 text-gray-600">{c.courseName}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${c.selectedTier === 'paid' ? 'bg-violet-100 text-violet-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {c.selectedTier === 'paid' ? 'NFT' : 'Free'}
                      </span>
                    </td>
                    <td className="py-2 px-3">{c.memberCount}</td>
                    <td className="py-2 px-3">{c.appliedCount}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        c.status === 'active' ? 'bg-blue-100 text-blue-800' :
                        c.status === 'completed' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-600'
                      }`}>{c.status}</span>
                    </td>
                    <td className="py-2 px-3 text-gray-500 text-xs">{c.paymentStatus ?? '—'}</td>
                  </tr>
                  {expanded === c.cohortId && (
                    <tr><td colSpan={8}>
                      <CohortDetail cohortId={c.cohortId} selectedTier={c.selectedTier} cohortStatus={c.status} onRefresh={load} />
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
