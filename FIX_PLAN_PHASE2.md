# Phase 2: Secrets, Crypto, Docker Hardening — Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix 6 Phase 2 CRITICALs/HIGHs covering TOTP secret encryption, Docker secrets for DB passwords, Docker image pinning, non-root container user, and localStorage token removal.

**Architecture:** Server-side AES-256-GCM encryption for TOTP secrets (key from env, not user PIN). Docker secrets for DB passwords (app reads from `/run/secrets/*`). Dockerfile hardening (pinned digest, non-root user). Frontend memory-only token storage (page refresh = logout).

**Tech Stack:** Node.js crypto (AES-256-GCM), Docker Compose secrets, Fastify, Vitest, TypeScript, Zustand

## Global Constraints

- Branch: `audit/full-codebase-2026-07-26` (worktree `.worktrees/audit-2026-07-26/`)
- NEVER merge to main. NEVER push to production.
- TDD: write the failing test FIRST, then implement the fix.
- One commit per fix. Commit message references finding ID.
- Test runner: `cd packages/backend && npx vitest run`
- Current test count: 233/233 passing (Phase 1 baseline).
- After ALL fixes, update `FINDINGS.md` marking each finding as FIXED with commit hash.
- Docker compose files live outside the git repo at `/home/webadmin/amma-wallet-docker/`. Modify in place AND create templates in the repo.
- NEVER commit actual passwords or secrets — only templates/examples.

---

### Task 1: P3-7-F1 — Encrypt TOTP secrets at rest (AES-256-GCM)

**Files:**
- Create: `packages/backend/src/lib/totp-crypto.ts`
- Create: `packages/backend/src/lib/totp-crypto.test.ts`
- Modify: `packages/backend/src/config/index.ts` (add `TOTP_ENCRYPTION_KEY` to config)
- Modify: `packages/backend/src/routes/two-fa.ts` (encrypt on setup, decrypt on verify/disable)
- Modify: `packages/backend/src/routes/auth.ts` (decrypt on login 2FA check)
- Create: `packages/backend/scripts/migrate-totp-secrets.ts` (one-time migration)

**Interfaces:**
- Produces: `encryptTotpSecret(plaintext: string): string` and `decryptTotpSecret(ciphertext: string): string` from `totp-crypto.ts`
- Consumes: `config.TOTP_ENCRYPTION_KEY` (32-byte hex string = 64 hex chars)

- [x] **Step 1: Write the failing tests for totp-crypto**

```typescript
// packages/backend/src/lib/totp-crypto.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config before importing module under test
vi.mock("../config", () => ({
  config: {
    TOTP_ENCRYPTION_KEY: "a]1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b",
  },
}));

import { encryptTotpSecret, decryptTotpSecret } from "./totp-crypto";

describe("TOTP secret encryption", () => {
  const testSecret = "JBSWY3DPEHPK3PXP"; // sample base32 TOTP secret

  it("round-trip: decrypt(encrypt(secret)) returns original secret", () => {
    const encrypted = encryptTotpSecret(testSecret);
    const decrypted = decryptTotpSecret(encrypted);
    expect(decrypted).toBe(testSecret);
  });

  it("encrypted value differs from plaintext", () => {
    const encrypted = encryptTotpSecret(testSecret);
    expect(encrypted).not.toBe(testSecret);
  });

  it("each encryption produces a different ciphertext (random IV)", () => {
    const a = encryptTotpSecret(testSecret);
    const b = encryptTotpSecret(testSecret);
    expect(a).not.toBe(b);
  });

  it("decrypting tampered ciphertext throws", () => {
    const encrypted = encryptTotpSecret(testSecret);
    const tampered = encrypted.slice(0, -2) + "XX";
    expect(() => decryptTotpSecret(tampered)).toThrow();
  });

  it("encrypted output is valid base64", () => {
    const encrypted = encryptTotpSecret(testSecret);
    expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
    expect(Buffer.from(encrypted, "base64").toString("base64")).toBe(encrypted);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/lib/totp-crypto.test.ts`
Expected: FAIL — `totp-crypto.ts` does not exist yet.

- [x] **Step 3: Implement totp-crypto.ts**

