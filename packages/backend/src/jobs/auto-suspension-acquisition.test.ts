import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("enforceDebtLimit — acquisition mode guard", () => {
  const src = readFileSync(
    join(__dirname, "auto-suspension.ts"),
    "utf-8",
  );

  // Extract the enforceDebtLimit function body (from declaration to next top-level async function)
  const fnMatch = src.match(
    /async function enforceDebtLimit\(\)[\s\S]*?^}/m,
  );

  it("enforceDebtLimit function exists in source", () => {
    expect(fnMatch).not.toBeNull();
  });

  it("filters by acquisitionModeEnabled in WHERE clause", () => {
    expect(fnMatch![0]).toContain("acquisitionModeEnabled");
  });
});
