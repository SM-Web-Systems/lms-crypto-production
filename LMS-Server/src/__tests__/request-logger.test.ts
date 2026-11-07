/**
 * RL-001 — Request logger sets x-request-id header
 * RL-002 — Request logger honors incoming x-request-id
 */

import express from 'express';
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { requestLogger } from '../middleware/requestLogger.js';
import logger from '../utils/logger.js';

describe('RL-001 — Request logger generates correlation ID', () => {
  it('should set x-request-id response header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

describe('RL-002 — Request logger honors incoming x-request-id', () => {
  it('should echo back the provided x-request-id', async () => {
    const customId = 'custom-trace-id-12345';
    const res = await request(app)
      .get('/health')
      .set('x-request-id', customId);
    expect(res.headers['x-request-id']).toBe(customId);
  });
});

it('logs retired role calls by their full route template without an account or query', async () => {
  const app = express();
  const users = express.Router();
  app.use(requestLogger);
  users.patch('/:id/role', (_req, res) => res.sendStatus(410));
  users.patch('/:id/roles', (_req, res) => res.sendStatus(404));
  app.use('/api/v1/users', users);
  const logged = vi.spyOn(logger, 'info');
  try {
    await request(app).patch('/api/v1/users/private-account/role?test=private-query').expect(410);
    await request(app).patch('/api/v1/users/other/roles').expect(404);
    expect(logged.mock.calls[0][0]).toMatchObject({
      method: 'PATCH', path: '/api/v1/users/:id/role', statusCode: 410,
    });
    expect(JSON.stringify(logged.mock.calls[0])).not.toMatch(/private-account|private-query/);
    expect(logged.mock.calls[1][0]).toMatchObject({ path: '/other/roles', statusCode: 404 });
  } finally {
    logged.mockRestore();
  }
});
