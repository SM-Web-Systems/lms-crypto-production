import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("api.ts — token storage security", () => {
  const source = readFileSync(resolve(__dirname, "api.ts"), "utf-8");

  it("does not use localStorage for token storage", () => {
    expect(source).not.toMatch(/localStorage\.(get|set|remove)Item\s*\(\s*["']stellar_(access|refresh)_token["']/);
  });

  it("does not reference localStorage at all", () => {
    const localStorageRefs = (source.match(/localStorage/g) || []).length;
    expect(localStorageRefs).toBe(0);
  });
});
