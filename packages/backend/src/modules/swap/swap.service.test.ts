import { beforeEach, describe, it, expect, vi } from "vitest";

// ── Module mocks ─────────────────────────────────────────────────────────────
// Mock stellarClient to avoid config/env validation at import time
vi.mock("../../lib/stellar-client", () => ({
  stellarClient: {
    horizon: {
      strictSendPaths: vi.fn(),
      strictReceivePaths: vi.fn(),
      orderbook: vi.fn(),
      liquidityPools: vi.fn(),
      loadAccount: vi.fn(),
    },
    stellar: {},
    networkPassphrase: "Test SDF Network ; September 2015",
  },
}));

vi.mock("../../lib/cache.js", () => ({
  cache: { get: vi.fn(), set: vi.fn() },
}));

import { SwapService } from "./swap.service";

const service = new SwapService();
const calcPriceImpact = (service as any).calcPriceImpact.bind(service);

describe("SwapService.calcPriceImpact — division by zero guards (P2-3-F2)", () => {
  const asks = [
    { price: "1.5", amount: "100" },
    { price: "1.6", amount: "200" },
  ];

  it('should return "0" when amount is "0"', () => {
    expect(calcPriceImpact(asks, "0")).toBe("0");
  });

  it('should return "0" when amount is negative', () => {
    expect(calcPriceImpact(asks, "-5")).toBe("0");
  });

  it('should return "0" when asks[0].price is "0"', () => {
    const zeroAsks = [{ price: "0", amount: "100" }];
    expect(calcPriceImpact(zeroAsks, "50")).toBe("0");
  });

  it("should return correct price impact for valid inputs", () => {
    const singleAsk = [{ price: "1.5", amount: "1000" }];
    expect(calcPriceImpact(singleAsk, "100")).toBe("0.00");
  });

  it('should return "0" for empty asks array', () => {
    expect(calcPriceImpact([], "100")).toBe("0");
  });
});

describe("SwapService.getBestQuote — amount validation (P2-3-F4)", () => {
  const svc = new SwapService();

  it('should throw for amount "0"', async () => {
    await expect(
      svc.getBestQuote("XLM", null, "USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "0")
    ).rejects.toThrow("amount must be a positive number");
  });

  it("should throw for negative amount", async () => {
    await expect(
      svc.getBestQuote("XLM", null, "USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "-5")
    ).rejects.toThrow("amount must be a positive number");
  });

  it('should throw for non-numeric amount "abc"', async () => {
    await expect(
      svc.getBestQuote("XLM", null, "USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", "abc")
    ).rejects.toThrow("amount must be a positive number");
  });
});
