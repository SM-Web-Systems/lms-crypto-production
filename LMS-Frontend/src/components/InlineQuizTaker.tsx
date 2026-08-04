import { useState, useEffect } from 'react';
import { quizService } from '../services/quizService';
import type { Quiz, QuizCompletion, QuizQuestion } from '../types/quiz';

interface InlineQuizTakerProps {
  quizId: string;
}

type Step = 'loading' | 'intro' | 'taking' | 'submitting' | 'result' | 'error';

export default function InlineQuizTaker({ quizId }: InlineQuizTakerProps) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [qi, setQi] = useState(0);
  const [result, setResult] = useState<QuizCompletion | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStep('loading');
    quizService.getById(quizId).then((q) => {
      if (cancelled) return;
      if (!q) {
        setErrorMsg('Quiz not found.');
        setStep('error');
        return;
      }
      setQuiz(q);
      setStep('intro');
    }).catch((err) => {
      if (cancelled) return;
      setErrorMsg(err?.message || 'Failed to load quiz.');
      setStep('error');
    });
    return () => { cancelled = true; };
  }, [quizId]);

  const questions = quiz?.questions ?? [];

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
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

  const allAnswered = questions.every((qq) => answers[qq.id]?.trim());
  const isLast = qi === questions.length - 1;

  return (
    <div className="flex flex-col gap-5 py-6 px-4 max-w-xl mx-auto">
      <p className="text-xs text-neutral-500 text-right">
        Question {qi + 1} of {questions.length}
      </p>

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
            onClick={handleSubmit}
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
    </div>
  );
}
