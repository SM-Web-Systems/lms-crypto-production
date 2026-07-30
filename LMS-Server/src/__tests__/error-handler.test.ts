/**
 * LMS-ERR-001 — AppError vs unexpected error logging
 * LMS-ERR-002 — Multer file size message dynamic
 * LMS-ERR-003 — SQLite errors never leak schema
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AppError, errorHandler } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../types/index.js';

function buildApp(handler: express.RequestHandler) {
  const app = express();
  app.get('/test', handler);
  app.use(errorHandler);
  return app;
}

describe('LMS-ERR-001 — AppError vs unexpected error logging', () => {
  it('should use console.warn (not error) for AppError', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = buildApp((_req, _res, next) => {
      next(new AppError('Not found', 404, ErrorCodes.NOT_FOUND));
    });

    await request(app).get('/test');

    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should use console.error for unexpected errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = buildApp((_req, _res, next) => {
      next(new Error('something broke'));
    });

    await request(app).get('/test');

    expect(errorSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
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
