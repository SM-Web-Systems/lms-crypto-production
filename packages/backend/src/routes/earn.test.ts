import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("../db", () => ({
  db: {
    insert: vi.fn(),
    delete: vi.fn(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  },
  schema: {},
}));

vi.mock("../config", () => ({
  config: {
    HORIZON_URL: "https://horizon-testnet.stellar.org",
    STELLAR_NETWORK: "testnet",
    JWT_SECRET: "test-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
  },
}));

vi.mock("@stellar/stellar-sdk", () => {
  const mockServer = {
    liquidityPools: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    call: vi.fn().mockResolvedValue({ records: [] }),
    loadAccount: vi.fn().mockResolvedValue({
      balances: [],
      subentry_count: 0,
    }),
  };
  return {
    Horizon: {
      Server: vi.fn().mockImplementation(function () { return mockServer; }),
    },
    Asset: { native: vi.fn() },
    TransactionBuilder: vi.fn(),
    Operation: { liquidityPoolDeposit: vi.fn(), liquidityPoolWithdraw: vi.fn() },
    BASE_FEE: "100",
    Networks: { TESTNET: "Test SDF Network ; September 2015", PUBLIC: "Public Global Stellar Network ; September 2015" },
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
