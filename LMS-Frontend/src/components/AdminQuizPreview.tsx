import { useState, useMemo } from 'react';
import {
  X,
  Eye,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Info,
  CheckCircle,
  XCircle,
  LayoutGrid,
} from 'lucide-react';
import { Button } from './Button';
import Input from './Input';
import type { Quiz, QuizQuestion } from '../types/quiz';

interface AdminQuizPreviewProps {
  quiz: Quiz;
  onClose: () => void;
}

type Step = 'intro' | 'take' | 'result';

const CARD_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function sortedQuestions(quiz: Quiz): QuizQuestion[] {
  return [...(quiz.questions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function scorePreview(
  questions: QuizQuestion[],
  answers: Record<string, string>
): { correct: number; total: number; score: number } {
  let correct = 0;
  for (const q of questions) {
    const submitted = (answers[q.id] ?? '').trim();
    if (!submitted) continue;
    if ((q.type === 'multiple_choice' || q.type === 'flashcard') && q.options && typeof q.correctIndex === 'number') {
      const expected = (q.options[q.correctIndex] ?? '').trim();
      if (submitted === expected) correct++;
    } else if (q.type === 'short_answer' && q.correctAnswer) {
      if (submitted.toLowerCase() === q.correctAnswer.trim().toLowerCase()) correct++;
    }
  }
  return { correct, total: questions.length, score: questions.length > 0 ? Math.round((correct / questions.length) * 100) : 100 };
}

// ─── Flashcard grid (same as student view) ───────────────────────────────────

function FlashcardGrid({
  questionId,
  options,
  selected,
  onSelect,
  disabled,
}: {
  questionId: string;
  options: string[];
  selected: string;
  onSelect: (val: string) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Answer choices" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.map((opt, oi) => {
        const isSelected = selected === opt;
        const letter = CARD_LETTERS[oi] ?? String(oi + 1);
        return (
          <button
            key={oi}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => !disabled && onSelect(opt)}
            disabled={disabled}
            className={[
              'relative group flex flex-col items-start gap-3 rounded-2xl border-2 px-5 py-4 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2 min-h-[7rem]',
              disabled ? 'cursor-default' : 'cursor-pointer',
              isSelected
                ? 'border-accent-teal bg-accent-teal/8 shadow-md shadow-accent-teal/15 ring-2 ring-accent-teal/25'
                : 'border-neutral-200/90 bg-white hover:border-accent-teal/40 hover:bg-neutral-50/80 hover:shadow-sm',
            ].join(' ')}
          >
            <span
              className={[
                'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-colors shrink-0',
                isSelected ? 'bg-accent-teal text-white' : 'bg-neutral-100 text-neutral-600',
              ].join(' ')}
            >
              {letter}
            </span>
            <span className={`text-sm font-medium leading-snug ${isSelected ? 'text-primary-dark' : 'text-neutral-700'}`}>
              {opt}
            </span>
            {isSelected && <span className="absolute top-3 right-3 h-3 w-3 rounded-full bg-accent-teal shadow-sm" aria-hidden />}
            <input type="radio" name={questionId} value={opt} checked={isSelected} onChange={() => onSelect(opt)} className="sr-only" tabIndex={-1} />
          </button>
        );
      })}
    </div>
  );
}

// ─── Preview component ────────────────────────────────────────────────────────

