import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("GET /wallets — encryptedSecret excluded (P0-3-F1)", () => {
  it("wallets.ts select clause does not include encryptedSecret", () => {
    const src = readFileSync(
      join(__dirname, "wallets.ts"),
      "utf-8",
    );

    // Find the GET /wallets handler's select block
    const getWalletsIdx = src.indexOf('"/api/v1/wallets"');
    // Look at the select() call after the route declaration
    const afterRoute = src.slice(getWalletsIdx, getWalletsIdx + 1500);

    // Verify explicit select (not .select() with no args)
    expect(afterRoute).toMatch(/\.select\(\{/);

    // Verify encryptedSecret is NOT in the select fields
    const selectMatch = afterRoute.match(/\.select\(\{([^}]+)\}\)/s);
    expect(selectMatch).toBeTruthy();
    expect(selectMatch![1]).not.toContain("encryptedSecret");
  });

  it("GET /wallets response schema does not include encryptedSecret", () => {
    const src = readFileSync(
      join(__dirname, "wallets.ts"),
      "utf-8",
    );

    // Find the response schema for GET /wallets
    const getIdx = src.indexOf('"/api/v1/wallets"');
    const nextRouteIdx = src.indexOf('"/api/v1/wallets"', getIdx + 1);
    const getBlock = src.slice(getIdx, nextRouteIdx > 0 ? nextRouteIdx : getIdx + 1500);

    // Extract the response schema section
    const responseIdx = getBlock.indexOf("response:");
    const responseBlock = getBlock.slice(responseIdx, responseIdx + 500);

    expect(responseBlock).not.toContain("encryptedSecret");
  });
});
