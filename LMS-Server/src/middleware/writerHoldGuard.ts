import { Request, Response, NextFunction } from 'express';
import { isWriterHoldActive } from '../services/writerHold.js';

const RETRY_AFTER_SECONDS = '120';
// Not /healthz: its readiness probe writes to the database.
const HEALTH_PATHS = new Set(['/health', '/api/v1/health']);

/** The release probes unauthenticated routes that cannot write while held. */
function isAllowedDuringHold(req: Request): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (HEALTH_PATHS.has(req.path)) return true;
  if (req.headers.authorization || req.headers.cookie) return false;
  return req.path === '/api/v1/courses'
    || (req.method === 'GET' && req.originalUrl === '/api/v1/auth/amma-callback');
}

export function writerHoldGuard(req: Request, res: Response, next: NextFunction): void {
  if (!isWriterHoldActive() || isAllowedDuringHold(req)) {
    next();
    return;
  }
  res.set('Retry-After', RETRY_AFTER_SECONDS).status(503).json({
    success: false,
    error: { code: 'WRITER_HOLD', message: 'Maintenance in progress, please retry shortly' },
  });
}
