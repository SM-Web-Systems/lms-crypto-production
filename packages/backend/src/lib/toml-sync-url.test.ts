import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const source = readFileSync(
  resolve(__dirname, "toml-sync.ts"),
  "utf-8"
);

describe("toml-sync URL scheme validation", () => {
  it("defines an isValidImageUrl function", () => {
    expect(source).toMatch(/function\s+isValidImageUrl\s*\(/);
  });

  it("calls isValidImageUrl before the imageUrl DB write", () => {
    // The imageUrl variable must be validated before being written to DB
    const imageUrlWriteIdx = source.indexOf("tomlImage: imageUrl");
    expect(imageUrlWriteIdx).toBeGreaterThan(-1);

    const beforeWrite = source.slice(0, imageUrlWriteIdx);
    expect(beforeWrite).toMatch(/isValidImageUrl\(imageUrl\)/);
  });

  it("calls isValidImageUrl before the orgLogo DB write", () => {
    // The orgLogo value must be validated before being written to DB
    const orgLogoWriteIdx = source.indexOf("tomlImage: orgLogo");
    expect(orgLogoWriteIdx).toBeGreaterThan(-1);

    const beforeWrite = source.slice(0, orgLogoWriteIdx);
    expect(beforeWrite).toMatch(/isValidImageUrl\(orgLogo/);
  });

  it("validates https: protocol only", () => {
    expect(source).toMatch(/parsed\.protocol\s*===\s*["']https:["']/);
  });
});
