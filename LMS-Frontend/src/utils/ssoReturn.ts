import type { User } from '../types/api';
import { canAccessPath } from './authorization';

// Where to land after sign-in or a Wallet round trip: the deep link a signed-out visitor opened,
// or the page a Wallet action started from. Same-origin signed-in app routes only, short-lived.
const KEY = 'lms.sso.returnTo';
const MAX_AGE_MS = 15 * 60 * 1000;
// Set by an explicit sign-out so the page being left is not kept for the next sign-in; the login page clears it.
let paused = false;

export function rememberSsoReturn(path: string, now = Date.now()) {
  if (paused || !isSafePath(path)) return;
  try { sessionStorage.setItem(KEY, JSON.stringify({path, at: now})); } catch { /* storage unavailable: fall back to home */ }
}

export function forgetSsoReturn() {
  paused = true;
  try { sessionStorage.removeItem(KEY); } catch { /* nothing stored */ }
}
export function resumeSsoReturn() { paused = false; }

/** The remembered path when this user may open it, else their home. Reads it once. */
export function ssoReturnFor(user: User, home: string): string {
  const path = takeSsoReturn();
  return path && canAccessPath(user, path.split(/[?#]/)[0]) ? path : home;
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

// First path segments of signed-in app routes (App.tsx). Public and auth pages are never a return target.
const APP_ROOTS = new Set(['student', 'admin', 'lecturer', 'ta', 'sponsor', 'employer', 'parent', 'teacher', 'settings', 'profile', 'messages', 'forum']);

/** Accepts only a path that already is its own normalised same-origin form, so nothing can steer it off-site. */
function isSafePath(path: string) {
  if (!path.startsWith('/') || /[\\\s]/.test(path)) return false;
  let url: URL;
  try { url = new URL(path, 'https://lms.invalid'); } catch { return false; }
  return url.origin === 'https://lms.invalid'
    && url.pathname + url.search + url.hash === path
    && /^\/[A-Za-z0-9/_-]*$/.test(url.pathname)
    && APP_ROOTS.has(url.pathname.split('/')[1]);
}
