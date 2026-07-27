import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const configSrc = readFileSync(join(__dirname, "index.ts"), "utf-8");

describe("Config startup validation — SSO_SECRET (P1-4-F2)", () => {
  it("SSO_SECRET is in requiredEnvVars", () => {
    // Extract the requiredEnvVars array content
    const match = configSrc.match(/requiredEnvVars\s*=\s*\[([\s\S]*?)\]/);
    expect(match).toBeTruthy();
    expect(match![1]).toContain('"SSO_SECRET"');
  });

  it("guards against SSO_SECRET === JWT_SECRET (key confusion)", () => {
    expect(configSrc).toContain("SSO_SECRET");
    expect(configSrc).toContain("JWT_SECRET");
    // Should have a comparison check
    expect(configSrc).toMatch(/SSO_SECRET.*===.*JWT_SECRET|JWT_SECRET.*===.*SSO_SECRET/);
  });
});

describe("Config startup validation — secret uniqueness (P2-4-F1/F2)", () => {
  it("guards against ADMIN_JWT_SECRET === JWT_SECRET", () => {
    expect(configSrc).toMatch(/ADMIN_JWT_SECRET.*===.*JWT_SECRET|JWT_SECRET.*===.*ADMIN_JWT_SECRET/);
  });

  it("validates minimum secret length for critical secrets", () => {
    // Should check length of secrets at startup
    expect(configSrc).toMatch(/\.length\s*</);
    // Should define a minimum length constant
    expect(configSrc).toMatch(/secretMinLength\s*=\s*\d+/);
  });
});
