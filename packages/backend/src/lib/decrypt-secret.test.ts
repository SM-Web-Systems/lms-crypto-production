import { describe, it, expect } from "vitest";
import { decryptSecret } from "./decrypt-secret";

describe("P0-3-F5: decrypt-secret input validation", () => {
  it("throws on empty string input", async () => {
    await expect(decryptSecret("", "1234")).rejects.toThrow(/too short|missing/i);
  });

  it("throws on short base64 input (< 60 chars)", async () => {
    await expect(decryptSecret("YWJj", "1234")).rejects.toThrow(/too short|missing/i);
  });

  it("throws on decoded buffer too short for salt+iv+ciphertext+tag", async () => {
    // 44 base64 chars = 33 bytes decoded, less than salt(16)+iv(12)+tag(16)+1 = 45
    const shortPayload = Buffer.alloc(33).toString("base64");
    await expect(decryptSecret(shortPayload, "1234")).rejects.toThrow(/too short|corrupt/i);
  });

  it("throws on valid-length garbage (bad decrypt, not CPU burn)", async () => {
    // 80 bytes = enough to pass length check but garbage data
    const garbage = Buffer.alloc(80, 0x42).toString("base64");
    await expect(decryptSecret(garbage, "1234")).rejects.toThrow();
  });
});