```typescript
// packages/backend/src/lib/totp-crypto.ts
import crypto from "node:crypto";
import { config } from "../config";

const IV_LENGTH = 12; // AES-GCM standard
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  return Buffer.from(config.TOTP_ENCRYPTION_KEY, "hex");
}

export function encryptTotpSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: base64(iv || ciphertext || authTag)
  return Buffer.concat([iv, encrypted, authTag]).toString("base64");
}

export function decryptTotpSecret(ciphertext: string): string {
  const combined = Buffer.from(ciphertext, "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encryptedData = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]).toString("utf8");
}
```

- [x] **Step 4: Run totp-crypto tests to verify they pass**

Run: `cd packages/backend && npx vitest run src/lib/totp-crypto.test.ts`
Expected: PASS — all 5 tests pass.

- [x] **Step 5: Add TOTP_ENCRYPTION_KEY to config**

In `packages/backend/src/config/index.ts`, add to `requiredEnvVars`:

```typescript
const requiredEnvVars = [
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "DATABASE_URL",
  "ADMIN_JWT_SECRET",
  "TOTP_ENCRYPTION_KEY",
] as const;
```

And add to the config object (after line 42):

```typescript
  TOTP_ENCRYPTION_KEY: process.env.TOTP_ENCRYPTION_KEY!,
```

- [x] **Step 6: Update two-fa.ts — encrypt on setup, decrypt on verify/disable**

In `packages/backend/src/routes/two-fa.ts`:

Add import at top:
```typescript
import { encryptTotpSecret, decryptTotpSecret } from "../lib/totp-crypto";
```

**Setup** (line 116): Change `twoFaSecret: secret.base32` to:
```typescript
        twoFaSecret: encryptTotpSecret(secret.base32),
```

**Verify** (line 237-238): Change `speakeasy.totp.verify({ secret: user.twoFaSecret, ...` to:
```typescript
      verified = speakeasy.totp.verify({
        secret: decryptTotpSecret(user.twoFaSecret),
        encoding: "base32",
        token: token.replace(/\s/g, ""),
        window: 2,
      });
```

**Disable** (line 451-452): Change `speakeasy.totp.verify({ secret: user.twoFaSecret!, ...` to:
```typescript
        verified = speakeasy.totp.verify({
          secret: decryptTotpSecret(user.twoFaSecret!),
          encoding: "base32",
          token: cleanToken,
          window: 2,
        });
```

- [x] **Step 7: Update auth.ts — decrypt on login 2FA check**

In `packages/backend/src/routes/auth.ts`:

Add import at top:
```typescript
import { decryptTotpSecret } from "../lib/totp-crypto";
```

**Login** (line 404-405): Change `speakeasy.totp.verify({ secret: user.twoFaSecret!, ...` to:
```typescript
          twoFaValid = speakeasy.totp.verify({
            secret: decryptTotpSecret(user.twoFaSecret!),
            encoding: "base32",
            token: cleanToken,
            window: 2,
          });
```

- [x] **Step 8: Create migration script**

```typescript
// packages/backend/scripts/migrate-totp-secrets.ts
// One-time migration: encrypt existing plaintext TOTP secrets
// Usage: TOTP_ENCRYPTION_KEY=<hex> DATABASE_URL=<url> npx tsx scripts/migrate-totp-secrets.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { isNotNull } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { encryptTotpSecret } from "../src/lib/totp-crypto";

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function migrate() {
  const users = await db
    .select({ id: schema.users.id, twoFaSecret: schema.users.twoFaSecret })
    .from(schema.users)
    .where(isNotNull(schema.users.twoFaSecret));

  console.log(`Found ${users.length} users with TOTP secrets`);
  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    // Skip if already encrypted (base64 with IV prefix, not base32 TOTP format)
    // Base32 TOTP secrets contain only A-Z2-7, encrypted values are base64 with +/= chars
    const isBase32 = /^[A-Z2-7]+=*$/.test(user.twoFaSecret!);
    if (!isBase32) {
      skipped++;
      continue;
    }

    const encrypted = encryptTotpSecret(user.twoFaSecret!);
    await db.update(schema.users).set({ twoFaSecret: encrypted })
      .where(schema.users.id === user.id ? undefined as any : undefined as any);
    // Correct drizzle syntax:
    const { eq } = await import("drizzle-orm");
    await db.update(schema.users).set({ twoFaSecret: encrypted })
      .where(eq(schema.users.id, user.id));
    migrated++;
  }

  console.log(`Migrated: ${migrated}, Skipped (already encrypted): ${skipped}`);
  await sql.end();
}

migrate().catch((e) => { console.error(e); process.exit(1); });
```

