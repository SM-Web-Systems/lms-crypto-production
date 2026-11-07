import { generateToken } from '../../config/jwt.js';
import type { JWTPayload } from '../../types/index.js';

export function makeToken(overrides: {
  userId: string;
  email: string;
  role?: string;
  studentId?: string;
}): string {
  const payload: JWTPayload = {
    userId: overrides.userId,
    email: overrides.email,
    studentId: overrides.studentId,
  };
  return generateToken(payload);
}
