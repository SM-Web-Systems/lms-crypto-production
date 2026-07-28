import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Source-assertion test: verifies that the unsuspend() function in
 * auto-suspension.ts guards against accidentally clearing manually-imposed
 * suspensions. The WHERE clause must check suspensionReason and suspendedAt.
 */
describe("auto-suspension unsuspend() guard (P1-3-F2)", () => {
  const src = readFileSync(
    join(__dirname, "auto-suspension.ts"),
    "utf-8",
  );

  // Extract the unsuspend function body (from "async function unsuspend" to next function or end)
  const unsuspendMatch = src.match(
    /async function unsuspend\b[\s\S]*?^}/m,
  );
  const unsuspendBody = unsuspendMatch?.[0] ?? "";

  it("unsuspend() WHERE clause includes suspensionReason guard", () => {
    expect(unsuspendBody).toContain("suspensionReason");
  });

  it("unsuspend() WHERE clause includes isNotNull check", () => {
    expect(unsuspendBody).toContain("isNotNull");
  });

  it("unsuspend() WHERE clause includes inArray for allowed reasons", () => {
    expect(unsuspendBody).toContain("inArray");
  });

  it("imports inArray from drizzle-orm", () => {
    expect(src).toMatch(/import\s*\{[^}]*inArray[^}]*\}\s*from\s*["']drizzle-orm["']/);
  });

  it("imports isNotNull from drizzle-orm", () => {
    expect(src).toMatch(/import\s*\{[^}]*isNotNull[^}]*\}\s*from\s*["']drizzle-orm["']/);
  });
});
