import { describe, it, expect, vi } from "vitest";

// Mock config before importing module under test
vi.mock("../config", () => ({
  config: {
    TOTP_ENCRYPTION_KEY: "a11b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b",
  },
}));

import { encryptTotpSecret, decryptTotpSecret } from "./totp-crypto";

describe("TOTP secret encryption", () => {
  const testSecret = "JBSWY3DPEHPK3PXP"; // sample base32 TOTP secret

  it("round-trip: decrypt(encrypt(secret)) returns original secret", () => {
    const encrypted = encryptTotpSecret(testSecret);
    const decrypted = decryptTotpSecret(encrypted);
    expect(decrypted).toBe(testSecret);
  });

  it("encrypted value differs from plaintext", () => {
    const encrypted = encryptTotpSecret(testSecret);
    expect(encrypted).not.toBe(testSecret);
  });

  it("each encryption produces a different ciphertext (random IV)", () => {
    const a = encryptTotpSecret(testSecret);
    const b = encryptTotpSecret(testSecret);
    expect(a).not.toBe(b);
  });

  it("decrypting tampered ciphertext throws", () => {
    const encrypted = encryptTotpSecret(testSecret);
    const tampered = encrypted.slice(0, -2) + "XX";
    expect(() => decryptTotpSecret(tampered)).toThrow();
  });

  it("encrypted output is valid base64", () => {
    const encrypted = encryptTotpSecret(testSecret);
    expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
    expect(Buffer.from(encrypted, "base64").toString("base64")).toBe(encrypted);
  });
});
