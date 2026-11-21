# SSO Multi-RP Core — Amma Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OAuth 2.1 multi-RP identity provider capability to Amma Wallet — RP registry, ES256/JWKS, authorization code flow with PKCE, refresh token rotation with family revocation, consent recording, and persistent JTI tracking — without modifying the legacy SSO assertion flow.

**Architecture:** New OAuth routes (`/api/v1/oauth/*`) alongside existing `/api/v1/sso/*` routes. Three new Drizzle tables (`oauth_clients`, `token_registry`, `consent_records`). ES256 signing with JWKS publication. All existing code paths remain byte-for-byte unchanged.

**Tech Stack:** Fastify 5, TypeScript, Drizzle ORM 0.45, PostgreSQL 16, jsonwebtoken 9, vitest 2, Node.js crypto for ES256 key handling.

## Global Constraints

- **Worktree only:** All work in `feature/sso-multi-rp-core` worktree of the amma-wallet repo. No CRM or LMS code changes.
- **Legacy flow untouched:** The `usedJtis` Set, `POST /api/v1/sso/token`, and `POST /api/v1/sso/verify` in `routes/sso.ts` must remain byte-for-byte unchanged. Their existing tests must continue passing.
- **No production DB writes:** Schema changes are tested against test DBs only. A production backup must precede any future `drizzle-kit push`.
- **Test framework:** vitest with `vi.mock()` for DB, `app.inject()` for HTTP — matching existing patterns.
- **Route pattern:** Exported async function plugin, full `/api/v1/oauth/...` paths embedded, registered in `server.ts`.
- **DB pattern:** Import `{ db, schema }` from `../db`, Drizzle query builder.
- **Config pattern:** Add new vars to `config/index.ts` exported object, mock in tests via `vi.mock("../config", ...)`.
- **Audit pattern:** Use existing `auditLog(action, opts)` from `lib/audit.ts`. New actions added to `AuditAction` union type.

### Required Confirmations (User-Approved)

1. **Redirect URI matching:** `/authorize` performs exact string equality against parsed JSON array entries from `oauth_clients.redirect_uris`. No substring matching, no regex, no wildcard support.
2. **Consent audit trail:** Consent grant, revocation, and re-grant events are recorded in the existing `audit_logs` table (via `auditLog()`) in addition to updating `consent_records`. The `consent_records` table stores the current active state; `audit_logs` stores the complete history. Revoke/re-grant never silently overwrites without a trail.
3. **Pre-push backup:** Before any `drizzle-kit push` that adds `oauth_clients`, `token_registry`, or `consent_records` tables to a real database, a PostgreSQL backup must be taken first (`pg_dump`). This is a deployment-time step documented in the plan, not a test-time step (tests use mocked DB).

---

## File Structure

### New Files (Create)

| File | Responsibility |
|---|---|
| `src/lib/oauth-signing.ts` | ES256 key loading, JWT signing, JWK export |
| `src/services/oauth-client.service.ts` | RP registry CRUD (read client, verify secret, validate redirect_uri) |
| `src/services/token-registry.service.ts` | JTI lifecycle (insert, mark used, revoke family, cleanup) |
| `src/services/consent.service.ts` | Consent check, grant, revoke |
| `src/routes/oauth.ts` | `/authorize`, `/token`, JWKS endpoint |
| `src/routes/__tests__/oauth-signing.test.ts` | ES256 signing + JWKS tests |
| `src/routes/__tests__/oauth-client.test.ts` | RP registry tests |
| `src/routes/__tests__/token-registry.test.ts` | JTI lifecycle + cleanup tests |
| `src/routes/__tests__/consent.test.ts` | Consent flow tests |
| `src/routes/__tests__/oauth-authorize.test.ts` | /authorize endpoint tests |
| `src/routes/__tests__/oauth-token.test.ts` | /token endpoint tests (code exchange + refresh) |
| `src/routes/__tests__/oauth-legacy-regression.test.ts` | Confirms legacy SSO tests still pass |

### Modified Files

| File | Change |
|---|---|
| `src/db/schema/index.ts` | Add `oauthClients`, `tokenRegistry`, `consentRecords` table definitions |
| `src/config/index.ts` | Add `OAUTH_SIGNING_KEY`, `OAUTH_SIGNING_KID` config vars |
| `src/lib/audit.ts` | Add new `AuditAction` values for consent events |
| `src/server.ts` | Register `oauthRoutes` plugin |

### Unchanged Files (Explicitly)

| File | Confirmation |
|---|---|
| `src/routes/sso.ts` | NOT TOUCHED — legacy flow byte-for-byte preserved |
| `src/routes/__tests__/sso.test.ts` | NOT TOUCHED — must pass unchanged |

---

### Task 1: Schema — Add Three New Tables to Drizzle

**Files:**
- Modify: `packages/backend/src/db/schema/index.ts` (append after existing tables)
- Test: `packages/backend/src/routes/__tests__/oauth-client.test.ts` (partial — schema import test)

**Interfaces:**
- Consumes: Nothing from other tasks.
- Produces: `oauthClients`, `tokenRegistry`, `consentRecords` Drizzle table definitions imported by all later tasks.

- [ ] **Step 1: Write the schema test that imports the new tables**

```typescript
// packages/backend/src/routes/__tests__/oauth-client.test.ts
import { describe, it, expect } from "vitest";

describe("OAuth schema exports", () => {
  it("exports oauthClients table with required columns", async () => {
    // Dynamic import to avoid module resolution issues during initial TDD
    const schema = await import("../../db/schema");
    expect(schema.oauthClients).toBeDefined();
    // Drizzle tables expose column definitions
    expect(schema.oauthClients.clientId).toBeDefined();
    expect(schema.oauthClients.clientSecretHash).toBeDefined();
    expect(schema.oauthClients.redirectUris).toBeDefined();
    expect(schema.oauthClients.requirePkce).toBeDefined();
    expect(schema.oauthClients.isActive).toBeDefined();
  });

  it("exports tokenRegistry table with required columns", async () => {
    const schema = await import("../../db/schema");
    expect(schema.tokenRegistry).toBeDefined();
    expect(schema.tokenRegistry.jti).toBeDefined();
    expect(schema.tokenRegistry.tokenType).toBeDefined();
    expect(schema.tokenRegistry.familyId).toBeDefined();
    expect(schema.tokenRegistry.usedAt).toBeDefined();
    expect(schema.tokenRegistry.revokedAt).toBeDefined();
  });

  it("exports consentRecords table with required columns", async () => {
    const schema = await import("../../db/schema");
    expect(schema.consentRecords).toBeDefined();
    expect(schema.consentRecords.userId).toBeDefined();
    expect(schema.consentRecords.clientId).toBeDefined();
    expect(schema.consentRecords.scopesGranted).toBeDefined();
    expect(schema.consentRecords.revokedAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/oauth-client.test.ts`
Expected: FAIL — `schema.oauthClients` is undefined

- [ ] **Step 3: Add the three table definitions to the schema**

Append to `packages/backend/src/db/schema/index.ts` (after the last existing table, before any trailing exports):

```typescript
// ════════════════════════════════════════════
// OAuth Clients — RP registry for multi-RP SSO
// ════════════════════════════════════════════

export const oauthClients = pgTable("oauth_clients", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecretHash: text("client_secret_hash").notNull(),
  clientName: text("client_name").notNull(),
  redirectUris: text("redirect_uris").notNull(),  // JSON array of exact URIs
  scopes: text("scopes").notNull().default("openid profile email"),
  grantTypes: text("grant_types").notNull().default("authorization_code refresh_token"),
  requirePkce: boolean("require_pkce").notNull().default(true),
  accessTokenTtlSeconds: integer("access_token_ttl_seconds").notNull().default(900),
  refreshTokenTtlSeconds: integer("refresh_token_ttl_seconds").notNull().default(2592000),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ════════════════════════════════════════════
// Token Registry — JTI tracking with 7-day post-expiry retention
// ════════════════════════════════════════════

export const tokenRegistry = pgTable("token_registry", {
  jti: text("jti").primaryKey(),
  tokenType: text("token_type").notNull(),     // 'auth_code' | 'access' | 'refresh'
  sub: text("sub").notNull(),
  clientId: text("client_id").notNull(),
  familyId: text("family_id"),
  codeChallenge: text("code_challenge"),
  redirectUri: text("redirect_uri"),
  scope: text("scope"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ════════════════════════════════════════════
// Consent Records — per (user, RP) consent state
// ════════════════════════════════════════════

export const consentRecords = pgTable(
  "consent_records",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    scopesGranted: text("scopes_granted").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("idx_consent_user_client").on(table.userId, table.clientId),
    index("idx_consent_client").on(table.clientId),
  ]
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/oauth-client.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run legacy SSO tests to confirm no regression**

Run: `cd packages/backend && npx vitest run src/routes/sso.test.ts`
Expected: All 6 existing tests PASS, unchanged

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/db/schema/index.ts packages/backend/src/routes/__tests__/oauth-client.test.ts
git commit -m "feat(oauth): add oauth_clients, token_registry, consent_records schema"
```

