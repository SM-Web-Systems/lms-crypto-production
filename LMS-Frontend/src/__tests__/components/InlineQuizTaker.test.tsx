import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/quizService', () => ({
  quizService: {
    getById: vi.fn(),
    getCompletion: vi.fn(),
    submitQuiz: vi.fn(),
  },
}));

vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Test Student' } }),
}));

import InlineQuizTaker from '../../components/InlineQuizTaker';
import { quizService } from '../../services/quizService';

const mockGetById = quizService.getById as ReturnType<typeof vi.fn>;
const mockGetCompletion = quizService.getCompletion as ReturnType<typeof vi.fn>;
const mockSubmitQuiz = quizService.submitQuiz as ReturnType<typeof vi.fn>;

const makeQuiz = (overrides: Record<string, unknown> = {}) => ({
  id: 'quiz-1',
  title: 'Blockchain Basics',
  description: 'Test your knowledge',
  questions: [
    { id: 'q1', type: 'multiple_choice', question: 'What is a blockchain?', options: ['Ledger', 'Database', 'Spreadsheet'], order: 1 },
    { id: 'q2', type: 'multiple_choice', question: 'What is consensus?', options: ['Agreement', 'Voting', 'Mining'], order: 2 },
  ],
  passingScore: 50,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('InlineQuizTaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCompletion.mockResolvedValue(null);
  });

  // IQ-1: Shows loading then intro
  it('shows loading state then intro with question count', async () => {
    const quiz = makeQuiz();
    mockGetById.mockResolvedValue(quiz);

    render(<InlineQuizTaker quizId="quiz-1" />);
    expect(screen.getByText('Loading quiz...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Blockchain Basics')).toBeInTheDocument();
      expect(screen.getByText('2 questions')).toBeInTheDocument();
      expect(screen.getByText('Begin')).toBeInTheDocument();
    });
  });

  // IQ-2: Already passed shows result directly
  it('shows result immediately if already passed', async () => {
    mockGetById.mockResolvedValue(makeQuiz());
    mockGetCompletion.mockResolvedValue({
      id: 'comp-1', quizId: 'quiz-1', userId: 'u1',
      score: 8, total: 10, passed: true,
      answers: {}, completedAt: new Date().toISOString(),
    });

    render(<InlineQuizTaker quizId="quiz-1" />);
    await waitFor(() => {
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(screen.getByText('Passed')).toBeInTheDocument();
    });
    expect(screen.queryByText('Begin')).not.toBeInTheDocument();
  });

  // IQ-3: Intro with question count and start button
  it('displays intro screen with description and Begin button', async () => {
    mockGetById.mockResolvedValue(makeQuiz({ description: 'Learn the fundamentals' }));

    render(<InlineQuizTaker quizId="quiz-1" />);
    await waitFor(() => {
      expect(screen.getByText('Learn the fundamentals')).toBeInTheDocument();
      expect(screen.getByText('Begin')).toBeInTheDocument();
    });
  });

  // IQ-4: Error state when quiz not found
  it('shows error state when quiz not found', async () => {
    mockGetById.mockResolvedValue(null);

    render(<InlineQuizTaker quizId="quiz-1" />);
    await waitFor(() => {
      expect(screen.getByText('Quiz not found.')).toBeInTheDocument();
      expect(screen.getByText('Try again')).toBeInTheDocument();
    });
  });

  // IQ-5: Navigates between questions and selects answers
  it('navigates between questions and selects answers', async () => {
    mockGetById.mockResolvedValue(makeQuiz());
    const user = userEvent.setup();

    render(<InlineQuizTaker quizId="quiz-1" />);
    await waitFor(() => expect(screen.getByText('Begin')).toBeInTheDocument());

    await user.click(screen.getByText('Begin'));
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('What is a blockchain?')).toBeInTheDocument();

    // Answer Q1
    await user.click(screen.getByLabelText('Ledger'));

    // Go to Q2
    await user.click(screen.getByText('Next'));
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('What is consensus?')).toBeInTheDocument();

    // Go back to Q1
    await user.click(screen.getByText('Previous'));
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
  });

  // IQ-6: Submits quiz and shows pass result
  it('submits quiz and shows pass result', async () => {
    const quiz = makeQuiz({
      questions: [{ id: 'q1', type: 'multiple_choice', question: 'Pick one', options: ['A', 'B'], order: 1 }],
    });
    mockGetById.mockResolvedValue(quiz);
    mockSubmitQuiz.mockResolvedValue({
      id: 'comp-1', quizId: 'quiz-1', userId: 'u1',
      score: 1, total: 1, passed: true,
      answers: { q1: 'A' }, completedAt: new Date().toISOString(),
    });
    const user = userEvent.setup();

    render(<InlineQuizTaker quizId="quiz-1" />);
    await waitFor(() => expect(screen.getByText('Begin')).toBeInTheDocument());

    await user.click(screen.getByText('Begin'));
    await user.click(screen.getByLabelText('A'));
    await user.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(screen.getByText('Passed')).toBeInTheDocument();
      expect(screen.getByText('1 of 1 correct')).toBeInTheDocument();
    });
  });

  // IQ-7: Shows fail result with red styling
  it('shows fail result with Not passed badge', async () => {
    const quiz = makeQuiz({
      questions: [{ id: 'q1', type: 'multiple_choice', question: 'Pick', options: ['X'], order: 1 }],
    });
    mockGetById.mockResolvedValue(quiz);
    mockSubmitQuiz.mockResolvedValue({
      id: 'comp-1', quizId: 'quiz-1', userId: 'u1',
      score: 0, total: 1, passed: false,
      answers: { q1: 'X' }, completedAt: new Date().toISOString(),
    });
    const user = userEvent.setup();

    render(<InlineQuizTaker quizId="quiz-1" />);
    await waitFor(() => expect(screen.getByText('Begin')).toBeInTheDocument());
    await user.click(screen.getByText('Begin'));
    await user.click(screen.getByLabelText('X'));
    await user.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(screen.getByText('0%')).toBeInTheDocument();
      expect(screen.getByText('Not passed')).toBeInTheDocument();
    });
  });

  // IQ-8: Retake resets to intro
  it('retake resets state to intro', async () => {
    const quiz = makeQuiz({
      questions: [{ id: 'q1', type: 'multiple_choice', question: 'Pick', options: ['A'], order: 1 }],
    });
    mockGetById.mockResolvedValue(quiz);
    mockSubmitQuiz.mockResolvedValue({
      id: 'comp-1', quizId: 'quiz-1', userId: 'u1',
      score: 1, total: 1, passed: true,
      answers: { q1: 'A' }, completedAt: new Date().toISOString(),
    });
    const user = userEvent.setup();

    render(<InlineQuizTaker quizId="quiz-1" />);
    await waitFor(() => expect(screen.getByText('Begin')).toBeInTheDocument());
    await user.click(screen.getByText('Begin'));
    await user.click(screen.getByLabelText('A'));
    await user.click(screen.getByText('Submit'));
    await waitFor(() => expect(screen.getByText('Passed')).toBeInTheDocument());

    await user.click(screen.getByText('Retake'));
    expect(screen.getByText('Begin')).toBeInTheDocument();
  });
});
