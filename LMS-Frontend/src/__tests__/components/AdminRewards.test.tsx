import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminRewards from '../../pages/AdminRewards';

const mocks = vi.hoisted(() => ({ list: vi.fn(), options: vi.fn() }));
vi.mock('../../services/rewardService', () => ({ rewardService: {
  listAwaitingFunding: mocks.list, getFundingOptions: mocks.options, createFundingIntent: vi.fn(), fundReward: vi.fn(),
} }));
beforeEach(() => vi.resetAllMocks());

const reward = { id: 'r-1', description: 'Well Done (mainnet claim test, Learner A)', rewardType: 'custom', amountStroops: 1000000, maxRecipients: null,
  scopeType: 'teacher_class', scopeName: 'iPhone invitation test', creatorName: 'Tester', createdAt: '2026-11-16' };

describe('admin: rewards to authorize', () => {
  it('lists draft rewards by someone else and opens the funding dialog for the chosen one', async () => {
    mocks.list.mockResolvedValue([reward]);
    mocks.options.mockResolvedValue([{ sourceType: 'admin_grant', available: true, reason: null }]);
    render(<AdminRewards />);
    expect(await screen.findByText('Well Done (mainnet claim test, Learner A)')).toBeInTheDocument();
    expect(screen.getByText(/iPhone invitation test/)).toBeInTheDocument();
    expect(screen.getByText(/created by Tester/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Funding options' }));
    await waitFor(() => expect(mocks.options).toHaveBeenCalledWith('teacher', 'r-1'));
    expect(await screen.findByRole('dialog', { name: 'Reward funding' })).toBeInTheDocument();
  });

  it('says so when nothing is waiting, and shows a load error', async () => {
    mocks.list.mockResolvedValueOnce([]);
    const { unmount } = render(<AdminRewards />);
    expect(await screen.findByText('Nothing is waiting for authorization.')).toBeInTheDocument();
    unmount();
    mocks.list.mockRejectedValueOnce(new Error('boom'));
    render(<AdminRewards />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
