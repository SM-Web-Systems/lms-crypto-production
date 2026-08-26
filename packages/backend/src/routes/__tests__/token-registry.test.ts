import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbInsert = vi.fn();
const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbDelete = vi.fn();

vi.mock("../../db", () => ({
  db: {
    insert: (...args: any[]) => mockDbInsert(...args),
    select: (...args: any[]) => mockDbSelect(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
    delete: (...args: any[]) => mockDbDelete(...args),
  },
  schema: {
    tokenRegistry: {
      jti: "jti",
      tokenType: "token_type",
      sub: "sub",
      clientId: "client_id",
      familyId: "family_id",
      usedAt: "used_at",
      revokedAt: "revoked_at",
      expiresAt: "expires_at",
      issuedAt: "issued_at",
    },
  },
}));

import {
  insertTokenEntry,
  markTokenUsed,
  revokeFamily,
  lookupToken,
  cleanupExpiredTokens,
} from "../../services/token-registry.service";

describe("Token Registry Service", () => {
  beforeEach(() => {
    mockDbInsert.mockReset();
    mockDbSelect.mockReset();
    mockDbUpdate.mockReset();
    mockDbDelete.mockReset();
  });

  it("TR-01: insertTokenEntry calls db.insert with correct values", async () => {
    mockDbInsert.mockReturnValue({ values: () => Promise.resolve() });
    await insertTokenEntry({
      jti: "abc-123",
      tokenType: "auth_code",
      sub: "42",
      clientId: "crm",
      familyId: "fam-1",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 300000),
    });
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });

  it("TR-02: markTokenUsed returns alreadyUsed=false for unused token", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ jti: "abc", usedAt: null, revokedAt: null, familyId: "fam-1", expiresAt: new Date(Date.now() + 60000) }],
      }),
    });
    mockDbUpdate.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });

    const result = await markTokenUsed("abc");
    expect(result.alreadyUsed).toBe(false);
    expect(result.familyId).toBe("fam-1");
  });

  it("TR-03: markTokenUsed returns alreadyUsed=true for already-used token", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ jti: "abc", usedAt: new Date(), revokedAt: null, familyId: "fam-1", expiresAt: new Date(Date.now() + 60000) }],
      }),
    });
    const result = await markTokenUsed("abc");
    expect(result.alreadyUsed).toBe(true);
    expect(result.familyId).toBe("fam-1");
  });

  it("TR-04: markTokenUsed returns alreadyUsed=true for revoked token", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ jti: "abc", usedAt: null, revokedAt: new Date(), familyId: "fam-1", expiresAt: new Date(Date.now() + 60000) }],
      }),
    });
    const result = await markTokenUsed("abc");
    expect(result.alreadyUsed).toBe(true);
  });

  it("TR-05: markTokenUsed returns alreadyUsed=true for expired token", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ jti: "abc", usedAt: null, revokedAt: null, familyId: "fam-1", expiresAt: new Date(Date.now() - 1000) }],
      }),
    });
    const result = await markTokenUsed("abc");
    expect(result.alreadyUsed).toBe(true);
  });

  it("TR-06: markTokenUsed returns alreadyUsed=true for unknown jti", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [],
      }),
    });
    const result = await markTokenUsed("unknown");
    expect(result.alreadyUsed).toBe(true);
  });

  it("TR-07: revokeFamily calls update on all tokens with matching familyId", async () => {
    mockDbUpdate.mockReturnValue({
      set: () => ({
        where: () => ({ returning: () => [{ jti: "a" }, { jti: "b" }] }),
      }),
    });
    const count = await revokeFamily("fam-1");
    expect(count).toBe(2);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it("TR-08: cleanupExpiredTokens deletes rows older than 7 days past expiry", async () => {
    mockDbDelete.mockReturnValue({
      where: () => ({ returning: () => [{ jti: "old1" }, { jti: "old2" }, { jti: "old3" }] }),
    });
    const count = await cleanupExpiredTokens();
    expect(count).toBe(3);
    expect(mockDbDelete).toHaveBeenCalledTimes(1);
  });

  it("TR-09: lookupToken returns entry when found", async () => {
    const entry = { jti: "abc", tokenType: "auth_code", sub: "42", clientId: "crm" };
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [entry],
      }),
    });
    const result = await lookupToken("abc");
    expect(result).toEqual(entry);
  });

  it("TR-10: lookupToken returns null when not found", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [],
      }),
    });
    const result = await lookupToken("missing");
    expect(result).toBeNull();
  });
});
