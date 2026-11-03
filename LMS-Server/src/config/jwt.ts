import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import { JWTPayload, type LegacyRole } from '../types/index.js';
import { queryOne } from './database.js';

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
  const current = queryOne<{ authorization_version: number; role: LegacyRole }>(
    'SELECT authorization_version, role FROM users WHERE id = ?', [payload.userId],
  );
  // A login may have read the user before an asynchronous password check. Read
  // the legacy role and version together so a concurrent demotion cannot mint
  // an old admin claim with the new, valid version.
  return jwt.sign({ ...payload, role: current?.role ?? payload.role, authorizationVersion: current?.authorization_version ?? 0 }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    jwtid: randomBytes(8).toString('hex'),
  } as jwt.SignOptions);
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

