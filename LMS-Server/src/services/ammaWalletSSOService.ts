/**
 * AmmaWallet SSO service — LMS side (relying party).
 *
 * Implements the two steps LMS is responsible for:
 *   1. Initiate — build the AmmaWallet SSO login URL with a signed state token.
 *   2. Verify  — exchange an assertion token for user identity (server-to-server).
 */

import jwt from "jsonwebtoken";
import crypto from "crypto";
import logger from "../utils/logger.js";

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
export function buildSsoInitiateUrl(lmsCallbackUrl: string): string {
  if (!STATE_SECRET) {
    throw new Error("AMMA_SSO_STATE_SECRET is required for SSO state signing");
  }

  const state = jwt.sign(
    { purpose: "sso_state", nonce: crypto.randomBytes(16).toString("hex") },
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
export function validateState(state: string): void {
  const payload = jwt.verify(state, STATE_SECRET) as { purpose?: string; nonce?: string };
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
  usedJtis.set(jti, Date.now() + JTI_RETENTION_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertion verification
// ─────────────────────────────────────────────────────────────────────────────

export interface AmmaWalletSSOUser {
  userId:               string; // AmmaWallet numeric user ID (as string)
  email:                string;
  firstName:            string | null;
  lastName:             string | null;
  isEmailVerified:      boolean;
  mainnetWalletAddress: string | null; // Stellar public key if user has an active mainnet wallet
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

  return res.json() as Promise<AmmaWalletSSOUser>;
}
