import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("contacts.ts rate limiting", () => {
  const source = readFileSync(join(__dirname, "contacts.ts"), "utf-8");

  // Find all route registrations: app.get(, app.post(, app.patch(, app.delete(
  const routePattern = /app\.(get|post|patch|delete)\s*\(/g;
  const routes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = routePattern.exec(source)) !== null) {
    routes.push(match[1].toUpperCase());
  }

  it("should have exactly 4 route handlers", () => {
    expect(routes).toHaveLength(4);
  });

  it("should have rateLimit config on every route handler", () => {
    // Split source by route registrations and check each block has rateLimit
    const blocks = source.split(/app\.(get|post|patch|delete)\s*\(/);
    // blocks[0] is preamble, then alternating: method, body, method, body...
    for (let i = 2; i < blocks.length; i += 2) {
      const routeBlock = blocks[i];
      const method = blocks[i - 1].toUpperCase();
      expect(routeBlock, `${method} handler should include rateLimit config`).toContain("rateLimit");
    }
  });

  it("should have at least 4 rateLimit occurrences", () => {
    const rateLimitCount = (source.match(/rateLimit/g) || []).length;
    expect(rateLimitCount).toBeGreaterThanOrEqual(4);
  });
});
