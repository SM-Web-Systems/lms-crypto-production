import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import Input from '../components/Input';
import { quizService } from '../services/quizService';
import { useAuth } from '../context/useAuth';
import type { Quiz, QuizCompletion, QuizQuestion } from '../types/quiz';
import {
  ClipboardList,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Loader2,
  CreditCard,
  AlertCircle,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { getErrorMessage } from '../utils/apiError';

type QuizStep = 'intro' | 'take' | 'result';

function sessionKey(quizId: string) {
  return `lms:quizTake:${quizId}`;
}

function attemptKey(quizId: string) {
  return `lms:quizAttempt:${quizId}`;
}

function getAttemptCount(quizId: string): number {
  try {
    return parseInt(sessionStorage.getItem(attemptKey(quizId)) ?? '0', 10) || 0;
  } catch { return 0; }
}

function incrementAttemptCount(quizId: string): number {
  try {
    const next = getAttemptCount(quizId) + 1;
    sessionStorage.setItem(attemptKey(quizId), String(next));
    return next;
  } catch { return 1; }
}

type QuizSession = { answers: Record<string, string>; qi: number };

function readSession(quizId: string): QuizSession | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(quizId));
    if (!raw) return null;
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== 'object') return null;
    const answers = (j as { answers?: unknown }).answers;
    const qi = (j as { qi?: unknown }).qi;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null;
    const qiNum = typeof qi === 'number' && Number.isFinite(qi) ? Math.max(0, Math.floor(qi)) : 0;
    return {
      answers: Object.fromEntries(
        Object.entries(answers as Record<string, unknown>).filter(
          ([k, v]) => typeof k === 'string' && typeof v === 'string'
        )
      ) as Record<string, string>,
      qi: qiNum,
    };
  } catch {
    return null;
  }
}

function writeSession(quizId: string, data: QuizSession) {
  try {
    sessionStorage.setItem(sessionKey(quizId), JSON.stringify(data));
  } catch {
    /* quota */
  }
}

function clearSession(quizId: string) {
  try {
    sessionStorage.removeItem(sessionKey(quizId));
  } catch {
    /* */
  }
}

