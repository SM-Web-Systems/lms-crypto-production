import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SOURCE = fs.readFileSync(
  path.join(__dirname, "trustlines.ts"),
  "utf-8"
);

/**
 * Extract catch block bodies from the source code.
 * Matches `catch (error: any) { ... }` blocks by counting braces.
 */
function extractCatchBlocks(source: string): string[] {
  const blocks: string[] = [];
  const regex = /catch\s*\(error:\s*any\)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth++;
      if (source[i] === "}") depth--;
      i++;
    }
    blocks.push(source.slice(start, i - 1));
  }
  return blocks;
}

describe("trustlines.ts error sanitization (P2-1-F5)", () => {
  const catchBlocks = extractCatchBlocks(SOURCE);

  it("should have exactly 5 catch blocks", () => {
    expect(catchBlocks.length).toBe(5);
  });

  it("should NOT leak error.message in any reply.send()", () => {
    for (const block of catchBlocks) {
      // No reply.send/reply.status...send containing error.message
      expect(block).not.toMatch(/\.send\(\s*\{[^}]*error\.message/);
    }
  });

  it("should use 'Internal server error' in 500 responses", () => {
    for (const block of catchBlocks) {
      // Every catch block that sends a 500 must use the sanitized message
      if (block.includes("status(500)")) {
        expect(block).toContain('"Internal server error"');
      }
    }
  });

  it("should include console.warn for server-side debugging", () => {
    for (const block of catchBlocks) {
      // Every catch block with a 500 path should log for debugging
      if (block.includes("status(500)")) {
        expect(block).toMatch(/console\.warn\(/);
      }
    }
  });
});
