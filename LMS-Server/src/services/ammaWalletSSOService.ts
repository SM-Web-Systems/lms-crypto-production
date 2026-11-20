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

// Read at call time so config is the live process env (and tests can point at a fake Amma).
const ammaBase   = () => (process.env.AMMA_WALLET_URL || "http://localhost:3001").replace(/\/$/, "");
const ammaApiKey = () => process.env.AMMA_WALLET_API_KEY || "";

// LMS-SSO-002: Separate secret for signing state nonces — no JWT_SECRET fallback.
const STATE_SECRET = process.env.AMMA_SSO_STATE_SECRET || '';
if (!STATE_SECRET && process.env.NODE_ENV === 'production') {
  logger.warn('AMMA_SSO_STATE_SECRET not set — SSO state signing disabled');
}

function walletUrl(path: string): string {
  return `${ammaBase()}/${path.replace(/^\//, "")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initiate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the AmmaWallet SSO login URL that the browser should be redirected to.
 * The state parameter is a short-lived signed JWT — no server-side state needed.
 *
 * @param lmsCallbackUrl  Full HTTPS URL of the LMS /auth/amma-callback endpoint.
 */
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
  url: string;
  /** The signed state put in the URL. Bind it to the browser with {@link stateBindingCookie}. */
  state: string;
}

export function buildSsoInitiateUrl(lmsCallbackUrl: string, context?: SsoContext): SsoInitiation {
  if (!STATE_SECRET) {
    throw new Error("AMMA_SSO_STATE_SECRET is required for SSO state signing");
  }

  const state = jwt.sign(
    { purpose: "sso_state", nonce: crypto.randomBytes(16).toString("hex"),
      ...(context?.client === 'mobile' ? {mobile: context} : context ? {link: context} : {}) },
    STATE_SECRET,
    { expiresIn: "5m" },
  );

  const ssoUrl = new URL("/sso/login", ammaBase() + "/");
  ssoUrl.searchParams.set("callback", lmsCallbackUrl);
  ssoUrl.searchParams.set("state", state);
  return { url: ssoUrl.toString(), state };
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser binding (AUTH-14): the callback URL carries assertion and state together,
// so the state alone proves nothing about who opened it. The browser that started
// the login also holds a cookie with sha256(state); the callback must present both.
// ─────────────────────────────────────────────────────────────────────────────

export const SSO_STATE_COOKIE = 'lms_sso_state';
export const SSO_STATE_COOKIE_PATH = '/api/v1/auth/amma-callback';
const SSO_STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

const sha256Hex = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** Options for `res.cookie` / `res.clearCookie`. Path is narrowed to the callback only. */
export function stateCookieOptions(includeMaxAge = true) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: SSO_STATE_COOKIE_PATH,
    ...(includeMaxAge ? { maxAge: SSO_STATE_COOKIE_MAX_AGE_MS } : {}),
  };
}

/** The cookie value for a freshly issued state: a hash, so the cookie never holds the state itself. */
export function stateBindingCookie(state: string): string {
  return sha256Hex(state);
}

/** Read one cookie from a raw Cookie header (no cookie-parser on this server). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

/** Constant-time check that the cookie from the browser matches sha256 of the query state. */
export function stateMatchesBinding(state: string, cookieValue: string | undefined): boolean {
  if (!cookieValue || !/^[a-f0-9]{64}$/.test(cookieValue)) return false;
  return crypto.timingSafeEqual(Buffer.from(sha256Hex(state), 'hex'), Buffer.from(cookieValue, 'hex'));
}

// ─────────────────────────────────────────────────────────────────────────────
// State validation — FIND-003a: JTI blacklist prevents replay within 5-min window
// ─────────────────────────────────────────────────────────────────────────────

// In-memory used-JTI set. Entries auto-expire after 6 minutes (> 5-min JWT TTL).
// Single-instance deployment (documented requirement from FIND-SSO-001).
const usedJtis = new Map<string, number>(); // jti → expiry timestamp (ms)
const JTI_RETENTION_MS = 6 * 60 * 1000; // 6 minutes

function cleanupExpiredJtis(): void {
  const now = Date.now();
  for (const [jti, expiry] of usedJtis) {
    if (now > expiry) usedJtis.delete(jti);
  }
}

// Cleanup every 2 minutes
setInterval(cleanupExpiredJtis, 2 * 60 * 1000).unref();

export interface InspectedState {
  nonce: string;
  context: SsoContext | undefined;
}

/**
 * Check the state JWT's signature, expiry, purpose and context without spending
 * its nonce. Lets the callback learn where to send an error (mobile, link or web)
 * before it has decided to accept the attempt, so a request without the browser
 * cookie cannot burn the real user's state.
 */
export function inspectState(state: string): InspectedState {
  const payload = jwt.verify(state, STATE_SECRET, {algorithms: ['HS256']}) as { purpose?: string; nonce?: string; mobile?: unknown; link?: unknown };
  if (payload.purpose !== "sso_state") {
    throw new Error("Invalid state token — wrong purpose");
  }

  // FIND-003a: Prevent replay by tracking used nonces (acting as JTI)
  const jti = payload.nonce;
  if (!jti) {
    throw new Error("Invalid state token — missing nonce");
  }
  if (payload.mobile !== undefined && !isMobileSsoContext(payload.mobile)) {
    throw new Error('Invalid native SSO context');
  }
  if ((payload.link !== undefined && !isWalletLinkContext(payload.link))
    || (payload.link !== undefined && payload.mobile !== undefined)) {
    throw new Error('Invalid wallet linking context');
  }
  return { nonce: jti, context: (payload.mobile ?? payload.link) as SsoContext | undefined };
}

/** Spend a state nonce. Throws if it was already used (replay). */
export function consumeStateNonce(nonce: string): void {
  if (usedJtis.has(nonce)) {
    throw new Error("State token already used — replay detected");
  }
  usedJtis.set(nonce, Date.now() + JTI_RETENTION_MS);
}

/**
 * Validate the state JWT returned in the callback and spend its nonce.
 * Throws on invalid signature, expiry, wrong purpose, or replay (JTI reuse).
 */
export function validateState(state: string): SsoContext | undefined {
  const { nonce, context } = inspectState(state);
  consumeStateNonce(nonce);
  return context;
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
// Verify errors (AUTH-14 brief 2.3)
// ─────────────────────────────────────────────────────────────────────────────

/** Amma `error` strings we recognise. Anything else is logged as "unrecognised", never verbatim. */
const KNOWN_VERIFY_ERRORS = new Set([
  'state is required',
  'state must be a string of at most 4096 characters',
  'Invalid or missing API key',
  'Invalid or expired assertion',
  'SSO verify needs a tenant API key',
  'API key missing required scope: sso:verify',
  'Assertion already used',
  'API key rate limit exceeded',
  'Too many requests',
  'SSO not configured',
]);

/**
 * What the user should be told.
 * - `assertion_failed`: this login cannot be used; start again.
 * - `already_used`: Amma has already accepted this assertion once (double click, second tab).
 * - `service_unavailable`: our config or Amma is broken; not the user's fault, try later.
 */
export type SsoVerifyFailure = 'assertion_failed' | 'already_used' | 'service_unavailable';

/** Fixed event name for log-based alerting on failures the team must act on. */
export const SSO_VERIFY_ALERT_EVENT = 'amma_sso_verify_alert';

export class SsoVerifyError extends Error {
  constructor(
    readonly failure: SsoVerifyFailure,
    readonly status: number | null,
    readonly providerError: string | null,
    /** True when the team should be alerted (config, key, scope or provider outage). */
    readonly alert: boolean,
  ) {
    super(`SSO verify failed (${status ?? 'network'})`);
    this.name = 'SsoVerifyError';
  }
}

async function readProviderError(res: Response): Promise<string | null> {
  try {
    const text = await res.text();
    if (text.length > 4096) return 'unrecognised';
    const body = JSON.parse(text) as { error?: unknown };
    if (typeof body?.error !== 'string') return null;
    return KNOWN_VERIFY_ERRORS.has(body.error) ? body.error : 'unrecognised';
  } catch {
    return null;
  }
}

function classifyVerifyFailure(status: number, providerError: string | null): SsoVerifyError {
  if (status === 401 && providerError !== 'Invalid or missing API key') {
    // Bad, expired, wrong-tenant or state-mismatched assertion. Amma does not say which.
    return new SsoVerifyError('assertion_failed', status, providerError, false);
  }
  if (status === 409) return new SsoVerifyError('already_used', status, providerError, false);
  // 400 (our bug), 401 bad key, 403 env key / scope, 429 after retry, 5xx and anything else.
  return new SsoVerifyError('service_unavailable', status, providerError, true);
}

export interface VerifyOptions {
  /** Wait before the single retry on 429. Default 1500 ms. */
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Exchange an assertion token for user identity.
 * Server-to-server call to AmmaWallet /api/v1/sso/verify.
 *
 * Sends the browser-bound `state` with the assertion (AUTH-14). Amma ignores it
 * while SSO_AUDIENCE_ENFORCE is off, so this is safe to ship first.
 * Retries once on 429. Throws SsoVerifyError on any provider failure, and plain
 * Error on an invalid success body. Never includes the assertion, state, key or
 * raw provider body in an error or log.
 */
export async function verifyAssertion(assertion: string, state: string, options: VerifyOptions = {}): Promise<AmmaWalletSSOUser> {
  const retryDelayMs = options.retryDelayMs ?? 1500;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(walletUrl("api/v1/sso/verify"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ammaApiKey(),
        },
        body: JSON.stringify({ assertion, state }),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new SsoVerifyError('service_unavailable', null, null, true);
    }

    if (res.ok) {
      const identity = await res.json().catch(() => {
        throw new Error("Invalid Wallet identity response");
      });
      return parseSsoIdentity(identity);
    }

    const providerError = await readProviderError(res);
    if (res.status === 429 && attempt === 1) {
      logger.warn({ module: 'ammaWalletSSO', status: res.status, providerError }, 'SSO verify rate limited; retrying once');
      await sleep(retryDelayMs);
      continue;
    }
    throw classifyVerifyFailure(res.status, providerError);
  }
}
