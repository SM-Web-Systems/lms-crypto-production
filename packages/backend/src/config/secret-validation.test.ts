import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const configSrc = readFileSync(join(__dirname, "index.ts"), "utf-8");

describe("P2-4-F2: empty secret defaults crash in production", () => {
  it("has a production guard that crashes on empty PLATFORM_SECRET", () => {
    // Must have a block that checks production AND PLATFORM_SECRET together
    // e.g., if (NODE_ENV === "production" && !PLATFORM_SECRET) process.exit(1)
    const guardSection = configSrc.match(
      /production[\s\S]{0,300}PLATFORM_SECRET[\s\S]{0,100}process\.exit/
    ) || configSrc.match(
      /PLATFORM_SECRET[\s\S]{0,300}production[\s\S]{0,100}process\.exit/
    );
    expect(guardSection).toBeTruthy();
  });

  it("has a production guard that crashes on empty SIGNING_SECRET_KEY", () => {
    const guardSection = configSrc.match(
      /production[\s\S]{0,300}SIGNING_SECRET_KEY[\s\S]{0,100}process\.exit/
    ) || configSrc.match(
      /SIGNING_SECRET_KEY[\s\S]{0,300}production[\s\S]{0,100}process\.exit/
    );
    expect(guardSection).toBeTruthy();
  });
});
