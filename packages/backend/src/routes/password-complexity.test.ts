import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("P0-1-F14: Password complexity at all password-setting sites", () => {
  const filePath = path.resolve(__dirname, "auth.ts");
  const source = fs.readFileSync(filePath, "utf-8");

  it("imports validatePasswordStrength", () => {
    expect(source).toContain("validatePasswordStrength");
  });

  it("calls validatePasswordStrength before register hashPassword", () => {
    const registerIdx = source.indexOf('"/api/v1/auth/register"');
    const registerBlock = source.slice(registerIdx, registerIdx + 5000);
    const hashIdx = registerBlock.indexOf("hashPassword(password)");
    const validateIdx = registerBlock.indexOf("validatePasswordStrength");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(hashIdx).toBeGreaterThan(-1);
    expect(validateIdx).toBeLessThan(hashIdx);
  });

  it("calls validatePasswordStrength before change-password hashPassword", () => {
    const changeIdx = source.indexOf('"/api/v1/auth/change-password"');
    const changeBlock = source.slice(changeIdx, changeIdx + 2500);
    const hashIdx = changeBlock.indexOf("hashPassword(newPassword)");
    const validateIdx = changeBlock.indexOf("validatePasswordStrength");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(hashIdx).toBeGreaterThan(-1);
    expect(validateIdx).toBeLessThan(hashIdx);
  });

  it("calls validatePasswordStrength before email reset hashPassword", () => {
    const resetIdx = source.indexOf('"/api/v1/auth/reset-password"');
    const resetBlock = source.slice(resetIdx, resetIdx + 3000);
    const hashIdx = resetBlock.indexOf("hashPassword(newPassword)");
    const validateIdx = resetBlock.indexOf("validatePasswordStrength");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(hashIdx).toBeGreaterThan(-1);
    expect(validateIdx).toBeLessThan(hashIdx);
  });

  it("calls validatePasswordStrength before SMS reset password hash", () => {
    const smsIdx = source.indexOf('"/api/v1/auth/reset-password-sms"');
    const smsBlock = source.slice(smsIdx, smsIdx + 3000);
    const hashIdx = smsBlock.indexOf(".hash(");
    const validateIdx = smsBlock.indexOf("validatePasswordStrength");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(hashIdx).toBeGreaterThan(-1);
    expect(validateIdx).toBeLessThan(hashIdx);
  });
});