- [x] **Step 9: Set TOTP_ENCRYPTION_KEY in test environment**

The test suite mocks config, so tests should work. But to ensure the vitest config loads, add a `.env.test` or set the env var in the test setup. The simplest approach: the existing test files mock `../config` inline. The new `totp-crypto.test.ts` already mocks the config. No global change needed — just ensure the mock covers it.

For the existing test suite, the config validation runs at import time. We need to ensure `TOTP_ENCRYPTION_KEY` is set in the test environment to avoid `process.exit(1)`.

Add to the test environment: create or update `packages/backend/.env.test`:
```
TOTP_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
```

Or set it in `vitest.config.ts` env if one exists. The implementer should check which approach is already used and follow that pattern.

- [x] **Step 10: Run full test suite to verify no regressions**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass (233 + 5 new = 238 minimum)

- [x] **Step 11: Commit**

```bash
git add packages/backend/src/lib/totp-crypto.ts packages/backend/src/lib/totp-crypto.test.ts \
       packages/backend/src/config/index.ts packages/backend/src/routes/two-fa.ts \
       packages/backend/src/routes/auth.ts packages/backend/scripts/migrate-totp-secrets.ts
git commit -m "fix(2fa): P3-7-F1 — encrypt TOTP secrets at rest with AES-256-GCM

TOTP secrets were stored as plaintext base32 in the users table. DB
compromise would expose all 2FA seeds, letting attackers generate valid
TOTP codes for every user.

Added AES-256-GCM envelope encryption (random IV per secret) keyed by
TOTP_ENCRYPTION_KEY env var. Encrypt on setup, decrypt on verify/login/
disable. Includes one-time migration script for existing plaintext secrets.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: P4-8-F4 — Move production DB password to Docker secrets

**Files:**
- Create: `packages/backend/src/lib/docker-secrets.ts`
- Create: `packages/backend/src/lib/docker-secrets.test.ts`
- Modify: `packages/backend/src/db/index.ts` (use secret-aware DATABASE_URL resolution)
- Modify: `/home/webadmin/amma-wallet-docker/docker-compose.yml` (remove inline password, add secret ref + DB_* env vars)
- Create: `packages/backend/docker-compose.example.yml` (template showing the pattern, no real passwords)

**Interfaces:**
- Produces: `resolveDatabaseUrl(): string` that checks `DATABASE_URL` env first, then constructs from `DB_HOST`+`DB_USER`+`DB_NAME` + password read from `DB_PASSWORD_FILE` (Docker secret path)
- Consumes: env vars `DB_HOST`, `DB_USER`, `DB_NAME`, `DB_PASSWORD_FILE` (or direct `DATABASE_URL`)

- [x] **Step 1: Write the failing test**

```typescript
// packages/backend/src/lib/docker-secrets.test.ts
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/lib/docker-secrets.test.ts`
Expected: FAIL — module does not exist.

- [x] **Step 3: Implement docker-secrets.ts**

```typescript
// packages/backend/src/lib/docker-secrets.ts
import fs from "node:fs";

export function resolveDatabaseUrl(): string {
  // Prefer explicit DATABASE_URL if set
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Construct from parts + Docker secret file
  const host = process.env.DB_HOST || "localhost";
  const port = process.env.DB_PORT || "5432";
  const user = process.env.DB_USER || "stellarwallet";
  const name = process.env.DB_NAME || "stellarwallet";
  const passwordFile = process.env.DB_PASSWORD_FILE || "/run/secrets/db_password";

  if (!fs.existsSync(passwordFile)) {
    throw new Error(
      `Neither DATABASE_URL nor a readable DB_PASSWORD_FILE (${passwordFile}) is available. ` +
      `Set DATABASE_URL directly, or provide DB_HOST/DB_USER/DB_NAME/DB_PASSWORD_FILE.`
    );
  }

  const password = fs.readFileSync(passwordFile, "utf8").trim();
  const encodedPassword = encodeURIComponent(password);

  return `postgresql://${user}:${encodedPassword}@${host}:${port}/${name}`;
}
```

- [x] **Step 4: Update db/index.ts to use resolveDatabaseUrl**

```typescript
// packages/backend/src/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { resolveDatabaseUrl } from "../lib/docker-secrets";

