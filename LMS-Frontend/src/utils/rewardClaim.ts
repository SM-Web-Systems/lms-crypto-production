import { AMMA_WALLET_URL } from './walletSignIn';

// The challenge text is kept in this tab while the learner signs it in AmmaWallet, then sent back
// with the signature. Keyed by claim id and short-lived; nothing secret is stored.
const KEY = 'lms.reward.claim';
const MAX_AGE_MS = 10 * 60 * 1000;

export function rememberClaim(claimId: string, message: string, now = Date.now()) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ claimId, message, at: now })); } catch { /* the return page explains */ }
}

export function takeClaim(claimId: string, now = Date.now()): string | null {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { claimId?: unknown; message?: unknown; at?: unknown };
    if (v.claimId !== claimId || typeof v.message !== 'string' || typeof v.at !== 'number' || now - v.at > MAX_AGE_MS || now < v.at) return null;
    return v.message;
  } catch { return null; }
}

/** AmmaWallet's signing page, with the challenge and the return address in the URL fragment. */
export function walletClaimUrl(message: string, returnUrl: string): string {
  const bytes = new TextEncoder().encode(message);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${AMMA_WALLET_URL}/lms/claim#${new URLSearchParams({ message: b64url, return: returnUrl }).toString()}`;
}

export const walletClaimNavigation = { go: (url: string) => window.location.assign(url) };
