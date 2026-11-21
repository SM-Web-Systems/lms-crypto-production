import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { isAxiosError } from 'axios';
import { Platform } from 'react-native';
import api from '@/lib/api';
import { ApiRequestError, assertApiSuccess } from '@/utils/apiError';
import type { ApiResponse } from '@/types/api';

/** AmmaWallet signs the claim and returns here, in the URL fragment. */
export const CLAIM_RETURN_URL = 'lmsmobile://reward-claim';

export interface StartedClaim { claimId: string; destination: string; amountStroops: number; expiresAt: string; message: string }
/**
 * 'refused': a payout rule stopped it (per-claim or daily limit, reward pool budget, payouts switched off) and message says why.
 * 'pending': it could not be sent yet. Only 'paid' means the reward reached the wallet.
 */
export interface ClaimPayout { status: 'paid' | 'submitted' | 'failed' | 'pending' | 'refused'; txHash?: string; ledger?: number | null; code?: string; message?: string }
/** One of my claims to my wallet, with what really happened to its payout. */
export interface MyRewardClaim {
  claimId: string; destination: string; amountStroops: number; status: 'verified' | 'cancelled'; verifiedAt: string | null;
  payout: 'paid' | 'submitted' | 'failed' | 'not_sent'; txHash: string | null; ledger: number | null;
}
export interface VerifiedClaim { claimId: string; status: 'verified'; payout: ClaimPayout | null }
export interface ReceivedReward { allocationId: string; rewardType: string; amountStroops: number; currencyCode: string; status: string; releasedAt: string | null; createdAt: string }

export type ClaimOutcome =
  | { kind: 'verified'; payout: ClaimPayout | null }
  | { kind: 'declined' }
  | { kind: 'cancelled' };
/** After a cold start: 'interrupted' means no saved claim matches the link, 'expired' that the server's challenge ran out. */
export type ResumedClaim = Exclude<ClaimOutcome, { kind: 'cancelled' }> | { kind: 'interrupted' } | { kind: 'expired' };

/**
 * The claim in flight while AmmaWallet has the screen. Android may close the app meanwhile, and verify needs
 * the exact challenge text, so it is kept on the device until the claim ends.
 */
export const PENDING_CLAIM_KEY = 'lms_reward_claim_pending';
interface PendingClaim { claimId: string; message: string; startedAt: number; expiresAt: string }

async function readPendingClaim(): Promise<PendingClaim | null> {
  try {
    const saved = JSON.parse((await SecureStore.getItemAsync(PENDING_CLAIM_KEY)) ?? 'null');
    if (typeof saved?.claimId !== 'string' || typeof saved?.message !== 'string') return null;
    // A claim left over from an abandoned hand-off can no longer be verified; never offer it.
    return Date.parse(saved.expiresAt) > Date.now() ? saved : null;
  } catch { return null; }
}
const forgetPendingClaim = () => SecureStore.deleteItemAsync(PENDING_CLAIM_KEY).catch(() => undefined);

function errorCode(error: unknown): string | undefined {
  if (error instanceof ApiRequestError) return error.code;
  return isAxiosError(error) ? (error.response?.data as { error?: { code?: string } } | undefined)?.error?.code : undefined;
}

const walletBase = () => (process.env.EXPO_PUBLIC_AMMA_WALLET_URL || 'https://ammawallet.com').replace(/\/$/, '');

