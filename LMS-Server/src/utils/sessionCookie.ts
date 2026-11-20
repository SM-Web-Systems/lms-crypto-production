import type { Request, Response } from 'express';
import { decodeToken } from '../config/jwt.js';

/**
 * Web sign-in lives in an HttpOnly cookie so page scripts (and any injected script) cannot read the token.
 * Native apps and API clients keep using `Authorization: Bearer`.
 *
 * CSRF: the cookie is SameSite=Lax, and authenticate() also requires the X-LMS-CSRF header on every
 * state-changing request that is authenticated by the cookie. A cross-site form cannot set that header,
 * and a cross-origin script cannot send it without passing the CORS allowlist.
 */
export const SESSION_COOKIE = 'lms_session';
export const CSRF_HEADER = 'x-lms-csrf';
const COOKIE_PATH = '/api';

function secureCookies(): boolean {
  const raw = process.env.SESSION_COOKIE_SECURE;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return process.env.NODE_ENV === 'production';
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    if (!value) return null;
    try { return decodeURIComponent(value); } catch { return null; }
  }
  return null;
}

/** Set the session cookie for a token; it expires with the JWT. */
export function setSessionCookie(res: Response, token: string): void {
  const exp = decodeToken(token)?.exp;
  const maxAge = exp ? Math.max(0, exp * 1000 - Date.now()) : 24 * 60 * 60 * 1000;
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: secureCookies(), sameSite: 'lax', path: COOKIE_PATH });
}
