import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "trustlines.ts"), "utf-8");

describe("Trustline POST rate limiting (P2-1-F3)", () => {
  it("trustlines/add has rateLimit config", () => {
    const addIdx = src.indexOf("trustlines/add");
    const section = src.substring(addIdx, addIdx + 300);
    expect(section).toContain("rateLimit");
  });

  it("trustlines/remove has rateLimit config", () => {
    const removeIdx = src.indexOf("trustlines/remove");
    const section = src.substring(removeIdx, removeIdx + 300);
    expect(section).toContain("rateLimit");
  });

  it("trustlines/update-limit has rateLimit config", () => {
    const updateIdx = src.indexOf("trustlines/update-limit");
    const section = src.substring(updateIdx, updateIdx + 300);
    expect(section).toContain("rateLimit");
  });
});