/** Base64url of the exact challenge text. */
export function encodeChallenge(message: string): string {
  const bytes = new TextEncoder().encode(message);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function walletClaimUrl(message: string): string {
  const params = new URLSearchParams({ message: encodeChallenge(message), return: CLAIM_RETURN_URL });
  return `${walletBase()}/lms/claim#${params.toString()}`;
}

/** Parse AmmaWallet's answer. Only the fragment of our own return address is trusted. */
/** What AmmaWallet says when it cannot approve: #claim=<id>&error=expired|unavailable, or #error=invalid. Never with a signature. */
const WALLET_ERRORS: Record<string, string> = {
  expired: 'This claim expired. Start a new claim. Your rewards are still safe in your LMS balance.',
  unavailable: 'AmmaWallet cannot approve this claim right now. Try again in a moment.',
  invalid: 'AmmaWallet could not read this claim. Start a new claim.',
};

export function parseClaimReturn(url: string, claimId: string): { signature: string } | { declined: true } {
  const hashAt = url.indexOf('#');
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  if (base !== CLAIM_RETURN_URL || hashAt === -1) throw new Error('The wallet response could not be verified. Start the claim again.');
  const params = new URLSearchParams(url.slice(hashAt + 1));
  const reason = WALLET_ERRORS[params.get('error') ?? ''];
  if (reason) throw new Error(reason);
  if (params.get('claim') !== claimId) throw new Error('The wallet response was for a different claim. Start the claim again.');
  if (params.get('declined') === '1') return { declined: true };
  const signature = params.get('signature') ?? '';
  if (!/^[A-Za-z0-9+/]{86}==$/.test(signature)) throw new Error('The wallet response was incomplete. Start the claim again.');
  return { signature };
}

export const rewardClaimService = {
  async claimable(): Promise<number> {
    const res = await api.get<ApiResponse<{ claimableStroops: string }>>('/students/me/reward-claims/balance');
    return Number(assertApiSuccess(res, 'Could not load your reward balance.').claimableStroops);
  },
  async received(): Promise<ReceivedReward[]> {
    const res = await api.get<ApiResponse<ReceivedReward[]>>('/students/me/rewards');
    return assertApiSuccess(res, 'Could not load your rewards.');
  },
  async claims(): Promise<MyRewardClaim[]> {
    const res = await api.get<ApiResponse<MyRewardClaim[]>>('/students/me/reward-claims');
    return assertApiSuccess(res, 'Could not load your claims.');
  },
  /** Try the payout of a verified claim again. Never pays twice. */
  async retryPayout(claimId: string): Promise<ClaimPayout & { claimId: string }> {
    const res = await api.post<ApiResponse<ClaimPayout & { claimId: string }>>(`/students/me/reward-claims/${encodeURIComponent(claimId)}/payout`);
    return assertApiSuccess(res, 'The payment could not be sent. Your claim is saved.');
  },
  async payoutStatus(claimId: string): Promise<ClaimPayout & { claimId: string }> {
    const res = await api.get<ApiResponse<ClaimPayout & { claimId: string }>>(`/students/me/reward-claims/${encodeURIComponent(claimId)}/payout`);
    return assertApiSuccess(res, 'Could not check the payment.');
  },
  /** Start a claim, let AmmaWallet sign it, then give the signature to the LMS. */
  async claim(amountStroops: number): Promise<ClaimOutcome> {
    if (Platform.OS === 'web') throw new Error('Use the LMS web dashboard to claim from this browser.');
    const started = assertApiSuccess(
      await api.post<ApiResponse<StartedClaim>>('/students/me/reward-claims', { amountStroops: String(amountStroops) }),
      'Could not start the claim.');
    const pending: PendingClaim = { claimId: started.claimId, message: started.message, startedAt: Date.now(), expiresAt: started.expiresAt };
    // Without the saved copy only a cold-start return is lost; the claim itself can still go ahead.
    await SecureStore.setItemAsync(PENDING_CLAIM_KEY, JSON.stringify(pending)).catch(() => undefined);
    const result = await WebBrowser.openAuthSessionAsync(walletClaimUrl(started.message), CLAIM_RETURN_URL, { createTask: false });
    // No answer is not the end of the claim: when Android recreates the app screen the session reports a
    // dismiss, and the signed answer arrives as the link that opens the new screen (resumeClaim). Keep it.
    if (result.type !== 'success') return { kind: 'cancelled' };
    try {
      return await finishClaim(pending, result.url);
    } finally {
      await forgetPendingClaim();
    }
  },
  /** Finish the claim AmmaWallet answered after Android closed the app, from the link that reopened it. */
  async resumeClaim(url: string): Promise<ResumedClaim> {
    try {
      const pending = await readPendingClaim();
      const hashAt = url.indexOf('#');
      const link = new URLSearchParams(hashAt === -1 ? '' : url.slice(hashAt + 1));
      const linkClaim = link.get('claim');
      if (!pending || (linkClaim !== null && linkClaim !== pending.claimId)) return { kind: 'interrupted' };
      if (link.get('error') === 'expired') return { kind: 'expired' };
      try {
        return await finishClaim(pending, url);
      } catch (error) {
        if (errorCode(error) === 'CLAIM_EXPIRED') return { kind: 'expired' };
        throw error;
      }
    } finally {
      await forgetPendingClaim();
    }
  },
};

async function finishClaim(pending: PendingClaim, url: string): Promise<Exclude<ClaimOutcome, { kind: 'cancelled' }>> {
  const answer = parseClaimReturn(url, pending.claimId);
  if ('declined' in answer) return { kind: 'declined' };
  // The server's verify is idempotent on the claim id, so a repeat never makes a second claim.
  const verified = assertApiSuccess(
    await api.post<ApiResponse<VerifiedClaim>>(`/students/me/reward-claims/${encodeURIComponent(pending.claimId)}/verify`,
      { message: pending.message, signature: answer.signature }),
    'Could not verify the claim.');
  return { kind: 'verified', payout: verified.payout };
}
