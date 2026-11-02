import { Request, Response, NextFunction } from 'express';
import { isWriterHoldActive } from '../services/writerHold.js';

const RETRY_AFTER_SECONDS = '120';
const HEALTH_PATHS = new Set(['/health', '/healthz', '/api/v1/health']);

/** The release checks these while held. Without a token this probe only returns 401. */
function isAllowedDuringHold(req: Request): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (HEALTH_PATHS.has(req.path)) return true;
  return req.path === '/api/v1/courses' && !req.headers.authorization && !req.headers.cookie;
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
