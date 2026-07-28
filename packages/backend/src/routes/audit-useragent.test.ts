import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const authSrc = readFileSync(join(__dirname, "auth.ts"), "utf-8");
const serverSrc = readFileSync(join(__dirname, "..", "server.ts"), "utf-8");
const adminSrc = readFileSync(join(__dirname, "admin.ts"), "utf-8");

/**
 * Source-assertion test: every auditLog() call in a request handler must
 * include `userAgent:` so the user-agent header is persisted in audit rows.
 */

function extractAuditLogBlocks(src: string): string[] {
  const blocks: string[] = [];
  const tag = "auditLog(";
  let idx = 0;
  while ((idx = src.indexOf(tag, idx)) !== -1) {
    // Walk forward from the opening paren, counting depth
    const start = idx;
    let depth = 0;
    let pos = idx + tag.length - 1; // points at '('
    while (pos < src.length) {
      if (src[pos] === "(") depth++;
      else if (src[pos] === ")") { depth--; if (depth === 0) break; }
      pos++;
    }
    blocks.push(src.slice(start, pos + 1));
    idx = pos + 1;
  }
  return blocks;
}

describe("auditLog calls must include userAgent (P2-7-F4)", () => {
  describe("auth.ts", () => {
    const blocks = extractAuditLogBlocks(authSrc);

    it("has 9 auditLog calls", () => {
      expect(blocks.length).toBe(9);
    });

    it("every auditLog call includes userAgent:", () => {
      for (const block of blocks) {
        expect(block).toContain("userAgent:");
      }
    });
  });

  describe("server.ts", () => {
    const blocks = extractAuditLogBlocks(serverSrc);

    it("has 2 auditLog calls in request handlers", () => {
      // Filter to only calls that reference request (i.e. in route handlers)
      const requestBlocks = blocks.filter((b) => b.includes("request"));
      expect(requestBlocks.length).toBe(2);
    });

    it("every request-handler auditLog call includes userAgent:", () => {
      const requestBlocks = blocks.filter((b) => b.includes("request"));
      for (const block of requestBlocks) {
        expect(block).toContain("userAgent:");
      }
    });
  });

  describe("admin.ts", () => {
    const blocks = extractAuditLogBlocks(adminSrc);

    it("has 8 auditLog calls", () => {
      expect(blocks.length).toBe(8);
    });

    it("every auditLog call includes userAgent:", () => {
      for (const block of blocks) {
        expect(block).toContain("userAgent:");
      }
    });
  });
});