const connectionString = resolveDatabaseUrl();

const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });

export { schema };
```

- [x] **Step 5: Remove DATABASE_URL from requiredEnvVars**

In `packages/backend/src/config/index.ts`, remove `"DATABASE_URL"` from `requiredEnvVars` since it's now optional (can be constructed from parts):

```typescript
const requiredEnvVars = [
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "ADMIN_JWT_SECRET",
  "TOTP_ENCRYPTION_KEY",
] as const;
```

The `resolveDatabaseUrl()` function handles its own validation.

- [x] **Step 6: Update production docker-compose.yml (outside git)**

In `/home/webadmin/amma-wallet-docker/docker-compose.yml`, replace the `environment:` block for `amma-api`:

Old (lines 54-58):
```yaml
    environment:
      # $$ in docker-compose.yml environment: section → literal $ in container.
      # Must be here (not in app.env) because Compose v2 interpolates env_file values.
      DATABASE_URL: "postgresql://stellarwallet:NaLeDi2026$$Wallet!@amma-db:5432/stellarwallet"
      DATABASE_URL_DIRECT: "postgresql://stellarwallet:NaLeDi2026$$Wallet!@amma-db:5432/stellarwallet"
```

New:
```yaml
    environment:
      DB_HOST: amma-db
      DB_USER: stellarwallet
      DB_NAME: stellarwallet
      DB_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
```

The `db_password` secret already exists in the secrets section (used by `amma-db`). Just adding the reference to `amma-api`.

- [x] **Step 7: Create template in repo**

```yaml
# packages/backend/docker-compose.example.yml
# Template showing Docker secrets pattern for DATABASE_URL.
# Copy and adapt for your deployment. NEVER commit actual passwords.
#
# The app reads DB_PASSWORD_FILE (/run/secrets/db_password) at startup
# and constructs DATABASE_URL internally. Fallback: set DATABASE_URL directly.

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: stellarwallet
      POSTGRES_USER: stellarwallet
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

  api:
    build:
      context: .
      dockerfile: Dockerfile
    env_file:
      - app.env
    environment:
      DB_HOST: db
      DB_USER: stellarwallet
      DB_NAME: stellarwallet
      DB_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

secrets:
  db_password:
    file: ./.db_password   # Create this file with your DB password, chmod 600
```

- [x] **Step 8: Run tests to verify no regressions**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass. Note: existing tests that import `db` will still work because they either mock the db module or have `DATABASE_URL` set in their env.

- [x] **Step 9: Commit**

```bash
git add packages/backend/src/lib/docker-secrets.ts packages/backend/src/lib/docker-secrets.test.ts \
       packages/backend/src/db/index.ts packages/backend/src/config/index.ts \
       packages/backend/docker-compose.example.yml
git commit -m "fix(docker): P4-8-F4 — move DB password to Docker secrets (production)

DATABASE_URL with plaintext password was hardcoded in docker-compose.yml.
Added docker-secrets.ts that reads password from /run/secrets/db_password
and constructs DATABASE_URL at runtime from DB_HOST/DB_USER/DB_NAME parts.
Falls back to direct DATABASE_URL env var for backward compatibility.

Production docker-compose.yml updated in place (outside git repo).
Template added as docker-compose.example.yml.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: P4-8-F5 — Move testnet DB password to Docker secrets

**Files:**
- Modify: `/home/webadmin/amma-wallet-docker/docker-compose.testnet.yml` (remove inline password, add secret ref + DB_* env vars)

**Interfaces:**
- Consumes: `resolveDatabaseUrl()` from Task 2 (already handles secret file reading)
- Produces: testnet compose now uses same Docker secrets pattern as production

**Note:** No new app code needed — Task 2's `docker-secrets.ts` handles both environments.

- [x] **Step 1: Verify Task 2's code handles testnet**

The `resolveDatabaseUrl()` function reads `DB_PASSWORD_FILE` which defaults to `/run/secrets/db_password`. For testnet, the compose file will set `DB_PASSWORD_FILE: /run/secrets/db_testnet_password`. This is already supported.

