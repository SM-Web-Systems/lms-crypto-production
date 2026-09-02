import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// Mock DB
const mockDbSelect = vi.fn();
vi.mock("../../db", () => ({
  db: {
    select: (...args: any[]) => mockDbSelect(...args),
  },
  schema: {
    oauthClients: {
      clientId: "client_id",
      isActive: "is_active",
    },
  },
}));

import {
  getClientByClientId,
  verifyClientSecret,
  validateRedirectUri,
} from "../../services/oauth-client.service";

const TEST_SECRET = "test-client-secret-at-least-32-chars";
const TEST_SECRET_HASH = bcrypt.hashSync(TEST_SECRET, 10);

const MOCK_CLIENT = {
  id: 1,
  clientId: "crm-smwebsystems",
  clientSecretHash: TEST_SECRET_HASH,
  clientName: "SM Web CRM",
  redirectUris: JSON.stringify(["https://crm.smwebsystems.com/auth/callback"]),
  scopes: "openid profile email",
  grantTypes: "authorization_code refresh_token",
  requirePkce: true,
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2592000,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("OAuth Client Service", () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  it("CLIENT-01: returns client by clientId when found and active", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => [MOCK_CLIENT] }),
      }),
    });
    const client = await getClientByClientId("crm-smwebsystems");
    expect(client).toBeTruthy();
    expect(client!.clientId).toBe("crm-smwebsystems");
  });

  it("CLIENT-02: returns null for unknown clientId", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => [] }),
      }),
    });
    const client = await getClientByClientId("unknown");
    expect(client).toBeNull();
  });

  it("CLIENT-03: returns null for inactive client", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => [] }),
      }),
    });
    const client = await getClientByClientId("crm-smwebsystems");
    expect(client).toBeNull();
  });

  it("CLIENT-04: verifyClientSecret returns true for correct secret", async () => {
    const result = await verifyClientSecret(MOCK_CLIENT as any, TEST_SECRET);
    expect(result).toBe(true);
  });

  it("CLIENT-05: verifyClientSecret returns false for wrong secret", async () => {
    const result = await verifyClientSecret(MOCK_CLIENT as any, "wrong-secret");
    expect(result).toBe(false);
  });

  it("CLIENT-06: validateRedirectUri accepts exact match", () => {
    const result = validateRedirectUri(MOCK_CLIENT as any, "https://crm.smwebsystems.com/auth/callback");
    expect(result).toBe(true);
  });

  it("CLIENT-07: validateRedirectUri rejects substring match", () => {
    const result = validateRedirectUri(MOCK_CLIENT as any, "https://crm.smwebsystems.com/auth/callback/extra");
    expect(result).toBe(false);
  });

  it("CLIENT-08: validateRedirectUri rejects prefix match", () => {
    const result = validateRedirectUri(MOCK_CLIENT as any, "https://crm.smwebsystems.com/auth");
    expect(result).toBe(false);
  });

  it("CLIENT-09: validateRedirectUri rejects different domain", () => {
    const result = validateRedirectUri(MOCK_CLIENT as any, "https://evil.com/auth/callback");
    expect(result).toBe(false);
  });

  it("CLIENT-10: validateRedirectUri rejects different port", () => {
    const result = validateRedirectUri(MOCK_CLIENT as any, "https://crm.smwebsystems.com:8080/auth/callback");
    expect(result).toBe(false);
  });

  it("CLIENT-11: validateRedirectUri rejects empty string", () => {
    const result = validateRedirectUri(MOCK_CLIENT as any, "");
    expect(result).toBe(false);
  });
});