---

### Task 2: ES256 Signing Service and JWKS Output

**Files:**
- Create: `packages/backend/src/lib/oauth-signing.ts`
- Modify: `packages/backend/src/config/index.ts` (add `OAUTH_SIGNING_KEY`, `OAUTH_SIGNING_KID`)
- Test: `packages/backend/src/routes/__tests__/oauth-signing.test.ts`

**Interfaces:**
- Consumes: `config` from `../config`.
- Produces: `signOAuthToken(payload, expiresInSeconds): string`, `verifyOAuthToken(token): JwtPayload`, `getJwks(): { keys: JWK[] }`, `getSigningKid(): string`. Used by Task 5 (/token endpoint) and Task 6 (JWKS route).

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/backend/src/routes/__tests__/oauth-signing.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

// Generate a real test ES256 key pair
const testKeyPair = crypto.generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const mockConfig = vi.hoisted(() => ({
  OAUTH_SIGNING_KEY: "",  // will be set per test
  OAUTH_SIGNING_KID: "test-kid-001",
}));

vi.mock("../../config", () => ({ config: mockConfig }));

// Import AFTER mocks
import { signOAuthToken, verifyOAuthToken, getJwks, getSigningKid } from "../../lib/oauth-signing";

describe("OAuth ES256 Signing", () => {
  beforeEach(() => {
    mockConfig.OAUTH_SIGNING_KEY = testKeyPair.privateKey;
  });

  it("SIGN-01: signs a token with ES256 that can be verified", () => {
    const token = signOAuthToken(
      { sub: "42", aud: "test-client", iss: "ammawallet", email: "test@example.com" },
      900,
    );
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);

    const decoded = verifyOAuthToken(token);
    expect(decoded.sub).toBe("42");
    expect(decoded.aud).toBe("test-client");
    expect(decoded.iss).toBe("ammawallet");
    expect(decoded.email).toBe("test@example.com");
    expect(decoded.jti).toBeTruthy();
  });

  it("SIGN-02: token header contains alg=ES256 and kid", () => {
    const token = signOAuthToken({ sub: "1", aud: "x", iss: "ammawallet" }, 60);
    const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    expect(header.alg).toBe("ES256");
    expect(header.kid).toBe("test-kid-001");
  });

  it("SIGN-03: rejects a token signed with wrong key", () => {
    const wrongKey = crypto.generateKeyPairSync("ec", {
      namedCurve: "P-256",
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    // Sign with wrong key using jsonwebtoken directly
    const jwt = await import("jsonwebtoken");
    const badToken = jwt.default.sign({ sub: "1", aud: "x", iss: "ammawallet" }, wrongKey.privateKey, {
      algorithm: "ES256",
    });
    expect(() => verifyOAuthToken(badToken)).toThrow();
  });

  it("SIGN-04: rejects an expired token", async () => {
    const token = signOAuthToken({ sub: "1", aud: "x", iss: "ammawallet" }, -1);
    expect(() => verifyOAuthToken(token)).toThrow(/expired/i);
  });

  it("SIGN-05: each token gets a unique jti", () => {
    const t1 = signOAuthToken({ sub: "1", aud: "x", iss: "ammawallet" }, 60);
    const t2 = signOAuthToken({ sub: "1", aud: "x", iss: "ammawallet" }, 60);
    const d1 = verifyOAuthToken(t1);
    const d2 = verifyOAuthToken(t2);
    expect(d1.jti).not.toBe(d2.jti);
  });
});

describe("JWKS Endpoint Output", () => {
  beforeEach(() => {
    mockConfig.OAUTH_SIGNING_KEY = testKeyPair.privateKey;
  });

  it("JWKS-01: returns a valid JWK Set with one key", () => {
    const jwks = getJwks();
    expect(jwks.keys).toHaveLength(1);
    const key = jwks.keys[0];
    expect(key.kty).toBe("EC");
    expect(key.crv).toBe("P-256");
    expect(key.alg).toBe("ES256");
    expect(key.use).toBe("sig");
    expect(key.kid).toBe("test-kid-001");
    expect(key.x).toBeTruthy();
    expect(key.y).toBeTruthy();
    // Must NOT contain the private key component
    expect(key.d).toBeUndefined();
  });

  it("JWKS-02: getSigningKid returns the configured kid", () => {
    expect(getSigningKid()).toBe("test-kid-001");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/oauth-signing.test.ts`
Expected: FAIL — module `../../lib/oauth-signing` not found

- [ ] **Step 3: Add config vars**

In `packages/backend/src/config/index.ts`, add to the `config` export object (after the existing `SSO_CALLBACK_WHITELIST` line):

```typescript
  OAUTH_SIGNING_KEY: process.env.OAUTH_SIGNING_KEY || "",
  OAUTH_SIGNING_KID: process.env.OAUTH_SIGNING_KID || "default-kid",
```

- [ ] **Step 4: Implement the signing service**

```typescript
// packages/backend/src/lib/oauth-signing.ts
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config";

let cachedPublicKeyPem: string | null = null;
let cachedJwk: Record<string, unknown> | null = null;

function getPrivateKey(): string {
  if (!config.OAUTH_SIGNING_KEY) {
    throw new Error("OAUTH_SIGNING_KEY is not configured");
  }
  return config.OAUTH_SIGNING_KEY;
}

function getPublicKeyPem(): string {
  if (!cachedPublicKeyPem) {
    const privKey = crypto.createPrivateKey(getPrivateKey());
    const pubKey = crypto.createPublicKey(privKey);
    cachedPublicKeyPem = pubKey.export({ type: "spki", format: "pem" }) as string;
  }
  return cachedPublicKeyPem;
}

export function getSigningKid(): string {
  return config.OAUTH_SIGNING_KID;
}

export function signOAuthToken(
  payload: Record<string, unknown>,
  expiresInSeconds: number,
): string {
  const jti = crypto.randomUUID();
  return jwt.sign(
    { ...payload, jti },
    getPrivateKey(),
    {
      algorithm: "ES256",
      expiresIn: expiresInSeconds,
      keyid: getSigningKid(),
    },
  );
}

export function verifyOAuthToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, getPublicKeyPem(), {
    algorithms: ["ES256"],
  }) as jwt.JwtPayload;
}

export function getJwks(): { keys: Record<string, unknown>[] } {
  if (!cachedJwk) {
    const pubKeyObj = crypto.createPublicKey(getPublicKeyPem());
    const jwk = pubKeyObj.export({ format: "jwk" });
    cachedJwk = {
      ...jwk,
      alg: "ES256",
      use: "sig",
      kid: getSigningKid(),
    };
  }
  return { keys: [{ ...cachedJwk }] };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/oauth-signing.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Run legacy SSO tests**

Run: `cd packages/backend && npx vitest run src/routes/sso.test.ts`
Expected: All 6 PASS

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/lib/oauth-signing.ts packages/backend/src/config/index.ts packages/backend/src/routes/__tests__/oauth-signing.test.ts
git commit -m "feat(oauth): ES256 signing service and JWKS output"
```

---

### Task 3: OAuth Client Service (RP Registry)

**Files:**
- Create: `packages/backend/src/services/oauth-client.service.ts`
- Test: `packages/backend/src/routes/__tests__/oauth-client.test.ts` (extend from Task 1)

**Interfaces:**
- Consumes: `oauthClients` schema from Task 1.
- Produces: `getClientByClientId(clientId: string): Promise<OAuthClient | null>`, `verifyClientSecret(client: OAuthClient, secret: string): Promise<boolean>`, `validateRedirectUri(client: OAuthClient, uri: string): boolean`. Used by Tasks 5-6.

- [ ] **Step 1: Write the failing tests**

Append to `packages/backend/src/routes/__tests__/oauth-client.test.ts`:

```typescript
import { vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// Mock DB
const mockDbSelect = vi.fn();
vi.mock("../../db", () => ({
  db: {
    select: (...args: any[]) => mockDbSelect(...args),
  },
  schema: {
    oauthClients: {
      clientId: "client_id",
      isActive: "is_active",
    },
  },
}));

import {
  getClientByClientId,
  verifyClientSecret,
  validateRedirectUri,
} from "../../services/oauth-client.service";

const TEST_SECRET = "test-client-secret-at-least-32-chars";
const TEST_SECRET_HASH = bcrypt.hashSync(TEST_SECRET, 10);

const MOCK_CLIENT = {
  id: 1,
  clientId: "crm-smwebsystems",
  clientSecretHash: TEST_SECRET_HASH,
  clientName: "SM Web CRM",
  redirectUris: JSON.stringify(["https://crm.smwebsystems.com/auth/callback"]),
  scopes: "openid profile email",
  grantTypes: "authorization_code refresh_token",
  requirePkce: true,
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2592000,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("OAuth Client Service", () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
  });

  it("CLIENT-01: returns client by clientId when found and active", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => [MOCK_CLIENT] }),
      }),
    });
    const client = await getClientByClientId("crm-smwebsystems");
    expect(client).toBeTruthy();
    expect(client!.clientId).toBe("crm-smwebsystems");
  });

  it("CLIENT-02: returns null for unknown clientId", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => [] }),
      }),
    });
    const client = await getClientByClientId("unknown");
    expect(client).toBeNull();
  });

  it("CLIENT-03: returns null for inactive client", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => [{ ...MOCK_CLIENT, isActive: false }] }),
      }),
    });
    const client = await getClientByClientId("crm-smwebsystems");
    expect(client).toBeNull();
  });

  it("CLIENT-04: verifyClientSecret returns true for correct secret", async () => {
    const result = await verifyClientSecret(MOCK_CLIENT, TEST_SECRET);
    expect(result).toBe(true);
  });

  it("CLIENT-05: verifyClientSecret returns false for wrong secret", async () => {
    const result = await verifyClientSecret(MOCK_CLIENT, "wrong-secret");
    expect(result).toBe(false);
  });

  it("CLIENT-06: validateRedirectUri accepts exact match", () => {
    const result = validateRedirectUri(MOCK_CLIENT, "https://crm.smwebsystems.com/auth/callback");
    expect(result).toBe(true);
  });

  it("CLIENT-07: validateRedirectUri rejects substring match", () => {
    const result = validateRedirectUri(MOCK_CLIENT, "https://crm.smwebsystems.com/auth/callback/extra");
    expect(result).toBe(false);
  });

  it("CLIENT-08: validateRedirectUri rejects prefix match", () => {
    const result = validateRedirectUri(MOCK_CLIENT, "https://crm.smwebsystems.com/auth");
    expect(result).toBe(false);
  });

  it("CLIENT-09: validateRedirectUri rejects different domain", () => {
    const result = validateRedirectUri(MOCK_CLIENT, "https://evil.com/auth/callback");
    expect(result).toBe(false);
  });

  it("CLIENT-10: validateRedirectUri rejects different port", () => {
    const result = validateRedirectUri(MOCK_CLIENT, "https://crm.smwebsystems.com:8080/auth/callback");
    expect(result).toBe(false);
  });

  it("CLIENT-11: validateRedirectUri rejects empty string", () => {
    const result = validateRedirectUri(MOCK_CLIENT, "");
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/oauth-client.test.ts`
Expected: FAIL — module `../../services/oauth-client.service` not found

- [ ] **Step 3: Implement the service**

```typescript
// packages/backend/src/services/oauth-client.service.ts
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../db";

export interface OAuthClient {
  id: number;
  clientId: string;
  clientSecretHash: string;
  clientName: string;
  redirectUris: string;        // JSON array
  scopes: string;
  grantTypes: string;
  requirePkce: boolean;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export async function getClientByClientId(clientId: string): Promise<OAuthClient | null> {
  const rows = await db
    .select()
    .from(schema.oauthClients)
    .where(and(eq(schema.oauthClients.clientId, clientId), eq(schema.oauthClients.isActive, true)))
    .limit(1);

  return rows.length > 0 ? (rows[0] as OAuthClient) : null;
}

export async function verifyClientSecret(client: OAuthClient, secret: string): Promise<boolean> {
  return bcrypt.compare(secret, client.clientSecretHash);
}

/**
 * Exact-match redirect_uri validation.
 * Compares the provided URI against each entry in the client's redirect_uris JSON array.
 * No substring, regex, or wildcard matching — strict string equality only.
 */
export function validateRedirectUri(client: OAuthClient, uri: string): boolean {
  if (!uri) return false;
  try {
    const allowedUris: string[] = JSON.parse(client.redirectUris);
    return allowedUris.includes(uri);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/oauth-client.test.ts`
Expected: PASS (all 14 tests — 3 from Task 1 + 11 new)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/oauth-client.service.ts packages/backend/src/routes/__tests__/oauth-client.test.ts
git commit -m "feat(oauth): RP registry service with exact-match redirect_uri validation"
```

---

### Task 4: Token Registry Service (JTI Lifecycle + 7-Day Cleanup)

**Files:**
- Create: `packages/backend/src/services/token-registry.service.ts`
- Test: `packages/backend/src/routes/__tests__/token-registry.test.ts`

**Interfaces:**
- Consumes: `tokenRegistry` schema from Task 1.
- Produces: `insertTokenEntry(entry): Promise<void>`, `markTokenUsed(jti): Promise<{ alreadyUsed: boolean, familyId?: string }>`, `revokeFamily(familyId): Promise<number>`, `lookupToken(jti): Promise<TokenEntry | null>`, `cleanupExpiredTokens(): Promise<number>`. Used by Task 5 (/token) and Task 6 (/authorize).

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/backend/src/routes/__tests__/token-registry.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbInsert = vi.fn();
const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbDelete = vi.fn();

vi.mock("../../db", () => ({
  db: {
    insert: (...args: any[]) => mockDbInsert(...args),
    select: (...args: any[]) => mockDbSelect(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
    delete: (...args: any[]) => mockDbDelete(...args),
  },
  schema: {
    tokenRegistry: {
      jti: "jti",
      tokenType: "token_type",
      sub: "sub",
      clientId: "client_id",
      familyId: "family_id",
      usedAt: "used_at",
      revokedAt: "revoked_at",
      expiresAt: "expires_at",
      issuedAt: "issued_at",
    },
  },
}));

import {
  insertTokenEntry,
  markTokenUsed,
  revokeFamily,
  lookupToken,
  cleanupExpiredTokens,
} from "../../services/token-registry.service";

describe("Token Registry Service", () => {
  beforeEach(() => {
    mockDbInsert.mockReset();
    mockDbSelect.mockReset();
    mockDbUpdate.mockReset();
    mockDbDelete.mockReset();
  });

  it("TR-01: insertTokenEntry calls db.insert with correct values", async () => {
    mockDbInsert.mockReturnValue({ values: () => Promise.resolve() });
    await insertTokenEntry({
      jti: "abc-123",
      tokenType: "auth_code",
      sub: "42",
      clientId: "crm",
      familyId: "fam-1",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 300000),
    });
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });

  it("TR-02: markTokenUsed returns alreadyUsed=false for unused token", async () => {
    const now = new Date();
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ jti: "abc", usedAt: null, revokedAt: null, familyId: "fam-1", expiresAt: new Date(Date.now() + 60000) }],
      }),
    });
    mockDbUpdate.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });

    const result = await markTokenUsed("abc");
    expect(result.alreadyUsed).toBe(false);
    expect(result.familyId).toBe("fam-1");
  });

  it("TR-03: markTokenUsed returns alreadyUsed=true for already-used token", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ jti: "abc", usedAt: new Date(), revokedAt: null, familyId: "fam-1", expiresAt: new Date(Date.now() + 60000) }],
      }),
    });
    const result = await markTokenUsed("abc");
    expect(result.alreadyUsed).toBe(true);
    expect(result.familyId).toBe("fam-1");
  });

  it("TR-04: markTokenUsed returns alreadyUsed=true for revoked token", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ jti: "abc", usedAt: null, revokedAt: new Date(), familyId: "fam-1", expiresAt: new Date(Date.now() + 60000) }],
      }),
    });
    const result = await markTokenUsed("abc");
    expect(result.alreadyUsed).toBe(true);
  });

  it("TR-05: markTokenUsed returns alreadyUsed=true for expired token", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ jti: "abc", usedAt: null, revokedAt: null, familyId: "fam-1", expiresAt: new Date(Date.now() - 1000) }],
      }),
    });
    const result = await markTokenUsed("abc");
    expect(result.alreadyUsed).toBe(true);
  });

  it("TR-06: markTokenUsed returns alreadyUsed=true for unknown jti", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [],
      }),
    });
    const result = await markTokenUsed("unknown");
    expect(result.alreadyUsed).toBe(true);
  });

  it("TR-07: revokeFamily calls update on all tokens with matching familyId", async () => {
    mockDbUpdate.mockReturnValue({
      set: () => ({
        where: () => ({ returning: () => [{ jti: "a" }, { jti: "b" }] }),
      }),
    });
    const count = await revokeFamily("fam-1");
    expect(count).toBe(2);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it("TR-08: cleanupExpiredTokens deletes rows older than 7 days past expiry", async () => {
    mockDbDelete.mockReturnValue({
      where: () => ({ returning: () => [{ jti: "old1" }, { jti: "old2" }, { jti: "old3" }] }),
    });
    const count = await cleanupExpiredTokens();
    expect(count).toBe(3);
    expect(mockDbDelete).toHaveBeenCalledTimes(1);
  });

  it("TR-09: lookupToken returns entry when found", async () => {
    const entry = { jti: "abc", tokenType: "auth_code", sub: "42", clientId: "crm" };
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [entry],
      }),
    });
    const result = await lookupToken("abc");
    expect(result).toEqual(entry);
  });

  it("TR-10: lookupToken returns null when not found", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [],
      }),
    });
    const result = await lookupToken("missing");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/token-registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the service**

