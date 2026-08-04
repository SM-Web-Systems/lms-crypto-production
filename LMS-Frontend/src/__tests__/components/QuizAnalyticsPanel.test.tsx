import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/analyticsService', () => ({
  analyticsService: {
    getQuizAnalytics: vi.fn(),
    getDashboard: vi.fn(),
    getCourseAnalytics: vi.fn(),
    getSponsorStudents: vi.fn(),
    exportCsv: vi.fn(),
  },
}));

import { QuizAnalyticsPanel } from '../../components/QuizAnalyticsPanel';
import { analyticsService } from '../../services/analyticsService';

const mockGetQuizAnalytics = analyticsService.getQuizAnalytics as ReturnType<typeof vi.fn>;

const makeQuizAnalytics = (overrides: Record<string, unknown> = {}) => ({
  quizId: crypto.randomUUID(),
  quizTitle: 'Blockchain Basics',
  passingScore: 70,
  courseTitle: 'BVC 101',
  courseCode: 'BVC-101',
  attempts: 25,
  passedCount: 18,
  passRate: 72.0,
  avgScore: 74.3,
  ...overrides,
});

describe('QuizAnalyticsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetQuizAnalytics.mockResolvedValue([]);
  });

  // QA-F1: Shows loading then data
  it('shows loading skeleton then data table', async () => {
    mockGetQuizAnalytics.mockResolvedValue([makeQuizAnalytics()]);
    render(<QuizAnalyticsPanel />);

    // Table headers appear after data loads
    await waitFor(() => {
      expect(screen.getByText('Blockchain Basics')).toBeInTheDocument();
    });
    expect(screen.getByText('Quiz performance')).toBeInTheDocument();
  });

  // QA-F2: Renders quiz stats table with correct values
  it('renders quiz stats with correct values', async () => {
    mockGetQuizAnalytics.mockResolvedValue([
      makeQuizAnalytics({ quizTitle: 'Test Quiz', courseCode: 'TST-101', attempts: 10, passRate: 80, avgScore: 75.5 }),
    ]);
    render(<QuizAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Test Quiz')).toBeInTheDocument();
      expect(screen.getByText('TST-101')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(screen.getByText('75.5%')).toBeInTheDocument();
    });
  });

  // QA-F3: Shows empty state
  it('shows empty state when no quizzes', async () => {
    mockGetQuizAnalytics.mockResolvedValue([]);
    render(<QuizAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('No quiz data yet')).toBeInTheDocument();
    });
  });

  // QA-F4: Shows error with retry
  it('shows error state with retry button', async () => {
    mockGetQuizAnalytics.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    render(<QuizAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Could not load quiz analytics')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();

    // Retry loads data
    mockGetQuizAnalytics.mockResolvedValue([makeQuizAnalytics({ quizTitle: 'Retry Quiz' })]);
    await user.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(screen.getByText('Retry Quiz')).toBeInTheDocument();
    });
  });

  // QA-F5: Displays zero-completion quiz correctly
  it('displays quiz with zero attempts as 0 and 0%', async () => {
    mockGetQuizAnalytics.mockResolvedValue([
      makeQuizAnalytics({ quizTitle: 'No Attempts', courseCode: null, attempts: 0, passRate: 0, avgScore: 0 }),
    ]);
    render(<QuizAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('No Attempts')).toBeInTheDocument();
    });
    // Both passRate and avgScore show 0%
    const zeroPcts = screen.getAllByText('0%');
    expect(zeroPcts.length).toBe(2);
    // Unlinked course shows dash
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