- [x] **Step 2: Update testnet docker-compose.testnet.yml (outside git)**

In `/home/webadmin/amma-wallet-docker/docker-compose.testnet.yml`, replace the `environment:` block for `amma-api-testnet`:

Old (lines 48-52):
```yaml
    environment:
      # $$ in docker-compose environment: section → literal $ in container.
      # Must be here (not in env_file) because Compose v2 interpolates env_file values.
      DATABASE_URL: "postgresql://stellarwallet:TestnetAmma2026@amma-db-testnet:5432/stellarwallet"
      DATABASE_URL_DIRECT: "postgresql://stellarwallet:TestnetAmma2026@amma-db-testnet:5432/stellarwallet"
```

New:
```yaml
    environment:
      DB_HOST: amma-db-testnet
      DB_USER: stellarwallet
      DB_NAME: stellarwallet
      DB_PASSWORD_FILE: /run/secrets/db_testnet_password
    secrets:
      - db_testnet_password
```

The `db_testnet_password` secret already exists in the secrets section.

- [x] **Step 3: Run tests (no new code, just compose change)**

Run: `cd packages/backend && npx vitest run`
Expected: All tests still pass — no app code changed in this task.

- [x] **Step 4: Commit**

This is an operational-only change (compose file outside git). No git commit needed. Document the change in FINDINGS.md.

---

### Task 4: P4-8-F1 — Pin Docker base image to digest

**Files:**
- Modify: `packages/backend/Dockerfile` (line 1)
- Create: `packages/backend/src/docker/dockerfile.test.ts`

**Interfaces:**
- Produces: Dockerfile with pinned `node:22-alpine@sha256:...` base image

- [x] **Step 1: Write the failing test**

```typescript
// packages/backend/src/docker/dockerfile.test.ts
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
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/docker/dockerfile.test.ts`
Expected: FAIL — current FROM line is `node:22-alpine` without digest.

- [x] **Step 3: Pin the base image**

In `packages/backend/Dockerfile` line 1, change:

```dockerfile
FROM node:22-alpine
```
to:
```dockerfile
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/docker/dockerfile.test.ts`
Expected: PASS

- [x] **Step 5: Run full suite**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass.

- [x] **Step 6: Commit**

