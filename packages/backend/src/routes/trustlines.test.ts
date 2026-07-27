import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/stellar-client", () => ({
  stellarClient: {
    horizon: {
      loadAccount: vi.fn().mockResolvedValue({
        balances: [
          { asset_type: "native", balance: "100.0000000" },
        ],
        subentry_count: 1,
      }),
    },
    networkPassphrase: "Test SDF Network ; September 2015",
  },
}));

vi.mock("../modules/tokens/token.service", () => ({
  TokenService: vi.fn().mockImplementation(function () {
    return { ensureToken: vi.fn().mockResolvedValue(undefined) };
  }),
}));

vi.mock("@stellar/stellar-sdk", () => {
  const mockTx = {
    toXDR: vi.fn().mockReturnValue("mock-xdr-base64"),
    sign: vi.fn(),
  };
  const mockBuilder = {
    addOperation: vi.fn().mockReturnThis(),
    setTimeout: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue(mockTx),
  };
  return {
    Asset: vi.fn(),
    TransactionBuilder: vi.fn().mockImplementation(function () { return mockBuilder; }),
    Operation: {
      changeTrust: vi.fn().mockReturnValue({}),
    },
    BASE_FEE: "100",
  };
});

import Fastify from "fastify";
import { trustlineRoutes } from "./trustlines";

describe("Trustline routes — secret key exclusion", () => {
  it("POST /api/v1/trustlines/add response does NOT echo back any secret key", async () => {
    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/add",
      payload: {
        publicKey: "GABC123",
        assetCode: "USDC",
        assetIssuer: "GDEF456",
        secretKey: "SXXX_should_be_ignored",
      },
    });

    const body = res.json();
    expect(body).not.toHaveProperty("secretKey");
    expect(body).not.toHaveProperty("secret");
  });

  it("POST /api/v1/trustlines/add returns XDR without requiring secret", async () => {
    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/add",
      payload: {
        publicKey: "GABC123",
        assetCode: "USDC",
        assetIssuer: "GDEF456",
      },
    });

    const body = res.json();
    expect(body).toHaveProperty("xdr");
    expect(body).toHaveProperty("networkPassphrase");
  });
});
