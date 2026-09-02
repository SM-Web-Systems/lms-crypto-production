import { describe, it, expect } from "vitest";
import { validatePasswordStrength } from "./password-validation";

describe("validatePasswordStrength", () => {
  it("rejects empty password", () => {
    expect(validatePasswordStrength("")).toEqual({ valid: false, error: "Password must be at least 8 characters" });
  });

  it("rejects short password", () => {
    expect(validatePasswordStrength("Abc1")).toEqual({ valid: false, error: "Password must be at least 8 characters" });
  });

  it("rejects password without uppercase", () => {
    expect(validatePasswordStrength("abcdefg1")).toEqual({ valid: false, error: "Password must contain at least one uppercase letter" });
  });

  it("rejects password without lowercase", () => {
    expect(validatePasswordStrength("ABCDEFG1")).toEqual({ valid: false, error: "Password must contain at least one lowercase letter" });
  });

  it("rejects password without digit", () => {
    expect(validatePasswordStrength("Abcdefgh")).toEqual({ valid: false, error: "Password must contain at least one digit" });
  });

  it("accepts strong password", () => {
    expect(validatePasswordStrength("Abcdefg1")).toEqual({ valid: true });
  });

  it("accepts complex password", () => {
    expect(validatePasswordStrength("MyP@ssw0rd!")).toEqual({ valid: true });
  });
});
