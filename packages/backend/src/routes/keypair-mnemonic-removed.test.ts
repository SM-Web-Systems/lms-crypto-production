import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const serverSrc = readFileSync(join(__dirname, "../server.ts"), "utf-8");

describe("P0-3-F2: mnemonic endpoints removed from backend", () => {
  it("does not have /api/v1/keypair/from-mnemonic endpoint", () => {
    expect(serverSrc).not.toContain("/api/v1/keypair/from-mnemonic");
  });

  it("does not have /api/v1/keypair/validate-mnemonic endpoint", () => {
    expect(serverSrc).not.toContain("/api/v1/keypair/validate-mnemonic");
  });

  it("does not import StellarHDWallet for mnemonic processing", () => {
    // After removal, StellarHDWallet should no longer be imported
    // (it was only used by the mnemonic endpoints)
    expect(serverSrc).not.toContain("StellarHDWallet");
  });
});
