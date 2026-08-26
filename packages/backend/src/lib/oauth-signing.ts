import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config";

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
