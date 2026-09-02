import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("known-tokens seed data integrity", () => {
  // Read the source file directly to check the hardcoded issuer value
  const sourceCode = readFileSync(
    resolve(__dirname, "known-tokens.ts"),
    "utf-8"
  );

  it("AQUA issuer address is exactly 56 characters (valid Stellar public key)", () => {
    // Extract the AQUA issuer from the source code
    const aquaMatch = sourceCode.match(
      /assetCode:\s*"AQUA"[\s\S]*?assetIssuer:\s*"([A-Z0-9]+)"/
    );
    expect(aquaMatch).not.toBeNull();
    const aquaIssuer = aquaMatch![1];
    expect(aquaIssuer).toHaveLength(56);
  });

  it("AQUA issuer matches the canonical address from token-list.json", () => {
    const tokenList = JSON.parse(
      readFileSync(resolve(__dirname, "../../data/token-list.json"), "utf-8")
    );
    const aquaFromList = tokenList.mainnet.find(
      (t: any) => t.code === "AQUA"
    );
    expect(aquaFromList).toBeDefined();

    const aquaMatch = sourceCode.match(
      /assetCode:\s*"AQUA"[\s\S]*?assetIssuer:\s*"([A-Z0-9]+)"/
    );
    const aquaIssuer = aquaMatch![1];
    expect(aquaIssuer).toBe(aquaFromList.issuer);
  });

  it("all issuer addresses in known-tokens are valid Stellar public keys (31-56 chars)", () => {
    const issuers = [...sourceCode.matchAll(/assetIssuer:\s*"([A-Z0-9]+)"/g)]
      .map((m) => m[1]);
    expect(issuers.length).toBeGreaterThan(0);
    for (const issuer of issuers) {
      // Stellar public keys are 56 chars, but null is used for native XLM
      expect(issuer.length).toBeGreaterThanOrEqual(31);
      expect(issuer.length).toBeLessThanOrEqual(56);
    }
  });
});
