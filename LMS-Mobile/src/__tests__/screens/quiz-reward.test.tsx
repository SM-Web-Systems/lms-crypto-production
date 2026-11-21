import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { QuizRewardNote } from '@/components/QuizRewardNote';
import { rewardClaimService } from '@/services/rewardClaimService';

jest.mock('@/services/rewardClaimService', () => ({ rewardClaimService: { received: jest.fn() } }));
const svc = rewardClaimService as jest.Mocked<typeof rewardClaimService>;
const row = (id: string, createdAt: string, amountStroops = 2000000) =>
  ({ allocationId: id, rewardType: 'custom', amountStroops, currencyCode: 'XLM', status: 'released', releasedAt: createdAt, createdAt });

beforeEach(() => jest.clearAllMocks());

describe('quiz result reward note', () => {
  it('shows the reward this pass earned and links to Rewards', async () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push, back: jest.fn() });
    svc.received.mockResolvedValue([row('new', '2026-11-21 10:00:05'), row('old', '2026-11-20 09:00:00', 5000000)]);
    render(<QuizRewardNote passed completedAt="2026-11-21 10:00:05" />);
    expect(await screen.findByText(/You earned 0\.2 XLM/)).toBeTruthy();
    fireEvent.press(screen.getByText('See my rewards'));
    expect(push).toHaveBeenCalledWith('/(student)/rewards');
  });

  it('still links to Rewards when no reward is listed yet or the lookup fails', async () => {
    svc.received.mockRejectedValue(new Error('offline'));
    render(<QuizRewardNote passed completedAt="2026-11-21 10:00:05" />);
    expect(await screen.findByText('See my rewards')).toBeTruthy();
    expect(screen.queryByText(/You earned/)).toBeNull();
  });

  it('says nothing about rewards for a failed attempt', async () => {
    render(<QuizRewardNote passed={false} completedAt="2026-11-21 10:00:05" />);
    await waitFor(() => expect(svc.received).not.toHaveBeenCalled());
    expect(screen.queryByText('See my rewards')).toBeNull();
  });
});
