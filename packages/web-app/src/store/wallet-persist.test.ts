import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const walletSrc = readFileSync(join(__dirname, "wallet.ts"), "utf-8");

describe("P0-3-F9: encryptedSecret excluded from localStorage persist", () => {
  it("partialize strips encryptedSecret from accounts before persisting", () => {
    // Find the partialize function
    const partializeMatch = walletSrc.match(/partialize:\s*\(state\)\s*=>\s*\({[\s\S]*?\}\)/);
    expect(partializeMatch).not.toBeNull();

    const partializeBody = partializeMatch![0];

    // Must NOT persist accounts directly (that would include encryptedSecret)
    expect(partializeBody).not.toMatch(/accounts:\s*state\.accounts\s*[,}]/);

    // Must destructure/strip encryptedSecret from each account
    expect(partializeBody).toContain("encryptedSecret");
  });
});
