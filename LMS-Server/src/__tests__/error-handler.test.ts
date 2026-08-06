/**
 * LMS-ERR-001 — AppError vs unexpected error logging
 * LMS-ERR-002 — Multer file size message dynamic
 * LMS-ERR-003 — SQLite errors never leak schema
 * LMS-ERR-004 — Error responses include requestId
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AppError, errorHandler } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../types/index.js';

function buildApp(handler: express.RequestHandler) {
  const app = express();
  // Simulate requestId middleware
  app.use((req, _res, next) => { req.requestId = 'test-request-id'; next(); });
  app.get('/test', handler);
  app.use(errorHandler);
  return app;
}

describe('LMS-ERR-001 — AppError vs unexpected error responses', () => {
  it('should return structured error for AppError with correct status', async () => {
    const app = buildApp((_req, _res, next) => {
      next(new AppError('Not found', 404, ErrorCodes.NOT_FOUND));
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(ErrorCodes.NOT_FOUND);
    expect(res.body.error.message).toBe('Not found');
  });

  it('should return 500 for unexpected errors', async () => {
    const app = buildApp((_req, _res, next) => {
      next(new Error('something broke'));
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe(ErrorCodes.INTERNAL_ERROR);
  });
});

describe('LMS-ERR-002 — Multer file size message reads env', () => {
  it('should use MAX_FILE_SIZE env var for error message', async () => {
    const orig = process.env.MAX_FILE_SIZE;
    process.env.MAX_FILE_SIZE = '5242880'; // 5MB

    const app = buildApp((_req, _res, next) => {
      next(Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' }));
    });

    const res = await request(app).get('/test');
    expect(res.body.error.message).toContain('5MB');
    expect(res.body.error.message).toMatch(/file size exceeds/i);

    if (orig !== undefined) process.env.MAX_FILE_SIZE = orig;
    else delete process.env.MAX_FILE_SIZE;
  });
});

describe('LMS-ERR-003 — SQLite errors never leak schema', () => {
  it('should return generic message for SQLITE errors', async () => {
    const app = buildApp((_req, _res, next) => {
      const err = new Error('UNIQUE constraint failed: users.email') as Error & { code?: string };
      err.code = 'SQLITE_CONSTRAINT';
      next(err);
    });

    const res = await request(app).get('/test');
    expect(res.body.error.message).not.toContain('users.email');
    expect(res.body.error.message).toBe('An unexpected error occurred');
  });
});

describe('LMS-ERR-004 — Error responses include requestId', () => {
  it('should include requestId in AppError responses', async () => {
    const app = buildApp((_req, _res, next) => {
      next(new AppError('Bad request', 400, 'BAD_REQUEST'));
    });

    const res = await request(app).get('/test');
    expect(res.body.error.requestId).toBe('test-request-id');
  });

  it('should include requestId in 500 error responses', async () => {
    const app = buildApp((_req, _res, next) => {
      next(new Error('crash'));
    });

    const res = await request(app).get('/test');
    expect(res.body.error.requestId).toBe('test-request-id');
  });
});
