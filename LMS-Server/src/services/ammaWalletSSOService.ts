/**
 * AmmaWallet SSO service — LMS side (relying party).
 *
 * Implements the two steps LMS is responsible for:
 *   1. Initiate — build the AmmaWallet SSO login URL with a signed state token.
 *   2. Verify  — exchange an assertion token for user identity (server-to-server).
 */

import jwt from "jsonwebtoken";
import crypto from "crypto";
import { StrKey } from '@stellar/stellar-sdk';
import logger from "../utils/logger.js";
import { isMobileSsoContext, type MobileSsoContext } from './mobileSsoService.js';

const AMMA_BASE    = (process.env.AMMA_WALLET_URL || "http://localhost:3001").replace(/\/$/, "");
const AMMA_API_KEY = process.env.AMMA_WALLET_API_KEY || "";

// LMS-SSO-002: Separate secret for signing state nonces — no JWT_SECRET fallback.
// AUTH-14: this secret is the LMS's own. It signs and checks only the LMS `state`; it is never
// used for Amma assertions, so it does not have to equal Amma's SSO_SECRET. During a rotation,
// AMMA_SSO_STATE_SECRET_PREVIOUS is accepted for checking (never signing) so logins already in
// flight still finish. Remove it once the state lifetime has passed.
const STATE_SECRET = process.env.AMMA_SSO_STATE_SECRET || '';
const PREVIOUS_STATE_SECRET = process.env.AMMA_SSO_STATE_SECRET_PREVIOUS || '';
if (!STATE_SECRET && process.env.NODE_ENV === 'production') {
  logger.warn('AMMA_SSO_STATE_SECRET not set — SSO state signing disabled');
} else if (STATE_SECRET && STATE_SECRET.length < 32 && process.env.NODE_ENV === 'production') {
  logger.warn('AMMA_SSO_STATE_SECRET is shorter than 32 characters — generate one with: openssl rand -hex 32');
}

/** State lifetime. AUTH-14 suggests 10 minutes; the browser binding cookie lives as long. */
export const SSO_STATE_TTL_SECONDS = 10 * 60;

