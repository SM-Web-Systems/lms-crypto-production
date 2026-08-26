import { eq, and, lt, isNull } from "drizzle-orm";
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
