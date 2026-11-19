import { CLAIM_RETURN_URL } from '@/services/rewardClaimService';

/**
 * AmmaWallet hands a signed reward claim back to lmsmobile://reward-claim#... On Android that link also
 * reaches the router. The root layout is a Slot, so navigating to /reward-claim unmounted the whole
 * student tab group: the Rewards screen that was waiting for the answer lost its confirmation, and
 * Course, Dashboard and Profile all mounted again and showed "Loading…".
 *
 * While the app is running, the Rewards screen reads the answer through its browser session, so the
 * router does not need to go anywhere. Only a cold start (the app was closed) opens the return route,
 * which sends the learner back to Rewards.
 */
export function isClaimReturn(path: string): boolean {
  const withoutFragment = path.split('#')[0].split('?')[0];
  return withoutFragment === CLAIM_RETURN_URL || withoutFragment === '/reward-claim' || withoutFragment === 'reward-claim';
}

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    if (!initial && isClaimReturn(path)) return '';
  } catch {
    // Never throw here: an error in this hook can crash the app on a deep link.
  }
  return path;
}
