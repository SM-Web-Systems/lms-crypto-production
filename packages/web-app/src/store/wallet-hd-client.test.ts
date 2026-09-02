import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const walletSrc = readFileSync(join(__dirname, "wallet.ts"), "utf-8");

describe("P0-3-F2: HD derivation happens client-side, not via server", () => {
  it("does not call keypairApi.fromMnemonic", () => {
    expect(walletSrc).not.toContain("keypairApi.fromMnemonic");
  });

  it("does not call keypairApi.validateMnemonic", () => {
    expect(walletSrc).not.toContain("keypairApi.validateMnemonic");
  });

  it("imports deriveHDKeypair from hd-wallet", () => {
    expect(walletSrc).toMatch(/from\s+["']\.\.\/lib\/hd-wallet["']/);
  });

  it("calls deriveHDKeypair for HD wallet creation", () => {
    expect(walletSrc).toContain("deriveHDKeypair(");
  });

  it("calls isValidMnemonic for mnemonic validation", () => {
    expect(walletSrc).toContain("isValidMnemonic(");
  });
});
