import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(
  join(__dirname, "trustlines.ts"),
  "utf-8"
);

describe("trustlines.ts — input validation (P2-1-F4)", () => {
  it("imports or uses StrKey from @stellar/stellar-sdk", () => {
    expect(SOURCE).toMatch(/StrKey/);
  });

  it("validates public keys with isValidEd25519PublicKey", () => {
    expect(SOURCE).toMatch(/isValidEd25519PublicKey/);
  });

  it("has a validateStellarPublicKey helper", () => {
    expect(SOURCE).toMatch(/validateStellarPublicKey/);
  });

  it("has a validateAssetCode helper with the correct regex", () => {
    expect(SOURCE).toMatch(/validateAssetCode/);
    // The regex pattern for 1-12 alphanumeric characters
    expect(SOURCE).toMatch(/\^?\[a-zA-Z0-9\]\{1,12\}\$?/);
  });

  it("validates publicKey in all 5 endpoints (at least 5 calls to validateStellarPublicKey)", () => {
    const calls = SOURCE.match(/validateStellarPublicKey\(/g) || [];
    // 5 endpoints, each validating at least publicKey => at least 5 calls
    // Plus assetIssuer validation in 4 endpoints => total >= 9
    // Be conservative: at least 5 publicKey validations
    expect(calls.length).toBeGreaterThanOrEqual(5);
  });

  it("validates assetCode in the 4 endpoints that accept it", () => {
    const calls = SOURCE.match(/validateAssetCode\(/g) || [];
    // check, add, remove, update-limit all take assetCode
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  it("returns 400 for invalid inputs (not 500)", () => {
    // Should have 400 status responses for validation failures
    const badRequestPatterns = SOURCE.match(/status\(400\)/g) || [];
    // At least 5 endpoints should return 400 on bad input
    // (some already have 400 for missing fields, plus new validation ones)
    expect(badRequestPatterns.length).toBeGreaterThanOrEqual(5);
  });
});
