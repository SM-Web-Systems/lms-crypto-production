import { useState, useEffect, useCallback } from 'react';
import { quizService } from '../services/quizService';
import { useAuth } from '../context/useAuth';
import type { Quiz, QuizCompletion, QuizQuestion } from '../types/quiz';

interface InlineQuizTakerProps {
  quizId: string;
}

type Step = 'loading' | 'intro' | 'taking' | 'submitting' | 'result' | 'error';

export default function InlineQuizTaker({ quizId }: InlineQuizTakerProps) {
  const { user } = useAuth();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [qi, setQi] = useState(0);
  const [result, setResult] = useState<QuizCompletion | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStep('loading');

    const quizP = quizService.getById(quizId);
    const compP = user?.id
      ? quizService.getCompletion(quizId, user.id).catch(() => null)
      : Promise.resolve(null);

    Promise.all([quizP, compP]).then(([q, comp]) => {
      if (cancelled) return;
      if (!q) { setErrorMsg('Quiz not found.'); setStep('error'); return; }
      setQuiz(q);
      if (comp?.passed) { setResult(comp); setStep('result'); }
      else { setStep('intro'); }
    }).catch((err) => {
      if (cancelled) return;
      setErrorMsg(err?.message || 'Failed to load quiz.');
      setStep('error');
    });

    return () => { cancelled = true; };
  }, [quizId, user?.id]);

  const questions = quiz?.questions ?? [];
  const answeredCount = questions.filter((qq) => answers[qq.id]?.trim()).length;
  const allAnswered = answeredCount === questions.length;
  const isLast = qi === questions.length - 1;

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    setShowConfirm(false);
    setStep('submitting');
    try {
      const res = await quizService.submitQuiz(quizId, '', answers);
      setResult(res);
      setStep('result');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || 'Failed to submit quiz.');
      setStep('error');
    }
  };

  const handleRetake = () => {
    setAnswers({});
    setQi(0);
    setResult(null);
    setShowReview(false);
    setStep('intro');
  };

  const handleRetry = () => {
    setErrorMsg('');
    setStep('loading');
    quizService.getById(quizId).then((q) => {
      if (!q) {
        setErrorMsg('Quiz not found.');
        setStep('error');
        return;
      }
      setQuiz(q);
      setStep('intro');
    }).catch((err) => {
      setErrorMsg(err?.message || 'Failed to load quiz.');
      setStep('error');
    });
  };

  // Keyboard navigation during quiz taking
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (step !== 'taking' || showConfirm) return;
    const q = questions[qi];
    if (!q) return;

    // Don't intercept when typing in text input
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text') return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setQi((p) => Math.min(questions.length - 1, p + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setQi((p) => Math.max(0, p - 1));
    } else if (e.key === 'Enter' && isLast && allAnswered) {
      e.preventDefault();
      setShowConfirm(true);
    } else if (q.type === 'multiple_choice' && q.options) {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= q.options.length) {
        e.preventDefault();
        handleAnswer(q.id, q.options[num - 1]);
      }
    }
  }, [step, showConfirm, qi, questions, isLast, allAnswered]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        <p className="text-sm text-neutral-500">Loading quiz...</p>
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 px-4">
        <p className="text-sm text-red-600">{errorMsg}</p>
        <button
          onClick={handleRetry}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 transition-colors"
        >
          Try again
        </button>
        <a
          href={`/student/quizzes?quiz=${quizId}`}
          className="text-xs text-accent-teal hover:underline"
        >
          Open in Quizzes page
        </a>
      </div>
    );
  }

  // ─── Intro ──────────────────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div className="flex flex-col items-center gap-5 py-8 px-4">
        <p className="text-base font-semibold text-neutral-800">{quiz?.title}</p>
        {quiz?.description?.trim() && (
          <p className="text-sm text-neutral-600 max-w-prose text-center leading-relaxed">{quiz.description}</p>
        )}
        {questions.length === 0 ? (
          <p className="text-sm text-neutral-500">This quiz has no questions yet.</p>
        ) : (
          <>
            <p className="text-sm text-neutral-500">{questions.length} question{questions.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => { setQi(0); setStep('taking'); }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 transition-colors min-w-[200px]"
            >
              Begin
            </button>
          </>
        )}
      </div>
    );
  }

  // ─── Result ─────────────────────────────────────────────────────────────────
  if (step === 'result' && result) {
    const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
    return (
      <div className="flex flex-col items-center gap-5 py-8 px-4">
        <p className="text-base font-semibold text-neutral-800">{quiz?.title}</p>
        <p className="text-3xl font-bold text-neutral-800">{pct}%</p>
        <span
          className={`inline-block rounded-full px-4 py-1 text-sm font-semibold ${
            result.passed
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {result.passed ? 'Passed' : 'Not passed'}
        </span>
        <p className="text-sm text-neutral-500">
          {result.score} of {result.total} correct
        </p>

        {/* Review answers toggle */}
        {!showReview ? (
          <button
            onClick={() => setShowReview(true)}
            className="rounded px-3 py-1.5 text-sm text-amber-600 hover:bg-amber-50 transition-colors"
          >
            Review Answers
          </button>
        ) : (
          <div className="w-full max-w-xl">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-semibold text-neutral-700">Your Answers</p>
              <button
                onClick={() => setShowReview(false)}
                className="text-xs text-neutral-500 hover:text-neutral-700"
              >
                Hide
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {questions.map((qq, i) => {
                const submitted = result.answers?.[qq.id] ?? '—';
                return (
                  <div key={qq.id} className="rounded border border-neutral-200 p-3">
                    <p className="text-xs text-neutral-500 mb-1">Question {i + 1}</p>
                    <p className="text-sm text-neutral-800 mb-1">{qq.question}</p>
                    <p className="text-sm text-neutral-600">
                      Your answer: <span className="font-medium">{submitted}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={handleRetake}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 transition-colors"
        >
          Retake
        </button>
      </div>
    );
  }

  // ─── Submitting ─────────────────────────────────────────────────────────────
  if (step === 'submitting') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        <p className="text-sm text-neutral-500">Submitting...</p>
      </div>
    );
  }

  // ─── Taking ─────────────────────────────────────────────────────────────────
  const q: QuizQuestion | undefined = questions[qi];
  if (!q) return null;

  return (
    <div className="flex flex-col gap-5 py-6 px-4 max-w-xl mx-auto">
      {/* Progress indicator */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <p className="text-xs text-neutral-500">
            Question {qi + 1} of {questions.length}
          </p>
          <p className="text-xs text-neutral-400">
            {answeredCount} of {questions.length} answered
          </p>
        </div>
        <div className="w-full bg-neutral-200 rounded-full h-1.5">
          <div
            className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${((qi + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <p className="text-sm font-semibold text-neutral-800">{q.question}</p>

      {q.information?.trim() && (
        <p className="text-xs text-neutral-500 italic">{q.information}</p>
      )}

      {q.type === 'multiple_choice' && q.options ? (
        <div className="flex flex-col gap-2">
          {q.options.map((opt, i) => (
            <label key={i} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name={`iq-${q.id}`}
                value={opt}
                checked={answers[q.id] === opt}
                onChange={() => handleAnswer(q.id, opt)}
                className="accent-amber-500"
              />
              {opt}
            </label>
          ))}
        </div>
      ) : (
        <input
          type="text"
          value={answers[q.id] || ''}
          onChange={(e) => handleAnswer(q.id, e.target.value)}
          placeholder="Your answer"
          className="rounded border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      )}

      <div className="flex justify-between items-center pt-2">
        <button
          onClick={() => setQi((p) => Math.max(0, p - 1))}
          disabled={qi === 0}
          className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>

        {isLast ? (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!allAnswered}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Submit
          </button>
        ) : (
          <button
            onClick={() => setQi((p) => Math.min(questions.length - 1, p + 1))}
            className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            Next
          </button>
        )}
      </div>

      {/* Submission confirmation dialog */}
      {showConfirm && (
        <div
          role="dialog"
          aria-label="Confirm submission"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm mx-4">
            <p className="text-sm font-semibold text-neutral-800 mb-2">Submit Quiz?</p>
            <p className="text-sm text-neutral-600 mb-4">
              You answered {answeredCount} of {questions.length} questions. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 transition-colors"
              >
                Confirm Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
