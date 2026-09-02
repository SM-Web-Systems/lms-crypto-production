import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("server.ts — PII logging guards (P0-3-F14)", () => {
  const src = readFileSync(
    join(__dirname, "../server.ts"),
    "utf-8"
  );

  it("should not have unguarded console.log with userId in sign-and-submit handlers", () => {
    const lines = src.split("\n");
    const userIdLogs = lines.filter(
      (l) => l.includes("console.log") && l.includes("userId") && l.includes("sign-and-submit") && !l.trim().startsWith("//")
    );
    expect(userIdLogs.length).toBe(0);
  });

  it("should not have unguarded console.log with publicKey in sign-and-submit handlers", () => {
    const lines = src.split("\n");
    const pkLogs = lines.filter(
      (l) => l.includes("console.log") && l.includes("publicKey") && !l.trim().startsWith("//")
    );
    expect(pkLogs.length).toBe(0);
  });
});
