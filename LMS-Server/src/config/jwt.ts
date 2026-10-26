import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import { JWTPayload } from '../types/index.js';
import { compatibleRole } from '../services/roleCompatibilityService.js';
import { getUserRoles } from '../middleware/rbac.js';
import { db, queryOne } from './database.js';

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate a signed JWT for the given payload.
 *
 * Role changes invalidate older tokens through an authorization version.
 * Tokens predating versioning are treated as version zero by authenticate().
 */
export function generateToken(payload: JWTPayload): string {
  // jwtid ensures each token is unique even for identical payloads issued in the same second
  return db.transaction(() => {
    const current = queryOne<{authorization_version:number}>('SELECT authorization_version FROM users WHERE id = ?', [payload.userId]);
    return jwt.sign({...payload,role:compatibleRole(payload.userId),roles:getUserRoles(payload.userId),
      authorizationVersion:current?.authorization_version ?? 0},JWT_SECRET,{
      expiresIn:JWT_EXPIRES_IN,jwtid:randomBytes(8).toString('hex'),
    } as jwt.SignOptions);
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

