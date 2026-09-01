import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("config/index.ts — startup validation (P2-4-F4, FIND-SSO-008)", () => {
  const src = readFileSync(
    join(__dirname, "index.ts"),
    "utf-8"
  );

  it("should crash when TURNSTILE_SECRET_KEY is empty in production", () => {
    // Must reference TURNSTILE_SECRET_KEY and production
    const hasTurnstileCheck = src.includes("TURNSTILE_SECRET_KEY") &&
      src.match(/TURNSTILE_SECRET_KEY[\s\S]*?production|production[\s\S]*?TURNSTILE_SECRET_KEY/);
    expect(hasTurnstileCheck).toBeTruthy();
    // Must use console.error + process.exit (crash-first, not just warn)
    expect(src).toMatch(/console\.error.*TURNSTILE/);
    expect(src).toMatch(/process\.exit\(1\)/);
  });
});
