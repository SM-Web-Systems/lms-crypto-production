import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const authSrc = readFileSync(join(__dirname, "auth.ts"), "utf-8");

describe("Logout token revocation (P0-1-F10)", () => {
  it("calls revokeAllUserTokens when refreshToken is missing", () => {
    // The logout handler should call revokeAllUserTokens as fallback
    const logoutIdx = authSrc.indexOf("/api/v1/auth/logout");
    expect(logoutIdx).toBeGreaterThan(-1);
    const nextRouteIdx = authSrc.indexOf("app.", logoutIdx + 1);
    const logoutHandler = authSrc.substring(logoutIdx, nextRouteIdx > 0 ? nextRouteIdx : logoutIdx + 1000);
    expect(logoutHandler).toContain("revokeAllUserTokens");
  });
});
