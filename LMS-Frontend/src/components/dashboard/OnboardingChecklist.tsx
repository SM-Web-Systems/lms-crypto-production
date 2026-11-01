import React, { useEffect, useState } from 'react';
import { Sparkles, CheckCircle, X, Minus } from 'lucide-react';

interface OnboardingChecklistProps {
  userId: string;
  walletConnected: boolean;
  // W09-R3: null means the data needed to evaluate this step is unavailable (load failed).
  // null is rendered as "unknown" — neither checked nor unchecked — so a failed fetch
  // does not falsely claim a prerequisite is incomplete.
  enrolled: boolean | null;
  hasCompletedLesson: boolean | null;
  quizPassed: boolean | null;
  hasApplied: boolean | null;
}

const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
  userId,
  walletConnected,
  enrolled,
  hasCompletedLesson,
  quizPassed,
  hasApplied,
}) => {
  // Start true to avoid flash; set correctly once userId is known
  const [checklistDismissed, setChecklistDismissed] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const dismissed = localStorage.getItem(`lms_checklist_dismissed_${userId}`) === 'true';
    setChecklistDismissed(dismissed);
  }, [userId]);

  const handleDismissChecklist = () => {
    if (!userId) return;
    localStorage.setItem(`lms_checklist_dismissed_${userId}`, 'true');
    setChecklistDismissed(true);
  };

  if (checklistDismissed) return null;

  const checklistSteps: { label: string; done: boolean | null }[] = [
    { label: 'Connect your AmmaWallet', done: walletConnected },
    { label: 'Enrol in a course', done: enrolled },
    { label: 'Complete your first lesson', done: hasCompletedLesson },
    { label: 'Pass the required quiz', done: quizPassed },
    { label: 'Apply for your certificate', done: hasApplied },
  ];
  // All-done only counts when every step is explicitly true (not null/false).
  const checklistAllDone = checklistSteps.every((s) => s.done === true);

  return (
    <section
      className="rounded-xl border border-primary-200/80 bg-gradient-to-br from-primary-50/70 via-white to-accent-teal/5 shadow-sm ring-1 ring-neutral-900/[0.03]"
      aria-label="Getting started checklist"
    >
      <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-primary-100/80">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-teal/15 text-accent-teal">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Getting started</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {checklistAllDone
                ? 'You\'ve completed all the steps — amazing work!'
                : 'Complete these steps to earn your NFT certificate.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismissChecklist}
          className="shrink-0 p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          aria-label="Dismiss getting started checklist"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="px-5 py-3 space-y-2.5">
        {checklistSteps.map((step) => (
          <li key={step.label} className="flex items-center gap-3">
            {step.done === null ? (
              /* W09-R3: unknown — data unavailable; do not claim step is not done */
              <Minus className="h-4 w-4 text-neutral-300 shrink-0" aria-hidden />
            ) : step.done ? (
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden />
            ) : (
              <div className="h-4 w-4 rounded-full border-2 border-neutral-300 shrink-0" aria-hidden />
            )}
            <span
              className={`text-sm ${
                step.done === true ? 'text-neutral-400 line-through' : 'text-neutral-800'
              }`}
            >
              {step.label}
            </span>
            {step.done === true && (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Done</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default OnboardingChecklist;
