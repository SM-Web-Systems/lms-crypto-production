import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QuizRewardNote } from '../components/QuizRewardNote';

const mocks = vi.hoisted(() => ({ rewards: vi.fn() }));
vi.mock('../services/rewardService', () => ({ rewardService: { getMyRewards: mocks.rewards } }));
vi.mock('../hooks/useXlmUsdcPrice', () => ({ useXlmUsdcPrice: () => null }));

const at = '2026-11-22T07:00:00.000Z';
const row = (over: Record<string, unknown>) => ({ allocationId: 'a', rewardType: 'quiz_pass', amountStroops: 1_000_000, currencyCode: 'XLM', status: 'released', releasedAt: '2026-11-22 07:00:02', createdAt: '2026-11-01 00:00:00', ...over });
const show = (passed = true) => render(<MemoryRouter><QuizRewardNote passed={passed} completedAt={at} /></MemoryRouter>);

beforeEach(() => vi.clearAllMocks());

describe('UX-012 — web quiz result shows the reward', () => {
  it('names the amount released with this pass and links to Rewards', async () => {
    mocks.rewards.mockResolvedValue([row({}), row({ allocationId: 'old', releasedAt: '2026-11-20 10:00:00' })]);
    show();
    expect(await screen.findByRole('status')).toHaveTextContent('You earned 0.1 XLM');
    expect(screen.getByRole('link', { name: 'See my rewards' })).toHaveAttribute('href', '/student/rewards');
  });
  it('explains approval when nothing was released with this pass', async () => {
    mocks.rewards.mockResolvedValue([row({ status: 'pending_approval', releasedAt: null })]);
    show();
    expect(await screen.findByText(/need your instructor's approval/)).toBeInTheDocument();
  });
  it('still links to Rewards if the rewards list fails to load', async () => {
    mocks.rewards.mockRejectedValue(new Error('down'));
    show();
    await waitFor(() => expect(mocks.rewards).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'See my rewards' })).toBeInTheDocument();
  });
  it('shows nothing for a quiz that was not passed', () => {
    show(false);
    expect(screen.queryByRole('link', { name: 'See my rewards' })).not.toBeInTheDocument();
    expect(mocks.rewards).not.toHaveBeenCalled();
  });
});
