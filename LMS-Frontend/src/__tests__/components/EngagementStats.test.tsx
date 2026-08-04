import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import EngagementStats from '../../components/dashboard/EngagementStats';
import type { Submission } from '../../types';
import type { QuizCompletion } from '../../types/quiz';

const makeSub = (status: 'pending' | 'approved' | 'rejected'): Submission => ({
  id: crypto.randomUUID(),
  studentId: 's1',
  studentName: 'Alice',
  title: 'Essay',
  description: 'desc',
  fileName: 'essay.pdf',
  fileSize: 1024,
  fileUrl: '/files/essay.pdf',
  status,
  submittedAt: new Date().toISOString(),
});

const makeQuiz = (passed: boolean): QuizCompletion => ({
  id: crypto.randomUUID(),
  quizId: 'q1',
  userId: 'u1',
  score: passed ? 8 : 3,
  total: 10,
  passed,
  answers: {},
  completedAt: new Date().toISOString(),
});

describe('EngagementStats', () => {
  it('renders all four stat cards', () => {
    render(<EngagementStats submissions={[]} quizCompletions={null} />);
    expect(screen.getByText('Your uploads')).toBeInTheDocument();
    expect(screen.getByText('In the queue')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Quizzes passed')).toBeInTheDocument();
  });

  it('counts submissions by status', () => {
    const subs = [makeSub('pending'), makeSub('approved'), makeSub('approved'), makeSub('rejected')];
    render(<EngagementStats submissions={subs} quizCompletions={null} />);
    // Total uploads = 4
    expect(screen.getByText('4')).toBeInTheDocument();
    // Pending = 1
    expect(screen.getByText('1')).toBeInTheDocument();
    // Approved = 2
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows rejection message when rejected > 0', () => {
    const subs = [makeSub('rejected'), makeSub('rejected')];
    render(<EngagementStats submissions={subs} quizCompletions={null} />);
    expect(screen.getByText(/2 submissions need a revision/)).toBeInTheDocument();
  });

  it('hides rejection message when none rejected', () => {
    render(<EngagementStats submissions={[makeSub('approved')]} quizCompletions={null} />);
    expect(screen.queryByText(/need a revision/)).not.toBeInTheDocument();
  });

  it('counts passed quizzes and shows attempt subtitle', () => {
    const quizzes = [makeQuiz(true), makeQuiz(false), makeQuiz(true)];
    render(<EngagementStats submissions={[]} quizCompletions={quizzes} />);
    // Passed = 2
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3 attempts total')).toBeInTheDocument();
  });
});
