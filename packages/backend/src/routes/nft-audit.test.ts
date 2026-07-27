/**
 * Tests for P3-1-F4/F6 — NFT auditLog call signature fix.
 *
 * Verifies that all auditLog calls in nft.ts use the correct 2-argument
 * opts-object pattern: auditLog(action, { userId, detail, ip })
 * rather than the broken positional-args pattern: auditLog(action, userId, detail, ip)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies
const mockAuditLog = vi.hoisted(() => vi.fn());
vi.mock("../lib/audit", () => ({
  auditLog: (...args: any[]) => mockAuditLog(...args),
}));

const mockDbLimit = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: mockDbLimit,
        }),
      }),
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 1 }]),
  },
  schema: {
    userWallets: { userId: "user_id", publicKey: "public_key" },
    auditLogs: {},
  },
}));

vi.mock("../db/schema", () => ({
  userWallets: { userId: "user_id", publicKey: "public_key" },
  nftCollections: { id: "id" },
}));

vi.mock("../config", () => ({
  config: {
    STELLAR_NETWORK: "testnet",
    HORIZON_URL: "https://horizon-testnet.stellar.org",
    JWT_SECRET: "test",
    JWT_REFRESH_SECRET: "test",
    SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    network: "testnet",
  },
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (request: any) => {
    request.user = { userId: 1, email: "test@test.com" };
  },
}));

vi.mock("../modules/nft/nft.service", () => ({
  nftService: {
    registerCollection: vi.fn().mockResolvedValue({ id: 1, name: "Test", contractId: "CABC", standard: "sep50" }),
    querySep50Contract: vi.fn().mockResolvedValue(null),
    buildSep50Transfer: vi.fn().mockResolvedValue({ xdr: "mock-xdr" }),
    indexToken: vi.fn().mockResolvedValue({ id: 1 }),
    syncCollectionTokens: vi.fn().mockResolvedValue({ synced: 5, totalSupply: 10 }),
    getCollection: vi.fn().mockResolvedValue({ id: 1, contractId: null }),
    listCollections: vi.fn().mockResolvedValue({ collections: [], total: 0 }),
    getTokensByCollection: vi.fn().mockResolvedValue({ tokens: [], total: 0 }),
    getToken: vi.fn().mockResolvedValue(null),
    getTokensByOwner: vi.fn().mockResolvedValue({ tokens: [], total: 0 }),
    scanClassicNfts: vi.fn().mockResolvedValue([]),
    querySep50TokenUri: vi.fn().mockResolvedValue(null),
    querySep50OwnerOf: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("@stellar/stellar-sdk", () => ({
  Horizon: { Server: vi.fn(() => ({})) },
  rpc: { Server: vi.fn(() => ({})) },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: any[]) => ({ type: "and", args })),
  eq: vi.fn((col: any, val: any) => ({ type: "eq", col, val })),
  desc: vi.fn((col: any) => ({ type: "desc", col })),
  sql: vi.fn((strings: any) => ({ type: "sql", strings })),
}));

import Fastify from "fastify";
import { nftRoutes } from "./nft";

describe("NFT routes — auditLog call signature", () => {
  let app: any;

  beforeEach(async () => {
    mockAuditLog.mockClear();
    app = Fastify();
    await app.register(nftRoutes);
    await app.ready();
  });

  it("POST /api/v1/nfts/collections calls auditLog with opts object (not positional args)", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/nfts/collections",
      headers: { authorization: "Bearer fake" },
      payload: { name: "Test", contractId: "CABC", standard: "sep50" },
    });

    // auditLog should have been called
    expect(mockAuditLog.mock.calls.length).toBeGreaterThan(0);

    const [action, opts] = mockAuditLog.mock.calls[0];

    // First arg is the action string
    expect(typeof action).toBe("string");
    expect(action).toBe("nft_collection_registered");

    // Second arg must be an object (opts), NOT a number (userId positional arg)
    expect(typeof opts).toBe("object");
    expect(opts).not.toBeNull();
    expect(typeof opts).not.toBe("number");

    // The opts object must have userId, detail, ip properties
    expect(opts).toHaveProperty("userId");
    expect(opts).toHaveProperty("detail");
    expect(opts).toHaveProperty("ip");

    // userId should be the number 1, not a secondary positional arg
    expect(opts.userId).toBe(1);
    expect(typeof opts.detail).toBe("object");
  });

  it("POST /api/v1/nfts/transfer returns 403 when wallet not found (ownership check uses imports)", async () => {
    // db mock returns empty array = no wallet found for this user
    mockDbLimit.mockResolvedValueOnce([]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/nfts/transfer",
      headers: { authorization: "Bearer fake" },
      payload: {
        contractId: "CXXX",
        fromAddress: "GABC123",
        toAddress: "GDEF456",
        tokenId: 1,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain("does not belong");
  });

  it("auditLog call has no extra positional arguments beyond 2", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/nfts/collections",
      headers: { authorization: "Bearer fake" },
      payload: { name: "Test", contractId: "CABC", standard: "sep50" },
    });

    expect(mockAuditLog.mock.calls.length).toBeGreaterThan(0);
    const call = mockAuditLog.mock.calls[0];

    // Must be exactly 2 arguments: (action, opts)
    expect(call.length).toBe(2);
  });
});
