import { eq, and, lt, gt, isNull } from "drizzle-orm";
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

/**
 * Atomically mark a token as used. Uses UPDATE...WHERE...RETURNING to avoid
 * TOCTOU race conditions — the check and mark happen in a single SQL statement.
 * If zero rows are returned, the token was already used, revoked, expired, or unknown.
 */
export async function markTokenUsed(jti: string): Promise<{ alreadyUsed: boolean; familyId?: string | null }> {
  // Atomic: only succeeds if the token exists, is unused, unrevoked, and not expired
  const result = await db
    .update(schema.tokenRegistry)
    .set({ usedAt: new Date() })
    .where(and(
      eq(schema.tokenRegistry.jti, jti),
      isNull(schema.tokenRegistry.usedAt),
      isNull(schema.tokenRegistry.revokedAt),
      gt(schema.tokenRegistry.expiresAt, new Date()),
    ))
    .returning({ familyId: schema.tokenRegistry.familyId });

  if (result.length > 0) {
    return { alreadyUsed: false, familyId: result[0].familyId };
  }

  // Token was not atomically claimed — look up to get familyId for revocation
  const entry = await lookupToken(jti);
  return { alreadyUsed: true, familyId: entry?.familyId ?? null };
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
