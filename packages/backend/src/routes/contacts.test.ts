import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

vi.mock("../db", () => ({
  db: {
    select: () => ({ from: (_table: any) => ({ where: mockWhere, orderBy: mockOrderBy }) }),
    insert: () => ({ values: (v: any) => ({ returning: () => Promise.resolve([{ id: 1, ...v }]) }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve({ rowCount: 1 }) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  },
}));

vi.mock("../db/schema", () => ({
  addressBook: {
    userId: "userId",
    name: "name",
    address: "address",
    id: "id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ col, val }),
  and: (...args: any[]) => args,
}));

// Mock auth middleware to set request.user
vi.mock("../middleware/auth", () => ({
  authMiddleware: async (request: any) => {
    request.user = { userId: 42, email: "test@example.com" };
  },
}));

import Fastify from "fastify";
import { addressBookRoutes } from "./contacts";

describe("Contacts routes — userId extraction", () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(addressBookRoutes);
    await app.ready();
  });

  it("GET /api/v1/contacts uses request.user.userId (not request.userId)", async () => {
    // The mock DB where clause should receive userId=42 from authMiddleware
    mockWhere.mockReturnValue({ orderBy: vi.fn().mockResolvedValue([]) });
    mockOrderBy.mockResolvedValue([]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/contacts",
      headers: { authorization: "Bearer fake-token" },
    });

    // If the bug is present (request.userId), userId will be undefined
    // If fixed (request.user!.userId), userId will be 42
    // We verify by checking the WHERE clause received the correct value
    expect(res.statusCode).toBe(200);

    // The key assertion: verify the drizzle eq() was called with userId=42
    // We can check this by inspecting the mock calls
    const whereCalls = mockWhere.mock.calls;
    // The where clause should contain eq(addressBook.userId, 42)
    // With our mock of eq, that produces { col: "userId", val: 42 }
    expect(whereCalls.length).toBeGreaterThan(0);
    const whereArg = whereCalls[0][0];
    // and() wraps eq calls — check we got userId=42 not userId=undefined
    if (Array.isArray(whereArg)) {
      const userIdEq = whereArg.find((a: any) => a.col === "userId");
      expect(userIdEq.val).toBe(42);
    } else if (whereArg.col === "userId") {
      expect(whereArg.val).toBe(42);
    }
  });
});

describe("Contacts — DELETE nonexistent returns 404 (P3-6-F5)", () => {
  it("DELETE /api/v1/contacts/:id returns 404 when contact does not exist", async () => {
    // Patch the mock so delete returns rowCount: 0
    const { db } = await import("../db");
    const origDelete = db.delete;
    (db as any).delete = () => ({
      where: () => Promise.resolve({ rowCount: 0 }),
    });

    const app = Fastify();
    await app.register(addressBookRoutes);
    await app.ready();

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/contacts/99999",
      headers: { authorization: "Bearer fake-token" },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toHaveProperty("error");

    // Restore original mock
    (db as any).delete = origDelete;
  });
});
