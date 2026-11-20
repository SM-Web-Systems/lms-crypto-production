import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import { JWTPayload } from '../types/index.js';
import { compatibleRole } from '../services/roleCompatibilityService.js';
import { getUserRoles } from '../middleware/rbac.js';
import { db, queryOne, createSession } from './database.js';

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate a signed JWT for the given payload and record its session row.
 *
 * Role changes invalidate older tokens through an authorization version.
 * Tokens predating versioning are treated as version zero by authenticate().
 *
 * authenticate() refuses any token without an active_sessions row (fail closed), so the row is
 * written here, in the same transaction as the signature, and expires with the JWT. Pass the
 * Express request to record the client IP and user agent.
 */
export function generateToken(
  payload: JWTPayload,
  req?: { ip?: string; get?: (h: string) => string | undefined },
): string {
  // jwtid ensures each token is unique even for identical payloads issued in the same second
  return db.transaction(() => {
    const current = queryOne<{authorization_version:number}>('SELECT authorization_version FROM users WHERE id = ?', [payload.userId]);
    const token = jwt.sign({...payload,role:compatibleRole(payload.userId),roles:getUserRoles(payload.userId),
      authorizationVersion:current?.authorization_version ?? 0},JWT_SECRET,{
      expiresIn:JWT_EXPIRES_IN,jwtid:randomBytes(8).toString('hex'),
    } as jwt.SignOptions);
    const exp = (jwt.decode(token) as { exp?: number } | null)?.exp;
    createSession(payload.userId, token, req, exp ? new Date(exp * 1000).toISOString() : undefined);
    return token;
  })();
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}

