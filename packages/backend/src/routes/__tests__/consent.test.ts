import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockAuditLog = vi.fn();

vi.mock("../../db", () => ({
  db: {
    select: (...args: any[]) => mockDbSelect(...args),
    insert: (...args: any[]) => mockDbInsert(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
  },
  schema: {
    consentRecords: {
      userId: "user_id",
      clientId: "client_id",
      revokedAt: "revoked_at",
      scopesGranted: "scopes_granted",
      id: "id",
    },
  },
}));

vi.mock("../../lib/audit", () => ({
  auditLog: (...args: any[]) => mockAuditLog(...args),
}));

import { hasActiveConsent, grantConsent, revokeConsent } from "../../services/consent.service";

describe("Consent Service", () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
    mockDbInsert.mockReset();
    mockDbUpdate.mockReset();
    mockAuditLog.mockReset();
  });

  it("CONSENT-01: hasActiveConsent returns true when consent exists with matching scopes", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ scopesGranted: "openid profile email", revokedAt: null }],
      }),
    });
    const result = await hasActiveConsent(42, "crm", "openid profile email");
    expect(result).toBe(true);
  });

  it("CONSENT-02: hasActiveConsent returns false when no consent exists", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [],
      }),
    });
    const result = await hasActiveConsent(42, "crm", "openid profile email");
    expect(result).toBe(false);
  });

  it("CONSENT-03: hasActiveConsent returns false when consent is revoked", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ scopesGranted: "openid profile email", revokedAt: new Date() }],
      }),
    });
    const result = await hasActiveConsent(42, "crm", "openid");
    expect(result).toBe(false);
  });

  it("CONSENT-04: hasActiveConsent returns false when stored scopes are subset of requested", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ scopesGranted: "openid", revokedAt: null }],
      }),
    });
    const result = await hasActiveConsent(42, "crm", "openid profile email");
    expect(result).toBe(false);
  });

  it("CONSENT-05: grantConsent inserts record and logs audit event", async () => {
    mockDbInsert.mockReturnValue({
      values: () => ({
        onConflictDoUpdate: () => Promise.resolve(),
      }),
    });
    mockAuditLog.mockResolvedValue(undefined);

    await grantConsent(42, "crm", "openid profile email", "1.2.3.4");

    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledWith(
      "oauth_consent_granted",
      expect.objectContaining({
        userId: 42,
        detail: expect.objectContaining({
          clientId: "crm",
          scopes: "openid profile email",
        }),
      }),
    );
  });

  it("CONSENT-06: revokeConsent updates record and logs audit event", async () => {
    mockDbUpdate.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: () => [{ id: 1 }],
        }),
      }),
    });
    mockAuditLog.mockResolvedValue(undefined);

    const result = await revokeConsent(42, "crm", "1.2.3.4");

    expect(result).toBe(true);
    expect(mockAuditLog).toHaveBeenCalledWith(
      "oauth_consent_revoked",
      expect.objectContaining({
        userId: 42,
        detail: expect.objectContaining({ clientId: "crm" }),
      }),
    );
  });

  it("CONSENT-07: revokeConsent returns false when no active consent exists", async () => {
    mockDbUpdate.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: () => [],
        }),
      }),
    });
    const result = await revokeConsent(42, "unknown");
    expect(result).toBe(false);
    // No audit log for a no-op revocation
    expect(mockAuditLog).not.toHaveBeenCalled();
  });
});
