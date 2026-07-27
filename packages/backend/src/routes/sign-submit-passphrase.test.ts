import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const serverSrc = readFileSync(join(__dirname, "..", "server.ts"), "utf-8");

describe("sign-and-submit networkPassphrase (P0-3-F6)", () => {
  it("does not use client-supplied networkPassphrase as fallback", () => {
    // After fix, server should NOT have "clientPassphrase ||" pattern
    expect(serverSrc).not.toContain("clientPassphrase ||");
  });

  it("always uses server-configured networkPassphrase", () => {
    // The passphrase variable should be assigned directly from stellarClient
    expect(serverSrc).toContain("stellarClient.networkPassphrase;");
  });
});
