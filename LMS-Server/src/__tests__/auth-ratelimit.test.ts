/**
 * AUTH-RL-001 through AUTH-RL-007 — authLimiter must skip GET/HEAD/OPTIONS requests.
 *
 * Root cause: authLimiter's skip function only exempted GET /amma-login and
 * GET /amma-callback via SSO_PATHS. GET /auth/me (called on every page load
 * by AuthContext hydration) was counted against the 60/15min budget, causing
 * normal LMS browsing to deplete the auth budget and block all authentication.
 *
 * Fix: Change skip to exempt all GET/HEAD/OPTIONS requests (matching writeLimiter
 * pattern). POST-based brute-force protection remains at 60/15min.
 *
 * See: production-audit/LMS-AMMA-LOGIN-RATE-LIMIT.md
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const appSource = fs.readFileSync(
  path.resolve(__dirname, '../app.ts'),
  'utf-8',
);

describe('AUTH-RL — authLimiter skips read-only requests', () => {
  /**
   * The authLimiter skip function must exempt GET requests by method,
   * NOT by path. Path-based exemption (SSO_PATHS) caused GET /auth/me
   * to be counted, depleting the budget during normal browsing.
   */
  it('AUTH-RL-001: authLimiter skip exempts all GET requests (not path-based)', () => {
    // The skip function should check req.method === 'GET', not SSO_PATHS.has(req.path)
    // Match the authLimiter definition and extract its skip function
    const hasMethodBasedSkip = /authLimiter\s*=\s*rateLimit\(\{[\s\S]*?skip:\s*\(req\)\s*=>\s*req\.method\s*===\s*'GET'/;
    expect(appSource).toMatch(hasMethodBasedSkip);
  });

  it('AUTH-RL-002: authLimiter skip does NOT use SSO_PATHS', () => {
    // SSO_PATHS-based skip was the bug — it only exempted /amma-login and /amma-callback
    // but not /me, causing GET /auth/me to deplete the budget
    const ssoPathsInSkip = /authLimiter\s*=\s*rateLimit\(\{[\s\S]*?skip:[\s\S]*?SSO_PATHS/;
    expect(appSource).not.toMatch(ssoPathsInSkip);
  });

  it('AUTH-RL-003: SSO_PATHS constant is removed (no longer needed)', () => {
    // With method-based skip, the SSO_PATHS constant is dead code
    const ssoPathsDecl = /const\s+SSO_PATHS\s*=/;
    expect(appSource).not.toMatch(ssoPathsDecl);
  });

  it('AUTH-RL-004: authLimiter skip also exempts HEAD requests', () => {
    // HEAD requests are safe read-only requests (same as writeLimiter pattern)
    const hasHeadSkip = /authLimiter\s*=\s*rateLimit\(\{[\s\S]*?skip:[\s\S]*?req\.method\s*===\s*'HEAD'/;
    expect(appSource).toMatch(hasHeadSkip);
  });

  it('AUTH-RL-005: authLimiter skip also exempts OPTIONS requests', () => {
    // OPTIONS requests are CORS preflight (same as writeLimiter pattern)
    const hasOptionsSkip = /authLimiter\s*=\s*rateLimit\(\{[\s\S]*?skip:[\s\S]*?req\.method\s*===\s*'OPTIONS'/;
    expect(appSource).toMatch(hasOptionsSkip);
  });

  it('AUTH-RL-006: authLimiter still has rate limit message for POST requests', () => {
    // POST requests (login, register, etc.) must still be rate-limited
    const hasMessage = /authLimiter\s*=\s*rateLimit\(\{[\s\S]*?message:[\s\S]*?RATE_LIMITED/;
    expect(appSource).toMatch(hasMessage);
  });

  it('AUTH-RL-007: authLimiter is mounted on /api/v1/auth routes', () => {
    // authLimiter must be mounted on the auth route prefix
    const authMount = /app\.use\(\s*['"]\/api\/v1\/auth['"]\s*,\s*authLimiter\s*,\s*authRoutes\s*\)/;
    expect(appSource).toMatch(authMount);
  });
});
