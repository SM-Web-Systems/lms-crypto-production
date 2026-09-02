import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("P3-8-F1: Push subscription takeover guard", () => {
  const filePath = path.resolve(__dirname, "push.ts");
  const source = fs.readFileSync(filePath, "utf-8");

  const conflictIdx = source.indexOf("onConflictDoUpdate");
  const conflictBlock = source.slice(conflictIdx, conflictIdx + 300);

  it("does not include userId in onConflictDoUpdate set clause", () => {
    const setMatch = conflictBlock.match(/set:\s*\{([^}]+)\}/);
    expect(setMatch).toBeTruthy();
    expect(setMatch![1]).not.toContain("userId");
  });

  it("has a WHERE guard on the conflict update", () => {
    expect(conflictBlock).toContain("where:");
  });
});
