import React, { useEffect, useState, useCallback } from 'react';
import {
  Award,
  CheckCircle,
  XCircle,
  X,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Coins,
  History,
  Info,
  ExternalLink,
  Copy,
  Check,
  Download,
  RotateCcw,
  DollarSign,
} from 'lucide-react';
import { Card, CardContent, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import TextInputModal from '../components/TextInputModal';
import { adminCertificateService } from '../services/adminCertificateService';
import { courseCompletionService } from '../services/courseCompletionService';
import type { NftApplication, NftApplicationStatus, CourseProgress, IssuedCredential } from '../types/api';
import { getErrorMessage } from '../utils/apiError';
import { toastSuccess } from '../utils/toastBus';

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function csvEscape(v: string | null | undefined): string {
  const s = v ?? '';
  return `"${s.replace(/"/g, '""')}"`;
}

function exportApplicationsCSV(applications: NftApplication[]): void {
  const headers = 'Student Name,Email,Course,Wallet Address,Status,Applied At,Reviewed At,Tx Hash';
  const rows = applications.map((a) =>
    [
      csvEscape(a.userName),
      csvEscape(a.userEmail),
      csvEscape(a.courseName),
      csvEscape(a.walletAddress),
      csvEscape(a.status),
      csvEscape(a.appliedAt ? new Date(a.appliedAt).toISOString() : ''),
      csvEscape(a.reviewedAt ? new Date(a.reviewedAt).toISOString() : ''),
      csvEscape(a.txHash),
    ].join(',')
  );
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cert-applications-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toastSuccess('Applications CSV exported');
}

function exportIssuedCSV(credentials: IssuedCredential[]): void {
  const headers = 'Student Name,Email,Course,Wallet Address,Mint Status,Tx Hash,Minted At,Mint Path';
  const rows = credentials.map((c) =>
    [
      csvEscape(c.userName),
      csvEscape(c.userEmail),
      csvEscape(c.courseName),
      csvEscape(c.walletAddress),
      csvEscape(c.mintStatus),
      csvEscape(c.txHash),
      csvEscape(c.mintedAt ? new Date(c.mintedAt).toISOString() : ''),
      csvEscape(c.mintPath),
    ].join(',')
  );
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `issued-nfts-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toastSuccess('Issued NFTs CSV exported');
}

// ─── Status definitions (PHASE 4) ────────────────────────────────────────────

const STATUS_LABELS: Record<NftApplicationStatus, { label: string; cls: string; description: string }> = {
  pending:  { label: 'Pending',  cls: 'bg-amber-100 text-amber-900',    description: 'Application submitted by student; awaiting admin review.' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-900', description: 'Admin approved — NFT can now be minted on-chain.' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-900',        description: 'Admin declined this application; student may reapply.' },
  minted:   { label: 'Minted',   cls: 'bg-violet-100 text-violet-900',  description: 'NFT credential issued and confirmed on Stellar mainnet.' },
};

const MINT_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending',  cls: 'bg-amber-100 text-amber-900'   },
  minted:  { label: 'Minted',   cls: 'bg-violet-100 text-violet-900' },
  failed:  { label: 'Failed',   cls: 'bg-red-100 text-red-900'       },
};

const StatusBadge: React.FC<{ status: NftApplicationStatus }> = ({ status }) => {
  const { label, cls, description } = STATUS_LABELS[status] ?? { label: status, cls: 'bg-neutral-100 text-neutral-900', description: '' };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}
      title={description}
    >
      {label}
    </span>
  );
};

const MintStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const { label, cls } = MINT_STATUS_LABELS[status] ?? { label: status, cls: 'bg-neutral-100 text-neutral-900' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
};

const PAYMENT_LABELS: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Payment pending', cls: 'bg-amber-100 text-amber-900'   },
  confirmed: { label: 'Paid',            cls: 'bg-emerald-100 text-emerald-900' },
  waived:    { label: 'Waived',          cls: 'bg-blue-100 text-blue-900'     },
};

const PaymentBadge: React.FC<{ app: NftApplication }> = ({ app }) => {
  if (!app.priceCents || app.priceCents === 0) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600">Free</span>;
  }
  const ps = app.paymentStatus ?? 'pending';
  const { label, cls } = PAYMENT_LABELS[ps] ?? { label: ps, cls: 'bg-neutral-100 text-neutral-900' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      <DollarSign className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
};

// ─── View tabs ────────────────────────────────────────────────────────────────

type ViewTab = 'applications' | 'issued';
type StatusFilter = 'all' | NftApplicationStatus;

// ─── Applications sub-panel ───────────────────────────────────────────────────

interface ApplicationsPanelProps {
  role: 'admin' | 'lecturer';
}

const ApplicationsPanel: React.FC<ApplicationsPanelProps> = ({ role: _role }) => {
  const [applications, setApplications] = useState<NftApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [progressCache, setProgressCache] = useState<Record<string, CourseProgress>>({});
  const [rejectModal, setRejectModal] = useState<NftApplication | null>(null);
  const [mintModal, setMintModal] = useState<NftApplication | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const certs = await adminCertificateService.getAllCertificates(
        statusFilter !== 'all' ? { status: statusFilter } : undefined
      );
      setApplications(certs);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load certificate applications.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleExpand = useCallback(async (app: NftApplication) => {
    const key = `${app.courseId}:${app.userId}`;
    if (expandedId === app.applicationId) { setExpandedId(null); return; }
    setExpandedId(app.applicationId);
    if (!progressCache[key]) {
      try {
        const prog = await courseCompletionService.getStudentProgress(app.courseId, app.userId);
        setProgressCache((p) => ({ ...p, [key]: prog }));
      } catch { /* best-effort */ }
    }
  }, [expandedId, progressCache]);

  const handleApprove = useCallback(async (app: NftApplication) => {
    setActionLoading(app.applicationId);
    setActionError((e) => ({ ...e, [app.applicationId]: '' }));
    try {
      const updated = await adminCertificateService.approveApplication(app.courseId, app.applicationId);
      setApplications((prev) => prev.map((a) => (a.applicationId === updated.applicationId ? { ...a, ...updated } : a)));
    } catch (e) {
      setActionError((err) => ({ ...err, [app.applicationId]: getErrorMessage(e, 'Approval failed.') }));
    } finally { setActionLoading(null); }
  }, []);

  const submitReject = useCallback(async (app: NftApplication, reason: string) => {
    setRejectModal(null);
    setActionLoading(app.applicationId);
    setActionError((e) => ({ ...e, [app.applicationId]: '' }));
    try {
      const updated = await adminCertificateService.rejectApplication(app.courseId, app.applicationId, reason || undefined);
      setApplications((prev) => prev.map((a) => (a.applicationId === updated.applicationId ? { ...a, ...updated } : a)));
    } catch (e) {
      setActionError((err) => ({ ...err, [app.applicationId]: getErrorMessage(e, 'Rejection failed.') }));
    } finally { setActionLoading(null); }
  }, []);

  const handleMint = useCallback((app: NftApplication) => {
    setMintModal(app);
  }, []);

  const submitMint = useCallback(async (app: NftApplication) => {
    setMintModal(null);
    setActionLoading(app.applicationId);
    setActionError((e) => ({ ...e, [app.applicationId]: '' }));
    try {
      const updated = await adminCertificateService.mintApplication(app.courseId, app.applicationId);
      setApplications((prev) => prev.map((a) => (a.applicationId === updated.applicationId ? { ...a, ...updated } : a)));
    } catch (e) {
      setActionError((err) => ({ ...err, [app.applicationId]: getErrorMessage(e, 'Mint failed.') }));
    } finally { setActionLoading(null); }
  }, []);

  const [waiveNotesModal, setWaiveNotesModal] = useState<NftApplication | null>(null);

  const handleConfirmPayment = useCallback(async (app: NftApplication) => {
    if (!app.paymentId) return;
    setActionLoading(app.applicationId);
    setActionError((e) => ({ ...e, [app.applicationId]: '' }));
    try {
      await adminCertificateService.confirmPayment(app.paymentId);
      await load();
    } catch (e) {
      setActionError((err) => ({ ...err, [app.applicationId]: getErrorMessage(e, 'Payment confirmation failed.') }));
    } finally { setActionLoading(null); }
  }, [load]);

  const submitWaivePayment = useCallback(async (app: NftApplication, notes: string) => {
    if (!app.paymentId) return;
    setWaiveNotesModal(null);
    setActionLoading(app.applicationId);
    setActionError((e) => ({ ...e, [app.applicationId]: '' }));
    try {
      await adminCertificateService.waivePayment(app.paymentId, notes);
      await load();
    } catch (e) {
      setActionError((err) => ({ ...err, [app.applicationId]: getErrorMessage(e, 'Waive failed.') }));
    } finally { setActionLoading(null); }
  }, [load]);

  const counts = {
    pending:  applications.filter((a) => a.status === 'pending').length,
    approved: applications.filter((a) => a.status === 'approved').length,
    minted:   applications.filter((a) => a.status === 'minted').length,
    rejected: applications.filter((a) => a.status === 'rejected').length,
  };

  return (
    <div className="space-y-4">
      {/* Rejection reason modal */}
      <TextInputModal
        isOpen={rejectModal !== null}
        title="Reject application"
        description={`Rejecting application from ${rejectModal?.userName ?? rejectModal?.userEmail ?? 'this student'}. The student will be able to re-apply.`}
        label="Reason for rejection"
        placeholder="Explain why this application is being rejected (optional)…"
        confirmLabel="Confirm rejection"
        onConfirm={(reason) => rejectModal && submitReject(rejectModal, reason)}
        onCancel={() => setRejectModal(null)}
      />

      {/* Waive payment notes modal */}
      <TextInputModal
        isOpen={waiveNotesModal !== null}
        title="Waive payment"
        description={`Waive payment for ${waiveNotesModal?.userName ?? waiveNotesModal?.userEmail ?? 'this student'}'s certificate (${waiveNotesModal?.courseName ?? 'course'}). This cannot be undone.`}
        label="Reason for waiving"
        placeholder="e.g. Scholarship recipient, fee exemption…"
        confirmLabel="Waive payment"
        onConfirm={(notes) => waiveNotesModal && submitWaivePayment(waiveNotesModal, notes)}
        onCancel={() => setWaiveNotesModal(null)}
      />

      {/* Mint confirmation modal */}
      {mintModal !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mint-confirm-title"
          onKeyDown={(e) => e.key === 'Escape' && setMintModal(null)}
        >
          <div
            className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm"
            aria-hidden
            onClick={() => setMintModal(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-neutral-900/[0.08] flex flex-col">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-neutral-100">
              <div>
                <h2 id="mint-confirm-title" className="text-base font-bold text-neutral-900">Mint certificate NFT?</h2>
                <p className="text-sm text-neutral-600 mt-0.5 leading-relaxed">
                  Issue an NFT credential to <strong>{mintModal.userName ?? mintModal.userEmail ?? 'this student'}</strong>
                  {mintModal.courseName ? <> for <strong>{mintModal.courseName}</strong></> : null}.{' '}
                  This on-chain transaction cannot be reversed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMintModal(null)}
                className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setMintModal(null)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={() => submitMint(mintModal)}>
                <Coins className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                Mint NFT
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Status legend (PHASE 4) */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 flex flex-wrap gap-x-5 gap-y-1.5">
        <span className="flex items-center gap-1 text-xs text-blue-800 font-medium">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Status guide:
        </span>
        {(Object.entries(STATUS_LABELS) as [NftApplicationStatus, typeof STATUS_LABELS[NftApplicationStatus]][]).map(
          ([k, v]) => (
            <span key={k} className="text-xs text-neutral-600">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full font-semibold mr-1 ${v.cls}`}>
                {v.label}
              </span>
              {v.description}
            </span>
          )
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-3">
        {([
          ['all',      'All',      applications.length, 'bg-neutral-100 text-neutral-800'],
          ['pending',  'Pending',  counts.pending,       'bg-amber-100 text-amber-900'],
          ['approved', 'Approved', counts.approved,      'bg-emerald-100 text-emerald-900'],
          ['minted',   'Minted',   counts.minted,        'bg-violet-100 text-violet-900'],
          ['rejected', 'Rejected', counts.rejected,      'bg-red-100 text-red-900'],
        ] as const).map(([val, label, count, cls]) => (
          <button
            key={val}
            type="button"
            onClick={() => setStatusFilter(val)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-all ${cls} ${
              statusFilter === val ? 'ring-2 ring-offset-1 ring-current' : 'opacity-70 hover:opacity-100'
            }`}
          >
            {label}
            {statusFilter === 'all' && <span className="tabular-nums font-bold">{count}</span>}
          </button>
        ))}
        <Button variant="outline" size="sm" type="button" onClick={load} className="ml-auto">
          <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden />
          Refresh
        </Button>
        <Button variant="outline" size="sm" type="button" onClick={() => exportApplicationsCSV(applications)}>
          <Download className="h-4 w-4 mr-1.5" aria-hidden />
          Export CSV
        </Button>
      </div>

      {error && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
        <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-violet-50/30 px-5 py-4">
          <CardTitle className="border-0 p-0 text-neutral-900">
            {statusFilter === 'all'
              ? 'All applications'
              : `${STATUS_LABELS[statusFilter as NftApplicationStatus]?.label} applications`}
          </CardTitle>
        </div>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-neutral-500 text-sm">Loading…</div>
          ) : applications.length === 0 ? (
            <div className="py-16 text-center px-4">
              <Award className="h-10 w-10 text-neutral-300 mx-auto mb-3" aria-hidden />
              <p className="text-neutral-500 text-sm">
                {statusFilter === 'all'
                  ? 'No certificate applications yet.'
                  : `No ${STATUS_LABELS[statusFilter as NftApplicationStatus]?.label.toLowerCase() ?? statusFilter} applications.`}
              </p>
              {statusFilter === 'all' && (
                <p className="text-neutral-400 text-xs mt-1 max-w-sm mx-auto">
                  Students submit applications from their dashboard once they meet all course requirements.
                </p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {applications.map((app) => {
                const isExpanded = expandedId === app.applicationId;
                const isActing = actionLoading === app.applicationId;
                const progKey = `${app.courseId}:${app.userId}`;
                const prog = progressCache[progKey];

                return (
                  <li key={app.applicationId} className="bg-white">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="text-sm font-semibold text-neutral-900 truncate">{app.userName ?? app.userEmail}</p>
                        <p className="text-xs text-neutral-500 truncate">{app.userEmail}</p>
                        <p className="text-xs text-neutral-600 truncate font-medium">{app.courseName}</p>
                        <p className="text-xs text-neutral-400 tabular-nums">Applied {new Date(app.appliedAt).toLocaleDateString()}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <StatusBadge status={app.status} />
                        <PaymentBadge app={app} />

                        {app.lecturerRecommendation && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 text-xs font-medium">
                            <CheckCircle className="h-3 w-3" aria-hidden /> Recommended
                          </span>
                        )}

                        {app.status === 'pending' && (
                          <>
                            <Button size="sm" type="button" disabled={isActing} onClick={() => handleApprove(app)} className="text-xs">
                              <CheckCircle className="h-3.5 w-3.5 mr-1" aria-hidden /> Approve
                            </Button>
                            <Button size="sm" variant="outline" type="button" disabled={isActing} onClick={() => setRejectModal(app)}
                              className="text-xs text-red-700 border-red-200 hover:bg-red-50">
                              <XCircle className="h-3.5 w-3.5 mr-1" aria-hidden /> Reject
                            </Button>
                          </>
                        )}
                        {app.status === 'approved' && app.paymentStatus === 'pending' && app.paymentId && (
                          <>
                            <Button size="sm" type="button" disabled={isActing} onClick={() => handleConfirmPayment(app)}
                              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                              <DollarSign className="h-3.5 w-3.5 mr-1" aria-hidden />
                              {isActing ? 'Confirming…' : 'Confirm Payment'}
                            </Button>
                            <Button size="sm" variant="outline" type="button" disabled={isActing} onClick={() => setWaiveNotesModal(app)}
                              className="text-xs text-blue-700 border-blue-200 hover:bg-blue-50">
                              Waive
                            </Button>
                          </>
                        )}
                        {app.status === 'approved' && (app.paymentStatus !== 'pending' || !app.priceCents) && (
                          <Button size="sm" type="button" disabled={isActing} onClick={() => handleMint(app)}
                            className="text-xs bg-violet-600 hover:bg-violet-700 text-white">
                            <Coins className="h-3.5 w-3.5 mr-1" aria-hidden />
                            {isActing ? 'Minting…' : 'Mint NFT'}
                          </Button>
                        )}
                        {app.status === 'minted' && app.txHash && (
                          <a
                            href={`https://stellar.expert/explorer/public/tx/${app.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-violet-700 font-mono flex items-center gap-1 hover:underline"
                            title={app.txHash}
                          >
                            tx: {app.txHash.slice(0, 8)}…
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                          </a>
                        )}

                        <button type="button" onClick={() => handleExpand(app)}
                          className="p-1 rounded-md text-neutral-400 hover:text-accent-teal hover:bg-neutral-50 transition-colors"
                          aria-label={isExpanded ? 'Collapse' : 'View progress'}>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {actionError[app.applicationId] && (
                      <p className="px-5 pb-3 text-xs text-red-600">{actionError[app.applicationId]}</p>
                    )}

                    {isExpanded && (
                      <div className="border-t border-neutral-100 bg-neutral-50/80 px-5 py-4 space-y-3">
                        <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Student progress</p>
                        {prog ? (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <ProgressStat label="Lessons" value={`${prog.completedLessonItems}/${prog.totalLessonItems}`} pct={prog.lessonPercentage} />
                            <div className="rounded-lg border border-neutral-200 bg-white p-3 text-center">
                              <p className="text-xs text-neutral-500 mb-1">Quizzes</p>
                              <p className="text-sm font-bold text-neutral-900">
                                {prog.allRequiredQuizzesPassed
                                  ? <span className="text-emerald-700">All passed</span>
                                  : <span className="text-amber-700">{prog.requiredQuizzes.filter((q) => q.passed).length}/{prog.requiredQuizzes.length}</span>}
                              </p>
                            </div>
                            <div className="rounded-lg border border-neutral-200 bg-white p-3 text-center">
                              <p className="text-xs text-neutral-500 mb-1">Submission</p>
                              <p className="text-sm font-bold">
                                {prog.hasApprovedSubmission
                                  ? <span className="text-emerald-700">Approved</span>
                                  : <span className="text-neutral-500">N/A</span>}
                              </p>
                            </div>
                            <div className="rounded-lg border border-neutral-200 bg-white p-3 text-center">
                              <p className="text-xs text-neutral-500 mb-1">Eligible</p>
                              <p className="text-sm font-bold">
                                {prog.meetsAllRequirements
                                  ? <span className="text-emerald-700">Yes</span>
                                  : <span className="text-red-700">No</span>}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-500">Loading progress…</p>
                        )}
                        {app.lecturerRecommendation && (
                          <div>
                            <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1">Lecturer recommendation</p>
                            <p className="text-sm text-neutral-700 italic">"{app.lecturerRecommendation}"</p>
                          </div>
                        )}
                        {app.reviewNotes && (
                          <div>
                            <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-1">Review notes</p>
                            <p className="text-sm text-neutral-700">{app.reviewNotes}</p>
                          </div>
                        )}
                      </div>
                    )}
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

// ─── Issued NFTs panel ────────────────────────────────────────────────────────

const IssuedCredentialsPanel: React.FC = () => {
  const [credentials, setCredentials] = useState<IssuedCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mintStatusFilter, setMintStatusFilter] = useState<'all' | 'pending' | 'minted' | 'failed'>('all');
  const [copiedTxHash, setCopiedTxHash] = useState<string | null>(null);

  // L-013 Re-mint state
  const [remintTarget, setRemintTarget] = useState<IssuedCredential | null>(null);
  const [remintWallet, setRemintWallet] = useState<string>('');
  const [remintLoading, setRemintLoading] = useState(false);
  const [remintError, setRemintError] = useState<string | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const openRemint = (cred: IssuedCredential) => {
    setRemintTarget(cred);
    setRemintWallet(cred.walletAddress);
    setRemintError(null);
  };

  const closeRemint = () => {
    if (remintLoading) return;
    setRemintTarget(null);
    setRemintWallet('');
    setRemintError(null);
  };

  const submitRemint = async () => {
    if (!remintTarget) return;
    setRemintLoading(true);
    setRemintError(null);
    try {
      const walletOverride = remintWallet.trim() !== remintTarget.walletAddress ? remintWallet.trim() : undefined;
      await adminCertificateService.remintCredential(remintTarget.credentialId, walletOverride);
      closeRemint();
      toastSuccess('Credential re-minted successfully.');
      await load();
    } catch (e) {
      setRemintError(getErrorMessage(e, 'Re-mint failed. Check the server logs.'));
    } finally {
      setRemintLoading(false);
    }
  };

  const handleCopyTx = (txHash: string) => {
    navigator.clipboard.writeText(txHash).then(() => {
      setCopiedTxHash(txHash);
      setTimeout(() => setCopiedTxHash((c) => (c === txHash ? null : c)), 2000);
    }).catch(() => {});
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const creds = await adminCertificateService.getIssuedCredentials(
        mintStatusFilter !== 'all' ? { mintStatus: mintStatusFilter } : undefined
      );
      setCredentials(creds);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load issued credentials.'));
    } finally {
      setLoading(false);
    }
  }, [mintStatusFilter]);

  useEffect(() => { load(); }, [load]);

  const counts = {
    minted:     credentials.filter((c) => c.mintStatus === 'minted').length,
    pending:    credentials.filter((c) => c.mintStatus === 'pending').length,
    failed:     credentials.filter((c) => c.mintStatus === 'failed').length,
    superseded: credentials.filter((c) => c.isSuperseded).length,
  };

  return (
    <div className="space-y-4">
      {/* Info banner explaining the two paths */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          About this view
        </p>
        <p className="text-xs text-neutral-600">
          Shows all rows in <code className="font-mono bg-neutral-100 px-1 rounded">nft_credentials</code>,
          including <strong>legacy quiz-triggered mints</strong> (minted automatically when a student passed a
          designated quiz while <code className="font-mono bg-neutral-100 px-1 rounded">NFT_AUTO_MINT_ENABLED=true</code>)
          and <strong>course-level mints</strong> that went through the application→approve→mint workflow.
          The <em>Path</em> column identifies which flow created each record.
        </p>
      </div>

      {/* Filter chips + refresh */}
      <div className="flex flex-wrap gap-3">
        {([
          ['all',     'All',     credentials.length, 'bg-neutral-100 text-neutral-800'],
          ['minted',  'Minted',  counts.minted,      'bg-violet-100 text-violet-900'],
          ['pending', 'Pending', counts.pending,      'bg-amber-100 text-amber-900'],
          ['failed',  'Failed',  counts.failed,       'bg-red-100 text-red-900'],
        ] as const).map(([val, label, count, cls]) => (
          <button key={val} type="button" onClick={() => setMintStatusFilter(val)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-all ${cls} ${
              mintStatusFilter === val ? 'ring-2 ring-offset-1 ring-current' : 'opacity-70 hover:opacity-100'
            }`}>
            {label}
            {mintStatusFilter === 'all' && <span className="tabular-nums font-bold">{count}</span>}
          </button>
        ))}
        {counts.superseded > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-neutral-200/70 text-neutral-500">
            Superseded
            <span className="tabular-nums font-bold">{counts.superseded}</span>
          </span>
        )}
        <Button variant="outline" size="sm" type="button" onClick={load} className="ml-auto">
          <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden />
          Refresh
        </Button>
        <Button variant="outline" size="sm" type="button" onClick={() => exportIssuedCSV(credentials)}>
          <Download className="h-4 w-4 mr-1.5" aria-hidden />
          Export CSV
        </Button>
      </div>

      {error && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
        <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-violet-50/30 px-5 py-4">
          <CardTitle className="border-0 p-0 text-neutral-900">
            Issued NFT credentials ({credentials.length})
          </CardTitle>
        </div>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-neutral-500 text-sm">Loading…</div>
          ) : credentials.length === 0 ? (
            <div className="py-16 text-center">
              <History className="h-10 w-10 text-neutral-300 mx-auto mb-3" aria-hidden />
              <p className="text-neutral-500 text-sm">No credentials found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Learner</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Course / Quiz</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Wallet</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Path</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Minted</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Tx</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {credentials.map((cred) => (
                    <tr key={cred.credentialId} className={`transition-colors ${
                      cred.isSuperseded
                        ? 'bg-neutral-50/60 opacity-60 hover:opacity-80'
                        : 'bg-white hover:bg-neutral-50/60'
                    }`}>
                      <td className="px-4 py-3">
                        <p className={`font-medium truncate max-w-[140px] ${cred.isSuperseded ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>
                          {cred.userName ?? cred.userEmail ?? '—'}
                        </p>
                        {cred.userName && <p className="text-xs text-neutral-400 truncate max-w-[140px]">{cred.userEmail}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {cred.courseName
                          ? <p className="text-neutral-700 truncate max-w-[160px]">{cred.courseName}</p>
                          : cred.quizTitle
                            ? <p className="text-neutral-500 italic truncate max-w-[160px]">{cred.quizTitle}</p>
                            : <span className="text-neutral-400 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-neutral-600 truncate max-w-[100px] block" title={cred.walletAddress}>
                          {cred.walletAddress.slice(0, 6)}…{cred.walletAddress.slice(-4)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {cred.isSuperseded
                          ? <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-500">Superseded</span>
                          : <MintStatusBadge status={cred.mintStatus} />}
                        {cred.mintError && !cred.isSuperseded && (
                          <p className="text-[10px] text-red-500 mt-0.5 truncate max-w-[100px]" title={cred.mintError}>
                            {cred.mintError.slice(0, 40)}…
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          cred.mintPath === 'course_application'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-orange-50 text-orange-700'
                        }`}>
                          {cred.mintPath === 'course_application' ? 'Application' : 'Quiz trigger'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500 tabular-nums">
                        {cred.mintedAt ? new Date(cred.mintedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {cred.txHash ? (
                          <div className="flex items-center gap-1">
                            <a
                              href={`https://stellar.expert/explorer/public/tx/${cred.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs text-violet-600 hover:text-violet-800 hover:underline flex items-center gap-0.5"
                              title={cred.txHash}
                            >
                              {cred.txHash.slice(0, 8)}…
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCopyTx(cred.txHash!)}
                              className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 transition-colors"
                              title="Copy full tx hash"
                              aria-label="Copy transaction hash"
                            >
                              {copiedTxHash === cred.txHash
                                ? <Check className="h-3 w-3 text-emerald-600" aria-hidden />
                                : <Copy className="h-3 w-3" aria-hidden />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-neutral-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {cred.mintStatus === 'minted' && !cred.isSuperseded && cred.courseId ? (
                          <button
                            type="button"
                            onClick={() => openRemint(cred)}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
                            title="Re-mint to a corrected wallet address"
                          >
                            <RotateCcw className="h-3 w-3" aria-hidden />
                            Re-mint
                          </button>
                        ) : (
                          <span className="text-neutral-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* L-013 Re-mint confirmation modal */}
      {remintTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md ring-1 ring-neutral-900/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-600 shrink-0" aria-hidden />
              <h2 className="text-base font-semibold text-neutral-900">Re-mint Credential</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Warning */}
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
                <div className="text-sm text-amber-900 space-y-1">
                  <p className="font-medium">This action is irreversible.</p>
                  <p>The original credential will be marked <strong>superseded</strong> and kept in the database for audit. A new NFT will be minted to the destination wallet.</p>
                </div>
              </div>

              {/* Credential summary */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Learner</span>
                  <span className="font-medium text-neutral-900 truncate max-w-[200px]">{remintTarget.userName ?? remintTarget.userEmail ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Course</span>
                  <span className="font-medium text-neutral-900 truncate max-w-[200px]">{remintTarget.courseName ?? '—'}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-neutral-500 shrink-0">Destination wallet</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-xs text-neutral-700 truncate">{remintWallet}</span>
                    <button
                      type="button"
                      onClick={() => setWalletModalOpen(true)}
                      className="shrink-0 text-xs font-medium text-violet-600 hover:text-violet-800 underline underline-offset-2"
                    >
                      Change
                    </button>
                  </div>
                </div>
                {remintWallet !== remintTarget.walletAddress && (
                  <p className="text-xs text-amber-700 font-medium">
                    ⚠ Wallet override applied — new NFT will go to the changed address.
                  </p>
                )}
              </div>

              {remintError && (
                <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                  <p className="text-sm">{remintError}</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-3">
              <Button variant="outline" size="sm" type="button" onClick={closeRemint} disabled={remintLoading}>
                Cancel
              </Button>
              <Button size="sm" type="button" onClick={submitRemint} disabled={remintLoading}
                className="bg-amber-600 hover:bg-amber-700 text-white border-amber-600">
                {remintLoading ? 'Minting…' : 'Confirm Re-mint'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet address override modal */}
      <TextInputModal
        isOpen={walletModalOpen}
        title="Change destination wallet"
        label="New wallet address"
        description="Enter the corrected Stellar wallet address (G…). The original wallet is kept for audit."
        placeholder="GABCD…"
        initialValue={remintWallet}
        confirmLabel="Apply"
        onConfirm={(val) => {
          if (val.trim()) setRemintWallet(val.trim());
          setWalletModalOpen(false);
        }}
        onCancel={() => setWalletModalOpen(false)}
      />
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const AdminCertificates: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ViewTab>('applications');

  return (
    <div className="pb-10 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <Award className="h-6 w-6 text-accent-teal" aria-hidden />
          Certificates &amp; NFT Credentials
        </h1>
        <p className="text-sm text-neutral-600 mt-1">
          Manage certificate applications and view all issued NFT credentials.
        </p>
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 w-fit">
        {([
          ['applications', 'Certificate Applications', <Award className="h-4 w-4" aria-hidden />],
          ['issued',       'Issued NFTs',              <History className="h-4 w-4" aria-hidden />],
        ] as const).map(([tab, label, icon]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-white shadow-sm text-neutral-900'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {activeTab === 'applications'
        ? <ApplicationsPanel role="admin" />
        : <IssuedCredentialsPanel />}
    </div>
  );
};

const ProgressStat: React.FC<{ label: string; value: string; pct: number }> = ({ label, value, pct }) => (
  <div className="rounded-lg border border-neutral-200 bg-white p-3 text-center">
    <p className="text-xs text-neutral-500 mb-1">{label}</p>
    <p className="text-sm font-bold text-neutral-900 tabular-nums">{value}</p>
    <div className="mt-1.5 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
      <div className="h-1.5 rounded-full bg-gradient-to-r from-accent-teal to-primary-600 transition-all" style={{ width: `${pct}%` }} />
    </div>
    <p className="text-[10px] text-neutral-400 mt-0.5 tabular-nums">{pct}%</p>
  </div>
);

export default AdminCertificates;
