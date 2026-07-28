import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("push /test endpoint rate limiting", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "push.ts"),
    "utf-8"
  );

  it("should have rateLimit config on the /push/test route", () => {
    // Extract the section from the /push/test route registration up to its handler
    const testRouteIdx = source.indexOf('"/api/v1/push/test"');
    expect(testRouteIdx).toBeGreaterThan(-1);

    // Grab a window around the route options (between the path string and the handler)
    const sectionAfter = source.slice(testRouteIdx, testRouteIdx + 400);
    expect(sectionAfter).toContain("rateLimit");
  });

  it("should NOT have rateLimit on /push/subscribe", () => {
    const idx = source.indexOf('"/api/v1/push/subscribe"');
    expect(idx).toBeGreaterThan(-1);
    const section = source.slice(idx, idx + 400);
    expect(section).not.toContain("rateLimit");
  });

  it("should NOT have rateLimit on /push/unsubscribe", () => {
    const idx = source.indexOf('"/api/v1/push/unsubscribe"');
    expect(idx).toBeGreaterThan(-1);
    const section = source.slice(idx, idx + 400);
    expect(section).not.toContain("rateLimit");
  });
});
