import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config";

/**
 * Key material cache. Derived from OAUTH_SIGNING_KEY at first use.
 * IMPORTANT: Key rotation requires either a process restart or calling
 * clearKeyCache() to force re-derivation from the (new) env var.
 */
let cachedPublicKeyPem: string | null = null;
let cachedJwk: Record<string, unknown> | null = null;

function getPrivateKey(): string {
  if (!config.OAUTH_SIGNING_KEY) {
    throw new Error("OAUTH_SIGNING_KEY is not configured");
  }
  return config.OAUTH_SIGNING_KEY;
}

function getPublicKeyPem(): string {
  if (!cachedPublicKeyPem) {
    const privKey = crypto.createPrivateKey(getPrivateKey());
    const pubKey = crypto.createPublicKey(privKey);
    cachedPublicKeyPem = pubKey.export({ type: "spki", format: "pem" }) as string;
  }
  return cachedPublicKeyPem;
}

export function getSigningKid(): string {
  return config.OAUTH_SIGNING_KID;
}

export function signOAuthToken(
  payload: Record<string, unknown>,
  expiresInSeconds: number,
): string {
  const jti = crypto.randomUUID();
  return jwt.sign(
    { ...payload, jti },
    getPrivateKey(),
    {
      algorithm: "ES256",
      expiresIn: expiresInSeconds,
      keyid: getSigningKid(),
    },
  );
}

export function verifyOAuthToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, getPublicKeyPem(), {
    algorithms: ["ES256"],
  }) as jwt.JwtPayload;
}

/**
 * Clear the cached public key and JWK. Call after rotating OAUTH_SIGNING_KEY
 * to force re-derivation. In practice, key rotation should be done via
 * process restart (update env var, then restart the container).
 */
export function clearKeyCache(): void {
  cachedPublicKeyPem = null;
  cachedJwk = null;
}

export function getJwks(): { keys: Record<string, unknown>[] } {
  if (!cachedJwk) {
    const pubKeyObj = crypto.createPublicKey(getPublicKeyPem());
    const jwk = pubKeyObj.export({ format: "jwk" });
    cachedJwk = {
      ...jwk,
      alg: "ES256",
      use: "sig",
      kid: getSigningKid(),
    };
  }
  return { keys: [{ ...cachedJwk }] };
}
