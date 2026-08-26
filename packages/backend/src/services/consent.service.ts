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