```typescript
// packages/backend/src/services/token-registry.service.ts
import { eq, and, lt, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db";

export interface TokenEntry {
  jti: string;
  tokenType: string;
  sub: string;
  clientId: string;
  familyId?: string | null;
  codeChallenge?: string | null;
  redirectUri?: string | null;
  scope?: string | null;
  issuedAt: Date;
  expiresAt: Date;
  usedAt?: Date | null;
  revokedAt?: Date | null;
}

export async function insertTokenEntry(entry: {
  jti: string;
  tokenType: string;
  sub: string;
  clientId: string;
  familyId?: string | null;
  codeChallenge?: string | null;
  redirectUri?: string | null;
  scope?: string | null;
  issuedAt: Date;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(schema.tokenRegistry).values(entry);
}

export async function markTokenUsed(jti: string): Promise<{ alreadyUsed: boolean; familyId?: string | null }> {
  const rows = await db
    .select()
    .from(schema.tokenRegistry)
    .where(eq(schema.tokenRegistry.jti, jti));

  if (rows.length === 0) {
    return { alreadyUsed: true };
  }

  const entry = rows[0];

  // Already used, revoked, or expired = treat as replay
  if (entry.usedAt || entry.revokedAt || new Date(entry.expiresAt) < new Date()) {
    return { alreadyUsed: true, familyId: entry.familyId };
  }

  // Mark as used
  await db
    .update(schema.tokenRegistry)
    .set({ usedAt: new Date() })
    .where(eq(schema.tokenRegistry.jti, jti));

  return { alreadyUsed: false, familyId: entry.familyId };
}

export async function revokeFamily(familyId: string): Promise<number> {
  const result = await db
    .update(schema.tokenRegistry)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.tokenRegistry.familyId, familyId), isNull(schema.tokenRegistry.revokedAt)))
    .returning({ jti: schema.tokenRegistry.jti });

  return result.length;
}

export async function lookupToken(jti: string): Promise<TokenEntry | null> {
  const rows = await db
    .select()
    .from(schema.tokenRegistry)
    .where(eq(schema.tokenRegistry.jti, jti));

  return rows.length > 0 ? (rows[0] as TokenEntry) : null;
}

/**
 * Purge token_registry rows whose expires_at is older than 7 days ago.
 * Rows are retained for 7 days past expiry for incident investigation.
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(schema.tokenRegistry)
    .where(lt(schema.tokenRegistry.expiresAt, cutoff))
    .returning({ jti: schema.tokenRegistry.jti });

  return result.length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/token-registry.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/token-registry.service.ts packages/backend/src/routes/__tests__/token-registry.test.ts
git commit -m "feat(oauth): token registry service with 7-day post-expiry retention"
```

