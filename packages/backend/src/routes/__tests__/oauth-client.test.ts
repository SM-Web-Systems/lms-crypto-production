import { describe, it, expect } from "vitest";

describe("OAuth schema exports", () => {
  it("exports oauthClients table with required columns", async () => {
    // Dynamic import to avoid module resolution issues during initial TDD
    const schema = await import("../../db/schema");
    expect(schema.oauthClients).toBeDefined();
    // Drizzle tables expose column definitions
    expect(schema.oauthClients.clientId).toBeDefined();
    expect(schema.oauthClients.clientSecretHash).toBeDefined();
    expect(schema.oauthClients.redirectUris).toBeDefined();
    expect(schema.oauthClients.requirePkce).toBeDefined();
    expect(schema.oauthClients.isActive).toBeDefined();
  });

  it("exports tokenRegistry table with required columns", async () => {
    const schema = await import("../../db/schema");
    expect(schema.tokenRegistry).toBeDefined();
    expect(schema.tokenRegistry.jti).toBeDefined();
    expect(schema.tokenRegistry.tokenType).toBeDefined();
    expect(schema.tokenRegistry.familyId).toBeDefined();
    expect(schema.tokenRegistry.usedAt).toBeDefined();
    expect(schema.tokenRegistry.revokedAt).toBeDefined();
  });

  it("exports consentRecords table with required columns", async () => {
    const schema = await import("../../db/schema");
    expect(schema.consentRecords).toBeDefined();
    expect(schema.consentRecords.userId).toBeDefined();
    expect(schema.consentRecords.clientId).toBeDefined();
    expect(schema.consentRecords.scopesGranted).toBeDefined();
    expect(schema.consentRecords.revokedAt).toBeDefined();
  });
});
