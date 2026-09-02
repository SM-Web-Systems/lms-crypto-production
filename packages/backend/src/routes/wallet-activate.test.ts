import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const walletsSrc = readFileSync(join(__dirname, "wallets.ts"), "utf-8");

describe("Activate wallet — verify before deactivate (P0-3-F8)", () => {
  it("verifies target wallet exists before deactivating all", () => {
    // Find the activate handler
    const activateIdx = walletsSrc.indexOf('wallets/:id/activate"');
    expect(activateIdx).toBeGreaterThan(-1);

    // Get the handler body (up to next app. route)
    const nextRouteIdx = walletsSrc.indexOf("app.", activateIdx + 1);
    const handler = walletsSrc.substring(activateIdx, nextRouteIdx > 0 ? nextRouteIdx : activateIdx + 2000);

    // The select (ownership verify) should come BEFORE the deactivate-all update
    const selectIdx = handler.indexOf(".select(");
    const deactivateIdx = handler.indexOf("isActive: false");
    expect(selectIdx).toBeGreaterThan(-1);
    expect(deactivateIdx).toBeGreaterThan(-1);
    expect(selectIdx).toBeLessThan(deactivateIdx);
  });

  it("wraps activate in a transaction", () => {
    const activateIdx = walletsSrc.indexOf('wallets/:id/activate"');
    const nextRouteIdx = walletsSrc.indexOf("app.", activateIdx + 1);
    const handler = walletsSrc.substring(activateIdx, nextRouteIdx > 0 ? nextRouteIdx : activateIdx + 2000);
    expect(handler).toContain("db.transaction");
  });
});