export function AdminQuizPreview({ quiz, onClose }: AdminQuizPreviewProps) {
  const questions = useMemo(() => sortedQuestions(quiz), [quiz]);
  const passingScore = quiz.passingScore ?? 70;

  const [step, setStep] = useState<Step>('intro');
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const currentQ = questions[qi] ?? null;
  const isLast = qi >= questions.length - 1;

  const setAnswer = (qId: string, val: string) =>
    setAnswers((prev) => ({ ...prev, [qId]: val }));

  const begin = () => {
    setAnswers({});
    setQi(0);
    setStep('take');
  };

  const restart = () => {
    setAnswers({});
    setQi(0);
    setStep('intro');
  };

  const result = useMemo(() => scorePreview(questions, answers), [questions, answers]);
  const passed = result.score >= passingScore;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-hidden" role="dialog" aria-modal aria-label="Quiz preview">

      {/* Admin banner */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary-dark text-white shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
            <Eye className="h-4 w-4" />
          </span>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/70 block leading-none">Admin Preview</span>
            <span className="text-sm font-bold leading-snug">{quiz.title}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          aria-label="Close preview"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-neutral-50/50">
        <div className="max-w-3xl mx-auto space-y-5 pb-8">

          {/* ── Intro ── */}
          {step === 'intro' && (
            <>
              <div className="rounded-xl border border-neutral-200/90 bg-white shadow-card ring-1 ring-neutral-900/5 overflow-hidden">
                <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-neutral-200/90 bg-gradient-to-b from-white to-neutral-50/90">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Before you start</p>
                  <h1 className="text-xl sm:text-2xl font-bold text-primary-dark tracking-tight">{quiz.title}</h1>
                  {quiz.description?.trim() && (
                    <p className="text-sm text-neutral-600 mt-2 max-w-prose leading-relaxed">{quiz.description}</p>
                  )}
                </div>

                {quiz.information?.trim() && (
                  <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-neutral-200/80 bg-sky-50/50">
                    <div className="flex gap-3 items-start max-w-prose">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-teal/15 text-accent-teal">
                        <Info className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Information</p>
                        <div className="text-sm text-neutral-800 mt-1.5 leading-relaxed whitespace-pre-wrap">{quiz.information}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="px-4 py-4 sm:px-6 sm:py-5 space-y-4">
                  <ul className="text-sm text-neutral-600 space-y-1.5">
                    <li className="flex gap-2">
                      <span className="text-accent-teal font-semibold">·</span>
                      {questions.length} question{questions.length !== 1 ? 's' : ''} — one at a time
                    </li>
                    <li className="flex gap-2">
                      <span className="text-accent-teal font-semibold">·</span>
                      Passing score: {passingScore}%
                    </li>
                  </ul>
                  <Button type="button" onClick={begin} disabled={questions.length === 0}>
                    {questions.length === 0 ? 'No questions yet' : 'Begin quiz'}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* ── Take ── */}
          {step === 'take' && currentQ && (
            <div className="rounded-xl border border-neutral-200/90 bg-white shadow-card overflow-hidden flex flex-col ring-1 ring-neutral-900/5">
              {/* Progress bar */}
              <div className="border-b border-neutral-200 bg-gradient-to-r from-accent-teal/[0.06] via-white to-neutral-50/90 px-3 py-3 sm:px-5 sm:py-3.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0 space-y-1.5 flex-1">
                    <p className="text-xs font-semibold text-neutral-800 tabular-nums">
                      Question {qi + 1} of {questions.length}
                    </p>
                    <div className="h-1.5 rounded-full bg-neutral-200/90 overflow-hidden max-w-md">
                      <div
                        className="h-full rounded-full bg-accent-teal transition-[width] duration-300 ease-out"
                        style={{ width: `${((qi + 1) / questions.length) * 100}%` }}
                      />
                    </div>
                    <p className="text-sm font-medium text-primary-dark truncate">{quiz.title}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={qi <= 0}
                      onClick={() => setQi((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    {!isLast ? (
                      <Button type="button" size="sm" className="gap-1" onClick={() => setQi((p) => p + 1)}>
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button type="button" size="sm" onClick={() => setStep('result')}>
                        View result
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Question card */}
              <div className="p-4 sm:p-6 bg-neutral-50/50">
                <div className="rounded-xl border border-neutral-200/90 bg-white shadow-sm ring-1 ring-neutral-900/[0.04] overflow-hidden">
                  <div className="px-4 py-4 sm:px-6 border-b border-neutral-200/90 bg-gradient-to-b from-white to-neutral-50/90">
                    <p className="text-base sm:text-lg font-semibold text-neutral-800 leading-snug">{currentQ.question}</p>
                  </div>
                  {currentQ.information?.trim() && (
                    <div className="px-4 py-3 sm:px-6 border-b border-neutral-200/80 bg-sky-50/40">
                      <div className="flex gap-2 items-start">
                        <Info className="h-4 w-4 text-accent-teal shrink-0 mt-0.5" />
                        <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap">{currentQ.information}</p>
                      </div>
                    </div>
                  )}
                  <div className="p-4 sm:p-6 space-y-4">
                    {currentQ.type === 'multiple_choice' && currentQ.options && (
                      <div className="space-y-2" role="radiogroup" aria-label="Answer choices">
                        {currentQ.options.map((opt, oi) => (
                          <label
                            key={oi}
                            className="flex items-center gap-3 cursor-pointer rounded-lg border border-neutral-200/90 px-3 py-2.5 hover:bg-neutral-50/90 has-[:checked]:border-accent-teal/50 has-[:checked]:bg-accent-teal/5"
                          >
                            <input
                              type="radio"
                              name={currentQ.id}
                              value={opt}
                              checked={(answers[currentQ.id] ?? '') === opt}
                              onChange={() => setAnswer(currentQ.id, opt)}
                              className="accent-accent-teal"
                            />
                            <span className="text-neutral-700">{opt}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {currentQ.type === 'flashcard' && currentQ.options && (
                      <FlashcardGrid
                        questionId={currentQ.id}
                        options={currentQ.options}
                        selected={answers[currentQ.id] ?? ''}
                        onSelect={(val) => setAnswer(currentQ.id, val)}
                      />
                    )}
                    {currentQ.type === 'short_answer' && (
                      <Input
                        label="Your answer"
                        placeholder="Type your answer"
                        value={answers[currentQ.id] ?? ''}
                        onChange={(e) => setAnswer(currentQ.id, e.target.value)}
                        className="max-w-lg"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Result ── */}
          {step === 'result' && (
            <div className="rounded-xl border border-neutral-200/90 bg-white shadow-card ring-1 ring-neutral-900/5 overflow-hidden">
              <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-neutral-200/90 bg-gradient-to-b from-white to-neutral-50/90">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">Preview result</p>
                <div className="flex items-start gap-3">
                  {passed ? (
                    <CheckCircle className="h-10 w-10 text-green-600 shrink-0" />
                  ) : (
                    <XCircle className="h-10 w-10 text-red-500 shrink-0" />
                  )}
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-primary-dark tracking-tight">{quiz.title}</h1>
                    <p className="text-sm text-neutral-600 mt-1 tabular-nums">
                      Score: <span className="font-semibold text-neutral-800">{result.score}%</span>
                      {' — '}
                      {passed ? (
                        <span className="text-green-700 font-medium">Passed</span>
                      ) : (
                        <span className="text-red-600 font-medium">Not passed</span>
                      )}
                      {' '}(passing {passingScore}%)
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-4 py-4 sm:px-6 sm:py-5 space-y-4">
                {/* Per-question breakdown with correct answers shown */}
                <div className="rounded-lg border border-neutral-200/90 bg-neutral-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3">
                    Answer review — correct answers highlighted
                  </p>
                  <ul className="space-y-4">
                    {questions.map((q, idx) => {
                      const submitted = (answers[q.id] ?? '').trim();
                      const correctText =
                        (q.type === 'multiple_choice' || q.type === 'flashcard') && q.options && typeof q.correctIndex === 'number'
                          ? (q.options[q.correctIndex] ?? '')
                          : q.correctAnswer ?? '';
                      const isCorrect =
                        submitted && submitted.toLowerCase() === correctText.trim().toLowerCase();

                      return (
                        <li key={q.id} className="text-sm border-b border-neutral-200/80 pb-4 last:border-0 last:pb-0 space-y-2">
                          <div className="flex items-start gap-2">
                            {isCorrect ? (
                              <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-neutral-800">
                                {idx + 1}. {q.question}
                                {q.type === 'flashcard' && (
                                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent-teal bg-accent-teal/8 border border-accent-teal/20 rounded-full px-1.5 py-0.5">
                                    <LayoutGrid className="h-2.5 w-2.5" />
                                    Flashcard
                                  </span>
                                )}
                              </p>

                              {/* Options for MC / flashcard: highlight correct + show what was picked */}
                              {(q.type === 'multiple_choice' || q.type === 'flashcard') && q.options && (
                                <ul className="mt-2 space-y-1">
                                  {q.options.map((opt, oi) => {
                                    const isCorrectOpt = oi === q.correctIndex;
                                    const isChosen = submitted === opt;
                                    return (
                                      <li
                                        key={oi}
                                        className={[
                                          'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium border',
                                          isCorrectOpt
                                            ? 'bg-green-50 border-green-200 text-green-800'
                                            : isChosen && !isCorrectOpt
                                            ? 'bg-red-50 border-red-200 text-red-700'
                                            : 'bg-white border-neutral-200/80 text-neutral-600',
                                        ].join(' ')}
                                      >
                                        <span className="w-5 shrink-0 font-bold">{CARD_LETTERS[oi]}</span>
                                        <span className="flex-1">{opt}</span>
                                        {isCorrectOpt && <span className="ml-auto shrink-0 text-green-700 font-semibold">✓ Correct</span>}
                                        {isChosen && !isCorrectOpt && <span className="ml-auto shrink-0 text-red-600 font-semibold">✗ Your answer</span>}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}

                              {/* Short answer result */}
                              {q.type === 'short_answer' && (
                                <div className="mt-2 space-y-1 text-xs">
                                  <p>
                                    <span className="text-neutral-500">Your answer: </span>
                                    <span className={isCorrect ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                                      {submitted || '—'}
                                    </span>
                                  </p>
                                  {!isCorrect && correctText && (
                                    <p>
                                      <span className="text-neutral-500">Expected: </span>
                                      <span className="text-green-700 font-medium">{correctText}</span>
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button type="button" onClick={begin}>Restart preview</Button>
                  <Button type="button" variant="outline" onClick={restart}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back to intro
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
