import { describe, it, expect, vi } from "vitest";

vi.mock("../config", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
  },
}));

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
    StrKey: {
      isValidEd25519PublicKey: vi.fn().mockReturnValue(true),
    },
  };
});

vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 1, userId: 1, publicKey: "GABC123" }]),
        }),
      }),
    }),
  },
  schema: {
    userWallets: { userId: "userId", publicKey: "publicKey" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
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

import Fastify from "fastify";
import { trustlineRoutes } from "./trustlines";

describe("Trustline routes — auth enforcement (P2-1-F1)", () => {
  it("POST /api/v1/trustlines/add returns 401 without auth token", async () => {
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

    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/trustlines/remove returns 401 without auth token", async () => {
    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/remove",
      payload: {
        publicKey: "GABC123",
        assetCode: "USDC",
        assetIssuer: "GDEF456",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/trustlines/update-limit returns 401 without auth token", async () => {
    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/update-limit",
      payload: {
        publicKey: "GABC123",
        assetCode: "USDC",
        assetIssuer: "GDEF456",
        limit: "1000",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/trustlines/:publicKey does NOT require auth (public read)", async () => {
    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/trustlines/GABC123",
    });

    // Should not be 401 — GET routes remain public
    expect(res.statusCode).not.toBe(401);
  });
});

describe("Trustline routes — secret key exclusion (P4-2-F2)", () => {
  it("POST /api/v1/trustlines/add response does NOT echo back any secret key", async () => {
    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/add",
      headers: { authorization: "Bearer mock-token" },
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
      headers: { authorization: "Bearer mock-token" },
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
