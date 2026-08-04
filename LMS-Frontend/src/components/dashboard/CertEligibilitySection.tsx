import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../Button';
import { courseCompletionService } from '../../services/courseCompletionService';
import type { CourseProgress, NftApplication } from '../../types/api';
import type { Course } from '../../types/course';
import { CertEligibilitySkeleton } from '../PageSkeletons';
import {
  CheckCircle,
  XCircle,
  Clock,
  MessageCircle,
  Award,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

/** NM-C1: Plain-English descriptions for each cert application state. */
const CERT_STATE_MSGS: Record<string, { desc: string; next: string }> = {
  not_eligible: {
    desc: 'You have not yet met the course requirements for a certificate.',
    next: 'Complete all required lessons and quizzes to unlock your application.',
  },
  eligible: {
    desc: 'You have completed all course requirements.',
    next: "Request your certificate below — your lecturer will review before it's issued.",
  },
  pending: {
    desc: 'Your application is under review by your instructor.',
    next: "You'll hear back once a decision has been made. No action needed.",
  },
  approved: {
    desc: 'Your application has been approved.',
    next: 'Your instructor will mint your NFT certificate — you\'ll see it in your wallet once issued.',
  },
  minted: {
    desc: 'Your NFT certificate has been issued to your wallet.',
    next: 'View it in AmmaWallet or follow the transaction link below.',
  },
  rejected: {
    desc: 'Your application was not approved this time.',
    next: '',
  },
};

interface CertEligibilitySectionProps {
  userWalletAddress: string | null | undefined;
  courses: Course[];
  coursesLoading: boolean;
  progressMap: Record<string, CourseProgress>;
  appStatusMap: Record<string, NftApplication | null>;
  onAppStatusChange: (courseId: string, app: NftApplication) => void;
}

const CertEligibilitySection: React.FC<CertEligibilitySectionProps> = ({
  userWalletAddress,
  courses,
  coursesLoading,
  progressMap,
  appStatusMap,
  onAppStatusChange,
}) => {
  const [certState, setCertState] = useState<Record<string, 'idle' | 'loading' | 'applied' | 'error'>>({});
  const [certErrors, setCertErrors] = useState<Record<string, string>>({});

  const handleApplyCertificate = async (courseId: string) => {
    setCertState((s) => ({ ...s, [courseId]: 'loading' }));
    setCertErrors((e) => ({ ...e, [courseId]: '' }));
    try {
      const newApp = await courseCompletionService.applyForCertificate(courseId);
      onAppStatusChange(courseId, newApp);
      setCertState((s) => ({ ...s, [courseId]: 'applied' }));
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : 'Could not submit application.';
      if (typeof e === 'object' && e !== null && 'response' in e) {
        const status = (e as { response?: { status?: number } }).response?.status;
        if (status === 409) {
          // Re-fetch the existing application so UI reflects real server state
          courseCompletionService.getCourseApplications(courseId)
            .then((apps) => {
              if (apps.length > 0) onAppStatusChange(courseId, apps[0]);
            })
            .catch(() => {});
          setCertState((s) => ({ ...s, [courseId]: 'applied' }));
          return;
        }
      }
      setCertErrors((err) => ({ ...err, [courseId]: msg }));
      setCertState((s) => ({ ...s, [courseId]: 'error' }));
    }
  };

  if (coursesLoading) {
    return <CertEligibilitySkeleton />;
  }

  if (courses.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Certificate eligibility</h2>
          <p className="text-sm text-neutral-600 mt-0.5">
            Complete lessons, quizzes, and submission to earn your NFT credential.
          </p>
        </div>
        <Link
          to="/student/progress"
          className="shrink-0 text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
        >
          View full progress →
        </Link>
      </div>
      <div className="space-y-3">
        {courses.map((course) => {
          const prog = progressMap[course.id];
          const state = certState[course.id] ?? 'idle';
          const certErr = certErrors[course.id];
          const appStatus = appStatusMap[course.id];
          const displayState =
            state === 'loading' ? 'loading'
            : appStatus?.status === 'minted' ? 'minted'
            : appStatus?.status === 'approved' ? 'approved'
            : appStatus?.status === 'pending' ? 'pending'
            : appStatus?.status === 'rejected' ? 'rejected'
            : state === 'applied' ? 'pending'
            : prog?.canApplyForCertificate ? 'eligible'
            : 'not_eligible';
          return (
            <div
              key={course.id}
              className="rounded-xl border border-neutral-200/90 bg-white px-4 py-4 shadow-card ring-1 ring-neutral-900/[0.02]"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{course.title}</p>
                    {course.courseCode && (
                      <span className="text-xs text-neutral-500 font-mono">{course.courseCode}</span>
                    )}
                    {displayState === 'eligible' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium">
                        <CheckCircle className="h-3 w-3" aria-hidden />
                        Eligible to apply
                      </span>
                    )}
                    {displayState === 'pending' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-medium">
                        <Clock className="h-3 w-3" aria-hidden />
                        Application pending
                      </span>
                    )}
                    {displayState === 'approved' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-medium">
                        <CheckCircle className="h-3 w-3" aria-hidden />
                        Approved · Awaiting mint
                      </span>
                    )}
                    {displayState === 'minted' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-900 text-xs font-medium">
                        <Award className="h-3 w-3" aria-hidden />
                        NFT Issued
                      </span>
                    )}
                    {displayState === 'rejected' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-900 text-xs font-medium">
                        <XCircle className="h-3 w-3" aria-hidden />
                        Application rejected
                      </span>
                    )}
                  </div>
                  {/* NM-C2: Plain-English cert status description */}
                  {displayState !== 'loading' && CERT_STATE_MSGS[displayState] && (
                    <p className="text-xs text-neutral-500 leading-snug mt-0.5">
                      {CERT_STATE_MSGS[displayState].desc}
                      {CERT_STATE_MSGS[displayState].next && (
                        <> <span className="text-neutral-400">{CERT_STATE_MSGS[displayState].next}</span></>
                      )}
                    </p>
                  )}
                  {/* NM-C3: Rejection reason + re-apply guidance */}
                  {displayState === 'rejected' && appStatus?.reviewNotes && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 mt-1">
                      <MessageCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-red-800">Reviewer's feedback</p>
                        <p className="text-xs text-red-700 mt-0.5 break-words">"{appStatus.reviewNotes}"</p>
                      </div>
                    </div>
                  )}
                  {displayState === 'rejected' && prog?.canApplyForCertificate && (
                    <p className="text-xs text-neutral-500 mt-1">
                      You still meet all requirements — click <strong className="font-medium text-neutral-700">Re-apply</strong> to submit a new application.
                    </p>
                  )}
                  {/* Wallet mismatch warning */}
                  {appStatus?.walletAddress && userWalletAddress &&
                    appStatus.walletAddress !== userWalletAddress &&
                    displayState !== 'minted' && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden />
                      <div className="text-xs text-amber-800">
                        <p className="font-medium">Wallet address changed</p>
                        <p className="mt-0.5">
                          Your application was submitted with a different wallet address. If minting fails,
                          please contact your instructor.
                        </p>
                      </div>
                    </div>
                  )}
                  {/* Mint error chip (shown to student as generic message) */}
                  {appStatus?.mintError && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Minting error — please contact your instructor for assistance.
                    </p>
                  )}
                  {prog ? (
                    <div className="flex flex-wrap gap-4 text-xs text-neutral-500">
                      <span>
                        Lessons:{' '}
                        <strong className="text-neutral-800">
                          {prog.completedLessonItems}/{prog.totalLessonItems}
                        </strong>
                      </span>
                      <span>
                        Quizzes:{' '}
                        <strong className={prog.allRequiredQuizzesPassed ? 'text-emerald-700' : 'text-neutral-800'}>
                          {prog.allRequiredQuizzesPassed
                            ? 'All passed'
                            : `${prog.requiredQuizzes.filter((q) => q.passed).length}/${prog.requiredQuizzes.length}`}
                        </strong>
                      </span>
                      {prog.hasApprovedSubmission && (
                        <span>
                          Submission: <strong className="text-emerald-700">Approved</strong>
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-400">Loading progress…</p>
                  )}
                  {prog && (
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
                  )}
                  {displayState === 'minted' && appStatus?.txHash && (
                    <a
                      href={`https://stellar.expert/explorer/public/tx/${appStatus.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-violet-600 font-mono inline-flex items-center gap-1 hover:underline"
                    >
                      tx: {appStatus.txHash.slice(0, 8)}…{appStatus.txHash.slice(-4)}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  )}
                  {certErr && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                      {certErr}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {(displayState === 'eligible' || (displayState === 'rejected' && prog?.canApplyForCertificate)) && (
                    <Button
                      size="sm"
                      type="button"
                      className="text-xs"
                      onClick={() => handleApplyCertificate(course.id)}
                    >
                      <Award className="h-3.5 w-3.5 mr-1" aria-hidden />
                      {displayState === 'rejected' ? 'Re-apply' : 'Request certificate'}
                    </Button>
                  )}
                  {displayState === 'loading' && (
                    <Button size="sm" type="button" disabled className="text-xs">
                      Submitting…
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default CertEligibilitySection;
