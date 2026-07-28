import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("token.service.ts — ILIKE wildcard escape (P2-2-F5)", () => {
  const src = readFileSync(join(__dirname, "token.service.ts"), "utf-8");

  it("should have an escapeIlike function that escapes % characters", () => {
    expect(src).toMatch(/function\s+escapeIlike|const\s+escapeIlike/);
    expect(src).toMatch(/replace.*%/);
  });

  it("should have an escapeIlike function that escapes _ characters", () => {
    expect(src).toMatch(/replace.*_/);
  });

  it("should cap query length before using in ILIKE", () => {
    expect(src).toMatch(/\.slice\s*\(\s*0\s*,\s*100\s*\)|\.substring\s*\(\s*0\s*,\s*100\s*\)/);
  });

  it("should use the escape function in the ilike conditions", () => {
    // The ilike calls should use escaped/safe query, not raw query
    expect(src).toMatch(/ilike.*safeQuery|ilike.*escaped/);
  });
});