---

### Task 5: Consent Service with Audit Trail

**Files:**
- Create: `packages/backend/src/services/consent.service.ts`
- Modify: `packages/backend/src/lib/audit.ts` (add consent audit actions)
- Test: `packages/backend/src/routes/__tests__/consent.test.ts`

**Interfaces:**
- Consumes: `consentRecords` schema from Task 1, `auditLog()` from `lib/audit.ts`.
- Produces: `hasActiveConsent(userId, clientId, requiredScopes): Promise<boolean>`, `grantConsent(userId, clientId, scopes, ip?, userAgent?): Promise<void>`, `revokeConsent(userId, clientId, ip?, userAgent?): Promise<boolean>`. Used by Task 6 (/authorize).

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/backend/src/routes/__tests__/consent.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockAuditLog = vi.fn();

vi.mock("../../db", () => ({
  db: {
    select: (...args: any[]) => mockDbSelect(...args),
    insert: (...args: any[]) => mockDbInsert(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
  },
  schema: {
    consentRecords: {
      userId: "user_id",
      clientId: "client_id",
      revokedAt: "revoked_at",
      scopesGranted: "scopes_granted",
    },
  },
}));

vi.mock("../../lib/audit", () => ({
  auditLog: (...args: any[]) => mockAuditLog(...args),
}));

import { hasActiveConsent, grantConsent, revokeConsent } from "../../services/consent.service";

describe("Consent Service", () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
    mockDbInsert.mockReset();
    mockDbUpdate.mockReset();
    mockAuditLog.mockReset();
  });

  it("CONSENT-01: hasActiveConsent returns true when consent exists with matching scopes", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ scopesGranted: "openid profile email", revokedAt: null }],
      }),
    });
    const result = await hasActiveConsent(42, "crm", "openid profile email");
    expect(result).toBe(true);
  });

  it("CONSENT-02: hasActiveConsent returns false when no consent exists", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [],
      }),
    });
    const result = await hasActiveConsent(42, "crm", "openid profile email");
    expect(result).toBe(false);
  });

  it("CONSENT-03: hasActiveConsent returns false when consent is revoked", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ scopesGranted: "openid profile email", revokedAt: new Date() }],
      }),
    });
    const result = await hasActiveConsent(42, "crm", "openid");
    expect(result).toBe(false);
  });

  it("CONSENT-04: hasActiveConsent returns false when stored scopes are subset of requested", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ scopesGranted: "openid", revokedAt: null }],
      }),
    });
    const result = await hasActiveConsent(42, "crm", "openid profile email");
    expect(result).toBe(false);
  });

  it("CONSENT-05: grantConsent inserts record and logs audit event", async () => {
    mockDbInsert.mockReturnValue({
      values: () => ({
        onConflictDoUpdate: () => Promise.resolve(),
      }),
    });
    mockAuditLog.mockResolvedValue(undefined);

    await grantConsent(42, "crm", "openid profile email", "1.2.3.4");

    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledWith(
      "oauth_consent_granted",
      expect.objectContaining({
        userId: 42,
        detail: expect.objectContaining({
          clientId: "crm",
          scopes: "openid profile email",
        }),
      }),
    );
  });

  it("CONSENT-06: revokeConsent updates record and logs audit event", async () => {
    mockDbUpdate.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: () => [{ id: 1 }],
        }),
      }),
    });
    mockAuditLog.mockResolvedValue(undefined);

    const result = await revokeConsent(42, "crm", "1.2.3.4");

    expect(result).toBe(true);
    expect(mockAuditLog).toHaveBeenCalledWith(
      "oauth_consent_revoked",
      expect.objectContaining({
        userId: 42,
        detail: expect.objectContaining({ clientId: "crm" }),
      }),
    );
  });

  it("CONSENT-07: revokeConsent returns false when no active consent exists", async () => {
    mockDbUpdate.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: () => [],
        }),
      }),
    });
    const result = await revokeConsent(42, "unknown");
    expect(result).toBe(false);
    // No audit log for a no-op revocation
    expect(mockAuditLog).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/consent.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Add consent audit actions**

