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
const STATE_SECRET = process.env.AMMA_SSO_STATE_SECRET || '';
if (!STATE_SECRET && process.env.NODE_ENV === 'production') {
  logger.warn('AMMA_SSO_STATE_SECRET not set — SSO state signing disabled');
}

function walletUrl(path: string): string {
  return `${AMMA_BASE}/${path.replace(/^\//, "")}`;
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

export function buildSsoInitiateUrl(lmsCallbackUrl: string, context?: SsoContext): string {
  if (!STATE_SECRET) {
    throw new Error("AMMA_SSO_STATE_SECRET is required for SSO state signing");
  }

  const state = jwt.sign(
    { purpose: "sso_state", nonce: crypto.randomBytes(16).toString("hex"),
      ...(context?.client === 'mobile' ? {mobile: context} : context ? {link: context} : {}) },
    STATE_SECRET,
    { expiresIn: "5m" },
  );

  const ssoUrl = new URL("/sso/login", AMMA_BASE + "/");
  ssoUrl.searchParams.set("callback", lmsCallbackUrl);
  ssoUrl.searchParams.set("state", state);
  return ssoUrl.toString();
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

/**
 * Validate the state JWT returned in the callback.
 * Throws on invalid signature, expiry, wrong purpose, or replay (JTI reuse).
 */
export function validateState(state: string): SsoContext | undefined {
  const payload = jwt.verify(state, STATE_SECRET, {algorithms: ['HS256']}) as { purpose?: string; nonce?: string; mobile?: unknown; link?: unknown };
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

/**
 * Exchange an assertion token for user identity.
 * Server-to-server call to AmmaWallet /api/v1/sso/verify.
 * Throws on network error, non-2xx response, or replay.
 */
export async function verifyAssertion(assertion: string): Promise<AmmaWalletSSOUser> {
  const verifyUrl = walletUrl("api/v1/sso/verify");

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(verifyUrl, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key":    AMMA_API_KEY,
      },
      body:   JSON.stringify({ assertion }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SSO verify failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return parseSsoIdentity(await res.json());
}
