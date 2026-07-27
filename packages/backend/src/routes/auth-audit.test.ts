import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const authSrc = readFileSync(join(__dirname, "auth.ts"), "utf-8");

describe("Auth audit logging — password change (P0-1-F5)", () => {
  it("calls auditLog('password_change') in change-password handler", () => {
    // Look for the auditLog call in the full file
    expect(authSrc).toContain('auditLog("password_change"');
  });

  it("includes userId and ip in password_change audit", () => {
    const match = authSrc.match(/auditLog\("password_change"[\s\S]*?\)/);
    expect(match).toBeTruthy();
    expect(match![0]).toContain("userId");
    expect(match![0]).toContain("ip:");
  });
});

describe("Auth audit logging — login success (P0-1-F6)", () => {
  it("calls auditLog('login') on successful authentication", () => {
    // The "login" audit call should exist (distinct from "login_failed")
    // Match auditLog("login", ...) but not auditLog("login_failed" or "login_locked")
    expect(authSrc).toMatch(/auditLog\("login",\s*\{/);
  });

  it("includes userId and ip in login success audit", () => {
    const match = authSrc.match(/auditLog\("login",\s*\{[\s\S]*?\}/);
    expect(match).toBeTruthy();
    expect(match![0]).toContain("userId");
    expect(match![0]).toContain("ip:");
  });
});
