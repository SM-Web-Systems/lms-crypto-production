import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import RewardsScreen, { stroopsToXlm } from '@/app/(student)/rewards';
import { rewardClaimService } from '@/services/rewardClaimService';
import { ApiRequestError } from '@/utils/apiError';

jest.mock('@/services/rewardClaimService', () => ({
  rewardClaimService: { claimable: jest.fn(), received: jest.fn(), claim: jest.fn() },
}));
const svc = rewardClaimService as jest.Mocked<typeof rewardClaimService>;
const reward = { allocationId: 'a-1', rewardType: 'custom', amountStroops: 1000000, currencyCode: 'XLM', status: 'released', releasedAt: '2026-11-13T20:33:38Z', createdAt: '2026-11-13T19:00:00Z' };

beforeEach(() => { jest.clearAllMocks(); svc.received.mockResolvedValue([reward]); svc.claimable.mockResolvedValue(1000000); });

describe('student rewards screen', () => {
  it('formats stroops as XLM', () => {
    expect(stroopsToXlm(1000000)).toBe('0.1 XLM');
    expect(stroopsToXlm(100000000)).toBe('10 XLM');
    expect(stroopsToXlm(1)).toBe('0.0000001 XLM');
  });

  it('shows the claimable amount and runs the claim', async () => {
    svc.claim.mockResolvedValue({ kind: 'verified', payout: { status: 'paid' } });
    render(<RewardsScreen />);
    expect(await screen.findByText('Ready to claim')).toBeTruthy();
    fireEvent.press(await screen.findByText('Claim to my wallet'));
    await waitFor(() => expect(svc.claim).toHaveBeenCalledWith(1000000));
    expect(await screen.findByText(/reward has been sent/)).toBeTruthy();
  });

  it('hides the claim button when nothing is claimable', async () => {
    svc.claimable.mockResolvedValue(0);
    render(<RewardsScreen />);
    await screen.findByText('Reward');
    expect(screen.queryByText('Claim to my wallet')).toBeNull();
  });

  it('keeps the rewards and says so when the claim fails', async () => {
    svc.claim.mockRejectedValue(new ApiRequestError({ message: 'The challenge expired. Start a new claim.', status: 409 }));
    render(<RewardsScreen />);
    fireEvent.press(await screen.findByText('Claim to my wallet'));
    expect(await screen.findByText('The challenge expired. Start a new claim.')).toBeTruthy();
    expect(screen.getByText('Claim to my wallet')).toBeTruthy();
  });
});
