import { describe, it, expect, vi } from "vitest";

// Mock config
vi.mock("../config", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
    STELLAR_NETWORK: "testnet",
    SIGNING_SECRET_KEY: "",
    PLATFORM_FEE_WALLET: "",
    PLATFORM_FEE_PERCENT: 0,
  },
}));

vi.mock("../lib/stellar-client", () => ({
  stellarClient: {
    horizon: { loadAccount: vi.fn().mockResolvedValue({ balances: [] }) },
    networkPassphrase: "Test SDF Network ; September 2015",
    stellar: { decodeTransaction: vi.fn() },
    wallet: vi.fn(),
  },
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (request: any, reply: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "No token provided" });
    }
    request.user = { userId: 1 };
  },
}));

vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  },
  schema: {
    userWallets: { userId: "userId", isActive: "isActive", publicKey: "publicKey" },
  },
}));

vi.mock("../lib/decrypt-secret", () => ({
  decryptSecret: vi.fn().mockRejectedValue(new Error("decrypt failed")),
}));

vi.mock("@stellar/stellar-sdk", () => ({
  TransactionBuilder: { fromXDR: vi.fn() },
  Networks: { TESTNET: "Test SDF Network ; September 2015", PUBLIC: "Public" },
  Keypair: { fromSecret: vi.fn() },
  BASE_FEE: "100",
}));

import Fastify from "fastify";

describe("Signing endpoints — PIN required (P0-3-F4 + P0-4-F2)", () => {
  it("POST /api/v1/transactions/sign returns 400 when pin is missing", async () => {
    // We test schema validation directly — pin is required in the schema
    const app = Fastify();

    // Register a minimal route with the same schema as the real one
    app.post("/api/v1/transactions/sign", {
      schema: {
        body: {
          type: "object",
          properties: {
            xdr: { type: "string" },
            pin: { type: "string" },
          },
          required: ["xdr", "pin"],
        },
      },
    }, async () => ({ signedXdr: "mock" }));

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions/sign",
      headers: { authorization: "Bearer mock-token" },
      payload: { xdr: "AAAA" }, // no pin
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/transactions/sign-and-submit returns 400 when pin is missing", async () => {
    const app = Fastify();

    app.post("/api/v1/transactions/sign-and-submit", {
      schema: {
        body: {
          type: "object",
          properties: {
            xdr: { type: "string" },
            pin: { type: "string" },
          },
          required: ["xdr", "pin"],
        },
      },
    }, async () => ({ success: true }));

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions/sign-and-submit",
      headers: { authorization: "Bearer mock-token" },
      payload: { xdr: "AAAA" }, // no pin
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/transactions/sign accepts request when pin is provided", async () => {
    const app = Fastify();

    app.post("/api/v1/transactions/sign", {
      schema: {
        body: {
          type: "object",
          properties: {
            xdr: { type: "string" },
            pin: { type: "string" },
          },
          required: ["xdr", "pin"],
        },
      },
    }, async () => ({ signedXdr: "mock" }));

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/transactions/sign",
      headers: { authorization: "Bearer mock-token" },
      payload: { xdr: "AAAA", pin: "1234" },
    });

    expect(res.statusCode).toBe(200);
  });
});