function sortedQuestions(quiz: Quiz): QuizQuestion[] {
  return [...(quiz.questions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

const StudentQuizzes: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [searchParams, setSearchParams] = useSearchParams();
  const qQuiz = searchParams.get('quiz') || '';
  const qStepRaw = searchParams.get('step') as string | null;
  const qStep: QuizStep | null =
    qStepRaw === 'intro' || qStepRaw === 'take' || qStepRaw === 'result' ? qStepRaw : null;
  const qQi = Math.max(0, parseInt(searchParams.get('qi') || '0', 10) || 0);

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [completions, setCompletions] = useState<Record<string, QuizCompletion | null>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<QuizCompletion | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const takeInitRef = useRef<string | null>(null);

  const activeQuiz = useMemo(() => quizzes.find((x) => x.id === qQuiz) ?? null, [quizzes, qQuiz]);
  const questions = useMemo(() => (activeQuiz ? sortedQuestions(activeQuiz) : []), [activeQuiz]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const list = await quizService.getAll();
        if (cancelled) return;
        setQuizzes(list);

        const comps: Record<string, QuizCompletion | null> = {};
        await Promise.all(
          list.map(async (q) => {
            try {
              comps[q.id] = await quizService.getCompletion(q.id, userId);
            } catch {
              comps[q.id] = null;
            }
          })
        );
        if (!cancelled) setCompletions(comps);
      } catch (e) {
        if (!cancelled) {
          setQuizzes([]);
          setLoadError(getErrorMessage(e, 'Could not load quizzes.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /** URL: quiz id only → normalize to step=intro */
  useEffect(() => {
    if (!qQuiz || qStep) return;
    const p = new URLSearchParams(searchParams);
    p.set('step', 'intro');
    p.delete('qi');
    setSearchParams(p, { replace: true });
  }, [qQuiz, qStep, searchParams, setSearchParams]);

  /** Invalid quiz id in URL */
  useEffect(() => {
    if (!qQuiz || loading) return;
    if (quizzes.length === 0) return;
    const exists = quizzes.some((x) => x.id === qQuiz);
    if (!exists) {
      setSearchParams({}, { replace: true });
    }
  }, [qQuiz, quizzes, loading, setSearchParams]);

  /** Sync question index from URL while taking */
  useEffect(() => {
    if (!activeQuiz || qStep !== 'take') return;
    if (questions.length === 0) return;
    const safeQi = Math.min(qQi, questions.length - 1);
    setQuestionIndex(safeQi);
  }, [activeQuiz?.id, qStep, qQi, questions.length]);

  /** Load draft answers once per take session */
  useEffect(() => {
    if (!activeQuiz || qStep !== 'take') {
      takeInitRef.current = null;
      return;
    }
    const key = `${activeQuiz.id}:take`;
    if (takeInitRef.current === key) return;
    takeInitRef.current = key;
    const sess = readSession(activeQuiz.id);
    if (sess && Object.keys(sess.answers).length > 0) {
      setAnswers(sess.answers);
    }
  }, [activeQuiz?.id, qStep]);

  /** Persist draft as student answers or index changes */
  useEffect(() => {
    if (!activeQuiz || qStep !== 'take') return;
    writeSession(activeQuiz.id, { answers, qi: questionIndex });
  }, [activeQuiz?.id, qStep, answers, questionIndex]);

  const setAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const pushTakeUrl = (qi: number) => {
    if (!activeQuiz) return;
    const p = new URLSearchParams(searchParams);
    p.set('quiz', activeQuiz.id);
    p.set('step', 'take');
    p.set('qi', String(qi));
    setSearchParams(p, { replace: true });
    setQuestionIndex(qi);
  };

  const openQuizIntro = (quiz: Quiz) => {
    takeInitRef.current = null;
    clearSession(quiz.id);
    setAnswers({});
    setQuestionIndex(0);
    setLastResult(null);
    setSubmitError(null);
    setSearchParams({ quiz: quiz.id, step: 'intro' }, { replace: false });
  };

  const beginQuiz = () => {
    if (!activeQuiz) return;
    takeInitRef.current = null;
    setAnswers({});
    setQuestionIndex(0);
    writeSession(activeQuiz.id, { answers: {}, qi: 0 });
    const count = incrementAttemptCount(activeQuiz.id);
    setAttemptCount(count);
    setSearchParams({ quiz: activeQuiz.id, step: 'take', qi: '0' }, { replace: false });
    setQuestionIndex(0);
  };

  const backToList = () => {
    takeInitRef.current = null;
    if (activeQuiz) clearSession(activeQuiz.id);
    setAnswers({});
    setQuestionIndex(0);
    setLastResult(null);
    setSubmitError(null);
    setSearchParams({}, { replace: false });
  };

  const goPrevQuestion = () => {
    if (questionIndex <= 0) return;
    pushTakeUrl(questionIndex - 1);
  };

  const goNextQuestion = () => {
    if (questionIndex >= questions.length - 1) return;
    pushTakeUrl(questionIndex + 1);
  };

  const submitQuiz = async () => {
    if (!activeQuiz || !userId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await quizService.submitQuiz(activeQuiz.id, userId, answers);
      setLastResult(result);
      setCompletions((prev) => ({ ...prev, [activeQuiz.id]: result }));
      clearSession(activeQuiz.id);
      setSearchParams({ quiz: activeQuiz.id, step: 'result' }, { replace: false });
    } catch (e) {
      setSubmitError(getErrorMessage(e, 'Could not submit your answers.'));
    } finally {
      setSubmitting(false);
    }
  };

  /** Load completion when landing on result via URL (e.g. refresh) */
  useEffect(() => {
    if (!activeQuiz || !userId || qStep !== 'result') return;
    if (lastResult && lastResult.quizId === activeQuiz.id) return;
    let cancelled = false;
    quizService.getCompletion(activeQuiz.id, userId).then((c) => {
      if (!cancelled && c) setLastResult(c);
    });
    return () => {
      cancelled = true;
    };
  }, [activeQuiz?.id, userId, qStep, lastResult]);

  const passingScore = activeQuiz?.passingScore ?? 70;

  /* ——— Result view ——— */
  if (qQuiz && activeQuiz && qStep === 'result') {
    const result = lastResult;
    return (
      <div className="max-w-3xl mx-auto space-y-5 pb-8">
        <button
          type="button"
          onClick={backToList}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200/90 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          All quizzes
        </button>

        {result ? (
          <div className="rounded-xl border border-neutral-200/90 bg-white shadow-card ring-1 ring-neutral-900/5 overflow-hidden">
            <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-neutral-200/90 bg-gradient-to-b from-white to-neutral-50/90">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Quiz result</p>
                {attemptCount > 0 && (
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    Attempt {attemptCount}
                  </span>
                )}
              </div>
              <div className="flex items-start gap-3">
                {result.passed ? (
                  <CheckCircle className="h-10 w-10 text-green-600 shrink-0" aria-hidden />
                ) : (
                  <XCircle className="h-10 w-10 text-red-600 shrink-0" aria-hidden />
                )}
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-primary-dark tracking-tight">{activeQuiz.title}</h1>
                  <p className="text-sm text-neutral-600 mt-1 tabular-nums">
                    Score: {result.score}% — {result.passed ? 'Passed' : 'Not passed'} (passing {passingScore}%)
                  </p>
                </div>
              </div>
            </div>
            <div className="px-4 py-4 sm:px-6 sm:py-5 space-y-4">
              <p className="text-sm text-neutral-700 leading-relaxed">
                {result.passed
                  ? 'Great work. You reached the passing score for this quiz.'
                  : `You need at least ${passingScore}% to pass — you scored ${result.score}%. Review the correct answers below and retake when you are ready.`}
              </p>

              <div className="rounded-lg border border-neutral-200/90 bg-neutral-50/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">Your answers</p>
                <ul className="space-y-3">
                  {questions.map((q, idx) => {
                    const submitted = (result.answers[q.id] ?? '').trim();
                    let correctText: string | null = null;
                    if (q.type === 'short_answer' && q.correctAnswer != null) {
                      correctText = String(q.correctAnswer).trim();
                    } else if ((q.type === 'multiple_choice' || q.type === 'flashcard') && q.options && typeof q.correctIndex === 'number') {
                      correctText = q.options[q.correctIndex] ?? null;
                    }
                    const isCorrect =
                      correctText != null && submitted !== '' &&
                      submitted.toLowerCase() === correctText.toLowerCase();
                    const isWrong = correctText != null && submitted !== '' && !isCorrect;
                    return (
                      <li key={q.id} className="text-sm border-b border-neutral-200/80 pb-3 last:border-0 last:pb-0">
                        <div className="flex items-start gap-2">
                          {isCorrect ? (
                            <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" aria-hidden />
                          ) : isWrong ? (
                            <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" aria-hidden />
                          ) : (
                            <span className="h-4 w-4 shrink-0" aria-hidden />
                          )}
                          <div className="min-w-0">
                            <span className="font-medium text-neutral-800">
                              {idx + 1}. {q.question}
                            </span>
                            {q.information?.trim() ? (
                              <p className="text-xs text-neutral-500 mt-1 whitespace-pre-wrap">{q.information}</p>
                            ) : null}
                            <p className={`mt-1 ${isCorrect ? 'text-green-700' : isWrong ? 'text-red-700' : 'text-neutral-700'}`}>
                              <span className="text-neutral-500">Your answer: </span>
                              {submitted || '—'}
                            </p>
                            {isWrong && correctText ? (
                              <p className="text-green-700 mt-0.5">
                                <span className="text-neutral-500">Correct answer: </span>
                                {correctText}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="rounded-xl border border-neutral-200/90 bg-neutral-100/50 p-4 ring-1 ring-neutral-900/5">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="h-5 w-5 text-neutral-600" aria-hidden />
                  <h2 className="text-base font-semibold text-neutral-800">Pay to certify</h2>
                </div>
                <p className="text-sm text-neutral-600 mb-3">
                  Certificate payment is not wired up yet — this is a placeholder.
                </p>
                <Button variant="outline" disabled className="opacity-75 cursor-not-allowed">
                  Payment coming soon
                </Button>
              </div>

              <Button variant="outline" onClick={() => openQuizIntro(activeQuiz)}>
                Retake quiz
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-neutral-600 py-8">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            Loading result…
          </div>
        )}
      </div>
    );
  }

  /* ——— Intro ——— */
  if (qQuiz && activeQuiz && qStep === 'intro') {
    const n = questions.length;
    const completion = completions[activeQuiz.id];
    return (
      <div className="max-w-3xl mx-auto space-y-5 pb-8">
        <button
          type="button"
          onClick={backToList}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200/90 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          All quizzes
        </button>

        <div className="rounded-xl border border-neutral-200/90 bg-white shadow-card ring-1 ring-neutral-900/5 overflow-hidden">
          <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-neutral-200/90 bg-gradient-to-b from-white to-neutral-50/90">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Before you start</p>
            <h1 className="text-xl sm:text-2xl font-bold text-primary-dark tracking-tight">{activeQuiz.title}</h1>
            {activeQuiz.description?.trim() ? (
              <p className="text-sm text-neutral-600 mt-2 max-w-prose leading-relaxed">{activeQuiz.description}</p>
            ) : null}
          </div>

          {activeQuiz.information?.trim() ? (
            <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-neutral-200/80 bg-sky-50/50">
              <div className="flex gap-3 items-start max-w-prose">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-teal/15 text-accent-teal">
                  <Info className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Information</p>
                  <div className="text-sm text-neutral-800 mt-1.5 leading-relaxed whitespace-pre-wrap">
                    {activeQuiz.information}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="px-4 py-4 sm:px-6 sm:py-5 space-y-4">
            <ul className="text-sm text-neutral-600 space-y-1.5">
              <li className="flex gap-2">
                <span className="text-accent-teal font-semibold">·</span>
                {n} question{n !== 1 ? 's' : ''} — move through one at a time; your progress is saved in this browser until you submit.
              </li>
              <li className="flex gap-2">
                <span className="text-accent-teal font-semibold">·</span>
                Passing score: {passingScore}%
              </li>
              {completion ? (
                <li className="flex gap-2">
                  <span className="text-accent-teal font-semibold">·</span>
                  You previously scored {completion.score}% ({completion.passed ? 'passed' : `did not pass — need ${passingScore}%`}). You can retake below.
                </li>
              ) : null}
            </ul>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="button" onClick={beginQuiz}>
                {completion ? 'Retake quiz' : 'Begin quiz'}
              </Button>
              <Button type="button" variant="outline" onClick={backToList}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ——— Take (one question) ——— */
  if (qQuiz && activeQuiz && qStep === 'take') {
    if (questions.length === 0) {
      return (
        <div className="max-w-lg mx-auto space-y-4">
          <Button type="button" variant="outline" onClick={backToList}>
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden />
            All quizzes
          </Button>
          <p className="text-neutral-600">This quiz has no questions yet.</p>
        </div>
      );
    }
    const q = questions[questionIndex];
    if (!q) {
      return null;
    }
    const idx = questionIndex;
    const isLast = idx >= questions.length - 1;

    return (
      <div className="max-w-3xl mx-auto space-y-4 pb-8">
        <button
          type="button"
          onClick={backToList}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200/90 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          All quizzes
        </button>

        <div className="rounded-xl border border-neutral-200/90 bg-white shadow-card overflow-hidden flex flex-col ring-1 ring-neutral-900/5">
          <div className="border-b border-neutral-200 bg-gradient-to-r from-accent-teal/[0.06] via-white to-neutral-50/90 px-3 py-3 sm:px-5 sm:py-3.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0 space-y-1.5 flex-1">
                <p className="text-xs font-semibold text-neutral-800 tabular-nums">
                  Question {idx + 1} of {questions.length}
                </p>
                <div className="h-1.5 rounded-full bg-neutral-200/90 overflow-hidden max-w-md">
                  <div
                    className="h-full rounded-full bg-accent-teal transition-[width] duration-300 ease-out"
                    style={{ width: `${((idx + 1) / questions.length) * 100}%` }}
                  />
                </div>
                <p className="text-sm font-medium text-primary-dark truncate">{activeQuiz.title}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={idx <= 0}
                  onClick={goPrevQuestion}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Previous
                </Button>
                {!isLast ? (
                  <Button type="button" size="sm" className="gap-1" onClick={goNextQuestion}>
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                ) : (
                  <Button type="button" size="sm" disabled={submitting} onClick={() => void submitQuiz()}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    Submit quiz
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 bg-neutral-50/50">
            {submitError ? (
              <div className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                <span>{submitError}</span>
              </div>
            ) : null}

            <div className="rounded-xl border border-neutral-200/90 bg-white shadow-sm ring-1 ring-neutral-900/[0.04] overflow-hidden">
              <div className="px-4 py-4 sm:px-6 border-b border-neutral-200/90 bg-gradient-to-b from-white to-neutral-50/90">
                <p className="text-base sm:text-lg font-semibold text-neutral-800 leading-snug">{q.question}</p>
              </div>
              {q.information?.trim() ? (
                <div className="px-4 py-3 sm:px-6 border-b border-neutral-200/80 bg-sky-50/40">
                  <div className="flex gap-2 items-start">
                    <Info className="h-4 w-4 text-accent-teal shrink-0 mt-0.5" aria-hidden />
                    <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap">{q.information}</p>
                  </div>
                </div>
              ) : null}
              <div className="p-4 sm:p-6 space-y-4">
                {q.type === 'multiple_choice' && q.options && (
                  <div className="space-y-2" role="radiogroup" aria-label="Answer choices">
                    {q.options.map((opt, oi) => (
                      <label
                        key={oi}
                        className="flex items-center gap-3 cursor-pointer rounded-lg border border-neutral-200/90 px-3 py-2.5 hover:bg-neutral-50/90 has-[:checked]:border-accent-teal/50 has-[:checked]:bg-accent-teal/5"
                      >
                        <input
                          type="radio"
                          name={q.id}
                          value={opt}
                          checked={(answers[q.id] ?? '') === opt}
                          onChange={() => setAnswer(q.id, opt)}
                          className="rounded border-neutral-300 text-accent-teal focus:ring-accent-teal"
                        />
                        <span className="text-neutral-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}
                {q.type === 'flashcard' && q.options && (
                  <FlashcardGrid
                    questionId={q.id}
                    options={q.options}
                    selected={answers[q.id] ?? ''}
                    onSelect={(val) => setAnswer(q.id, val)}
                  />
                )}
                {q.type === 'short_answer' && (
                  <Input
                    label="Your answer"
                    placeholder="Type your answer"
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    className="max-w-lg"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ——— List ——— */
  return (
    <div>
      <div className="mb-8 flex items-center">
        <ClipboardList className="h-8 w-8 text-primary-600 mr-3 shrink-0" aria-hidden />
        <div>
          <h1 className="text-3xl font-bold text-neutral-800">Quizzes</h1>
          <p className="text-neutral-600 mt-1">
            Open a quiz for instructions, then answer one question at a time. You can bookmark or share the URL to
            resume (progress is kept in this browser until you submit).
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" aria-hidden />
        </div>
      ) : loadError ? (
        <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-medium">Could not load quizzes</p>
            <p className="text-sm mt-1">{loadError}</p>
          </div>
        </div>
      ) : quizzes.length === 0 ? (
        <p className="text-neutral-600">No quizzes available yet. Check back later.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {quizzes.map((quiz) => {
            const completion = completions[quiz.id] ?? null;
            const n = quiz.questions?.length ?? 0;
            return (
              <Card key={quiz.id} className="shadow-card border-neutral-200/90 ring-1 ring-neutral-900/5">
                <CardContent className="p-5 sm:p-6">
                  <h3 className="text-lg font-bold text-primary-dark tracking-tight">{quiz.title}</h3>
                  <p className="text-sm text-neutral-600 mt-1 line-clamp-2">
                    {quiz.description?.trim() || 'Knowledge check'}
                  </p>
                  <p className="text-xs text-neutral-500 mt-3 tabular-nums">
                    {n} question{n !== 1 ? 's' : ''}
                    {completion ? ` · Last score ${completion.score}% (${completion.passed ? 'passed' : 'not passed'})` : ''}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => openQuizIntro(quiz)}>
                      {completion ? 'Retake' : 'Take quiz'}
                    </Button>
                    {completion ? (
                      <span className="inline-flex items-center text-xs font-medium text-green-700 bg-green-50 border border-green-200/80 rounded-full px-2.5 py-1">
                        <CheckCircle className="h-3.5 w-3.5 mr-1" aria-hidden />
                        Completed
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

const CARD_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function FlashcardGrid({
  questionId,
  options,
  selected,
  onSelect,
}: {
  questionId: string;
  options: string[];
  selected: string;
  onSelect: (val: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Answer choices"
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      {options.map((opt, oi) => {
        const isSelected = selected === opt;
        const letter = CARD_LETTERS[oi] ?? String(oi + 1);
        return (
          <button
            key={oi}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`Option ${letter}: ${opt}`}
            onClick={() => onSelect(opt)}
            className={[
              'relative group flex flex-col items-start gap-3 rounded-2xl border-2 px-5 py-4 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2 min-h-[7rem]',
              isSelected
                ? 'border-accent-teal bg-accent-teal/8 shadow-md shadow-accent-teal/15 ring-2 ring-accent-teal/25'
                : 'border-neutral-200/90 bg-white hover:border-accent-teal/40 hover:bg-neutral-50/80 hover:shadow-sm',
            ].join(' ')}
          >
            {/* Letter badge */}
            <span
              className={[
                'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-colors shrink-0',
                isSelected
                  ? 'bg-accent-teal text-white'
                  : 'bg-neutral-100 text-neutral-600 group-hover:bg-accent-teal/15 group-hover:text-primary-dark',
              ].join(' ')}
            >
              {letter}
            </span>

            {/* Option text */}
            <span
              className={[
                'text-sm font-medium leading-snug',
                isSelected ? 'text-primary-dark' : 'text-neutral-700',
              ].join(' ')}
            >
              {opt}
            </span>

            {/* Selected indicator dot */}
            {isSelected && (
              <span className="absolute top-3 right-3 h-3 w-3 rounded-full bg-accent-teal shadow-sm" aria-hidden />
            )}

            {/* Hidden radio for a11y */}
            <input
              type="radio"
              name={questionId}
              value={opt}
              checked={isSelected}
              onChange={() => onSelect(opt)}
              className="sr-only"
              tabIndex={-1}
            />
          </button>
        );
      })}
    </div>
  );
}

export default StudentQuizzes;