In `packages/backend/src/lib/audit.ts`, add to the `AuditAction` union type:

```typescript
  | "oauth_consent_granted" | "oauth_consent_revoked"
```

- [ ] **Step 4: Implement the consent service**

```typescript
// packages/backend/src/services/consent.service.ts
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "../db";
import { auditLog } from "../lib/audit";

export async function hasActiveConsent(
  userId: number,
  clientId: string,
  requiredScopes: string,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(schema.consentRecords)
    .where(and(
      eq(schema.consentRecords.userId, userId),
      eq(schema.consentRecords.clientId, clientId),
    ));

  if (rows.length === 0) return false;

  const record = rows[0];
  if (record.revokedAt) return false;

  // Check that all requested scopes are in the granted set
  const granted = new Set(record.scopesGranted.split(" "));
  const required = requiredScopes.split(" ");
  return required.every((s) => granted.has(s));
}

export async function grantConsent(
  userId: number,
  clientId: string,
  scopes: string,
  ip?: string,
  userAgent?: string,
): Promise<void> {
  await db.insert(schema.consentRecords)
    .values({
      userId,
      clientId,
      scopesGranted: scopes,
      grantedAt: new Date(),
      revokedAt: null,
    })
    .onConflictDoUpdate({
      target: [schema.consentRecords.userId, schema.consentRecords.clientId],
      set: {
        scopesGranted: scopes,
        grantedAt: new Date(),
        revokedAt: null,
      },
    });

  await auditLog("oauth_consent_granted", {
    userId,
    detail: { clientId, scopes },
    ip,
    userAgent,
  });
}

export async function revokeConsent(
  userId: number,
  clientId: string,
  ip?: string,
  userAgent?: string,
): Promise<boolean> {
  const result = await db
    .update(schema.consentRecords)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(schema.consentRecords.userId, userId),
      eq(schema.consentRecords.clientId, clientId),
      isNull(schema.consentRecords.revokedAt),
    ))
    .returning({ id: schema.consentRecords.id });

  if (result.length === 0) return false;

  await auditLog("oauth_consent_revoked", {
    userId,
    detail: { clientId },
    ip,
    userAgent,
  });

  return true;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/consent.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/services/consent.service.ts packages/backend/src/lib/audit.ts packages/backend/src/routes/__tests__/consent.test.ts
git commit -m "feat(oauth): consent service with audit trail for grant/revoke events"
```

---

### Task 6: OAuth Routes — /authorize, /token, JWKS

**Files:**
- Create: `packages/backend/src/routes/oauth.ts`
- Modify: `packages/backend/src/server.ts` (register `oauthRoutes`)
- Test: `packages/backend/src/routes/__tests__/oauth-authorize.test.ts`
- Test: `packages/backend/src/routes/__tests__/oauth-token.test.ts`

**Interfaces:**
- Consumes: `getClientByClientId`, `verifyClientSecret`, `validateRedirectUri` from Task 3; `insertTokenEntry`, `markTokenUsed`, `revokeFamily`, `lookupToken` from Task 4; `hasActiveConsent`, `grantConsent` from Task 5; `signOAuthToken`, `getJwks` from Task 2.
- Produces: `GET /api/v1/oauth/.well-known/jwks.json`, `GET /api/v1/oauth/authorize`, `POST /api/v1/oauth/token`. Used by CRM/LMS RPs (future tasks, not this plan).

This is the largest task. It has two test files and one route file.

- [ ] **Step 1: Write /authorize tests**

```typescript
// packages/backend/src/routes/__tests__/oauth-authorize.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetClient = vi.fn();
const mockValidateRedirectUri = vi.fn();
const mockHasActiveConsent = vi.fn();
const mockInsertTokenEntry = vi.fn();

vi.mock("../../services/oauth-client.service", () => ({
  getClientByClientId: (...args: any[]) => mockGetClient(...args),
  validateRedirectUri: (...args: any[]) => mockValidateRedirectUri(...args),
  verifyClientSecret: vi.fn(),
}));
vi.mock("../../services/token-registry.service", () => ({
  insertTokenEntry: (...args: any[]) => mockInsertTokenEntry(...args),
  markTokenUsed: vi.fn(),
  revokeFamily: vi.fn(),
  lookupToken: vi.fn(),
  cleanupExpiredTokens: vi.fn(),
}));
vi.mock("../../services/consent.service", () => ({
  hasActiveConsent: (...args: any[]) => mockHasActiveConsent(...args),
  grantConsent: vi.fn(),
  revokeConsent: vi.fn(),
}));
vi.mock("../../lib/oauth-signing", () => ({
  signOAuthToken: vi.fn(() => "mock-signed-token"),
  verifyOAuthToken: vi.fn(),
  getJwks: vi.fn(() => ({ keys: [{ kty: "EC", kid: "test" }] })),
  getSigningKid: vi.fn(() => "test"),
}));
vi.mock("../../middleware/auth", () => ({
  authMiddleware: async (request: any) => { request.user = { userId: 1 }; },
}));
vi.mock("../../config", () => ({
  config: { OAUTH_SIGNING_KEY: "test", OAUTH_SIGNING_KID: "test" },
}));
vi.mock("../../lib/audit", () => ({ auditLog: vi.fn() }));

import Fastify from "fastify";
import { oauthRoutes } from "../oauth";

const VALID_CLIENT = {
  id: 1, clientId: "crm", clientSecretHash: "h", clientName: "CRM",
  redirectUris: JSON.stringify(["https://crm.example.com/callback"]),
  scopes: "openid profile email", grantTypes: "authorization_code refresh_token",
  requirePkce: true, accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2592000,
  isActive: true, createdAt: new Date(), updatedAt: new Date(),
};

describe("/api/v1/oauth/authorize", () => {
  beforeEach(() => {
    mockGetClient.mockReset();
    mockValidateRedirectUri.mockReset();
    mockHasActiveConsent.mockReset();
    mockInsertTokenEntry.mockReset();
  });

  it("AUTH-01: rejects unknown client_id with 400", async () => {
    mockGetClient.mockResolvedValue(null);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/oauth/authorize",
      query: {
        client_id: "unknown", redirect_uri: "https://x.com/cb",
        response_type: "code", scope: "openid", state: "s1",
        code_challenge: "abc", code_challenge_method: "S256",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("client");
  });

  it("AUTH-02: rejects mismatched redirect_uri with 400", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockValidateRedirectUri.mockReturnValue(false);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/oauth/authorize",
      query: {
        client_id: "crm", redirect_uri: "https://evil.com/cb",
        response_type: "code", scope: "openid", state: "s1",
        code_challenge: "abc", code_challenge_method: "S256",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("redirect");
  });

  it("AUTH-03: rejects missing code_challenge when client requires PKCE", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockValidateRedirectUri.mockReturnValue(true);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/oauth/authorize",
      query: {
        client_id: "crm", redirect_uri: "https://crm.example.com/callback",
        response_type: "code", scope: "openid", state: "s1",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("PKCE");
  });

  it("AUTH-04: returns consent_required when no active consent exists (unauthenticated)", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockValidateRedirectUri.mockReturnValue(true);
    mockHasActiveConsent.mockResolvedValue(false);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/oauth/authorize",
      query: {
        client_id: "crm", redirect_uri: "https://crm.example.com/callback",
        response_type: "code", scope: "openid", state: "s1",
        code_challenge: "abc", code_challenge_method: "S256",
      },
      headers: { authorization: "Bearer mock-token" },
    });
    // When consent is needed, return consent_required so frontend can show consent screen
    expect(res.statusCode).toBe(200);
    expect(res.json().action).toBe("consent_required");
    expect(res.json().client_name).toBe("CRM");
    expect(res.json().scopes).toContain("openid");
  });

  it("AUTH-05: issues auth code redirect when consent exists", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockValidateRedirectUri.mockReturnValue(true);
    mockHasActiveConsent.mockResolvedValue(true);
    mockInsertTokenEntry.mockResolvedValue(undefined);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/oauth/authorize",
      query: {
        client_id: "crm", redirect_uri: "https://crm.example.com/callback",
        response_type: "code", scope: "openid", state: "s1",
        code_challenge: "abc", code_challenge_method: "S256",
      },
      headers: { authorization: "Bearer mock-token" },
    });
    expect(res.statusCode).toBe(302);
    const location = res.headers.location as string;
    expect(location).toContain("https://crm.example.com/callback");
    expect(location).toContain("code=");
    expect(location).toContain("state=s1");
  });
});
```

