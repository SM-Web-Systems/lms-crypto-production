import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("config/index.ts — startup warnings (P2-4-F4)", () => {
  const src = readFileSync(
    join(__dirname, "index.ts"),
    "utf-8"
  );

  it("should warn when TURNSTILE_SECRET_KEY is empty in production", () => {
    // Must have a warning that mentions both TURNSTILE_SECRET_KEY and production
    const hasTurnstileWarning = src.includes("TURNSTILE_SECRET_KEY") &&
      src.match(/TURNSTILE_SECRET_KEY[\s\S]*?production|production[\s\S]*?TURNSTILE_SECRET_KEY/);
    expect(hasTurnstileWarning).toBeTruthy();
    // Must use console.warn (not crash)
    expect(src).toMatch(/console\.warn.*TURNSTILE/);
  });
});
