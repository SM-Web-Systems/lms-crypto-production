import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'learner-b' } }) }));
vi.mock('../../services/quizService', () => ({
  quizService: {
    getById: vi.fn().mockResolvedValue({
      id: 'q1', title: 'Dummy acceptance quiz', passingScore: 70,
      questions: [{ id: 'a', type: 'multiple_choice', question: 'Pick yes', options: ['yes', 'no'], order: 0 }],
      createdAt: 'x',
    }),
    // Server shape: score is a percentage, total is the number of questions.
    getCompletion: vi.fn().mockResolvedValue({
      id: 'c1', quizId: 'q1', userId: 'learner-b', score: 100, total: 1, passed: true,
      answers: { a: 'yes' }, completedAt: '2026-11-19T21:00:00Z',
    }),
  },
}));

import InlineQuizTaker from '../../components/InlineQuizTaker';

describe('InlineQuizTaker result', () => {
  it('shows 100% (not 10000%) and 1 of 1 correct for a one-question pass', async () => {
    render(<InlineQuizTaker quizId="q1" />);
    expect(await screen.findByText('100%')).toBeInTheDocument();
    expect(screen.queryByText('10000%')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 1 correct')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
  });
});