- [ ] **Step 2: Write /token tests**

```typescript
// packages/backend/src/routes/__tests__/oauth-token.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

const mockGetClient = vi.fn();
const mockVerifyClientSecret = vi.fn();
const mockMarkTokenUsed = vi.fn();
const mockLookupToken = vi.fn();
const mockInsertTokenEntry = vi.fn();
const mockRevokeFamily = vi.fn();

vi.mock("../../services/oauth-client.service", () => ({
  getClientByClientId: (...args: any[]) => mockGetClient(...args),
  verifyClientSecret: (...args: any[]) => mockVerifyClientSecret(...args),
  validateRedirectUri: vi.fn(),
}));
vi.mock("../../services/token-registry.service", () => ({
  insertTokenEntry: (...args: any[]) => mockInsertTokenEntry(...args),
  markTokenUsed: (...args: any[]) => mockMarkTokenUsed(...args),
  revokeFamily: (...args: any[]) => mockRevokeFamily(...args),
  lookupToken: (...args: any[]) => mockLookupToken(...args),
  cleanupExpiredTokens: vi.fn(),
}));
vi.mock("../../services/consent.service", () => ({
  hasActiveConsent: vi.fn(),
  grantConsent: vi.fn(),
  revokeConsent: vi.fn(),
}));

// Generate real ES256 key for token signing/verification in tests
const testKeyPair = crypto.generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

vi.mock("../../lib/oauth-signing", () => ({
  signOAuthToken: vi.fn((payload: any, _ttl: number) => {
    const jwt = require("jsonwebtoken");
    return jwt.sign({ ...payload, jti: crypto.randomUUID() }, testKeyPair.privateKey, { algorithm: "ES256", expiresIn: 900 });
  }),
  verifyOAuthToken: vi.fn((token: string) => {
    const jwt = require("jsonwebtoken");
    return jwt.verify(token, testKeyPair.publicKey, { algorithms: ["ES256"] });
  }),
  getJwks: vi.fn(() => ({ keys: [] })),
  getSigningKid: vi.fn(() => "test-kid"),
}));

vi.mock("../../middleware/auth", () => ({
  authMiddleware: async (request: any) => { request.user = { userId: 1 }; },
}));
vi.mock("../../config", () => ({
  config: { OAUTH_SIGNING_KEY: testKeyPair.privateKey, OAUTH_SIGNING_KID: "test-kid" },
}));
vi.mock("../../lib/audit", () => ({ auditLog: vi.fn() }));
vi.mock("../../db", () => ({
  db: { select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: () => [{ id: 1, email: "test@example.com", isEmailVerified: true, firstName: "Test", lastName: "User" }] }) }) })) },
  schema: { users: { id: "id", email: "email" } },
}));

import Fastify from "fastify";
import { oauthRoutes } from "../oauth";

const VALID_CLIENT = {
  id: 1, clientId: "crm", clientSecretHash: "h", clientName: "CRM",
  redirectUris: JSON.stringify(["https://crm.example.com/callback"]),
  scopes: "openid profile email", grantTypes: "authorization_code refresh_token",
  requirePkce: true, accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2592000,
  isActive: true, createdAt: new Date(), updatedAt: new Date(),
};

// PKCE pair
const codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

describe("POST /api/v1/oauth/token — code exchange", () => {
  beforeEach(() => {
    mockGetClient.mockReset();
    mockVerifyClientSecret.mockReset();
    mockMarkTokenUsed.mockReset();
    mockLookupToken.mockReset();
    mockInsertTokenEntry.mockReset();
    mockRevokeFamily.mockReset();
  });

  it("TOKEN-01: rejects invalid client credentials", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockVerifyClientSecret.mockResolvedValue(false);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST", url: "/api/v1/oauth/token",
      payload: {
        grant_type: "authorization_code", code: "test-code",
        client_id: "crm", client_secret: "wrong",
        redirect_uri: "https://crm.example.com/callback",
        code_verifier: codeVerifier,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("TOKEN-02: rejects replayed authorization code", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockVerifyClientSecret.mockResolvedValue(true);
    mockMarkTokenUsed.mockResolvedValue({ alreadyUsed: true, familyId: "fam-1" });
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST", url: "/api/v1/oauth/token",
      payload: {
        grant_type: "authorization_code", code: "replayed-code",
        client_id: "crm", client_secret: "valid",
        redirect_uri: "https://crm.example.com/callback",
        code_verifier: codeVerifier,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("invalid_grant");
    // Family should be revoked on replay
    expect(mockRevokeFamily).toHaveBeenCalledWith("fam-1");
  });

  it("TOKEN-03: issues tokens on valid code exchange", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockVerifyClientSecret.mockResolvedValue(true);
    mockMarkTokenUsed.mockResolvedValue({ alreadyUsed: false, familyId: "fam-1" });
    mockLookupToken.mockResolvedValue({
      jti: "code-jti", tokenType: "auth_code", sub: "42", clientId: "crm",
      familyId: "fam-1", codeChallenge, redirectUri: "https://crm.example.com/callback",
      scope: "openid profile email",
      issuedAt: new Date(), expiresAt: new Date(Date.now() + 300000),
      usedAt: new Date(), revokedAt: null,
    });
    mockInsertTokenEntry.mockResolvedValue(undefined);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST", url: "/api/v1/oauth/token",
      payload: {
        grant_type: "authorization_code", code: "code-jti",
        client_id: "crm", client_secret: "valid",
        redirect_uri: "https://crm.example.com/callback",
        code_verifier: codeVerifier,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.access_token).toBeTruthy();
    expect(body.id_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(900);
  });

  it("TOKEN-04: rejects invalid PKCE code_verifier", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockVerifyClientSecret.mockResolvedValue(true);
    mockMarkTokenUsed.mockResolvedValue({ alreadyUsed: false, familyId: "fam-1" });
    mockLookupToken.mockResolvedValue({
      jti: "code-jti", tokenType: "auth_code", sub: "42", clientId: "crm",
      familyId: "fam-1", codeChallenge, redirectUri: "https://crm.example.com/callback",
      scope: "openid", issuedAt: new Date(), expiresAt: new Date(Date.now() + 300000),
      usedAt: new Date(), revokedAt: null,
    });
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST", url: "/api/v1/oauth/token",
      payload: {
        grant_type: "authorization_code", code: "code-jti",
        client_id: "crm", client_secret: "valid",
        redirect_uri: "https://crm.example.com/callback",
        code_verifier: "wrong-verifier",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("invalid_grant");
  });
});

describe("POST /api/v1/oauth/token — refresh exchange", () => {
  beforeEach(() => {
    mockGetClient.mockReset();
    mockVerifyClientSecret.mockReset();
    mockMarkTokenUsed.mockReset();
    mockLookupToken.mockReset();
    mockInsertTokenEntry.mockReset();
    mockRevokeFamily.mockReset();
  });

  it("TOKEN-05: rotates refresh token on valid use", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockVerifyClientSecret.mockResolvedValue(true);
    mockMarkTokenUsed.mockResolvedValue({ alreadyUsed: false, familyId: "fam-1" });
    mockLookupToken.mockResolvedValue({
      jti: "refresh-jti", tokenType: "refresh", sub: "42", clientId: "crm",
      familyId: "fam-1", scope: "openid profile email",
      issuedAt: new Date(), expiresAt: new Date(Date.now() + 86400000),
      usedAt: new Date(), revokedAt: null,
    });
    mockInsertTokenEntry.mockResolvedValue(undefined);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST", url: "/api/v1/oauth/token",
      payload: {
        grant_type: "refresh_token", refresh_token: "refresh-jti",
        client_id: "crm", client_secret: "valid",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.refresh_token).not.toBe("refresh-jti"); // new token issued
  });

  it("TOKEN-06: revokes family on refresh token reuse", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockVerifyClientSecret.mockResolvedValue(true);
    mockMarkTokenUsed.mockResolvedValue({ alreadyUsed: true, familyId: "fam-1" });
    mockRevokeFamily.mockResolvedValue(3);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST", url: "/api/v1/oauth/token",
      payload: {
        grant_type: "refresh_token", refresh_token: "reused-jti",
        client_id: "crm", client_secret: "valid",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(mockRevokeFamily).toHaveBeenCalledWith("fam-1");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/oauth-authorize.test.ts src/routes/__tests__/oauth-token.test.ts`
