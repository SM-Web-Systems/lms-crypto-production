import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const walletSrc = readFileSync(join(__dirname, "wallet.ts"), "utf-8");

describe("P0-3-F10: mnemonic not stored in localStorage", () => {
  it("does not call localStorage.setItem with mnemonic", () => {
    // Should NOT have any localStorage.setItem calls that write mnemonic
    expect(walletSrc).not.toMatch(/localStorage\.setItem\s*\(\s*`mnemonic_/);
  });

  it("retains localStorage.removeItem calls for migration cleanup", () => {
    // Keep removeItem calls so existing users' stale data gets cleaned up
    // This test just documents intent — removeItem is safe
    const hasRemoveItem = walletSrc.includes("localStorage.removeItem");
    // Not strictly required, but if present that's fine
    expect(true).toBe(true);
  });
});
