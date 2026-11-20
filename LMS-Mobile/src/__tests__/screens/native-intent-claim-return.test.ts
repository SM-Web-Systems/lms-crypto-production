import { redirectSystemPath, isClaimReturn } from '@/app/+native-intent';

jest.mock('@/lib/api', () => ({ __esModule: true, default: {} }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

const signed = 'lmsmobile://reward-claim#claim=c1&signature=abc';

describe('deep link back from AmmaWallet after a reward claim', () => {
  it('keeps the running app on the Rewards screen, so the waiting claim can show its confirmation', () => {
    expect(redirectSystemPath({ path: signed, initial: false })).toBe('');
    expect(redirectSystemPath({ path: '/reward-claim', initial: false })).toBe('');
  });

  it('still opens the return route on a cold start, which sends the learner to Rewards', () => {
    expect(redirectSystemPath({ path: signed, initial: true })).toBe(signed);
  });

  it('leaves every other link alone', () => {
    expect(redirectSystemPath({ path: 'lmsmobile://notification?id=1', initial: false })).toBe('lmsmobile://notification?id=1');
    expect(redirectSystemPath({ path: 'lmsmobile://sso-callback#token=x', initial: false })).toBe('lmsmobile://sso-callback#token=x');
    expect(isClaimReturn('lmsmobile://reward-claims-other')).toBe(false);
  });
});
