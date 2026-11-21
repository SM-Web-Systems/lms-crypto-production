import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SponsorBillingPanel } from '../../components/SponsorBillingPanel';

const mocks = vi.hoisted(() => ({ getBilling: vi.fn() }));
vi.mock('../../services/sponsorService', () => ({ sponsorService: { getBilling: mocks.getBilling, downloadReceipt: vi.fn() } }));
vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ user: { id: 's', permissions: ['billing.view_own'] } }) }));

const base = { courseId: 'c1', courseName: 'Paid Course', amountCents: 5000, currency: 'USD', paymentMethod: 'manual', createdAt: '2026-11-21' };

beforeEach(() => vi.resetAllMocks());

describe('sponsor billing: cohort payment request status', () => {
  it('says whether each cohort request is waiting, approved or declined, with the reason', async () => {
    mocks.getBilling.mockResolvedValue({ total: 3, payments: [
      { ...base, id: 'p1', status: 'pending', cohortName: 'Spring' },
      { ...base, id: 'p2', status: 'confirmed', cohortName: 'Summer' },
      { ...base, id: 'p3', status: 'failed', cohortName: 'Autumn', declineReason: 'Purchase order missing' },
    ] });
    render(<SponsorBillingPanel />);
    expect(await screen.findByText('Waiting for administrator approval')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Declined: Purchase order missing')).toBeInTheDocument();
    expect(screen.getByText(/Spring/)).toBeInTheDocument();
  });

  it('still shows the decline reason once a newer request replaced the declined one', async () => {
    mocks.getBilling.mockResolvedValue({ total: 1, payments: [{ ...base, id: 'p5', status: 'failed', declineReason: 'Wrong count' }] });
    render(<SponsorBillingPanel />);
    expect(await screen.findByText('Declined: Wrong count')).toBeInTheDocument();
  });

  it('leaves ordinary payment statuses as they are', async () => {
    mocks.getBilling.mockResolvedValue({ total: 1, payments: [{ ...base, id: 'p4', status: 'confirmed' }] });
    render(<SponsorBillingPanel />);
    expect(await screen.findByText('confirmed')).toBeInTheDocument();
  });
});
