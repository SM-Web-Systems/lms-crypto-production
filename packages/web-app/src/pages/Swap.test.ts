import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const swapSrc = readFileSync(join(__dirname, "Swap.tsx"), "utf-8");

describe("Swap.tsx — no frontend fee injection (P0-4-F18)", () => {
  it("does not import calculatePlatformFee", () => {
    expect(swapSrc).not.toContain("calculatePlatformFee");
  });

  it("does not contain platform fee payment operation", () => {
    // Should not have a payment op to platformWallet in executeSwap
    const executeSwapBlock = swapSrc.slice(
      swapSrc.indexOf("executeSwap"),
      swapSrc.indexOf("executeSwap") + 2000,
    );
    expect(executeSwapBlock).not.toMatch(/Operation\.payment.*platformWallet|platformWallet.*Operation\.payment/s);
  });

  it("sends full amount without fee deduction", () => {
    // Should use totalSend directly, not netSendAmount
    const executeSwapBlock = swapSrc.slice(
      swapSrc.indexOf("executeSwap"),
      swapSrc.indexOf("executeSwap") + 2000,
    );
    expect(executeSwapBlock).not.toContain("netSendAmount");
    expect(executeSwapBlock).toContain("totalSend");
  });
});
