import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("auth.ts — verification token lifecycle (P0-1-F16)", () => {
  const src = readFileSync(
    join(__dirname, "../routes/auth.ts"),
    "utf-8"
  );

  it("should DELETE old verification tokens before inserting new ones in resend-verification", () => {
    // Find the resend-verification handler
    const resendIdx = src.indexOf("resend-verification");
    expect(resendIdx).toBeGreaterThan(-1);
    const handlerBlock = src.slice(resendIdx, resendIdx + 2000);
    // Must contain a DELETE before the INSERT
    const deleteIdx = handlerBlock.indexOf("DELETE FROM email_verification_tokens");
    const insertIdx = handlerBlock.indexOf("INSERT INTO email_verification_tokens");
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeLessThan(insertIdx);
  });
});
