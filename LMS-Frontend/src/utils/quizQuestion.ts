import type { QuizQuestion } from '../types/quiz';

export const CARD_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const hasOptions = (q: QuizQuestion) => Array.isArray(q.options) && q.options.length > 0;

/** True when QuestionInput can render an answer control for this question. */
export function isAnswerableHere(q: QuizQuestion): boolean {
  if (q.type === 'multiple_choice' || q.type === 'flashcard') return hasOptions(q);
  return q.type === 'short_answer';
}
