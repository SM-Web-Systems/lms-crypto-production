import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import RewardClaimReturnScreen from '@/app/reward-claim';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

describe('return from AmmaWallet after a reward claim', () => {
  it('shows a short message and goes back to Rewards instead of an unmatched route', () => {
    render(<RewardClaimReturnScreen />);
    expect(screen.getByText('Finishing your claim…')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(500); });
    expect(mockReplace).toHaveBeenCalledWith('/(student)/rewards');
  });

  it('does not read anything from the URL', () => {
    const source = require('fs').readFileSync(require('path').resolve(__dirname, '../../app/reward-claim.tsx'), 'utf8');
    expect(source).not.toMatch(/useLocalSearchParams|useGlobalSearchParams|Linking/);
  });
});
