/**
 * AUTH-14 2.1: Amma links a learner to the LMS tenant at /sso/verify using the key that verified
 * the sign-in, and activations must use that same tenant key. Warn at startup when the SSO key
 * and the activation key differ, or point at different Amma hosts. Values are never logged.
 */
import { timingSafeEqual, createHash } from 'node:crypto';

function sameSecret(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(a), digest(b));
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).host.toLowerCase(); } catch { return null; }
}

export function ammaKeyConfigWarnings(env: NodeJS.ProcessEnv): string[] {
  const warnings: string[] = [];
  if (env.AMMA_ACTIVATION_ENABLED !== 'on') return warnings;
  const ssoKey = env.AMMA_WALLET_API_KEY || '';
  const activationKey = env.AMMA_ACTIVATION_API_KEY || '';
  if (ssoKey && activationKey && !sameSecret(ssoKey, activationKey)) {
    warnings.push('AMMA_WALLET_API_KEY and AMMA_ACTIVATION_API_KEY differ — both must hold the same Amma DB tenant key (AUTH-14), or activations report USER_NOT_LINKED');
  }
  const ssoHost = hostOf(env.AMMA_WALLET_URL);
  const activationHost = hostOf(env.AMMA_ACTIVATION_BASE_URL);
  if (ssoHost && activationHost && ssoHost !== activationHost) {
    warnings.push('AMMA_WALLET_URL and AMMA_ACTIVATION_BASE_URL point at different hosts — SSO verify and activations must use the same Amma environment');
  }
  return warnings;
}
