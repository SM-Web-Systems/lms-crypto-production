import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("P0-2-F3: CREDIT_ROLES renamed to PRIVILEGED_ROLES", () => {
  const filePath = path.resolve(__dirname, "admin.ts");
  const source = fs.readFileSync(filePath, "utf-8");

  it("defines PRIVILEGED_ROLES", () => {
    expect(source).toMatch(/const\s+PRIVILEGED_ROLES/);
  });

  it("does not contain CREDIT_ROLES", () => {
    expect(source).not.toContain("CREDIT_ROLES");
  });
});
