import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("curated-tokens /seed endpoint security", () => {
  const filePath = path.resolve(__dirname, "curated-tokens.ts");
  const source = fs.readFileSync(filePath, "utf-8");

  // Extract the POST /seed route block (from app.post containing "/seed" to its closing)
  const seedIdx = source.indexOf('"/api/v1/tokens/curated/seed"');
  const seedBlock = source.slice(seedIdx, seedIdx + 400);

  it("should have verifyInternalAdmin on the /seed endpoint", () => {
    expect(seedBlock).toContain("verifyInternalAdmin");
  });

  it("should have rate limiting on the /seed endpoint", () => {
    expect(seedBlock).toContain("rateLimit");
  });

  it("should NOT have authMiddleware on the GET /curated endpoint", () => {
    const getIdx = source.indexOf('"/api/v1/tokens/curated"');
    const getBlock = source.slice(getIdx, getIdx + 400);
    expect(getBlock).not.toContain("authMiddleware");
  });
});
