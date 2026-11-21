/**
 * Tests for Phase 18 C1 — StudentPayments page component.
 *
 * PAY-FE-1 — Renders payment list with course name, amount, status badge
 * PAY-FE-2 — Shows a receipt download button for confirmed payments
 * PAY-FE-5 — Receipt download: Downloading… state, inline errors with Retry, 401 left to the session handler
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

vi.mock('../../services/download', () => ({ downloadWithSession: vi.fn() }));

import StudentPayments from '../../pages/StudentPayments';
import { courseCompletionService } from '../../services/courseCompletionService';
import { downloadWithSession } from '../../services/download';
import { ApiRequestError } from '../../utils/apiError';

const mockDownload = downloadWithSession as ReturnType<typeof vi.fn>;

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

  // PAY-FE-2: Receipt button for confirmed payments
  it('PAY-FE-2 — shows a receipt download button for confirmed payments only', async () => {
    mockGetMyPayments.mockResolvedValueOnce(MOCK_PAYMENTS);

    render(<StudentPayments />);

    const buttons = await screen.findAllByRole('button', { name: /receipt/i });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Download receipt for Blockchain Fundamentals');
    expect(screen.queryByRole('link', { name: /receipt/i })).toBeNull();
  });

  it('PAY-FE-5a — downloads the receipt once through the session and shows Downloading… meanwhile', async () => {
    mockGetMyPayments.mockResolvedValueOnce(MOCK_PAYMENTS);
    let finish!: () => void;
    mockDownload.mockReturnValueOnce(new Promise<void>(done => { finish = done; }));
    render(<StudentPayments />);

    await userEvent.click(await screen.findByRole('button', { name: /download receipt/i }));

    expect(mockDownload).toHaveBeenCalledOnce();
    expect(mockDownload).toHaveBeenCalledWith('/payments/pay-1/receipt', 'receipt-pay-1.pdf');
    expect(screen.getByRole('button', { name: /download receipt/i })).toBeDisabled();
    expect(screen.getByText('Downloading…')).toBeInTheDocument();

    finish();
    await waitFor(() => expect(screen.queryByText('Downloading…')).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    [400, 'Receipt not ready yet'],
    [403, 'Not your receipt'],
    [404, 'Receipt not found'],
    [500, 'Could not download the receipt. Try again.'],
  ])('PAY-FE-5b — a %i shows "%s" inline with Retry', async (status, message) => {
    mockGetMyPayments.mockResolvedValueOnce(MOCK_PAYMENTS);
    mockDownload.mockRejectedValueOnce(new ApiRequestError({ message: 'server text', status }));
    render(<StudentPayments />);

    await userEvent.click(await screen.findByRole('button', { name: /download receipt/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    mockDownload.mockResolvedValueOnce(undefined);
    await userEvent.click(screen.getByRole('button', { name: /retry download/i }));
    expect(mockDownload).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('PAY-FE-5c — a 401 is left to the global session handler (no inline error)', async () => {
    mockGetMyPayments.mockResolvedValueOnce(MOCK_PAYMENTS);
    mockDownload.mockRejectedValueOnce(new ApiRequestError({ message: 'Please sign in again to continue.', status: 401 }));
    render(<StudentPayments />);

    await userEvent.click(await screen.findByRole('button', { name: /download receipt/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /download receipt/i })).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
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
