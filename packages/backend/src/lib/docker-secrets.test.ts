import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("resolveDatabaseUrl", () => {
  let tmpDir: string;
  const origEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "docker-secrets-test-"));
    // Clear relevant env vars
    delete process.env.DATABASE_URL;
    delete process.env.DB_HOST;
    delete process.env.DB_USER;
    delete process.env.DB_NAME;
    delete process.env.DB_PASSWORD_FILE;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns DATABASE_URL when set directly", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@host:5432/db";
    const { resolveDatabaseUrl } = await import("./docker-secrets");
    expect(resolveDatabaseUrl()).toBe("postgresql://user:pass@host:5432/db");
  });

  it("constructs URL from DB_* env vars + secret file", async () => {
    const secretFile = path.join(tmpDir, "db_password");
    fs.writeFileSync(secretFile, "MyS3cret!\n"); // trailing newline should be trimmed
    process.env.DB_HOST = "amma-db";
    process.env.DB_USER = "stellarwallet";
    process.env.DB_NAME = "stellarwallet";
    process.env.DB_PASSWORD_FILE = secretFile;
    // Force fresh import
    vi.resetModules();
    const { resolveDatabaseUrl } = await import("./docker-secrets");
    const url = resolveDatabaseUrl();
    expect(url).toBe("postgresql://stellarwallet:MyS3cret%21@amma-db:5432/stellarwallet");
  });

  it("URL-encodes special characters in password", async () => {
    const secretFile = path.join(tmpDir, "db_password");
    fs.writeFileSync(secretFile, "NaLeDi2026$Wallet!");
    process.env.DB_HOST = "amma-db";
    process.env.DB_USER = "stellarwallet";
    process.env.DB_NAME = "stellarwallet";
    process.env.DB_PASSWORD_FILE = secretFile;
    vi.resetModules();
    const { resolveDatabaseUrl } = await import("./docker-secrets");
    const url = resolveDatabaseUrl();
    expect(url).toContain("NaLeDi2026%24Wallet%21");
  });

  it("throws if neither DATABASE_URL nor DB_PASSWORD_FILE is set", async () => {
    vi.resetModules();
    const { resolveDatabaseUrl } = await import("./docker-secrets");
    expect(() => resolveDatabaseUrl()).toThrow();
  });
});
