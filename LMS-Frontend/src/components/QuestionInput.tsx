import Input from './Input';
import type { QuizQuestion } from '../types/quiz';
import { CARD_LETTERS, isAnswerableHere } from '../utils/quizQuestion';


interface QuestionInputProps {
  question: QuizQuestion;
  value: string;
  onChange: (value: string) => void;
  /** Where to answer a question this view can't render. */
  quizHref?: string;
  disabled?: boolean;
}

/** The answer control for one quiz question. Shared by lessons, the Quizzes page and the admin preview. */
export default function QuestionInput({ question: q, value, onChange, quizHref, disabled }: QuestionInputProps) {
  if (!isAnswerableHere(q)) {
    return (
      <p className="text-sm text-neutral-600">
        This question can't be answered here
        {quizHref ? (
          <>
            , <a href={quizHref} className="text-accent-teal underline">open it in Quizzes</a>
          </>
        ) : null}
        .
      </p>
    );
  }

  if (q.type === 'flashcard') {
    return <FlashcardGrid questionId={q.id} options={q.options!} selected={value} onSelect={onChange} disabled={disabled} />;
  }

  if (q.type === 'multiple_choice') {
    return (
      <div className="space-y-2" role="radiogroup" aria-label="Answer choices">
        {q.options!.map((opt, oi) => (
          <label
            key={oi}
            className="flex items-center gap-3 cursor-pointer rounded-lg border border-neutral-200/90 px-3 py-2.5 hover:bg-neutral-50/90 has-[:checked]:border-accent-teal/50 has-[:checked]:bg-accent-teal/5"
          >
            <input
              type="radio"
              name={q.id}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              disabled={disabled}
              className="rounded border-neutral-300 text-accent-teal focus:ring-accent-teal"
            />
            <span className="text-neutral-700">{opt}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <Input
      label="Your answer"
      aria-label="Your answer"
      placeholder="Type your answer"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="max-w-lg"
    />
  );
}

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
            disabled={disabled}
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
