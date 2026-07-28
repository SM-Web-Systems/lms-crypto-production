import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("P1-3-F3: Auto-suspension concurrency guard", () => {
  const filePath = path.resolve(__dirname, "auto-suspension.ts");
  const source = fs.readFileSync(filePath, "utf-8");

  it("has isRunning guard variable", () => {
    expect(source).toMatch(/let\s+isRunning/);
  });

  it("checks isRunning before executing", () => {
    expect(source).toContain("if (isRunning)");
  });

  it("clears isRunning in finally block", () => {
    expect(source).toMatch(/finally\s*\{[\s\S]*?isRunning\s*=\s*false/);
  });
});
