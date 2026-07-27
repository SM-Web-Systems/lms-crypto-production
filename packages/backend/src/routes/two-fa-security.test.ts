import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("2FA code generation — CSPRNG (P0-1-F8)", () => {
  const authSrc = readFileSync(join(__dirname, "auth.ts"), "utf-8");
  const twoFaSrc = readFileSync(join(__dirname, "two-fa.ts"), "utf-8");

  it("auth.ts does not use Math.random() for code generation", () => {
    // Find all Math.random usages — none should remain
    const matches = authSrc.match(/Math\.random\(\)/g);
    expect(matches).toBeNull();
  });

  it("two-fa.ts does not use Math.random() for code generation", () => {
    const matches = twoFaSrc.match(/Math\.random\(\)/g);
    expect(matches).toBeNull();
  });

  it("auth.ts uses crypto.randomInt for email 2FA code", () => {
    expect(authSrc).toContain("crypto.randomInt(100000, 1000000)");
  });

  it("two-fa.ts uses crypto.randomInt for email 2FA code", () => {
    expect(twoFaSrc).toContain("crypto.randomInt(100000, 1000000)");
  });
});
