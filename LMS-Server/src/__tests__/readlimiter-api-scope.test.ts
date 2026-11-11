/**
 * LOCKOUT-LMS-003 — the public read limiter must not leak onto every /api/v1 route.
 *
 * app.use('/api/v1', readLimiter, someRouter) runs the limiter for every
 * /api/v1 request that reaches that line, including the admin, RBAC, payment,
 * cohort and sponsor routers mounted after it. Normal admin or sponsor use then
 * exhausted 120 reads per 15 minutes per IP and got 429 on unrelated routes.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { limitPaths } from '../middleware/scopedLimiter.js';

function appWith(max: number) {
  const limiter = rateLimit({ windowMs: 60_000, max, standardHeaders: true, legacyHeaders: false });
  const app = express();
  const credentials = express.Router();
  credentials.get('/credentials/public', (_req, res) => { res.json({ ok: true }); });
  const search = express.Router();
  search.get('/search', (_req, res) => { res.json({ ok: true }); });
  const sponsor = express.Router();
  sponsor.get('/sponsor/cohorts', (_req, res) => { res.json({ ok: true }); });
  app.use('/api/v1', limitPaths(limiter, ['/credentials']), credentials);
  app.use('/api/v1', limitPaths(limiter, ['/search']), search);
  app.use('/api/v1', sponsor);
  return app;
}

describe('LOCKOUT-LMS-003 — scoped public read limiter', () => {
  it('still limits the scoped public routes', async () => {
    const app = appWith(2);
    await request(app).get('/api/v1/credentials/public').expect(200);
    await request(app).get('/api/v1/search').expect(200);
    await request(app).get('/api/v1/credentials/public').expect(429);
  });

  it('does not count or limit routes mounted after the scoped routers', async () => {
    const app = appWith(2);
    for (let i = 0; i < 10; i += 1) {
      await request(app).get('/api/v1/sponsor/cohorts').expect(200);
    }
    // The unrelated traffic consumed nothing from the public budget.
    await request(app).get('/api/v1/credentials/public').expect(200);
    await request(app).get('/api/v1/search').expect(200);
  });

  it('matches whole path segments only', async () => {
    const app = appWith(1);
    const extra = express.Router();
    extra.get('/credentialsx', (_req, res) => { res.json({ ok: true }); });
    app.use('/api/v1', extra);
    await request(app).get('/api/v1/credentialsx').expect(200);
    await request(app).get('/api/v1/credentialsx').expect(200);
  });

  it('app.ts never mounts readLimiter on the bare /api/v1 prefix', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../app.ts'), 'utf-8');
    expect(source).not.toMatch(/app\.use\(\s*['"]\/api\/v1['"]\s*,\s*readLimiter\s*,/);
    for (const [prefix, router] of [['/credentials', 'publicCredentialsRoutes'], ['/nft/metadata', 'nftMetadataRoutes'], ['/search', 'searchRoutes']]) {
      expect(source).toMatch(new RegExp(`limitPaths\\(\\s*readLimiter\\s*,\\s*\\[\\s*'${prefix.replace(/\//g, '\\/')}'\\s*\\]\\s*\\)\\s*,\\s*${router}`));
    }
  });
});
