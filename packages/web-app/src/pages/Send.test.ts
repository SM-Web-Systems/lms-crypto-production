import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const sendSrc = readFileSync(join(__dirname, "Send.tsx"), "utf-8");

describe("Send.tsx destination validation (P0-4-F4)", () => {
  it("uses StrKey.isValidEd25519PublicKey for address validation", () => {
    expect(sendSrc).toContain("isValidEd25519PublicKey");
  });

  it("does not use naive prefix+length check", () => {
    expect(sendSrc).not.toContain('startsWith("G")');
  });
});