function walletUrl(path: string): string {
  return `${AMMA_BASE}/${path.replace(/^\//, "")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initiate
// ─────────────────────────────────────────────────────────────────────────────

export interface WalletLinkContext {
  client: 'link';
  userId: string;
  authorizationVersion: number;
  sessionHash: string;
  sessionExpires: number;
}

export type SsoContext = MobileSsoContext | WalletLinkContext;

function isWalletLinkContext(value: unknown): value is WalletLinkContext {
  if (!value || typeof value !== 'object') return false;
  const link = value as WalletLinkContext;
  return link.client === 'link' && typeof link.userId === 'string' && link.userId.length > 0
    && Number.isSafeInteger(link.authorizationVersion) && link.authorizationVersion >= 0
    && typeof link.sessionHash === 'string' && /^[a-f0-9]{64}$/.test(link.sessionHash)
    && Number.isSafeInteger(link.sessionExpires) && link.sessionExpires > Date.now() / 1000;
}

export interface SsoInitiation {
  /** Where to send the browser (Amma's SSO login page). */
  url: string;
  /** The signed state for this attempt. Never log it. */
  state: string;
}

/**
 * Build the AmmaWallet SSO login URL that the browser should be redirected to.
 * The state parameter is a short-lived signed JWT. The caller must also bind it to the
 * browser with setStateBindingCookie() (AUTH-14 section 2.2).
 *
 * @param lmsCallbackUrl  Full HTTPS URL of the LMS /auth/amma-callback endpoint.
 */
export function buildSsoInitiateUrl(lmsCallbackUrl: string, context?: SsoContext): SsoInitiation {
  if (!STATE_SECRET) {
    throw new Error("AMMA_SSO_STATE_SECRET is required for SSO state signing");
  }

  const state = jwt.sign(
    { purpose: "sso_state", nonce: crypto.randomBytes(16).toString("hex"),
      ...(context?.client === 'mobile' ? {mobile: context} : context ? {link: context} : {}) },
    STATE_SECRET,
    { expiresIn: SSO_STATE_TTL_SECONDS },
  );

  const ssoUrl = new URL("/sso/login", AMMA_BASE + "/");
  ssoUrl.searchParams.set("callback", lmsCallbackUrl);
  ssoUrl.searchParams.set("state", state);
  return { url: ssoUrl.toString(), state };
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser binding — AUTH-14 2.2: the state must belong to the browser that started the login
// ─────────────────────────────────────────────────────────────────────────────

/*
 * At login start the LMS sets an HttpOnly cookie holding a digest of the issued state. At the
 * callback it compares the query state with that digest in constant time and clears the cookie.
 * A callback URL opened in a different browser (login CSRF, or a leaked URL) has no matching
 * cookie and is refused before Amma is called. Single use comes from the nonce cache below plus
 * the cookie being cleared. Nothing is held in server memory, so a restart or a second process
 * does not break logins that are in flight.
 *
 * On HTTPS the cookie uses the __Host- prefix (Secure, Path=/, no Domain), so a sibling subdomain
 * cannot plant one. The cookie value is a digest, not the state itself.
 */
const SECURE_BINDING_COOKIE = '__Host-lms_sso_state';
const PLAIN_BINDING_COOKIE = 'lms_sso_state'; // plain-HTTP local development only

export type StateBindingMode = 'required' | 'optional';

/**
 * AMMA_SSO_STATE_BINDING=optional is an emergency fallback only: a callback with no binding
 * cookie is logged and allowed (a cookie that does not match is still refused). Default: required.
 */
export function stateBindingMode(): StateBindingMode {
  return (process.env.AMMA_SSO_STATE_BINDING || '').trim().toLowerCase() === 'optional' ? 'optional' : 'required';
}

function bindingDigest(state: string): string {
  return crypto.createHash('sha256').update(state, 'utf8').digest('base64url');
}

function isSecureCallback(callbackUrl: string): boolean {
  try { return new URL(callbackUrl).protocol === 'https:'; } catch { return true; }
}

interface CookieWriter {
  cookie(name: string, value: string, options: Record<string, unknown>): unknown;
  clearCookie(name: string, options: Record<string, unknown>): unknown;
}

function bindingCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
}

export function setStateBindingCookie(res: CookieWriter, state: string, callbackUrl: string): void {
  const secure = isSecureCallback(callbackUrl);
  res.cookie(secure ? SECURE_BINDING_COOKIE : PLAIN_BINDING_COOKIE, bindingDigest(state),
    { ...bindingCookieOptions(secure), maxAge: SSO_STATE_TTL_SECONDS * 1000 });
}

export function clearStateBindingCookie(res: CookieWriter, callbackUrl: string): void {
  const secure = isSecureCallback(callbackUrl);
  res.clearCookie(secure ? SECURE_BINDING_COOKIE : PLAIN_BINDING_COOKIE, bindingCookieOptions(secure));
}

/** Read the binding cookie from a raw Cookie header. Several cookies with that name count as none. */
export function readStateBindingCookie(cookieHeader: string | undefined, callbackUrl: string): string | undefined {
  if (!cookieHeader) return undefined;
  const name = isSecureCallback(callbackUrl) ? SECURE_BINDING_COOKIE : PLAIN_BINDING_COOKIE;
  const values = cookieHeader.split(';').map(part => part.trim())
    .filter(part => part.startsWith(name + '='))
    .map(part => part.slice(name.length + 1));
  return values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(values[0]) ? values[0] : undefined;
}

export type StateBindingResult = 'bound' | 'missing' | 'mismatch';

/** Compare the callback's query state with the browser's binding cookie, in constant time. */
export function checkStateBinding(cookieValue: string | undefined, state: string): StateBindingResult {
  if (!cookieValue) return 'missing';
  const expected = Buffer.from(bindingDigest(state));
  const actual = Buffer.from(cookieValue);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected) ? 'bound' : 'mismatch';
}

// ─────────────────────────────────────────────────────────────────────────────
// State validation — FIND-003a: JTI blacklist prevents replay within 5-min window
// ─────────────────────────────────────────────────────────────────────────────

// In-memory used-JTI set. Entries auto-expire after 11 minutes (> 10-min state TTL).
// Single-instance deployment (documented requirement from FIND-SSO-001).
const usedJtis = new Map<string, number>(); // jti → expiry timestamp (ms)
const JTI_RETENTION_MS = (SSO_STATE_TTL_SECONDS + 60) * 1000;

function cleanupExpiredJtis(): void {
  const now = Date.now();
  for (const [jti, expiry] of usedJtis) {
    if (now > expiry) usedJtis.delete(jti);
  }
}

// Cleanup every 2 minutes
setInterval(cleanupExpiredJtis, 2 * 60 * 1000).unref();

/**
 * Validate the state JWT returned in the callback.
 * Throws on invalid signature, expiry, wrong purpose, or replay (JTI reuse).
 */
type StatePayload = { purpose?: string; nonce?: string; mobile?: unknown; link?: unknown };

function verifyStateSignature(state: string): StatePayload {
  if (!STATE_SECRET) throw new Error('AMMA_SSO_STATE_SECRET is required for SSO state checks');
  try {
    return jwt.verify(state, STATE_SECRET, {algorithms: ['HS256']}) as StatePayload;
  } catch (error) {
    // Only a bad signature may fall back to the previous secret; an expired state stays expired.
    if (!PREVIOUS_STATE_SECRET || !(error instanceof jwt.JsonWebTokenError) || error instanceof jwt.TokenExpiredError
      || error.message !== 'invalid signature') throw error;
    return jwt.verify(state, PREVIOUS_STATE_SECRET, {algorithms: ['HS256']}) as StatePayload;
  }
}

export function validateState(state: string): SsoContext | undefined {
  const payload = verifyStateSignature(state);
  if (payload.purpose !== "sso_state") {
    throw new Error("Invalid state token — wrong purpose");
  }

  // FIND-003a: Prevent replay by tracking used nonces (acting as JTI)
  const jti = payload.nonce;
  if (!jti) {
    throw new Error("Invalid state token — missing nonce");
  }
  if (usedJtis.has(jti)) {
    throw new Error("State token already used — replay detected");
  }
  if (payload.mobile !== undefined && !isMobileSsoContext(payload.mobile)) {
    throw new Error('Invalid native SSO context');
  }
  if ((payload.link !== undefined && !isWalletLinkContext(payload.link))
    || (payload.link !== undefined && payload.mobile !== undefined)) {
    throw new Error('Invalid wallet linking context');
  }
  usedJtis.set(jti, Date.now() + JTI_RETENTION_MS);
  return (payload.mobile ?? payload.link) as SsoContext | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertion verification
// ─────────────────────────────────────────────────────────────────────────────

export interface AmmaWalletSSOUser {
  userId:               string; // AmmaWallet numeric user ID (as string)
  email:                string | null;
  firstName:            string | null;
  lastName:             string | null;
  isEmailVerified:      boolean;
  mainnetWalletAddress: string | null; // Stellar public key if user has an active mainnet wallet
}

/** Validate the provider response at the trust boundary, before any database write. */
export function parseSsoIdentity(value: unknown): AmmaWalletSSOUser {
  if (!value || typeof value !== 'object') throw new Error('Invalid Wallet identity');
  const user = value as AmmaWalletSSOUser;
  if (typeof user.userId !== 'string' || !user.userId.trim() || user.userId.length > 128
    || user.userId !== user.userId.trim()
    || !(user.email === null || typeof user.email === 'string')
    || typeof user.isEmailVerified !== 'boolean'
    || ![user.firstName, user.lastName].every(name => name === null || (typeof name === 'string' && name.length <= 200))
    || !(user.mainnetWalletAddress === null || (typeof user.mainnetWalletAddress === 'string'
      && StrKey.isValidEd25519PublicKey(user.mainnetWalletAddress)))) {
    throw new Error('Invalid Wallet identity');
  }
  return user;
}

// ─────────────────────────────────────────────────────────────────────────────
// /sso/verify failures — AUTH-14 section 2.3
// ─────────────────────────────────────────────────────────────────────────────

/** The `error` texts Amma documents for /sso/verify. Anything else is logged as `unrecognised`. */
const KNOWN_VERIFY_ERRORS = [
  'state is required',
  'state must be a string of at most 4096 characters',
  'Invalid or missing API key',
  'Invalid or expired assertion',
  'SSO verify needs a tenant API key',
  'API key missing required scope: sso:verify',
  'Assertion already used',
  'API key rate limit exceeded',
  'SSO not configured',
] as const;

/**
 * What the LMS does about a failure:
 * - `request_rejected`: 400, a bug on the LMS side. Generic error, alert.
 * - `config`: bad or wrong kind of key, missing scope, Amma not configured. "Try again later", alert.
 * - `assertion_rejected`: 401 bad/expired assertion or state mismatch. User starts again.
 * - `already_used`: 409. No second login.
 * - `rate_limited`: 429 after one retry. "Try again later".
 * - `unavailable`: 5xx, timeout, network error, unexpected status. "Try again later", alert.
 * - `invalid_response`: 2xx with a body that is not a valid identity.
 */
export type SsoVerifyFailure = 'request_rejected' | 'config' | 'assertion_rejected' | 'already_used'
  | 'rate_limited' | 'unavailable' | 'invalid_response';

export class SsoVerifyError extends Error {
  constructor(
    readonly failure: SsoVerifyFailure,
    readonly status: number | null,
    /** Amma's `error` text if it is one of the documented ones, else 'unrecognised' or 'none'. Safe to log. */
    readonly ammaError: string,
  ) {
    super(`SSO verify failed (${status ?? 'network'})`);
    this.name = 'SsoVerifyError';
  }
}

function classifyVerifyFailure(status: number, ammaError: string): SsoVerifyFailure {
  if (status === 400) return 'request_rejected';
  if (status === 401) return ammaError === 'Invalid or missing API key' ? 'config' : 'assertion_rejected';
  if (status === 403) return 'config';
  if (status === 409) return 'already_used';
  if (status === 429) return 'rate_limited';
  if (status === 503 && ammaError === 'SSO not configured') return 'config';
  return 'unavailable';
}

async function readAmmaError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (text.length > 2048) return 'unrecognised';
    const value = (JSON.parse(text) as { error?: unknown })?.error;
    if (typeof value !== 'string') return 'none';
    return (KNOWN_VERIFY_ERRORS as readonly string[]).includes(value) ? value : 'unrecognised';
  } catch {
    return 'none';
  }
}

/** Delay before the single retry after a 429. Exported for tests. */
export const verifyRetryPolicy = { rateLimitDelayMs: 1500 };

/**
 * Exchange an assertion token for user identity.
 * Server-to-server call to AmmaWallet /api/v1/sso/verify, sending the state that this browser
 * started the login with (AUTH-14 2.2). Amma ignores `state` while its switch is off.
 * Retries once after a 429; never retries anything else. Throws SsoVerifyError on failure.
 * The error never carries the assertion, the state, the key or Amma's raw response body.
 */
export async function verifyAssertion(assertion: string, state: string): Promise<AmmaWalletSSOUser> {
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(walletUrl("api/v1/sso/verify"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": AMMA_API_KEY,
        },
        body: JSON.stringify({ assertion, state }),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new SsoVerifyError('unavailable', null, 'none');
    }

    if (!res.ok) {
      const ammaError = await readAmmaError(res);
      const failure = classifyVerifyFailure(res.status, ammaError);
      if (failure === 'rate_limited' && attempt === 1) {
        await new Promise(resolve => setTimeout(resolve, verifyRetryPolicy.rateLimitDelayMs));
        continue;
      }
      throw new SsoVerifyError(failure, res.status, ammaError);
    }

    const identity = await res.json().catch(() => {
      throw new SsoVerifyError('invalid_response', res.status, 'none');
    });
    try {
      return parseSsoIdentity(identity);
    } catch {
      throw new SsoVerifyError('invalid_response', res.status, 'none');
    }
  }
}
