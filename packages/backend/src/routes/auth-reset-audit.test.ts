import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const authSrc = readFileSync(join(__dirname, "auth.ts"), "utf-8");

describe("P0-1-F3: email password reset auditLog uses correct field name", () => {
  it("uses record.user_id (snake_case) not record.userId in password_reset auditLog", () => {
    // Find the email-based password_reset auditLog section (not the SMS one)
    // The email reset handler calls revokeAllUserTokens(record.user_id) then auditLog
    const resetSection = authSrc.split("revokeAllUserTokens(record.user_id)")[1];
    expect(resetSection).toBeDefined();

    // Within the next ~10 lines after revokeAllUserTokens, find the auditLog call
    const nextLines = resetSection!.slice(0, 300);
    expect(nextLines).toContain('auditLog("password_reset"');
    expect(nextLines).toContain("record.user_id");
    expect(nextLines).not.toContain("record.userId");
  });
});
