import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

// Generate a real test ES256 key pair
const testKeyPair = crypto.generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const mockConfig = vi.hoisted(() => ({
  OAUTH_SIGNING_KEY: "",
  OAUTH_SIGNING_KID: "test-kid-001",
}));

vi.mock("../../config", () => ({ config: mockConfig }));

// Import AFTER mocks
import { signOAuthToken, verifyOAuthToken, getJwks, getSigningKid } from "../../lib/oauth-signing";

describe("OAuth ES256 Signing", () => {
  beforeEach(() => {
    mockConfig.OAUTH_SIGNING_KEY = testKeyPair.privateKey;
  });

  it("SIGN-01: signs a token with ES256 that can be verified", () => {
    const token = signOAuthToken(
      { sub: "42", aud: "test-client", iss: "ammawallet", email: "test@example.com" },
      900,
    );
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const decoded = verifyOAuthToken(token);
    expect(decoded.sub).toBe("42");
    expect(decoded.aud).toBe("test-client");
    expect(decoded.iss).toBe("ammawallet");
    expect(decoded.email).toBe("test@example.com");
    expect(decoded.jti).toBeTruthy();
  });

  it("SIGN-02: token header contains alg=ES256 and kid", () => {
    const token = signOAuthToken({ sub: "1", aud: "x", iss: "ammawallet" }, 60);
    const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    expect(header.alg).toBe("ES256");
    expect(header.kid).toBe("test-kid-001");
  });

  it("SIGN-03: rejects a token signed with wrong key", async () => {
    const wrongKey = crypto.generateKeyPairSync("ec", {
      namedCurve: "P-256",
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const jwt = await import("jsonwebtoken");
    const badToken = jwt.default.sign({ sub: "1", aud: "x", iss: "ammawallet" }, wrongKey.privateKey, {
      algorithm: "ES256",
    });
    expect(() => verifyOAuthToken(badToken)).toThrow();
  });

  it("SIGN-04: rejects an expired token", () => {
    const token = signOAuthToken({ sub: "1", aud: "x", iss: "ammawallet" }, -1);
    expect(() => verifyOAuthToken(token)).toThrow(/expired/i);
  });

  it("SIGN-05: each token gets a unique jti", () => {
    const t1 = signOAuthToken({ sub: "1", aud: "x", iss: "ammawallet" }, 60);
    const t2 = signOAuthToken({ sub: "1", aud: "x", iss: "ammawallet" }, 60);
    const d1 = verifyOAuthToken(t1);
    const d2 = verifyOAuthToken(t2);
    expect(d1.jti).not.toBe(d2.jti);
  });
});

describe("JWKS Endpoint Output", () => {
  beforeEach(() => {
    mockConfig.OAUTH_SIGNING_KEY = testKeyPair.privateKey;
  });

  it("JWKS-01: returns a valid JWK Set with one key", () => {
    const jwks = getJwks();
    expect(jwks.keys).toHaveLength(1);
    const key = jwks.keys[0];
    expect(key.kty).toBe("EC");
    expect(key.crv).toBe("P-256");
    expect(key.alg).toBe("ES256");
    expect(key.use).toBe("sig");
    expect(key.kid).toBe("test-kid-001");
    expect(key.x).toBeTruthy();
    expect(key.y).toBeTruthy();
    // Must NOT contain the private key component
    expect(key.d).toBeUndefined();
  });

  it("JWKS-02: getSigningKid returns the configured kid", () => {
    expect(getSigningKid()).toBe("test-kid-001");
  });
});
