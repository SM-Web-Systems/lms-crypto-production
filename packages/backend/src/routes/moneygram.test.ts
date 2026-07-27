// packages/backend/src/routes/moneygram.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

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
    MONEYGRAM_RAMPS_URL: "https://extstellar.moneygram.com/ramps",
    MONEYGRAM_RAMPS_DOMAIN: "extstellar.moneygram.com",
    SIGNING_SECRET_KEY: "SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE6PNVPZ7ZTLHGM3AGAZYASP",
    SIGNING_PUBLIC_KEY: "GCTEST123",
    STELLAR_NETWORK: "testnet",
    FIAT_RAMP_FEE_PERCENT: 1.5,
    HORIZON_URL: "https://horizon-testnet.stellar.org",
    JWT_SECRET: "test-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
  },
}));

vi.mock("@stellar/stellar-sdk", () => ({
  Horizon: { Server: vi.fn(() => ({})) },
  Keypair: { fromSecret: vi.fn(() => ({ sign: vi.fn() })) },
  TransactionBuilder: { fromXDR: vi.fn(() => ({ sign: vi.fn(), toXDR: vi.fn(() => "xdr") })) },
  Networks: { TESTNET: "Test SDF Network ; September 2015", PUBLIC: "Public Global Stellar Network ; September 2015" },
}));

import Fastify from "fastify";
import { moneygramRoutes } from "./moneygram";

describe("MoneyGram routes — auth enforcement", () => {
  const app = Fastify();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  app.register(moneygramRoutes);

  it("POST /api/v1/moneygram/deposit returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/moneygram/deposit",
      payload: { publicKey: "GABC123" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });

  it("POST /api/v1/moneygram/withdraw returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/moneygram/withdraw",
      payload: { publicKey: "GABC123", amount: "100" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });

  it("GET /api/v1/moneygram/transaction/:id returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/moneygram/transaction/txn_123",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });

  it("GET /api/v1/moneygram/info remains accessible without auth (public config)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/moneygram/info",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("provider", "MoneyGram");
  });
});
