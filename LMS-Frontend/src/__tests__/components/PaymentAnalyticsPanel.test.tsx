/**
 * Tests for Phase 19 C1 — PaymentAnalyticsPanel component.
 *
 * ANA-FE-1 — Summary cards render with totals
 * ANA-FE-2 — Revenue by course table renders
 * ANA-FE-3 — Revenue by method table renders
 * ANA-FE-4 — Revenue by month table renders
 * ANA-FE-5 — Empty state when no payments
 * ANA-FE-6 — Error state with retry button
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/analyticsService', () => ({
  analyticsService: {
    getPaymentAnalytics: vi.fn(),
    getQuizAnalytics: vi.fn(),
    getDashboard: vi.fn(),
    getCourseAnalytics: vi.fn(),
    getSponsorStudents: vi.fn(),
    exportCsv: vi.fn(),
  },
}));

import { PaymentAnalyticsPanel } from '../../components/PaymentAnalyticsPanel';
import { analyticsService } from '../../services/analyticsService';

const mockGetPaymentAnalytics = analyticsService.getPaymentAnalytics as ReturnType<typeof vi.fn>;

const MOCK_DATA = {
  summary: {
    totalRevenueCents: 12500,
    totalPayments: 5,
    confirmedPayments: 3,
    pendingPayments: 1,
    failedPayments: 0,
    waivedPayments: 1,
    refundedPayments: 0,
  },
  byCourse: [
    { courseId: 'c1', courseName: 'Blockchain Fundamentals', revenueCents: 7500, paymentCount: 3 },
    { courseId: 'c2', courseName: 'Smart Contracts', revenueCents: 5000, paymentCount: 2 },
  ],
  byMethod: [
    { method: 'paystack', revenueCents: 7500, count: 3 },
    { method: 'stellar_xlm', revenueCents: 5000, count: 2 },
  ],
  byMonth: [
    { month: '2026-08', revenueCents: 7500, count: 3 },
    { month: '2026-07', revenueCents: 5000, count: 2 },
  ],
};

const EMPTY_DATA = {
  summary: {
    totalRevenueCents: 0,
    totalPayments: 0,
    confirmedPayments: 0,
    pendingPayments: 0,
    failedPayments: 0,
    waivedPayments: 0,
    refundedPayments: 0,
  },
  byCourse: [],
  byMethod: [],
  byMonth: [],
};

describe('PaymentAnalyticsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ANA-FE-1: Summary cards
  it('ANA-FE-1 — renders summary cards with total revenue and counts', async () => {
    mockGetPaymentAnalytics.mockResolvedValueOnce(MOCK_DATA);
    render(<PaymentAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('$125.00')).toBeInTheDocument();
    });
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Waived')).toBeInTheDocument();
  });

  // ANA-FE-2: Revenue by course table
  it('ANA-FE-2 — renders revenue by course table', async () => {
    mockGetPaymentAnalytics.mockResolvedValueOnce(MOCK_DATA);
    render(<PaymentAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Blockchain Fundamentals')).toBeInTheDocument();
    });
    expect(screen.getByText('Smart Contracts')).toBeInTheDocument();
    expect(screen.getByText('Revenue by course')).toBeInTheDocument();
    // $75.00 and $50.00 appear in multiple tables, so just verify they exist
    expect(screen.getAllByText('$75.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('$50.00').length).toBeGreaterThanOrEqual(1);
  });

  // ANA-FE-3: Revenue by method table
  it('ANA-FE-3 — renders revenue by method table', async () => {
    mockGetPaymentAnalytics.mockResolvedValueOnce(MOCK_DATA);
    render(<PaymentAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Paystack')).toBeInTheDocument();
    });
    expect(screen.getByText('Stellar XLM')).toBeInTheDocument();
  });

  // ANA-FE-4: Revenue by month table
  it('ANA-FE-4 — renders revenue by month table', async () => {
    mockGetPaymentAnalytics.mockResolvedValueOnce(MOCK_DATA);
    render(<PaymentAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Aug 2026')).toBeInTheDocument();
    });
    expect(screen.getByText('Jul 2026')).toBeInTheDocument();
  });

  // ANA-FE-5: Empty state
  it('ANA-FE-5 — shows empty state when no payments', async () => {
    mockGetPaymentAnalytics.mockResolvedValueOnce(EMPTY_DATA);
    render(<PaymentAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('No payment data yet')).toBeInTheDocument();
    });
  });

  // ANA-FE-6: Error state with retry
  it('ANA-FE-6 — shows error state with retry button', async () => {
    mockGetPaymentAnalytics.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    render(<PaymentAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Could not load payment analytics')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();

    mockGetPaymentAnalytics.mockResolvedValueOnce(MOCK_DATA);
    await user.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(screen.getByText('Blockchain Fundamentals')).toBeInTheDocument();
    });
  });
});
