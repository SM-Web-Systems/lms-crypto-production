/**
 * AUTH-14: the LMS talks to Amma with two keys from two variables:
 * AMMA_WALLET_API_KEY (SSO verify, wallet registration) and
 * AMMA_ACTIVATION_API_KEY (partner activations). After the cutover both must
 * hold the same DB tenant key and point at the same Amma environment.
 * This only warns; it never blocks startup and never logs key values.
 */
type Env = Record<string, string | undefined>;

function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

export function ammaConfigWarnings(env: Env = process.env): string[] {
  const warnings: string[] = [];
  const walletKey = env.AMMA_WALLET_API_KEY ?? '';
  const activationKey = env.AMMA_ACTIVATION_API_KEY ?? '';
  if (walletKey && activationKey && walletKey !== activationKey) {
    warnings.push('AMMA_WALLET_API_KEY and AMMA_ACTIVATION_API_KEY differ. Both should hold the same Amma DB tenant key (AUTH-14).');
  }
  const walletHost = hostOf(env.AMMA_WALLET_URL);
  const activationHost = hostOf(env.AMMA_ACTIVATION_BASE_URL);
  if (walletHost && activationHost && walletHost !== activationHost) {
    warnings.push('AMMA_WALLET_URL and AMMA_ACTIVATION_BASE_URL point at different hosts. Both should target the same Amma environment.');
  }
  return warnings;
}