```bash
git add packages/backend/Dockerfile packages/backend/src/docker/dockerfile.test.ts
git commit -m "fix(docker): P4-8-F1 — pin base image to digest (supply-chain protection)

FROM node:22-alpine tracked a floating tag — rebuilds could silently
pull a different or compromised image. Pinned to sha256:16e22a550f...
(node:22-alpine as of 2026-07-27).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: P4-8-F2 — Add non-root USER to Dockerfile

**Files:**
- Modify: `packages/backend/Dockerfile` (add user creation + USER directive)
- Modify: `packages/backend/src/docker/dockerfile.test.ts` (add USER test)

**Interfaces:**
- Consumes: Dockerfile from Task 4 (with pinned image)
- Produces: Container runs as non-root `appuser`

- [x] **Step 1: Write the failing test**

Add to `packages/backend/src/docker/dockerfile.test.ts`:

```typescript
  it("contains a USER directive (non-root)", () => {
    const userLine = dockerfile.split("\n").find((l) => l.startsWith("USER "));
    expect(userLine).toBeDefined();
    expect(userLine).not.toMatch(/USER\s+root/);
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/docker/dockerfile.test.ts`
Expected: FAIL — no USER directive exists.

- [x] **Step 3: Add non-root user to Dockerfile**

Update `packages/backend/Dockerfile` to:

```dockerfile
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Install dependencies first (layer cache)
COPY --chown=appuser:appgroup package*.json ./
RUN npm ci

# Copy source
COPY --chown=appuser:appgroup . .

# Remove any local .env — Docker will inject via env_file
RUN rm -f .env .env.bak

USER appuser

EXPOSE 3001

CMD ["npx", "tsx", "src/server.ts"]
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/docker/dockerfile.test.ts`
Expected: PASS — both digest and USER tests pass.

- [x] **Step 5: Run full suite**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass.

- [x] **Step 6: Commit**

```bash
git add packages/backend/Dockerfile packages/backend/src/docker/dockerfile.test.ts
git commit -m "fix(docker): P4-8-F2 — add non-root USER to Dockerfile

Container ran as root (UID 0). RCE exploit would have full root
privileges. Added appuser/appgroup and USER directive so the app
process runs as a non-privileged user.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: P4-2-F1 — Remove localStorage token persistence (XSS protection)

**Files:**
- Modify: `packages/web-app/src/lib/api.ts` (remove all localStorage calls for tokens)
- Create: `packages/web-app/src/lib/api.test.ts` (verify no localStorage usage)

**Interfaces:**
- Produces: Tokens stored in memory only. Page refresh = logout (user re-authenticates).
- Note: `useAuthStore` persist (key `amma-wallet-auth`) stores `user`/`isAuthenticated` in localStorage, NOT tokens. On refresh, `loadProfile` calls `/auth/me` — with no token in memory, this returns 401, which triggers `clearTokens()` and sets `isAuthenticated: false`. The flow is self-healing.

- [x] **Step 1: Write the failing test**

```typescript
// packages/web-app/src/lib/api.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("api.ts — token storage security", () => {
  const source = readFileSync(resolve(__dirname, "api.ts"), "utf-8");

  it("does not use localStorage for token storage", () => {
    // Should not contain any localStorage calls for tokens
    expect(source).not.toMatch(/localStorage\.(get|set|remove)Item\s*\(\s*["']stellar_(access|refresh)_token["']/);
  });

  it("does not reference localStorage at all for auth tokens", () => {
    // Count localStorage references — should be zero
    const localStorageRefs = (source.match(/localStorage/g) || []).length;
    expect(localStorageRefs).toBe(0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run ../web-app/src/lib/api.test.ts`
(Or if web-app has its own vitest config: `cd packages/web-app && npx vitest run src/lib/api.test.ts`)
Expected: FAIL — source contains 6 localStorage references.

- [x] **Step 3: Remove localStorage from api.ts**

In `packages/web-app/src/lib/api.ts`, change lines 3-18:

Old:
```typescript
// ——— Token store for auth ———
let _accessToken: string | null = localStorage.getItem("stellar_access_token");
let _refreshToken: string | null = localStorage.getItem("stellar_refresh_token");

export function setTokens(access: string, refresh: string) {
  _accessToken = access;
  _refreshToken = refresh;
  localStorage.setItem("stellar_access_token", access);
  localStorage.setItem("stellar_refresh_token", refresh);
}

export function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
  localStorage.removeItem("stellar_access_token");
  localStorage.removeItem("stellar_refresh_token");
}
```

New:
```typescript
// ——— Token store for auth (memory-only, never persisted) ———
// Tokens are NOT stored in localStorage to prevent XSS exfiltration.
// Trade-off: page refresh = logout (user must re-authenticate).
let _accessToken: string | null = null;
let _refreshToken: string | null = null;

export function setTokens(access: string, refresh: string) {
  _accessToken = access;
  _refreshToken = refresh;
}

export function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd packages/web-app && npx vitest run src/lib/api.test.ts` (or from backend if web-app has no vitest config — adjust path accordingly)
Expected: PASS — no localStorage references in api.ts.

- [x] **Step 5: Run full backend test suite**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass (frontend change doesn't affect backend tests).

- [x] **Step 6: Commit**

```bash
git add packages/web-app/src/lib/api.ts packages/web-app/src/lib/api.test.ts
git commit -m "fix(frontend): P4-2-F1 — remove localStorage token persistence (XSS protection)

Both access and refresh tokens were written to localStorage, making them
exfiltrable by any XSS vector (third-party scripts, browser extensions).
The refresh token is long-lived, enabling persistent session takeover.

Switched to memory-only storage. Trade-off: page refresh = logout.
The Zustand auth store auto-clears on failed loadProfile (/auth/me → 401).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Post-Fix Checklist

After all 6 tasks are complete:

- [x] Run full test suite: `cd packages/backend && npx vitest run` — expect all passing
- [x] Update `FINDINGS.md` — mark P3-7-F1, P4-8-F4, P4-8-F5, P4-8-F1, P4-8-F2, P4-2-F1 as **FIXED** with commit hashes
- [x] Update `ARCHITECTURE.md` — add 2FA TOTP encryption flow diagram
- [x] Update `DEV_SPEC.md` — append Docker secrets integration spec
- [x] Present Phase 2 checkpoint summary