Expected: FAIL — `../oauth` module not found

- [ ] **Step 4: Implement the OAuth routes**

```typescript
// packages/backend/src/routes/oauth.ts
import crypto from "node:crypto";
import { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth";
import { getClientByClientId, verifyClientSecret, validateRedirectUri } from "../services/oauth-client.service";
import { insertTokenEntry, markTokenUsed, revokeFamily, lookupToken } from "../services/token-registry.service";
import { hasActiveConsent } from "../services/consent.service";
import { signOAuthToken, getJwks } from "../lib/oauth-signing";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

export async function oauthRoutes(app: FastifyInstance) {
  // ── JWKS endpoint (public, no auth) ────────────────────────────────────
  app.get("/api/v1/oauth/.well-known/jwks.json", async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=3600");
    return getJwks();
  });

  // ── Authorization endpoint ─────────────────────────────────────────────
  app.get(
    "/api/v1/oauth/authorize",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const q = request.query as Record<string, string>;
      const { client_id, redirect_uri, response_type, scope, state, code_challenge, code_challenge_method } = q;

      // 1. Validate client
      if (!client_id) return reply.status(400).send({ error: "invalid_request", error_description: "client_id required" });
      const client = await getClientByClientId(client_id);
      if (!client) return reply.status(400).send({ error: "invalid_client", error_description: "Unknown client_id" });

      // 2. Validate redirect_uri — exact match only
      if (!redirect_uri || !validateRedirectUri(client, redirect_uri)) {
        return reply.status(400).send({ error: "invalid_request", error_description: "redirect_uri does not match any registered URI" });
      }

      // 3. Validate response_type
      if (response_type !== "code") {
        return reply.redirect(`${redirect_uri}?error=unsupported_response_type&state=${encodeURIComponent(state || "")}`);
      }

      // 4. Validate PKCE
      if (client.requirePkce && (!code_challenge || code_challenge_method !== "S256")) {
        return reply.status(400).send({ error: "invalid_request", error_description: "PKCE S256 code_challenge required" });
      }

      // 5. Check consent
      const userId = (request as any).user.userId;
      const requestedScope = scope || client.scopes;
      const consented = await hasActiveConsent(userId, client_id, requestedScope);

      if (!consented) {
        // Return consent_required — the frontend (SsoLogin.tsx or a new consent page) will show the consent UI
        return reply.status(200).send({
          action: "consent_required",
          client_name: client.clientName,
          client_id: client.clientId,
          scopes: requestedScope,
          redirect_uri,
          state: state || "",
          code_challenge: code_challenge || "",
          code_challenge_method: code_challenge_method || "",
        });
      }

      // 6. Issue authorization code
      const familyId = crypto.randomUUID();
      const codeJti = crypto.randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

      await insertTokenEntry({
        jti: codeJti,
        tokenType: "auth_code",
        sub: String(userId),
        clientId: client_id,
        familyId,
        codeChallenge: code_challenge || null,
        redirectUri: redirect_uri,
        scope: requestedScope,
        issuedAt: now,
        expiresAt,
      });

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set("code", codeJti);
      if (state) redirectUrl.searchParams.set("state", state);

      return reply.redirect(302, redirectUrl.toString());
    },
  );

  // ── Token endpoint ─────────────────────────────────────────────────────
  app.post(
    "/api/v1/oauth/token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = request.body as Record<string, string>;
      const { grant_type, client_id, client_secret } = body;

      // 1. Authenticate client
      if (!client_id || !client_secret) {
        return reply.status(401).send({ error: "invalid_client", error_description: "client_id and client_secret required" });
      }
      const client = await getClientByClientId(client_id);
      if (!client) return reply.status(401).send({ error: "invalid_client" });
      const secretValid = await verifyClientSecret(client, client_secret);
      if (!secretValid) return reply.status(401).send({ error: "invalid_client" });

      if (grant_type === "authorization_code") {
        return handleCodeExchange(body, client, reply);
      } else if (grant_type === "refresh_token") {
        return handleRefreshExchange(body, client, reply);
      } else {
        return reply.status(400).send({ error: "unsupported_grant_type" });
      }
    },
  );
}

async function handleCodeExchange(
  body: Record<string, string>,
  client: any,
  reply: any,
) {
  const { code, redirect_uri, code_verifier } = body;

  if (!code) return reply.status(400).send({ error: "invalid_request", error_description: "code required" });

  // 1. Mark code as used (single-use enforcement)
  const useResult = await markTokenUsed(code);
  if (useResult.alreadyUsed) {
    // Replay detected — revoke the entire family
    if (useResult.familyId) await revokeFamily(useResult.familyId);
    return reply.status(400).send({ error: "invalid_grant", error_description: "Authorization code already used or expired" });
  }

  // 2. Lookup the code entry for bound parameters
  const entry = await lookupToken(code);
  if (!entry || entry.tokenType !== "auth_code" || entry.clientId !== client.clientId) {
    return reply.status(400).send({ error: "invalid_grant" });
  }

  // 3. Verify redirect_uri matches the one bound at authorization time
  if (entry.redirectUri && entry.redirectUri !== redirect_uri) {
    return reply.status(400).send({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
  }

  // 4. Verify PKCE
  if (entry.codeChallenge) {
    if (!code_verifier) {
      return reply.status(400).send({ error: "invalid_grant", error_description: "code_verifier required" });
    }
    const computedChallenge = crypto.createHash("sha256").update(code_verifier).digest("base64url");
    if (computedChallenge !== entry.codeChallenge) {
      return reply.status(400).send({ error: "invalid_grant", error_description: "PKCE verification failed" });
    }
  }

  // 5. Fetch user info for ID token claims
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      isEmailVerified: schema.users.isEmailVerified,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .where(eq(schema.users.id, Number(entry.sub)))
    .limit(1);

  if (!user) return reply.status(400).send({ error: "invalid_grant" });

  // 6. Issue tokens
  return issueTokens(entry.sub, entry.familyId!, entry.scope || client.scopes, client, user, reply);
}

async function handleRefreshExchange(
  body: Record<string, string>,
  client: any,
  reply: any,
) {
  const { refresh_token } = body;
  if (!refresh_token) return reply.status(400).send({ error: "invalid_request" });

  // 1. Mark refresh token as used
  const useResult = await markTokenUsed(refresh_token);
  if (useResult.alreadyUsed) {
    // Reuse detected — revoke entire family (theft detection)
    if (useResult.familyId) await revokeFamily(useResult.familyId);
    return reply.status(401).send({ error: "invalid_grant", error_description: "Refresh token reused — session revoked" });
  }

  // 2. Lookup the refresh token entry
  const entry = await lookupToken(refresh_token);
  if (!entry || entry.tokenType !== "refresh" || entry.clientId !== client.clientId) {
    return reply.status(401).send({ error: "invalid_grant" });
  }

  // 3. Fetch user info
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      isEmailVerified: schema.users.isEmailVerified,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .where(eq(schema.users.id, Number(entry.sub)))
    .limit(1);

  if (!user) return reply.status(401).send({ error: "invalid_grant" });

  // 4. Issue new tokens with same family_id
  return issueTokens(entry.sub, entry.familyId!, entry.scope || client.scopes, client, user, reply);
}

async function issueTokens(
  sub: string,
  familyId: string,
  scope: string,
  client: any,
  user: { id: number; email: string | null; isEmailVerified: boolean | null; firstName: string | null; lastName: string | null },
  reply: any,
) {
  const now = new Date();

  // Access token
  const accessToken = signOAuthToken(
    { sub, aud: client.clientId, iss: "ammawallet", scope },
    client.accessTokenTtlSeconds,
  );

  // ID token
  const idToken = signOAuthToken(
    {
      sub,
      aud: client.clientId,
      iss: "ammawallet",
      email: user.email,
      email_verified: user.isEmailVerified ?? false,
    },
    client.accessTokenTtlSeconds,
  );

  // Refresh token (opaque JTI stored server-side)
  const refreshJti = crypto.randomUUID();
  await insertTokenEntry({
    jti: refreshJti,
    tokenType: "refresh",
    sub,
    clientId: client.clientId,
    familyId,
    scope,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + client.refreshTokenTtlSeconds * 1000),
  });

  // Also register access token JTI for audit (not checked on use — stateless verification)
  const accessPayload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
  await insertTokenEntry({
    jti: accessPayload.jti,
    tokenType: "access",
    sub,
    clientId: client.clientId,
    familyId,
    scope,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + client.accessTokenTtlSeconds * 1000),
  });

  return reply.status(200).send({
    access_token: accessToken,
    id_token: idToken,
    refresh_token: refreshJti,
    token_type: "Bearer",
    expires_in: client.accessTokenTtlSeconds,
  });
}
```

