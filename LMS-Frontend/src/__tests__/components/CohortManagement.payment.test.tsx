/**
 * UX-001 AC6 — sponsor Create Payment shows the quoted amount in the cohort's
 * currency and asks before creating the payment.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/cohortService', () => ({
  cohortService: {
    listCohorts: vi.fn(), getCohort: vi.fn(), getStatusLog: vi.fn(),
    bulkPay: vi.fn(), quoteBulkPay: vi.fn(),
  },
}));

import { CohortManagement } from '../../components/CohortManagement';
import { cohortService } from '../../services/cohortService';

const svc = vi.mocked(cohortService);
const cohort = {
  cohortId: 'coh2', name: 'Paid Cohort', courseId: 'c1', courseName: 'Test Course', selectedTier: 'paid' as const,
  status: 'active' as const, memberCount: 2, appliedCount: 2, paymentStatus: null, createdAt: '2026-08-05T00:00:00Z',
};

async function openPaidCohort() {
  render(<CohortManagement courses={[{ id: 'c1', title: 'Test Course', tiersEnabled: 'both' }]} />);
  await userEvent.click(await screen.findByText('Paid Cohort'));
  return screen.findByRole('button', { name: /Create Payment/ });
}

beforeEach(() => {
  vi.resetAllMocks();
  svc.listCohorts.mockResolvedValue([cohort] as never);
  svc.getStatusLog.mockResolvedValue([]);
  svc.getCohort.mockResolvedValue({ cohort, members: [], completionStats: { totalMembers: 2, completedCount: 0, certifiedCount: 0, avgLessonProgress: 0 } } as never);
  svc.quoteBulkPay.mockResolvedValue({ amountCents: 5000, currency: 'EUR', memberCount: 2 });
  svc.bulkPay.mockResolvedValue({ paymentId: 'p1', amountCents: 5000, currency: 'EUR', memberCount: 2, status: 'pending' });
});

describe('Create Payment (UX-001)', () => {
  it('shows the quote in the cohort currency and creates nothing until confirmed', async () => {
    await userEvent.click(await openPaidCohort());
    const dialog = await screen.findByRole('alertdialog');
    expect(svc.quoteBulkPay).toHaveBeenCalledWith('coh2');
    expect(dialog).toHaveTextContent('50.00 EUR');
    expect(dialog).toHaveTextContent('2 learners');
    expect(dialog).not.toHaveTextContent('$');
    expect(svc.bulkPay).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create payment of 50.00 EUR' }));
    await waitFor(() => expect(svc.bulkPay).toHaveBeenCalledTimes(1));
    const result = await screen.findByText(/Payment created/);
    expect(result).toHaveTextContent('50.00 EUR (pending)');
    expect(result.textContent).not.toContain('$');
    // The payment is a request an administrator approves; say so, and where to follow it.
    expect(screen.getByText(/An administrator reviews the request/)).toBeInTheDocument();
    expect(screen.getByText(/Billing/)).toBeInTheDocument();
  });

  it('cancelling the dialog creates nothing', async () => {
    await userEvent.click(await openPaidCohort());
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(svc.bulkPay).not.toHaveBeenCalled();
  });

  it('a quote that fails is shown and opens no dialog', async () => {
    svc.quoteBulkPay.mockRejectedValue(new Error('No applied members to pay for'));
    await userEvent.click(await openPaidCohort());
    expect(await screen.findByText('No applied members to pay for')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(svc.bulkPay).not.toHaveBeenCalled();
  });
});
