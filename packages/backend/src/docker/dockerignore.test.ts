import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const dockerignorePath = join(__dirname, "..", "..", ".dockerignore");

describe(".dockerignore (P4-8-F6/F7)", () => {
  it("exists", () => {
    expect(existsSync(dockerignorePath)).toBe(true);
  });

  it("excludes .env files", () => {
    const content = readFileSync(dockerignorePath, "utf-8");
    expect(content).toContain(".env");
  });

  it("excludes node_modules", () => {
    const content = readFileSync(dockerignorePath, "utf-8");
    expect(content).toContain("node_modules");
  });

  it("excludes .git", () => {
    const content = readFileSync(dockerignorePath, "utf-8");
    expect(content).toContain(".git");
  });
});
