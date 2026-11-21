import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import QuestionInput from '../../components/QuestionInput';
import { isAnswerableHere } from '../../utils/quizQuestion';
import type { QuestionType, QuizQuestion } from '../../types/quiz';

const q = (type: string, extra: Partial<QuizQuestion> = {}): QuizQuestion =>
  ({ id: 'q1', type: type as QuestionType, question: 'Pick', options: ['Ledger', 'Database'], order: 1, ...extra });

function renderInput(question: QuizQuestion, value = '', onChange = vi.fn()) {
  render(<QuestionInput question={question} value={value} onChange={onChange} quizHref="/student/quizzes?quiz=quiz-1" />);
  return onChange;
}

// Every QuestionType in types/quiz.ts, plus a type the server may store but this client does not know.
describe.each([
  ['multiple_choice', 'radio'],
  ['flashcard', 'radio'],
  ['short_answer', 'textbox'],
  ['true_false', 'unsupported'],
] as const)('QuestionInput type %s', (type, expected) => {
  it(`renders ${expected}`, async () => {
    const onChange = renderInput(q(type));
    if (expected === 'radio') {
      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBeGreaterThanOrEqual(2);
      await userEvent.click(screen.getAllByRole('radio', { name: /Database/ })[0]);
      expect(onChange).toHaveBeenCalledWith('Database');
    } else if (expected === 'textbox') {
      await userEvent.type(screen.getByRole('textbox', { name: 'Your answer' }), 'x');
      expect(onChange).toHaveBeenCalledWith('x');
    } else {
      expect(screen.getByText(/This question can't be answered here/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /open it in Quizzes/i })).toHaveAttribute('href', '/student/quizzes?quiz=quiz-1');
      expect(screen.queryByRole('textbox')).toBeNull();
    }
    expect(isAnswerableHere(q(type))).toBe(expected !== 'unsupported');
  });
});

it('a flashcard shows its options as radio cards with the chosen one checked', () => {
  renderInput(q('flashcard'), 'Ledger');
  expect(screen.getByRole('radio', { name: 'Option A: Ledger' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('radio', { name: 'Option B: Database' })).toHaveAttribute('aria-checked', 'false');
});

it('a choice question with no options is not answerable here', () => {
  renderInput(q('flashcard', { options: [] }));
  expect(screen.getByText(/This question can't be answered here/)).toBeInTheDocument();
  expect(isAnswerableHere(q('multiple_choice', { options: undefined }))).toBe(false);
});
