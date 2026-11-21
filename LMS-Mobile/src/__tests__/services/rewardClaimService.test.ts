import * as Browser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import api from '@/lib/api';
import { rewardClaimService, walletClaimUrl, parseClaimReturn, CLAIM_RETURN_URL, PENDING_CLAIM_KEY } from '@/services/rewardClaimService';

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const browser = Browser.openAuthSessionAsync as jest.Mock;
const post = api.post as jest.Mock;
const get = api.get as jest.Mock;

const message = 'SM Web Systems LMS reward claim\nclaim:c-1\ndestination:GADDR\namount_stroops:1000000\nexpires:2026-11-14T08:00:00.000Z\nnonce:' + 'a'.repeat(64);
const signature = 'A'.repeat(86) + '==';
const started = { claimId: 'c-1', destination: 'GADDR', amountStroops: 1000000, expiresAt: '2999-01-01T00:00:00.000Z', message };

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

describe('AmmaWallet says why it could not approve', () => {
  it('gives a specific message for each known reason, and ignores a signature sent with one', () => {
    expect(() => parseClaimReturn(`${CLAIM_RETURN_URL}#claim=c-1&error=expired`, 'c-1')).toThrow(/claim expired/);
    expect(() => parseClaimReturn(`${CLAIM_RETURN_URL}#claim=c-1&error=unavailable`, 'c-1')).toThrow(/cannot approve this claim right now/);
    expect(() => parseClaimReturn(`${CLAIM_RETURN_URL}#error=invalid`, 'c-1')).toThrow(/could not read this claim/);
    expect(() => parseClaimReturn(`${CLAIM_RETURN_URL}#claim=c-1&error=expired&signature=${encodeURIComponent('A'.repeat(86) + '==')}`, 'c-1')).toThrow(/claim expired/);
  });

  it('treats an unknown reason like a bare return, and only trusts the exact return address', () => {
    expect(() => parseClaimReturn(`${CLAIM_RETURN_URL}#claim=c-1&error=teapot`, 'c-1')).toThrow(/incomplete/);
    expect(() => parseClaimReturn(`lmsmobile://sso-callback#claim=c-1&error=expired`, 'c-1')).toThrow(/could not be verified/);
  });
});

describe('UX-008 a claim survives Android closing the app during the AmmaWallet hand-off', () => {
  const store = new Map<string, string>();
  const setItem = SecureStore.setItemAsync as jest.Mock;
  const getItem = SecureStore.getItemAsync as jest.Mock;
  const deleteItem = SecureStore.deleteItemAsync as jest.Mock;
  const signedReturn = `${CLAIM_RETURN_URL}#claim=c-1&signature=${encodeURIComponent(signature)}`;
  const save = (claimId = 'c-1', expiresAt = started.expiresAt) => store.set(PENDING_CLAIM_KEY, JSON.stringify({ claimId, message, startedAt: 1, expiresAt }));
  beforeEach(() => {
    store.clear();
    setItem.mockImplementation(async (k: string, v: string) => { store.set(k, v); });
    getItem.mockImplementation(async (k: string) => store.get(k) ?? null);
    deleteItem.mockImplementation(async (k: string) => { store.delete(k); });
  });
  afterAll(() => { setItem.mockResolvedValue(undefined); getItem.mockResolvedValue(null); deleteItem.mockResolvedValue(undefined); });

  it('saves the claim id and the exact challenge before opening AmmaWallet, and forgets it once the claim ends', async () => {
    let savedWhenOpened: unknown;
    browser.mockImplementation(async () => { savedWhenOpened = JSON.parse(store.get(PENDING_CLAIM_KEY)!); return { type: 'success', url: signedReturn }; });
    await rewardClaimService.claim(1000000);
    expect(savedWhenOpened).toEqual({ claimId: 'c-1', message, startedAt: expect.any(Number), expiresAt: started.expiresAt });
    expect(store.has(PENDING_CLAIM_KEY)).toBe(false);
  });

  it('keeps the saved claim when the wallet hand-off ends without an answer', async () => {
    // With "Don't keep activities", Android recreates the app screen: the browser session reports a dismiss
    // and the signed answer arrives later as the link that starts the new screen.
    browser.mockResolvedValue({ type: 'dismiss' });
    expect(await rewardClaimService.claim(1000000)).toEqual({ kind: 'cancelled' });
    expect(await rewardClaimService.resumeClaim(signedReturn)).toEqual({ kind: 'verified', payout: { status: 'paid', txHash: 'ab', ledger: 5 } });
    expect(store.has(PENDING_CLAIM_KEY)).toBe(false);
  });

  it('ignores a saved claim whose challenge has already expired', async () => {
    save('c-1', '2000-01-01T00:00:00.000Z');
    expect(await rewardClaimService.resumeClaim(signedReturn)).toEqual({ kind: 'interrupted' });
    expect(post).not.toHaveBeenCalled();
  });

  it('reports the wallet saying the claim expired as expired', async () => {
    save();
    expect(await rewardClaimService.resumeClaim(`${CLAIM_RETURN_URL}#claim=c-1&error=expired`)).toEqual({ kind: 'expired' });
    expect(store.has(PENDING_CLAIM_KEY)).toBe(false);
  });

  it('still opens AmmaWallet when the device cannot save the claim', async () => {
    setItem.mockRejectedValueOnce(new Error('keystore locked'));
    browser.mockResolvedValue({ type: 'success', url: signedReturn });
    expect(await rewardClaimService.claim(1000000)).toEqual({ kind: 'verified', payout: { status: 'paid', txHash: 'ab', ledger: 5 } });
  });

  it('finishes the saved claim from the return link after a cold start, then forgets it', async () => {
    save();
    expect(await rewardClaimService.resumeClaim(signedReturn)).toEqual({ kind: 'verified', payout: { status: 'paid', txHash: 'ab', ledger: 5 } });
    expect(post).toHaveBeenCalledWith('/students/me/reward-claims/c-1/verify', { message, signature });
    expect(store.has(PENDING_CLAIM_KEY)).toBe(false);
  });

  it('reports an interrupted claim when nothing saved matches the return link', async () => {
    expect(await rewardClaimService.resumeClaim(signedReturn)).toEqual({ kind: 'interrupted' });
    save('other');
    expect(await rewardClaimService.resumeClaim(signedReturn)).toEqual({ kind: 'interrupted' });
    expect(store.has(PENDING_CLAIM_KEY)).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('reports an expired challenge, and forgets the claim', async () => {
    save();
    post.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 409'), {
      isAxiosError: true, response: { status: 409, data: { success: false, error: { code: 'CLAIM_EXPIRED', message: 'The challenge expired. Start a new claim.' } } },
    }));
    expect(await rewardClaimService.resumeClaim(signedReturn)).toEqual({ kind: 'expired' });
    expect(store.has(PENDING_CLAIM_KEY)).toBe(false);
  });

  it('passes on a decline or a wallet error, and forgets the claim either way', async () => {
    save();
    expect(await rewardClaimService.resumeClaim(`${CLAIM_RETURN_URL}#claim=c-1&declined=1`)).toEqual({ kind: 'declined' });
    save();
    await expect(rewardClaimService.resumeClaim(`${CLAIM_RETURN_URL}#claim=c-1&error=unavailable`)).rejects.toThrow(/cannot approve/);
    expect(store.has(PENDING_CLAIM_KEY)).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
});