- [ ] **Step 5: Register the routes in server.ts**

In `packages/backend/src/server.ts`, add after the existing `app.register(ssoRoutes);` line:

```typescript
import { oauthRoutes } from "./routes/oauth";
// ... in bootstrap():
app.register(oauthRoutes);
```

- [ ] **Step 6: Run all new tests**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/oauth-authorize.test.ts src/routes/__tests__/oauth-token.test.ts`
Expected: PASS (all 11 tests: 5 authorize + 6 token)

- [ ] **Step 7: Run legacy SSO tests**

Run: `cd packages/backend && npx vitest run src/routes/sso.test.ts`
Expected: All 6 PASS

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/routes/oauth.ts packages/backend/src/server.ts packages/backend/src/routes/__tests__/oauth-authorize.test.ts packages/backend/src/routes/__tests__/oauth-token.test.ts
git commit -m "feat(oauth): /authorize, /token, and JWKS endpoints with PKCE and refresh rotation"
```

---

### Task 7: Legacy Regression Verification and Full Suite

**Files:**
- Create: `packages/backend/src/routes/__tests__/oauth-legacy-regression.test.ts`

**Interfaces:**
- Consumes: Nothing new — confirms existing code is unchanged.
- Produces: Confidence that the legacy SSO flow works identically to before this plan was executed.

- [ ] **Step 1: Write the regression test**

```typescript
// packages/backend/src/routes/__tests__/oauth-legacy-regression.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Legacy SSO flow regression", () => {
  const ssoSource = readFileSync(join(__dirname, "..", "sso.ts"), "utf-8");

  it("LEGACY-01: sso.ts still contains usedJtis in-memory Set", () => {
    expect(ssoSource).toContain("const usedJtis = new Set<string>()");
  });

  it("LEGACY-02: sso.ts still contains 60-second cleanup timer", () => {
    expect(ssoSource).toContain("usedJtis.clear()");
    expect(ssoSource).toContain("60_000");
  });

  it("LEGACY-03: sso.ts still uses SSO_SECRET for signing", () => {
    expect(ssoSource).toContain("config.SSO_SECRET");
  });

  it("LEGACY-04: sso.ts still hardcodes audience to lms-amma-sso", () => {
    expect(ssoSource).toContain('aud: "lms-amma-sso"');
  });

  it("LEGACY-05: sso.ts still uses HS256 (default jsonwebtoken behavior with string secret)", () => {
    // ES256 requires { algorithm: "ES256" } — its absence confirms HS256
    // The sso.ts file should NOT contain algorithm: "ES256" for the legacy flow
    const ssoSignCalls = ssoSource.match(/jwt\.sign\([^)]*\)/gs) || [];
    for (const call of ssoSignCalls) {
      expect(call).not.toContain("ES256");
    }
  });

  it("LEGACY-06: sso.ts does not import from oauth-signing or token-registry", () => {
    expect(ssoSource).not.toContain("oauth-signing");
    expect(ssoSource).not.toContain("token-registry");
    expect(ssoSource).not.toContain("oauth-client");
    expect(ssoSource).not.toContain("consent");
  });
});
```

- [ ] **Step 2: Run the regression test**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/oauth-legacy-regression.test.ts`
Expected: PASS (6 tests) — confirms sso.ts is completely untouched

- [ ] **Step 3: Run the FULL Amma Wallet test suite**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass — 492+ existing + ~50 new = ~542 total. Zero failures.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/__tests__/oauth-legacy-regression.test.ts
git commit -m "test(oauth): legacy SSO regression tests confirming zero behavioral change"
```

---

## Pre-Deployment Backup Requirement

**CRITICAL: Before any `drizzle-kit push` that adds the new `oauth_clients`, `token_registry`, or `consent_records` tables to a real (non-test) PostgreSQL database, the following backup must be taken first:**

```bash
# Run from the VPS host — NOT inside a container
docker exec amma-db pg_dump -U postgres -d amma_wallet > /home/webadmin/backups/amma-wallet/pre-oauth-schema-$(date +%Y%m%d_%H%M%S).sql
```

This is a deployment-time step. It is NOT performed during test-driven development (tests use mocked DB). It must be performed before the production `drizzle-kit push` in a future deployment session, under explicit approval.

---

## Self-Review Checklist

**Spec coverage:**
- ADR-001 ES256 → Task 2 (signing service + JWKS)
- ADR-005 oauth_clients → Task 1 (schema) + Task 3 (service)
- Token registry + JTI transition → Task 1 (schema) + Task 4 (service)
- Consent recording + audit trail → Task 1 (schema) + Task 5 (service)
- /authorize, /token, JWKS → Task 6 (routes)
- Legacy non-regression → Task 7 (regression tests)
- 7-day cleanup → Task 4 (`cleanupExpiredTokens`)
- Redirect URI exact-match → Task 3 (CLIENT-06 through CLIENT-11)
- Pre-push backup → documented in Pre-Deployment section

**Placeholder scan:** No TBD, TODO, or "implement later" found.

**Type consistency:**
- `OAuthClient` interface defined in Task 3, consumed by Tasks 5-6 ✓
- `TokenEntry` interface defined in Task 4, consumed by Task 6 ✓
- `signOAuthToken`, `verifyOAuthToken`, `getJwks` signatures consistent across Tasks 2 and 6 ✓
- `hasActiveConsent`, `grantConsent`, `revokeConsent` signatures consistent across Tasks 5 and 6 ✓
