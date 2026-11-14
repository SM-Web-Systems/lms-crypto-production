import * as Browser from 'expo-web-browser';
import api from '@/lib/api';
import { rewardClaimService, walletClaimUrl, parseClaimReturn, CLAIM_RETURN_URL } from '@/services/rewardClaimService';

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const browser = Browser.openAuthSessionAsync as jest.Mock;
const post = api.post as jest.Mock;
const get = api.get as jest.Mock;

const message = 'SM Web Systems LMS reward claim\nclaim:c-1\ndestination:GADDR\namount_stroops:1000000\nexpires:2026-11-14T08:00:00.000Z\nnonce:' + 'a'.repeat(64);
const signature = 'A'.repeat(86) + '==';
const started = { claimId: 'c-1', destination: 'GADDR', amountStroops: 1000000, expiresAt: 'x', message };

beforeEach(() => {
  jest.clearAllMocks();
  post.mockImplementation(async (url: string) => url === '/students/me/reward-claims'
    ? { data: { success: true, data: started } }
    : { data: { success: true, data: { claimId: 'c-1', status: 'verified', payout: { status: 'paid', txHash: 'ab', ledger: 5 } } } });
});
afterEach(() => { delete process.env.EXPO_PUBLIC_AMMA_WALLET_URL; });

describe('wallet claim hand-off', () => {
  it('sends the challenge as base64url in the fragment with the app return address', () => {
    const url = new URL(walletClaimUrl(message));
    expect(url.origin + url.pathname).toBe('https://ammawallet.com/lms/claim');
    const params = new URLSearchParams(url.hash.slice(1));
    expect(params.get('return')).toBe(CLAIM_RETURN_URL);
    expect(params.get('message')).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(params.get('message')!, 'base64url').toString('utf8')).toBe(message);
  });

  it('starts a claim, opens AmmaWallet, and verifies the returned signature', async () => {
    browser.mockResolvedValue({ type: 'success', url: `${CLAIM_RETURN_URL}#claim=c-1&signature=${encodeURIComponent(signature)}` });
    const outcome = await rewardClaimService.claim(1000000);
    expect(post).toHaveBeenNthCalledWith(1, '/students/me/reward-claims', { amountStroops: '1000000' });
    expect(browser.mock.calls[0][1]).toBe(CLAIM_RETURN_URL);
    expect(post).toHaveBeenNthCalledWith(2, '/students/me/reward-claims/c-1/verify', { message, signature });
    expect(outcome).toEqual({ kind: 'verified', payout: { status: 'paid', txHash: 'ab', ledger: 5 } });
  });

  it('keeps the rewards when the learner declines or closes the wallet', async () => {
    browser.mockResolvedValueOnce({ type: 'success', url: `${CLAIM_RETURN_URL}#claim=c-1&declined=1` });
    expect(await rewardClaimService.claim(1000000)).toEqual({ kind: 'declined' });
    browser.mockResolvedValueOnce({ type: 'cancel' });
    expect(await rewardClaimService.claim(1000000)).toEqual({ kind: 'cancelled' });
    expect(post).not.toHaveBeenCalledWith(expect.stringContaining('/verify'), expect.anything());
  });

  it('refuses a response for another claim, another address, or a malformed signature', () => {
    expect(() => parseClaimReturn(`${CLAIM_RETURN_URL}#claim=other&signature=${encodeURIComponent(signature)}`, 'c-1')).toThrow(/different claim/);
    expect(() => parseClaimReturn(`lmsmobile://sso-callback#claim=c-1&signature=${encodeURIComponent(signature)}`, 'c-1')).toThrow(/could not be verified/);
    expect(() => parseClaimReturn(`${CLAIM_RETURN_URL}?x=1#claim=c-1&signature=${encodeURIComponent(signature)}`, 'c-1')).toThrow(/could not be verified/);
    expect(() => parseClaimReturn(`${CLAIM_RETURN_URL}#claim=c-1&signature=bad`, 'c-1')).toThrow(/incomplete/);
    expect(() => parseClaimReturn(CLAIM_RETURN_URL, 'c-1')).toThrow(/could not be verified/);
  });

  it('reads the claimable balance as a number', async () => {
    get.mockResolvedValue({ data: { success: true, data: { claimableStroops: '1234567' } } });
    expect(await rewardClaimService.claimable()).toBe(1234567);
  });
});
