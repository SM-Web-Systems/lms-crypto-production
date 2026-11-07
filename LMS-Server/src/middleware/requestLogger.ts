import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const start = Date.now();
  // Express may strip the router prefix before finish. Capture the retired
  // route at entry and log its template without the target account ID.
  const retiredRolePath = req.method === 'PATCH' && /^\/api\/v1\/users\/[^/]+\/role\/?$/i.test(req.path)
    ? '/api/v1/users/:id/role'
    : null;
  res.on('finish', () => {
    const duration = Date.now() - start;
    const loggedPath = retiredRolePath ?? req.path;
    logger.info({
      requestId,
      method: req.method,
      path: loggedPath,
      statusCode: res.statusCode,
      duration,
    }, `${req.method} ${loggedPath} ${res.statusCode} ${duration}ms`);
  });

  next();
}
