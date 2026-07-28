import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("TOTP verification window (P3-7-F10)", () => {
  const source = readFileSync(
    resolve(__dirname, "two-fa.ts"),
    "utf-8",
  );

  it("should NOT use window: 2 (150-second range is too permissive)", () => {
    const matches = source.match(/window:\s*2/g);
    expect(matches).toBeNull();
  });

  it("should use window: 1 at both TOTP verification sites", () => {
    const matches = source.match(/window:\s*1/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
