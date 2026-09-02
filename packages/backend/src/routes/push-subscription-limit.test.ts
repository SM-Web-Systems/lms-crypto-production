import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("push subscribe endpoint subscription limit", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "push.ts"),
    "utf-8"
  );

  it("should count existing subscriptions before INSERT in the subscribe handler", () => {
    // Find the subscribe handler section
    const subscribeIdx = source.indexOf('"/api/v1/push/subscribe"');
    expect(subscribeIdx).toBeGreaterThan(-1);

    // Get everything from subscribe route to the next route (unsubscribe)
    const unsubscribeIdx = source.indexOf('"/api/v1/push/unsubscribe"');
    const subscribeSection = source.slice(subscribeIdx, unsubscribeIdx);

    // Must have a COUNT query before the INSERT
    expect(subscribeSection).toMatch(/COUNT\(\*\)/i);
  });

  it("should enforce a max subscription limit of 10", () => {
    const subscribeIdx = source.indexOf('"/api/v1/push/subscribe"');
    const unsubscribeIdx = source.indexOf('"/api/v1/push/unsubscribe"');
    const subscribeSection = source.slice(subscribeIdx, unsubscribeIdx);

    // Must reference a limit of 10
    expect(subscribeSection).toMatch(/>=\s*10/);
  });

  it("should return 429 when subscription limit is exceeded", () => {
    const subscribeIdx = source.indexOf('"/api/v1/push/subscribe"');
    const unsubscribeIdx = source.indexOf('"/api/v1/push/unsubscribe"');
    const subscribeSection = source.slice(subscribeIdx, unsubscribeIdx);

    expect(subscribeSection).toContain("429");
    expect(subscribeSection).toMatch(/[Mm]aximum.*subscriptions/);
  });
});
