import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import RewardsScreen, { stroopsToXlm } from '@/app/(student)/rewards';
import { rewardClaimService } from '@/services/rewardClaimService';
import { ApiRequestError } from '@/utils/apiError';

jest.mock('@/services/rewardClaimService', () => ({
  rewardClaimService: { claimable: jest.fn(), received: jest.fn(), claim: jest.fn(), claims: jest.fn(), retryPayout: jest.fn(), maxClaim: jest.fn() },
}));
const svc = rewardClaimService as jest.Mocked<typeof rewardClaimService>;
const reward = { allocationId: 'a-1', rewardType: 'custom', amountStroops: 1000000, currencyCode: 'XLM', status: 'released', releasedAt: '2026-11-13T20:33:38Z', createdAt: '2026-11-13T19:00:00Z' };

beforeEach(() => { jest.clearAllMocks(); svc.received.mockResolvedValue([reward]); svc.claimable.mockResolvedValue(1000000); svc.claims.mockResolvedValue([]); });

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

  it('claims at most the per-payment limit and says the rest stays claimable', async () => {
    svc.claimable.mockResolvedValue(2000000);
    svc.maxClaim.mockResolvedValue(1000000);
    svc.claim.mockResolvedValue({ kind: 'verified', payout: { status: 'paid' } });
    render(<RewardsScreen />);
    fireEvent.press(await screen.findByText('Claim 0.1 XLM to my wallet'));
    await waitFor(() => expect(svc.claim).toHaveBeenCalledWith(1000000));
    expect(screen.getByText(/at most 0\.1 XLM\. Claim again for the rest/)).toBeTruthy();
  });

  it('explains how to restore the wallet on another device', async () => {
    render(<RewardsScreen />);
    expect(await screen.findByText(/device where your wallet was set up, or your recovery phrase/)).toBeTruthy();
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

  it.each([
    ['PAYOUT_CAP_EXCEEDED', 'This payout is above the per-claim limit. Your claim is saved.'],
    ['PAYOUT_CAP_EXCEEDED', 'The daily payout limit has been reached. Your claim is saved and can be paid later.'],
    ['TREASURY_PILOT_LIMIT_EXCEEDED', 'This payout exceeds the reward pool budget.'],
    ['PAYOUT_UNAVAILABLE', 'Mainnet reward payouts are switched off.'],
  ])('says a %s payout was not sent, with the reason, never that it was sent', async (code, message) => {
    svc.claim.mockResolvedValue({ kind: 'verified', payout: { status: 'refused', code, message } });
    render(<RewardsScreen />);
    fireEvent.press(await screen.findByText('Claim to my wallet'));
    expect(await screen.findByText(`Your wallet is confirmed, but the reward has not been sent to it yet. ${message}`)).toBeTruthy();
    expect(screen.queryByText(/reward has been sent/)).toBeNull();
  });

  it('shows an earned reward as Earned and an unpaid claim as Not paid yet, and can retry it', async () => {
    svc.claimable.mockResolvedValue(0);
    svc.received.mockResolvedValue([{ ...reward, amountStroops: 2000000 }]);
    svc.claims.mockResolvedValue([
      { claimId: 'c-2', destination: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ', amountStroops: 2000000, status: 'verified', verifiedAt: '2026-11-20T18:05:00Z', payout: 'not_sent', txHash: null, ledger: null },
      { claimId: 'c-1', destination: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ', amountStroops: 1000000, status: 'verified', verifiedAt: '2026-11-18T10:00:00Z', payout: 'paid', txHash: 'ab', ledger: 5 },
    ]);
    svc.retryPayout.mockRejectedValue(new ApiRequestError({ message: 'This payout is above the per-claim limit. Your claim is saved.', status: 409 }));
    render(<RewardsScreen />);
    const statuses = await screen.findAllByTestId('claim-payout-status');
    expect(statuses.map(s => s.props.children)).toEqual(['Not paid yet', 'Paid to wallet']);
    expect(screen.getByText(/^Earned/)).toBeTruthy();
    expect(screen.queryByText(/Released/)).toBeNull();
    fireEvent.press(screen.getByText('Try payment again'));
    await waitFor(() => expect(svc.retryPayout).toHaveBeenCalledWith('c-2'));
    expect(await screen.findByText('This payout is above the per-claim limit. Your claim is saved.')).toBeTruthy();
  });

  it('shows a failed balance load as an error with retry, never as nothing to claim', async () => {
    svc.claimable.mockRejectedValueOnce(new ApiRequestError({ message: 'Could not load your reward balance.', status: 500 }));
    render(<RewardsScreen />);
    expect(await screen.findByText('Could not load your reward balance.')).toBeTruthy();
    expect(screen.queryByText(/Nothing to claim/)).toBeNull();
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Claim to my wallet')).toBeTruthy();
    expect(screen.queryByText('Could not load your reward balance.')).toBeNull();
  });

  it('shows a failed payments load as an error with retry instead of hiding the payments', async () => {
    svc.claims.mockRejectedValueOnce(new ApiRequestError({ message: 'Could not load your claims.', status: 500 }));
    render(<RewardsScreen />);
    expect(await screen.findByText('Could not load your claims.')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(svc.claims).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Could not load your claims.')).toBeNull());
  });

  it('says a retried payment that failed was not sent', async () => {
    svc.claimable.mockResolvedValue(0);
    svc.claims.mockResolvedValue([
      { claimId: 'c-2', destination: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ', amountStroops: 2000000, status: 'verified', verifiedAt: '2026-11-20T18:05:00Z', payout: 'failed', txHash: null, ledger: null },
    ]);
    svc.retryPayout.mockResolvedValue({ claimId: 'c-2', status: 'failed' });
    render(<RewardsScreen />);
    fireEvent.press(await screen.findByText('Try payment again'));
    expect(await screen.findByText('The payment was not sent. Your claim is saved.')).toBeTruthy();
  });

  it('shows the server message when a retried payment is refused', async () => {
    svc.claimable.mockResolvedValue(0);
    svc.claims.mockResolvedValue([
      { claimId: 'c-2', destination: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ', amountStroops: 2000000, status: 'verified', verifiedAt: '2026-11-20T18:05:00Z', payout: 'not_sent', txHash: null, ledger: null },
    ]);
    svc.retryPayout.mockRejectedValue(new ApiRequestError({ message: 'Mainnet reward payouts are switched off.', status: 502, code: 'PAYOUT_UNAVAILABLE' }));
    render(<RewardsScreen />);
    fireEvent.press(await screen.findByText('Try payment again'));
    expect(await screen.findByText('Mainnet reward payouts are switched off.')).toBeTruthy();
  });

  it('shows one banner when the whole page fails to load', async () => {
    svc.received.mockRejectedValueOnce(new ApiRequestError({ message: 'Could not load your rewards.', status: 500 }));
    svc.claimable.mockRejectedValueOnce(new ApiRequestError({ message: 'Could not load your reward balance.', status: 500 }));
    render(<RewardsScreen />);
    expect(await screen.findByText('Could not load your rewards.')).toBeTruthy();
    expect(screen.queryByText('Could not load your reward balance.')).toBeNull();
    expect(screen.getAllByText('Try again')).toHaveLength(1);
  });

  it('labels statuses and reward types in plain words and explains Earned', async () => {
    svc.claimable.mockResolvedValue(0);
    svc.received.mockResolvedValue([
      { ...reward, allocationId: 'a-1', rewardType: 'course_completion' },
      { ...reward, allocationId: 'a-2', status: 'partially_refunded' },
    ]);
    render(<RewardsScreen />);
    expect(await screen.findByText('Course completion reward')).toBeTruthy();
    expect(screen.getByText(/^Partially refunded ·/)).toBeTruthy();
    expect(screen.queryByText(/partially_refunded|partially refunded ·/)).toBeNull();
    expect(screen.getByText(/"Earned" means not paid yet/)).toBeTruthy();
    expect(screen.getByText(/Nothing to claim right now/)).toBeTruthy();
  });
});

