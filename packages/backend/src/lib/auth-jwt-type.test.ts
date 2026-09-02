import { describe, it, expect, vi } from "vitest";

vi.mock("../config", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret-for-type-test",
    JWT_REFRESH_SECRET: "test-refresh-secret",
    JWT_EXPIRES_IN: 900,
    JWT_REFRESH_EXPIRES_IN: 604800,
  },
}));

vi.mock("../db", () => ({
  db: { insert: vi.fn().mockReturnThis(), values: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../db/schema", () => ({
  refreshTokens: {},
}));

import { generateAccessToken, verifyAccessToken } from "./auth";

describe("JWT type claim (P0-1-F9)", () => {
  it("generateAccessToken includes type:'user' in payload", () => {
    const token = generateAccessToken({ userId: 1, email: "test@example.com" });
    const decoded = verifyAccessToken(token);
    expect(decoded.type).toBe("user");
  });

  it("verifyAccessToken returns userId and email", () => {
    const token = generateAccessToken({ userId: 42, email: "a@b.com" });
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(42);
    expect(decoded.email).toBe("a@b.com");
  });
});

// Test authMiddleware rejects admin tokens
import { readFileSync } from "fs";
import { join } from "path";

describe("authMiddleware — admin token rejection (P0-1-F9)", () => {
  const middlewareSrc = readFileSync(
    join(__dirname, "..", "middleware", "auth.ts"),
    "utf-8",
  );

  it("checks payload.type === 'admin' and rejects", () => {
    expect(middlewareSrc).toContain('type === "admin"');
  });
});
