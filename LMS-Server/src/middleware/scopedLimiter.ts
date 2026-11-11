import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Runs `limiter` only for requests whose path (relative to the mount point)
 * is one of `prefixes` or lies beneath one of them, on whole path segments.
 *
 * Several routers are mounted on the shared '/api/v1' prefix. A limiter passed
 * directly to that app.use() would also count and refuse every later /api/v1
 * route (LOCKOUT-LMS-003); this keeps it on the routes it was meant for.
 */
export function limitPaths(limiter: RequestHandler, prefixes: readonly string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const matched = prefixes.some((prefix) => req.path === prefix || req.path.startsWith(prefix + '/'));
    if (!matched) {
      next();
      return;
    }
    limiter(req, res, next);
  };
}
