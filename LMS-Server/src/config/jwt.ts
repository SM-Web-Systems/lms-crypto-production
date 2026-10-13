import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import { JWTPayload } from '../types/index.js';

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate a signed JWT for the given payload.
 *
 * KB-01: The `role` field in the payload is the legacy `users.role` value at
 * issuance time. It is NOT refreshed when an admin changes the user's role or
 * RBAC assignments. This is accepted behavior — backend authorization always
 * queries the DB via `requirePermission()`, so permission changes take effect
 * immediately. The JWT `role` is used only for frontend routing (presentation).
 * See KNOWN_BEHAVIORS.md for full rationale.
 */
export function generateToken(payload: JWTPayload): string {
  // jwtid ensures each token is unique even for identical payloads issued in the same second
  return jwt.sign(payload, JWT_SECRET, {
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

