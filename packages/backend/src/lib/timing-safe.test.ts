import { describe, it, expect } from "vitest";
import { timingSafeCompare } from "./timing-safe";

describe("timingSafeCompare", () => {
  it("returns true for matching strings", () => {
    expect(timingSafeCompare("abc123", "abc123")).toBe(true);
  });

  it("returns false for non-matching strings", () => {
    expect(timingSafeCompare("abc123", "abc124")).toBe(false);
  });

  it("returns false for different-length strings", () => {
    expect(timingSafeCompare("short", "longer-string")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(timingSafeCompare("", "")).toBe(true);
    expect(timingSafeCompare("", "nonempty")).toBe(false);
  });

  it("handles SHA-256 hex strings (64 chars)", () => {
    const hash1 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const hash2 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const hash3 = "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592";
    expect(timingSafeCompare(hash1, hash2)).toBe(true);
    expect(timingSafeCompare(hash1, hash3)).toBe(false);
  });
});
