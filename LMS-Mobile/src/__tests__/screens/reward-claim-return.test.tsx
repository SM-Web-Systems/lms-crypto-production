import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import RewardClaimReturnScreen from '@/app/reward-claim';
import { rewardClaimService } from '@/services/rewardClaimService';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@/lib/api', () => ({ __esModule: true, default: {} }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

const resume = jest.spyOn(rewardClaimService, 'resumeClaim');
const initialUrl = jest.spyOn(Linking, 'getInitialURL');
const link = 'lmsmobile://reward-claim#claim=c1&signature=abc';

beforeEach(() => { jest.clearAllMocks(); initialUrl.mockResolvedValue(link); });

describe('cold start from the AmmaWallet return link (Android closed the app)', () => {
  it('finishes the claim from the link and shows the real result', async () => {
    resume.mockResolvedValue({ kind: 'verified', payout: { status: 'paid', txHash: 'ab' } });
    render(<RewardClaimReturnScreen />);
    expect(screen.getByText('Finishing your claim…')).toBeTruthy();
    expect(await screen.findByText('Your wallet is confirmed and the reward has been sent to it.')).toBeTruthy();
    expect(resume).toHaveBeenCalledWith(link);
    fireEvent.press(screen.getByText('Go to Rewards'));
    expect(mockReplace).toHaveBeenCalledWith('/(student)/rewards');
  });

  it('says the claim was interrupted when nothing matches', async () => {
    resume.mockResolvedValue({ kind: 'interrupted' });
    render(<RewardClaimReturnScreen />);
    expect(await screen.findByText('Your claim was interrupted. Start again.')).toBeTruthy();
  });

  it('says the claim was interrupted when the app has no return link', async () => {
    initialUrl.mockResolvedValue(null);
    render(<RewardClaimReturnScreen />);
    expect(await screen.findByText('Your claim was interrupted. Start again.')).toBeTruthy();
    expect(resume).not.toHaveBeenCalled();
  });

  it('says the claim expired', async () => {
    resume.mockResolvedValue({ kind: 'expired' });
    render(<RewardClaimReturnScreen />);
    expect(await screen.findByText('This claim expired. Start again.')).toBeTruthy();
  });

  it('shows why the claim could not be finished', async () => {
    resume.mockRejectedValue(new Error('AmmaWallet cannot approve this claim right now. Try again in a moment.'));
    render(<RewardClaimReturnScreen />);
    expect(await screen.findByText(/cannot approve this claim right now/)).toBeTruthy();
    expect(screen.getByText('Go to Rewards')).toBeTruthy();
  });
});
