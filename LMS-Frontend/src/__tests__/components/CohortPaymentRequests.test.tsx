import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CohortPaymentRequests } from '../../components/CohortPaymentRequests';

const mocks = vi.hoisted(() => ({ list: vi.fn(), approve: vi.fn(), decline: vi.fn(), permissions: ['billing.confirm'] as string[] }));
vi.mock('../../services/cohortPaymentService', () => ({ cohortPaymentService: { list: mocks.list, approve: mocks.approve, decline: mocks.decline } }));
vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin', permissions: mocks.permissions } }) }));

const request = {
  paymentId: 'p-1', cohortId: 'c-1', cohortName: 'Spring Cohort', courseName: 'Paid Course', sponsorUserId: 's-1',
  sponsorName: 'Sam Sponsor', sponsorEmail: 'sam@example.com', amountCents: 5000, currency: 'USD', learnerCount: 2,
  status: 'pending', paymentStatus: 'pending', declineReason: null, decidedByName: null, decidedAt: null, createdAt: '2026-11-21 10:00:00',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.permissions = ['billing.confirm'];
});

describe('admin: cohort payment requests', () => {
  it('shows nothing without billing.confirm', () => {
    mocks.permissions = [];
    const { container } = render(<CohortPaymentRequests />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('lists pending requests with sponsor, cohort, amount and learner count', async () => {
    mocks.list.mockResolvedValue([request]);
    render(<CohortPaymentRequests />);
    expect(await screen.findByText('Spring Cohort')).toBeInTheDocument();
    expect(screen.getByText(/Sam Sponsor/)).toBeInTheDocument();
    expect(screen.getByText(/\$50\.00/)).toBeInTheDocument();
    expect(screen.getByText(/2 learners/)).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith('pending');
  });

  it('approves through the confirm dialog naming the sponsor, amount and learner count', async () => {
    mocks.list.mockResolvedValueOnce([request]).mockResolvedValueOnce([]);
    mocks.approve.mockResolvedValue({ ...request, status: 'approved', learnersSettled: 2 });
    render(<CohortPaymentRequests />);
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Sam Sponsor');
    expect(dialog).toHaveTextContent('$50.00');
    expect(dialog).toHaveTextContent('2 learners');
    expect(mocks.approve).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve $50.00 for 2 learners' }));
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith('p-1'));
    expect(await screen.findByRole('status')).toHaveTextContent('Approved Spring Cohort. Sam Sponsor has been told');
  });

  it('declines with a reason, and refuses an empty one', async () => {
    mocks.list.mockResolvedValueOnce([request]).mockResolvedValueOnce([]);
    mocks.decline.mockResolvedValue({ ...request, status: 'declined' });
    render(<CohortPaymentRequests />);
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Sam Sponsor');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Decline request' }));
    expect(await within(dialog).findByText(/Give a reason/)).toBeInTheDocument();
    expect(mocks.decline).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Purchase order missing');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Decline request' }));
    await waitFor(() => expect(mocks.decline).toHaveBeenCalledWith('p-1', 'Purchase order missing'));
  });
});
