import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbResult = vi.hoisted(() => ({
  rows: [] as any[],
}));

vi.mock("../config", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret",
    STELLAR_NETWORK: "testnet",
  },
}));

vi.mock("../lib/stellar-client", () => ({
  stellarClient: {
    horizon: {
      loadAccount: vi.fn().mockResolvedValue({
        balances: [],
        accountId: () => "GABC",
        incrementSequenceNumber: () => {},
        sequenceNumber: () => "1",
      }),
    },
    networkPassphrase: "Test SDF Network ; September 2015",
  },
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (request: any) => {
    request.user = { userId: 1 };
  },
}));

vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => Promise.resolve(mockDbResult.rows)),
        }),
      }),
    }),
  },
  schema: {
    userWallets: {
      userId: "userId",
      publicKey: "publicKey",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
}));

vi.mock("@stellar/stellar-sdk", () => ({
  Asset: vi.fn(),
  TransactionBuilder: vi.fn().mockImplementation(() => ({
    addOperation: vi.fn().mockReturnThis(),
    setTimeout: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue({ toXDR: () => "mock-xdr" }),
  })),
  Operation: { changeTrust: vi.fn() },
  BASE_FEE: "100",
  StrKey: {
    isValidEd25519PublicKey: vi.fn().mockReturnValue(true),
  },
}));

vi.mock("../modules/tokens/token.service", () => ({
  TokenService: vi.fn().mockImplementation(function (this: any) {
    this.ensureToken = vi.fn().mockResolvedValue(undefined);
  }),
}));

import Fastify from "fastify";
import { trustlineRoutes } from "./trustlines";

describe("Trustline routes — wallet ownership (P2-1-F2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbResult.rows = [];
  });

  it("POST /trustlines/add returns 403 when wallet does not belong to user", async () => {
    mockDbResult.rows = []; // no matching wallet

    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/add",
      headers: { authorization: "Bearer mock-token" },
      payload: {
        publicKey: "GNOTMYWALLET",
        assetCode: "USDC",
        assetIssuer: "GISSUER",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain("does not belong");
  });

  it("POST /trustlines/remove returns 403 when wallet does not belong to user", async () => {
    mockDbResult.rows = [];

    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/remove",
      headers: { authorization: "Bearer mock-token" },
      payload: {
        publicKey: "GNOTMYWALLET",
        assetCode: "USDC",
        assetIssuer: "GISSUER",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain("does not belong");
  });

  it("POST /trustlines/update-limit returns 403 when wallet does not belong to user", async () => {
    mockDbResult.rows = [];

    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/update-limit",
      headers: { authorization: "Bearer mock-token" },
      payload: {
        publicKey: "GNOTMYWALLET",
        assetCode: "USDC",
        assetIssuer: "GISSUER",
        limit: "1000",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain("does not belong");
  });

  it("POST /trustlines/add proceeds when wallet belongs to user", async () => {
    mockDbResult.rows = [{ id: 1, userId: 1, publicKey: "GMYWALLET" }];

    const app = Fastify();
    app.register(trustlineRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/trustlines/add",
      headers: { authorization: "Bearer mock-token" },
      payload: {
        publicKey: "GMYWALLET",
        assetCode: "USDC",
        assetIssuer: "GISSUER",
      },
    });

    // Should pass ownership check (may succeed or fail on Stellar mock, but not 403)
    expect(res.statusCode).not.toBe(403);
  });
});
