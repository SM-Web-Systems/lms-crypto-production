/**
 * Source-assertion test: /tokens/curated/seed must require admin auth + role check (P3-9-F1)
 *
 * The seed endpoint is a privileged operation (writes to the database). It must:
 *   1. Use verifyInternalAdmin (not regular authMiddleware)
 *   2. Restrict to super_admin / platform_admin roles
 *   3. Return 403 for non-privileged admin roles
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "curated-tokens.ts"),
  "utf-8",
);

describe("curated-tokens /seed admin guard (source assertion)", () => {
  // Extract the seed handler block (from the POST "/api/v1/tokens/curated/seed" to the end)
  const seedIdx = SRC.indexOf("/api/v1/tokens/curated/seed");
  const seedBlock = SRC.slice(seedIdx);

  it("uses verifyInternalAdmin middleware, not regular authMiddleware", () => {
    // The file should import verifyInternalAdmin
    expect(SRC).toContain("verifyInternalAdmin");
    // The seed handler should use verifyInternalAdmin in its preHandler
    expect(seedBlock).toContain("verifyInternalAdmin");
  });

  it("checks for admin role (super_admin / platform_admin)", () => {
    // The seed handler must contain a role check
    expect(seedBlock).toMatch(/super_admin|platform_admin|CREDIT_ROLES/);
  });

  it("returns 403 for non-privileged roles", () => {
    expect(seedBlock).toContain("403");
  });
});
