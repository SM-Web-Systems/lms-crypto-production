/**
 * UX-001 AC3 AC4 AC7 — every reward money action asks first, with amount and name;
 * a double click on confirm sends one request; a failure stays in the dialog.
 */
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/rewardService', () => ({
  rewardService: {
    listRewards: vi.fn(), getAllocations: vi.fn(),
    activateReward: vi.fn(), cancelReward: vi.fn(), approveReward: vi.fn(),
    releaseAllocation: vi.fn(), refundAllocation: vi.fn(),
  },
}));

import { useAuth } from '../../context/useAuth';
import { rewardService } from '../../services/rewardService';
import { RewardDashboard } from '../../components/RewardDashboard';

const svc = vi.mocked(rewardService);

function reward(status: string) {
  return {
    id: 'r1', creator_user_id: 'u1', scope_type: 'sponsor_cohort', scope_id: 's1', reward_type: 'custom',
    amount_stroops: 2_000_000, max_recipients: null, currency_code: 'XLM', description: null, auto_release: 0,
    status, expires_at: null, funded_at: null, activated_at: null, released_at: null, cancelled_at: null,
    created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
  };
}
function allocation(status: string) {
  return {
    id: 'a1', reward_id: 'r1', student_user_id: 'aaaaaaaa-1111-2222-3333-444444444444', student_name: 'Learner B',
    amount_stroops: 2_000_001, currency_code: 'XLM', status, eligible_at: null, released_at: null,
    cancelled_at: null, refunded_at: null, created_at: '2026-11-01T00:00:00Z',
  };
}

function renderWith(status: string, alloc?: string) {
  svc.listRewards.mockResolvedValue([reward(status)] as never);
  svc.getAllocations.mockResolvedValue(alloc ? [allocation(alloc)] as never : []);
  return render(<MemoryRouter><RewardDashboard role="sponsor" scopeId="s1" scopeLabel="Alpha Cohort" canRefund /></MemoryRouter>);
}

async function openAllocations() {
  await userEvent.click(await screen.findByRole('button', { name: 'Expand allocations' }));
  await screen.findByText('Learner B');
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 'u1', permissions: ['reward.view_assigned', 'reward.activate', 'reward.cancel', 'reward.approve', 'reward.release', 'reward.refund'] },
    isAuthenticated: true, isLoading: false, logout: vi.fn(),
  } as never);
  for (const f of [svc.activateReward, svc.cancelReward, svc.approveReward, svc.releaseAllocation, svc.refundAllocation]) f.mockResolvedValue({} as never);
});

describe('RewardDashboard asks before money moves (UX-001)', () => {
  it('rows show the learner name, not a sliced id', async () => {
    renderWith('active', 'eligible');
    await openAllocations();
    expect(screen.queryByText(/aaaaaaaa/)).toBeNull();
  });

  it('Release states full-precision amount, learner name and that it cannot be undone; danger confirm', async () => {
    renderWith('active', 'eligible');
    await openAllocations();
    await userEvent.click(screen.getByRole('button', { name: 'Release' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Send 0.2000001 XLM to Learner B. This cannot be undone.');
    const confirm = within(dialog).getByRole('button', { name: 'Release 0.2000001 XLM' });
    expect(confirm.className).toMatch(/bg-red-600/);
    expect(svc.releaseAllocation).not.toHaveBeenCalled();
    await userEvent.click(confirm);
    await waitFor(() => expect(svc.releaseAllocation).toHaveBeenCalledWith('sponsor', 'r1', 'a1', expect.any(String)));
  });

  it('Refund says it takes money back and cannot be undone', async () => {
    renderWith('released', 'released');
    await openAllocations();
    await userEvent.click(screen.getByRole('button', { name: 'Refund' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Take back 0.2000001 XLM from this reward. This cannot be undone.');
    expect(svc.refundAllocation).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Refund 0.2000001 XLM' }));
    await waitFor(() => expect(svc.refundAllocation).toHaveBeenCalledTimes(1));
  });

  it('Activate uses the primary style and says what happens next', async () => {
    renderWith('funded');
    await userEvent.click(await screen.findByRole('button', { name: 'Activate' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Make this reward live. Learners can start earning it.');
    const confirm = within(dialog).getByRole('button', { name: 'Activate 0.2000000 XLM reward' });
    expect(confirm.className).toMatch(/bg-accent-teal/);
    expect(svc.activateReward).not.toHaveBeenCalled();
    await userEvent.click(confirm);
    await waitFor(() => expect(svc.activateReward).toHaveBeenCalledWith('sponsor', 'r1', expect.any(String)));
  });

  it('Cancel says unearned funds are returned, and keeping it sends nothing', async () => {
    renderWith('active');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Stop this reward. Funds not yet earned are returned.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep reward' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(svc.cancelReward).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel reward' }));
    await waitFor(() => expect(svc.cancelReward).toHaveBeenCalledWith('sponsor', 'r1', '', expect.any(String)));
  });

  it('Approve names whose reward it is and uses the primary style', async () => {
    renderWith('eligible_pending_approval');
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent("Approve Alpha Cohort's reward for payment.");
    const confirm = within(dialog).getByRole('button', { name: 'Approve 0.2000000 XLM' });
    expect(confirm.className).toMatch(/bg-accent-teal/);
    await userEvent.click(confirm);
    await waitFor(() => expect(svc.approveReward).toHaveBeenCalledTimes(1));
  });

  it('a capability revoked while the dialog is open sends nothing and says so', async () => {
    const { rerender } = renderWith('funded');
    await userEvent.click(await screen.findByRole('button', { name: 'Activate' }));
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', { name: /^Activate/ });
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', permissions: ['reward.view_assigned'] }, isAuthenticated: true, isLoading: false, logout: vi.fn() } as never);
    rerender(<MemoryRouter><RewardDashboard role="sponsor" scopeId="s1" scopeLabel="Alpha Cohort" canRefund /></MemoryRouter>);
    await userEvent.click(confirm);
    // Nothing is sent, and the dialog says so instead of closing as if it worked.
    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent('no longer have permission');
    expect(svc.activateReward).not.toHaveBeenCalled();
  });

  it('a double click on confirm sends one request, and a failure stays in the dialog', async () => {
    let reject!: (e: unknown) => void;
    svc.releaseAllocation.mockReturnValue(new Promise((_, r) => { reject = r; }) as never);
    renderWith('active', 'eligible');
    await openAllocations();
    await userEvent.click(screen.getByRole('button', { name: 'Release' }));
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Release 0.2000001 XLM' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(svc.releaseAllocation).toHaveBeenCalledTimes(1);
    expect(await within(screen.getByRole('alertdialog')).findByRole('button', { name: /Working…/ })).toBeDisabled();
    reject(new Error('Network down'));
    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent('Network down');
  });
});
