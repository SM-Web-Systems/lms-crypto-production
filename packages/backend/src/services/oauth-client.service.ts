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
  idTokenTtlSeconds: number;
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
