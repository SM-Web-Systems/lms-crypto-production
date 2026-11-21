import { CLAIM_RETURN_URL } from '@/services/rewardClaimService';

/**
 * AmmaWallet hands a signed reward claim back to lmsmobile://reward-claim#... On Android that link also
 * reaches the router. While the app is running, the Rewards screen reads the answer through its browser
 * session, so the router does not need to go anywhere: opening the route would push a second screen over
 * Rewards, whose replace back to Rewards would mount another copy of the tabs on the root Stack.
 * Only a cold start (the app was closed) opens the return route.
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
