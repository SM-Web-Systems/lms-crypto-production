import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("P1-2-F2: Billing TOCTOU guard", () => {
  const billingPath = path.resolve(__dirname, "billing.service.ts");
  const billingSrc = fs.readFileSync(billingPath, "utf-8");

  const walletsPath = path.resolve(__dirname, "../routes/wallets.ts");
  const walletsSrc = fs.readFileSync(walletsPath, "utf-8");

  it("exports checkWalletBillingTx from billing.service.ts", () => {
    expect(billingSrc).toMatch(/export\s+(async\s+)?function\s+checkWalletBillingTx/);
  });

  it("uses FOR UPDATE lock in checkWalletBillingTx", () => {
    // Find the function body
    const fnIdx = billingSrc.indexOf("checkWalletBillingTx");
    const fnBlock = billingSrc.slice(fnIdx, fnIdx + 2000);
    expect(fnBlock).toMatch(/\.for\s*\(\s*["']update["']\s*\)|FOR\s+UPDATE/i);
  });

  it("wallets.ts calls checkWalletBillingTx inside the transaction", () => {
    // The transaction block starts with db.transaction
    const txIdx = walletsSrc.indexOf("db.transaction");
    const txBlock = walletsSrc.slice(txIdx, txIdx + 2000);
    expect(txBlock).toContain("checkWalletBillingTx");
  });

  it("wallets.ts still has pre-flight checkWalletBilling outside transaction", () => {
    const txIdx = walletsSrc.indexOf("db.transaction");
    const preflightBlock = walletsSrc.slice(0, txIdx);
    expect(preflightBlock).toContain("checkWalletBilling");
  });
});
