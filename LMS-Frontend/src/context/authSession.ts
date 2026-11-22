import { createContext } from 'react';
import type { User } from '../types/api';

// The sign-in token lives in an HttpOnly cookie set by the API; page scripts never see it.
// The browser keeps only a random, non-secret session marker. It says "a sign-in may exist" (so a
// signed-out visitor does not call /auth/me) and changes on every sign-in, so in-flight work can
// tell that the session changed. LEGACY_TOKEN_KEY is read once to migrate older browsers.
const MARKER_KEY = 'lms_session_marker';
export const LEGACY_TOKEN_KEY = 'lms_token';
let storageFallback: string | null | undefined;
export function newMarker(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
/** The current session marker (not a credential), or null when signed out. */
export function getStoredToken(): string | null {
  if (storageFallback !== undefined) return storageFallback;
  try { return localStorage.getItem(MARKER_KEY); } catch { return null; }
}
export function setStoredToken(marker: string | null): void {
  try {
    if(marker) localStorage.setItem(MARKER_KEY,marker); else localStorage.removeItem(MARKER_KEY);
    storageFallback=undefined;
  } catch { storageFallback=marker; }
}
// A wallet sign-in in progress, shared with the browser's other LMS tabs. Its marker is already stored, but
// the cookie only exists once POST /auth/session completes, so a 401 for that marker in the meantime is not
// a sign-out. Without this, another open tab's background check wiped the new sign-in ("Unable to verify").
const PENDING_KEY = 'lms_session_pending';
const PENDING_MS = 30_000;
export function markSessionPending(marker: string): void {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ marker, at: Date.now() })); } catch { /* storage unavailable */ }
}
export function clearSessionPending(marker: string): void {
  try { if (isSessionPending(marker)) localStorage.removeItem(PENDING_KEY); } catch { /* storage unavailable */ }
}
export function isSessionPending(marker: string | null): boolean {
  if (!marker) return false;
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null') as { marker?: unknown; at?: unknown } | null;
    return value?.marker === marker && typeof value.at === 'number' && Date.now() - value.at < PENDING_MS;
  } catch { return false; }
}
export function takeLegacyToken(): string | null {
  try {
    const token = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (token) localStorage.removeItem(LEGACY_TOKEN_KEY);
    return token;
  } catch { return null; }
}
export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  completeSso: (token: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (user: User, verifiedToken?: string) => void;
}
export const AuthContext = createContext<AuthContextType | undefined>(undefined);
