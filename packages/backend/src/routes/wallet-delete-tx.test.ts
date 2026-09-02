import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const walletsSrc = readFileSync(join(__dirname, "wallets.ts"), "utf-8");

/**
 * P0-3-F7 — Wallet deletion + auto-activate must be transactional.
 * If the DELETE succeeds but the auto-activate fails, the user is left with
 * no active wallet (data integrity violation).
 */
describe("Wallet deletion transactional (P0-3-F7)", () => {
  it("delete handler wraps operations in db.transaction", () => {
    // The delete wallet handler should use db.transaction()
    // Find the DELETE route section and verify it contains a transaction call
    const deleteSection = walletsSrc.indexOf("delete(schema.userWallets)");
    expect(deleteSection).toBeGreaterThan(-1);

    // Look for db.transaction in the vicinity (within the handler)
    const handlerWindow = walletsSrc.substring(
      Math.max(0, deleteSection - 300),
      deleteSection + 600,
    );
    expect(handlerWindow).toContain("db.transaction");
  });
});
