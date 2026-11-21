import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminRewards from '../../pages/AdminRewards';

const mocks = vi.hoisted(() => ({
  list: vi.fn(), options: vi.fn(), prepare: vi.fn(), fund: vi.fn(), decline: vi.fn(), stuck: vi.fn(), attempts: vi.fn(), retry: vi.fn(),
  permissions: ['reward.manage', 'reward.fund', 'reward.refund_review'] as string[],
}));
vi.mock('../../services/rewardService', () => ({ rewardService: {
  listAwaitingFunding: mocks.list, getFundingOptions: mocks.options, createFundingIntent: mocks.prepare, fundReward: mocks.fund,
  declineReward: mocks.decline, listStuckPayouts: mocks.stuck, listRefundAttempts: mocks.attempts, retryRefundAttempt: mocks.retry,
} }));
vi.mock('../../hooks/useXlmUsdcPrice', () => ({ useXlmUsdcPrice: () => null }));
vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin', permissions: mocks.permissions } }) }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.permissions = ['reward.manage', 'reward.fund', 'reward.refund_review'];
  mocks.stuck.mockResolvedValue([]);
  mocks.attempts.mockResolvedValue([]);
});

const reward = { id: 'r-1', description: 'Well Done (mainnet claim test, Learner A)', rewardType: 'custom', amountStroops: 1, maxRecipients: null,
  scopeType: 'teacher_class', scopeName: 'iPhone invitation test', creatorName: 'Tester', createdAt: '2026-11-16' };

describe('admin: rewards to authorize', () => {
  it('lists draft rewards by someone else, in full precision, and opens the funding dialog named for the chosen one', async () => {
    mocks.list.mockResolvedValue([reward]);
    mocks.options.mockResolvedValue([{ sourceType: 'admin_grant', available: true, reason: null }]);
    render(<AdminRewards />);
    expect(await screen.findByText('Well Done (mainnet claim test, Learner A)')).toBeInTheDocument();
    expect(screen.getByText(/0\.0000001 XLM/)).toBeInTheDocument();
    expect(screen.getByText(/iPhone invitation test/)).toBeInTheDocument();
    expect(screen.getByText(/created by Tester/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Funding options' }));
    await waitFor(() => expect(mocks.options).toHaveBeenCalledWith('teacher', 'r-1'));
    expect(await screen.findByRole('dialog', { name: 'Fund “Well Done (mainnet claim test, Learner A)”' })).toBeInTheDocument();
  });

  it('after funding says the creator must now press Activate', async () => {
    mocks.list.mockResolvedValue([reward]);
    mocks.options.mockResolvedValue([{ sourceType: 'admin_grant', available: true, reason: null }]);
    mocks.prepare.mockResolvedValue({ id: 'intent', amount_stroops: 1, network: 'testnet' });
    mocks.fund.mockResolvedValue({ status: 'funded' });
    render(<AdminRewards />);
    await userEvent.click(await screen.findByRole('button', { name: 'Funding options' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Prepare grant' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Authorize grant' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Funded “Well Done (mainnet claim test, Learner A)”. Tester has been told to press Activate');
  });

  it('sends a reward back with a reason through the confirm dialog, and refuses an empty reason', async () => {
    mocks.list.mockResolvedValueOnce([reward]).mockResolvedValueOnce([]);
    mocks.decline.mockResolvedValue({});
    render(<AdminRewards />);
    await userEvent.click(await screen.findByRole('button', { name: 'Send back' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Well Done (mainnet claim test, Learner A)');
    expect(dialog).toHaveTextContent('Tester');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send back reward' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Give a reason');
    expect(mocks.decline).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Amount is too high');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send back reward' }));
    await waitFor(() => expect(mocks.decline).toHaveBeenCalledWith('r-1', 'Amount is too high'));
    expect(await screen.findByRole('status')).toHaveTextContent('Sent back to Tester');
    expect(await screen.findByText('Nothing is waiting for authorization.')).toBeInTheDocument();
  });

  it('says so when nothing is waiting, and shows a load error', async () => {
    mocks.list.mockResolvedValueOnce([]);
    const { unmount } = render(<AdminRewards />);
    expect(await screen.findByText('Nothing is waiting for authorization.')).toBeInTheDocument();
    unmount();
    mocks.list.mockRejectedValueOnce(new Error('boom'));
    render(<AdminRewards />);
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });
});

describe('admin: payout problems (UX-019)', () => {
  it('lists stuck learner payouts and blocked refunds, and retries a refund after confirming', async () => {
    mocks.list.mockResolvedValue([]);
    mocks.stuck.mockResolvedValue([{ claimId: 'c1', learnerName: 'Learner B', amountStroops: 2000000, verifiedAt: 1, network: 'public',
      payoutStatus: 'failed', error: 'tx_bad_seq', txHash: 'abc', attempts: 2, updatedAt: 1 }]);
    mocks.attempts.mockResolvedValue([{ id: 'att1', reward_id: 'r9', reward_description: 'Course bonus', learner_name: 'Learner C',
      attempted_amount_stroops: 3000001, currency_code: 'XLM', status: 'blocked', created_at: '2026-11-20 10:00:00' }]);
    mocks.retry.mockResolvedValue({});
    render(<AdminRewards />);
    const section = await screen.findByRole('region', { name: 'Payout problems' });
    expect(await within(section).findByText(/Learner B/)).toBeInTheDocument();
    expect(within(section).getByText(/0\.2 XLM/)).toBeInTheDocument();
    expect(within(section).getByText(/tx_bad_seq/)).toBeInTheDocument();
    expect(within(section).getByText(/Public network/)).toBeInTheDocument();
    expect(within(section).getByText(/Course bonus/)).toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'Retry refund' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('0.3000001 XLM');
    expect(dialog).toHaveTextContent('Learner C');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retry refund of 0.3000001 XLM' }));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith('att1', expect.any(String)));
  });

  it('one failing list does not hide the other', async () => {
    mocks.list.mockResolvedValue([]);
    mocks.stuck.mockRejectedValue(new Error('payouts down'));
    mocks.attempts.mockResolvedValue([]);
    render(<AdminRewards />);
    const section = await screen.findByRole('region', { name: 'Payout problems' });
    expect(await within(section).findByText('payouts down')).toBeInTheDocument();
    expect(within(section).getByText('None.')).toBeInTheDocument();
  });

  it('is hidden from an administrator without refund review', async () => {
    mocks.permissions = ['reward.manage'];
    mocks.list.mockResolvedValue([]);
    render(<AdminRewards />);
    await screen.findByText('Nothing is waiting for authorization.');
    expect(screen.queryByRole('region', { name: 'Payout problems' })).toBeNull();
    expect(mocks.stuck).not.toHaveBeenCalled();
  });
});
