/**
 * Tests for Phase 18 C1 — StudentPayments page component.
 *
 * PAY-FE-1 — Renders payment list with course name, amount, status badge
 * PAY-FE-2 — Shows receipt download link for confirmed payments
 * PAY-FE-3 — Shows empty state when no payments
 * PAY-FE-4 — Shows error state with retry button
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/courseCompletionService', () => ({
  courseCompletionService: {
    getMyPayments: vi.fn(),
    createPaystackCheckout: vi.fn(),
    createStellarCheckout: vi.fn(),
    getPaymentStatus: vi.fn(),
    getPricing: vi.fn(),
    getCourseProgress: vi.fn(),
    getStudentProgress: vi.fn(),
    getAllProgress: vi.fn(),
    getMyProgress: vi.fn(),
    getMyCredentials: vi.fn(),
    markLessonComplete: vi.fn(),
    getLessonCompletions: vi.fn(),
    updateProgress: vi.fn(),
    applyForCertificate: vi.fn(),
    getCourseApplications: vi.fn(),
    recommendApplication: vi.fn(),
    getRequirements: vi.fn(),
    saveRequirements: vi.fn(),
    getTiers: vi.fn(),
    getBadge: vi.fn(),
  },
}));

import StudentPayments from '../../pages/StudentPayments';
import { courseCompletionService } from '../../services/courseCompletionService';

const mockGetMyPayments = courseCompletionService.getMyPayments as ReturnType<typeof vi.fn>;

const MOCK_PAYMENTS = [
  {
    paymentId: 'pay-1',
    courseId: 'course-1',
    courseName: 'Blockchain Fundamentals',
    amountCents: 2500,
    currency: 'USD',
    paymentMethod: 'paystack',
    status: 'confirmed',
    createdAt: '2026-08-01T12:00:00.000Z',
    confirmedAt: '2026-08-01T12:05:00.000Z',
  },
  {
    paymentId: 'pay-2',
    courseId: 'course-2',
    courseName: 'Smart Contract Development',
    amountCents: 5000,
    currency: 'USD',
    paymentMethod: 'stellar_xlm',
    status: 'pending',
    createdAt: '2026-08-02T10:00:00.000Z',
    confirmedAt: null,
  },
];

describe('StudentPayments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // PAY-FE-1: Renders payment list
  it('PAY-FE-1 — renders payment list with course name, amount, and status badge', async () => {
    mockGetMyPayments.mockResolvedValueOnce(MOCK_PAYMENTS);

    render(<StudentPayments />);

    await waitFor(() => {
      expect(screen.getByText('Blockchain Fundamentals')).toBeInTheDocument();
    });

    expect(screen.getByText('Smart Contract Development')).toBeInTheDocument();
    expect(screen.getByText('$25.00 USD')).toBeInTheDocument();
    expect(screen.getByText('$50.00 USD')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Paystack')).toBeInTheDocument();
    expect(screen.getByText('Stellar XLM')).toBeInTheDocument();
  });

  // PAY-FE-2: Receipt link for confirmed payments
  it('PAY-FE-2 — shows receipt download link for confirmed payments only', async () => {
    mockGetMyPayments.mockResolvedValueOnce(MOCK_PAYMENTS);

    render(<StudentPayments />);

    await waitFor(() => {
      expect(screen.getByText('Blockchain Fundamentals')).toBeInTheDocument();
    });

    const receiptLinks = screen.getAllByRole('link', { name: /receipt/i });
    expect(receiptLinks).toHaveLength(1);
    expect(receiptLinks[0]).toHaveAttribute('href', expect.stringContaining('/payments/pay-1/receipt'));
    expect(receiptLinks[0]).toHaveAttribute('target', '_blank');
  });

  // PAY-FE-3: Empty state
  it('PAY-FE-3 — shows empty state when no payments', async () => {
    mockGetMyPayments.mockResolvedValueOnce([]);

    render(<StudentPayments />);

    await waitFor(() => {
      expect(screen.getByText('No payments yet')).toBeInTheDocument();
    });

    expect(screen.getByText('Payments for certificate applications will appear here')).toBeInTheDocument();
  });

  // PAY-FE-4: Error state with retry
  it('PAY-FE-4 — shows error state with retry button', async () => {
    mockGetMyPayments.mockRejectedValueOnce(new Error('Network error'));

    render(<StudentPayments />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();

    // Click retry and verify it calls getMyPayments again
    mockGetMyPayments.mockResolvedValueOnce(MOCK_PAYMENTS);
    await userEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Blockchain Fundamentals')).toBeInTheDocument();
    });
  });
});
