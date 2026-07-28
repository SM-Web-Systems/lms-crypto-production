import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("contacts POST Stellar address validation (P3-6-F2)", () => {
  const src = readFileSync(resolve(__dirname, "contacts.ts"), "utf-8");

  it("should import StrKey from @stellar/stellar-sdk", () => {
    expect(src).toMatch(/import\s*\{[^}]*StrKey[^}]*\}\s*from\s*["']@stellar\/stellar-sdk["']/);
  });

  it("should validate address with StrKey.isValidEd25519PublicKey in POST handler", () => {
    const postIdx = src.indexOf('app.post("/api/v1/contacts"');
    expect(postIdx).toBeGreaterThan(-1);

    // Extract POST handler section
    const afterPost = src.slice(postIdx);
    const nextRoute = afterPost.indexOf("\n  app.", 1);
    const postSection = nextRoute > 0 ? afterPost.slice(0, nextRoute) : afterPost;

    expect(postSection).toContain("StrKey.isValidEd25519PublicKey");
    expect(postSection).toContain("Invalid Stellar address");
    expect(postSection).toMatch(/status\(400\)/);
  });
});
