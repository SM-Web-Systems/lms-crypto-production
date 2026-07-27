import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("../config", () => ({
  config: {
    HORIZON_URL: "https://horizon-testnet.stellar.org",
    STELLAR_NETWORK: "testnet",
  },
}));

vi.mock("@stellar/stellar-sdk", () => {
  const mockServer = {
    liquidityPools: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    call: vi.fn().mockResolvedValue({ records: [] }),
  };
  return {
    Horizon: { Server: vi.fn(() => mockServer) },
  };
});

import Fastify from "fastify";
import { earnRoutes } from "./earn";

describe("Earn routes — auth enforcement", () => {
  const app = Fastify();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Register routes once
  app.register(earnRoutes);

  it("POST /api/v1/earn/deposit returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/earn/deposit",
      payload: {
        publicKey: "GABC123",
        poolId: "pool123",
        maxAmountA: "100",
        maxAmountB: "100",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });

  it("POST /api/v1/earn/withdraw returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/earn/withdraw",
      payload: {
        publicKey: "GABC123",
        poolId: "pool123",
        shares: "50",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });

  it("GET /api/v1/earn/pools returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/earn/pools",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });

  it("GET /api/v1/earn/positions/GABC123 returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/earn/positions/GABC123",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });
});
