// Where to land after a Wallet round trip that the learner started from inside the LMS
// (for example "Refresh from AmmaWallet" on their profile). Same-origin paths only, short-lived.
const KEY = 'lms.sso.returnTo';
const MAX_AGE_MS = 15 * 60 * 1000;

export function rememberSsoReturn(path: string, now = Date.now()) {
  if (!isSafePath(path)) return;
  try { sessionStorage.setItem(KEY, JSON.stringify({path, at: now})); } catch { /* storage unavailable: fall back to home */ }
}

/** Reads and clears the remembered path. Returns null when it is missing, stale or unsafe. */
export function takeSsoReturn(now = Date.now()): string | null {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as {path?: unknown; at?: unknown};
    if (typeof value.path !== 'string' || typeof value.at !== 'number' || now - value.at > MAX_AGE_MS || now < value.at) return null;
    return isSafePath(value.path) ? value.path : null;
  } catch { return null; }
}

function isSafePath(path: string) {
  return /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(path) && /(^|\/)profile(\/|$)/.test(path);
}
