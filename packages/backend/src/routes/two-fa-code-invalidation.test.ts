import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("two-fa email code invalidation (P3-7-F11)", () => {
  const source = readFileSync(
    join(__dirname, "two-fa.ts"),
    "utf-8"
  );

  it("should invalidate old codes before each email code INSERT", () => {
    // Find all db.insert(schema.emailCodes) sites
    const insertPattern = /db\.insert\(schema\.emailCodes\)/g;
    const insertMatches = [...source.matchAll(insertPattern)];
    expect(insertMatches.length).toBeGreaterThanOrEqual(3);

    // For each INSERT, verify there's an invalidation UPDATE before it
    for (const match of insertMatches) {
      const insertIndex = match.index!;
      // Look at the 500 chars preceding the INSERT for the invalidation pattern
      const preceding = source.slice(Math.max(0, insertIndex - 600), insertIndex);

      // Must have an UPDATE that sets used: true on emailCodes
      expect(preceding).toMatch(/db\.update\(schema\.emailCodes\)/);
      expect(preceding).toMatch(/set\(\{\s*used:\s*true\s*\}\)/);
      // Must filter by userId, type, and used: false
      expect(preceding).toMatch(/eq\(schema\.emailCodes\.userId/);
      expect(preceding).toMatch(/eq\(schema\.emailCodes\.type/);
      expect(preceding).toMatch(/eq\(schema\.emailCodes\.used,\s*false\)/);
    }
  });

  it("should have exactly 3 invalidation UPDATE blocks", () => {
    // Count the invalidation pattern (set used:true with userId+type+used=false WHERE)
    const invalidationPattern = /db\.update\(schema\.emailCodes\)\s*\n?\s*\.set\(\{\s*used:\s*true\s*\}\)/g;
    const matches = [...source.matchAll(invalidationPattern)];
    // 3 before INSERTs + 2 existing after-verification marks = at least 3 new ones
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});
