import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Fiat auditLog calls — correct signature (P2-7-F1)", () => {
  const fiatSrc = readFileSync(join(__dirname, "fiat.ts"), "utf-8");
  const auditSrc = readFileSync(join(__dirname, "..", "lib", "audit.ts"), "utf-8");

  it("fiat_stripe_session uses opts object pattern (not positional args)", () => {
    const match = fiatSrc.match(/auditLog\("fiat_stripe_session"[\s\S]*?\);/);
    expect(match).toBeTruthy();
    const call = match![0];
    // Should have { userId, detail, ip } pattern
    expect(call).toContain("userId");
    expect(call).toContain("detail:");
    expect(call).toContain("ip:");
    // Should NOT have positional userId (second arg is object, not number)
    expect(call).not.toMatch(/auditLog\("fiat_stripe_session",\s*userId,/);
  });

  it("fiat_transak_url uses opts object pattern (not positional args)", () => {
    const match = fiatSrc.match(/auditLog\("fiat_transak_url"[\s\S]*?\);/);
    expect(match).toBeTruthy();
    const call = match![0];
    expect(call).toContain("userId");
    expect(call).toContain("detail:");
    expect(call).toContain("ip:");
    expect(call).not.toMatch(/auditLog\("fiat_transak_url",\s*userId,/);
  });

  it("AuditAction type includes fiat_stripe_session", () => {
    expect(auditSrc).toContain('"fiat_stripe_session"');
  });

  it("AuditAction type includes fiat_transak_url", () => {
    expect(auditSrc).toContain('"fiat_transak_url"');
  });
});
