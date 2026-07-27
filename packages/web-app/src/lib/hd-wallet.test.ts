import { describe, it, expect } from "vitest";
import { deriveHDKeypair, isValidMnemonic } from "./hd-wallet";

// BIP39 test vector: 12-word "abandon" mnemonic
// SEP-0005 derivation path: m/44'/148'/accountIndex'
const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("hd-wallet: client-side HD derivation (P0-3-F2)", () => {
  describe("deriveHDKeypair", () => {
    it("derives correct public key for index 0 (SEP-0005 test vector)", () => {
      const { publicKey } = deriveHDKeypair(TEST_MNEMONIC, 0);
      expect(publicKey).toBe(
        "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX"
      );
    });

    it("derives correct public key for index 1", () => {
      const { publicKey } = deriveHDKeypair(TEST_MNEMONIC, 1);
      expect(publicKey).toBe(
        "GDVSYYTUAJ3ACHTPQNSTQBDQ4LDHQCMNY4FCEQH5TJUMSSLWQSTG42MV"
      );
    });

    it("returns a secret key starting with S", () => {
      const { secretKey } = deriveHDKeypair(TEST_MNEMONIC, 0);
      expect(secretKey).toMatch(/^S[A-Z2-7]{55}$/);
    });

    it("throws on invalid mnemonic", () => {
      expect(() => deriveHDKeypair("not a valid mnemonic phrase", 0)).toThrow(
        /invalid mnemonic/i
      );
    });

    it("throws on empty string", () => {
      expect(() => deriveHDKeypair("", 0)).toThrow(/invalid mnemonic/i);
    });
  });

  describe("isValidMnemonic", () => {
    it("returns true for valid 12-word mnemonic", () => {
      expect(isValidMnemonic(TEST_MNEMONIC)).toBe(true);
    });

    it("returns false for garbage input", () => {
      expect(isValidMnemonic("hello world foo bar")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isValidMnemonic("")).toBe(false);
    });
  });
});
