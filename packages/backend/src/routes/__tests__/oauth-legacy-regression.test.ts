import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Legacy SSO flow regression", () => {
  const ssoSource = readFileSync(join(__dirname, "..", "sso.ts"), "utf-8");

  it("LEGACY-01: sso.ts still contains usedJtis in-memory Set", () => {
    expect(ssoSource).toContain("const usedJtis = new Set<string>()");
  });

  it("LEGACY-02: sso.ts still contains 60-second cleanup timer", () => {
    expect(ssoSource).toContain("usedJtis.clear()");
    expect(ssoSource).toContain("60_000");
  });

  it("LEGACY-03: sso.ts still uses SSO_SECRET for signing", () => {
    expect(ssoSource).toContain("config.SSO_SECRET");
  });

  it("LEGACY-04: sso.ts still hardcodes audience to lms-amma-sso", () => {
    expect(ssoSource).toMatch(/aud:\s*"lms-amma-sso"/);
  });

  it("LEGACY-05: sso.ts still uses HS256 (default jsonwebtoken behavior with string secret)", () => {
    const ssoSignCalls = ssoSource.match(/jwt\.sign\([^)]*\)/gs) || [];
    for (const call of ssoSignCalls) {
      expect(call).not.toContain("ES256");
    }
  });

  it("LEGACY-06: sso.ts does not import from oauth-signing or token-registry", () => {
    expect(ssoSource).not.toContain("oauth-signing");
    expect(ssoSource).not.toContain("token-registry");
    expect(ssoSource).not.toContain("oauth-client");
    expect(ssoSource).not.toContain("consent");
  });
});
