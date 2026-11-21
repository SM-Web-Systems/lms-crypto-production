import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { QuizRewardNote } from '@/components/QuizRewardNote';
import { rewardClaimService } from '@/services/rewardClaimService';

jest.mock('@/services/rewardClaimService', () => ({ rewardClaimService: { received: jest.fn() } }));
const svc = rewardClaimService as jest.Mocked<typeof rewardClaimService>;
// The real shapes: completedAt is ISO (the quiz route's toISO); allocation times are raw SQLite text, and an
// allocation is created when the reward is activated, often days before the pass that releases it.
const row = (id: string, releasedAt: string | null, amountStroops = 2000000, status = 'released') =>
  ({ allocationId: id, rewardType: 'custom', amountStroops, currencyCode: 'XLM', status, releasedAt, createdAt: '2026-11-01 08:00:00' });
const passedAt = '2026-11-21T10:00:05.000Z';

beforeEach(() => jest.clearAllMocks());

describe('quiz result reward note', () => {
  it('says a reward may need approval when none was released by the pass', async () => {
    svc.received.mockResolvedValue([row('yesterday', '2026-11-20 09:00:00')]);
    render(<QuizRewardNote passed completedAt={passedAt} />);
    expect(await screen.findByText(/need your instructor's approval/)).toBeTruthy();
    expect(screen.queryByText(/You earned/)).toBeNull();
  });

  it('shows the reward this pass earned and links to Rewards', async () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push, back: jest.fn() });
    svc.received.mockResolvedValue([
      row('this-pass', '2026-11-21 10:00:05'), row('same-second-pass', '2026-11-21 10:00:04', 1000000),
      row('yesterday', '2026-11-20 09:00:00', 5000000), row('refund', '2026-11-21 10:00:05', 7000000, 'refunded'), row('unreleased', null),
    ]);
    render(<QuizRewardNote passed completedAt={passedAt} />);
    expect(await screen.findByText(/You earned 0\.3 XLM/)).toBeTruthy();
    fireEvent.press(screen.getByText('See my rewards'));
    expect(push).toHaveBeenCalledWith('/(student)/rewards');
  });

  it('still links to Rewards when no reward is listed yet or the lookup fails', async () => {
    svc.received.mockRejectedValue(new Error('offline'));
    render(<QuizRewardNote passed completedAt={passedAt} />);
    expect(await screen.findByText('See my rewards')).toBeTruthy();
    expect(screen.queryByText(/You earned/)).toBeNull();
  });

  it('says nothing about rewards for a failed attempt', async () => {
    render(<QuizRewardNote passed={false} completedAt={passedAt} />);
    await waitFor(() => expect(svc.received).not.toHaveBeenCalled());
    expect(screen.queryByText('See my rewards')).toBeNull();
  });
});
