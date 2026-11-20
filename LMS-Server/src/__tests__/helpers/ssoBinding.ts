import type { Response } from 'supertest';

/** AUTH-14: the browser-binding cookie set when an Amma sign-in starts, as a Cookie header value. */
export function bindingCookie(res: Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const all = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const found = all.find(cookie => /^(__Host-)?lms_sso_state=/.test(cookie));
  if (!found) throw new Error('No SSO binding cookie was set');
  return found.split(';')[0];
}
