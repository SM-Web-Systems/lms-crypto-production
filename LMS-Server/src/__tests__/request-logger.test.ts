import express from 'express';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { requestLogger } from '../middleware/requestLogger.js';
import logger from '../utils/logger.js';

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
