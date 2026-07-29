/**
 * LMS-RATE-001 — Admin routes must have rate limiting applied.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedAdmin() {
  const adminId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${adminId}', 'Rate Admin', 'rate-admin-${adminId}@test.com', '${HASH}', 'admin');
  `);
  return { adminId };
}

describe('LMS-RATE-001 — admin routes have rate limiter', () => {
  it('POST /api/v1/admin/credentials/:id/remint includes rate limit headers', async () => {
    const { adminId } = seedAdmin();
    const token = makeToken({ userId: adminId, email: `rate-admin-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .post('/api/v1/admin/credentials/fake-id/remint')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // Even if the request fails (404 for fake-id), rate limit headers should be present
    expect(res.headers).toHaveProperty('ratelimit-limit');
  });
});
