/**
 * An emailed invitation link (/sign-up?join=TOKEN) is kept in this browser until the learner is signed in,
 * because signing up goes through AmmaWallet and comes back later. It expires with the link (14 days).
 */
const KEY = 'lms.pendingJoin';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function rememberJoinToken(search: string = typeof window === 'undefined' ? '' : window.location.search): void {
  const token = new URLSearchParams(search).get('join');
  if (!token || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ token, at: Date.now() })); } catch { /* storage unavailable */ }
}

export function takeJoinToken(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return null;
    const { token, at } = JSON.parse(raw) as { token?: string; at?: number };
    return token && typeof at === 'number' && Date.now() - at < MAX_AGE_MS ? token : null;
  } catch { return null; }
}
