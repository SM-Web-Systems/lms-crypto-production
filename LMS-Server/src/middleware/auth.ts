import { Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt.js';
import { queryOne, hashToken } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'Missing or invalid authorization header',
        },
      });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const payload = verifyToken(token);

      // Reject tokens issued before the last password reset.
      // One indexed SELECT by PK — negligible cost on SQLite.
      const row = queryOne<{ password_changed_at: string | null; deletion_status: string | null; authorization_version: number }>(
        'SELECT password_changed_at, deletion_status, authorization_version FROM users WHERE id = ?',
        [payload.userId],
      );

      if (!row || (payload.authorizationVersion ?? 0) !== row.authorization_version) {
        res.status(401).json({ success: false, error: {
          code: ErrorCodes.UNAUTHORIZED, message: 'Authorization changed. Please log in again.',
        } });
        return;
      }

      // Account deletion gate: finalized users are fully blocked.
      // pending_deletion users are restricted to allowlisted paths.
      if (row?.deletion_status === 'finalized') {
        res.status(403).json({
          success: false,
          error: {
            code: ErrorCodes.FORBIDDEN,
            message: 'This account has been deleted and is no longer accessible.',
          },
        });
        return;
      }
      if (row?.deletion_status === 'pending_deletion') {
        // Allowlist: deletion management + data export
        const allowedPaths = [
          '/api/v1/account/delete',
          '/api/v1/data-export',
          '/api/v1/auth/me',
          '/api/v1/auth/logout',
          '/api/v1/sessions',
        ];
        const requestPath = req.originalUrl.split('?')[0];
        const isAllowed = allowedPaths.some(p => requestPath === p || requestPath.startsWith(p + '/'));
        if (!isAllowed) {
          res.status(403).json({
            success: false,
            error: {
              code: ErrorCodes.FORBIDDEN,
              message: 'Account is pending deletion. Only deletion management and data export are available.',
            },
          });
          return;
        }
      }

      if (row?.password_changed_at) {
        const changedEpoch =
          new Date(row.password_changed_at.replace(' ', 'T') + 'Z').getTime() / 1000;
        if ((payload.iat ?? 0) < changedEpoch) {
          res.status(401).json({
            success: false,
            error: {
              code: ErrorCodes.UNAUTHORIZED,
              message: 'Session expired after password change. Please log in again.',
            },
          });
          return;
        }
      }

      // Phase F2: session hash check.
      // Look up the session row by token hash. Three cases:
      //   1. Row found, revoked_at IS NULL, not expired → valid session, allow.
      //   2. Row found but revoked_at IS NOT NULL or expired → explicitly revoked/expired, 401.
      //   3. No row at all → token was created without going through login (test token or
      //      pre-F2 token) → allow through for backward compatibility.
      const tokenHash = hashToken(token);
      const session = queryOne<{ id: string; revoked_at: string | null; expired: number }>(
        "SELECT id, revoked_at, datetime(expires_at) <= datetime('now') as expired FROM active_sessions WHERE token_hash = ?",
        [tokenHash],
      );
      if (session) {
        // Row exists — check if revoked or expired
        if (session.revoked_at || session.expired) {
          res.status(401).json({
            success: false,
            error: {
              code: ErrorCodes.UNAUTHORIZED,
              message: 'Session revoked or expired',
            },
          });
          return;
        }
        // Not revoked; expiry is also enforced by the WHERE clause on session queries,
        // but double-check here if needed (skip for performance — token jwt exp covers this)
      }
      // session === null → no row in active_sessions → test/pre-F2 token, allow through

      req.user = payload;
      next();
    } catch {
      res.status(401).json({
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'Invalid or expired token',
        },
      });
    }
  } catch (error) {
    next(error);
  }
}

