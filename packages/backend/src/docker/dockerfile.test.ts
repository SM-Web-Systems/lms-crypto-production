import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Dockerfile hardening", () => {
  const dockerfile = readFileSync(
    resolve(__dirname, "../../Dockerfile"),
    "utf-8"
  );

  it("base image is pinned to a digest (sha256:)", () => {
    const fromLine = dockerfile.split("\n").find((l) => l.startsWith("FROM "));
    expect(fromLine).toBeDefined();
    expect(fromLine).toMatch(/@sha256:[a-f0-9]{64}/);
  });

  it("contains a USER directive (non-root)", () => {
    const userLine = dockerfile.split("\n").find((l) => l.startsWith("USER "));
    expect(userLine).toBeDefined();
    expect(userLine).not.toMatch(/USER\s+root/);
  });
});
