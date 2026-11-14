import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import api from '@/lib/api';
import { assertApiSuccess } from '@/utils/apiError';
import type { ApiResponse } from '@/types/api';

/** AmmaWallet signs the claim and returns here, in the URL fragment. */
export const CLAIM_RETURN_URL = 'lmsmobile://reward-claim';

export interface StartedClaim { claimId: string; destination: string; amountStroops: number; expiresAt: string; message: string }
export interface ClaimPayout { status: 'paid' | 'submitted' | 'failed' | 'pending'; txHash?: string; ledger?: number | null; code?: string }
export interface VerifiedClaim { claimId: string; status: 'verified'; payout: ClaimPayout | null }
export interface ReceivedReward { allocationId: string; rewardType: string; amountStroops: number; currencyCode: string; status: string; releasedAt: string | null; createdAt: string }

export type ClaimOutcome =
  | { kind: 'verified'; payout: ClaimPayout | null }
  | { kind: 'declined' }
  | { kind: 'cancelled' };

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
export function parseClaimReturn(url: string, claimId: string): { signature: string } | { declined: true } {
  const hashAt = url.indexOf('#');
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  if (base !== CLAIM_RETURN_URL || hashAt === -1) throw new Error('The wallet response could not be verified. Start the claim again.');
  const params = new URLSearchParams(url.slice(hashAt + 1));
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
    const result = await WebBrowser.openAuthSessionAsync(walletClaimUrl(started.message), CLAIM_RETURN_URL, { createTask: false });
    if (result.type !== 'success') return { kind: 'cancelled' };
    const answer = parseClaimReturn(result.url, started.claimId);
    if ('declined' in answer) return { kind: 'declined' };
    const verified = assertApiSuccess(
      await api.post<ApiResponse<VerifiedClaim>>(`/students/me/reward-claims/${encodeURIComponent(started.claimId)}/verify`,
        { message: started.message, signature: answer.signature }),
      'Could not verify the claim.');
    return { kind: 'verified', payout: verified.payout };
  },
};
