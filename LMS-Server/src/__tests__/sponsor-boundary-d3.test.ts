/**
 * Deliverable 3 Batch 1 — Sponsor RBAC Boundary Tests
 *
 * D3B1-15  Sponsor cannot access admin analytics endpoints
 * D3B1-16  Unauthorized user gets 401 on sponsor endpoints
 * D3B1-17  No mutating billing operations exist on sponsor routes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(role: 'admin' | 'student', suffix: string) {
  const userId = uuidv4();
  const email = `${suffix}-${Date.now()}@test.com`;
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${userId}', 'User ${suffix}', '${email}', '${HASH}', '${role}');
  `);
  return { userId, email };
}

function assignSponsorRole(userId: string) {
  // Assign the sponsor RBAC role via user_roles
  db.exec(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${userId}', 'role_sponsor');`);
}

describe('Sponsor RBAC Boundary (D3B1-15, D3B1-16, D3B1-17)', () => {
  let sponsorId: string;
  let sponsorEmail: string;
  let sponsorToken: string;

  beforeEach(() => {
    const sponsor = seedUser('student', 'boundary-sponsor');
    sponsorId = sponsor.userId;
    sponsorEmail = sponsor.email;
    assignSponsorRole(sponsorId);
    sponsorToken = makeToken({ userId: sponsorId, email: sponsorEmail, role: 'student' });
  });

  // D3B1-15: Sponsor cannot access admin analytics
  it('D3B1-15: sponsor gets 403 on admin analytics courses endpoint', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/courses')
      .set('Authorization', `Bearer ${sponsorToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('D3B1-15b: sponsor gets 403 on admin analytics ROI endpoint', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/sponsors/roi')
      .set('Authorization', `Bearer ${sponsorToken}`);

    expect(res.status).toBe(403);
  });

  // D3B1-16: Unauthorized access returns 401
  it('D3B1-16: no token on sponsor dashboard returns 401', async () => {
    const res = await request(app)
      .get('/api/v1/sponsor/dashboard');

    expect(res.status).toBe(401);
  });

  it('D3B1-16b: no token on sponsor impact report returns 401', async () => {
    const res = await request(app)
      .get('/api/v1/sponsor/impact-report');

    expect(res.status).toBe(401);
  });

  it('D3B1-16c: no token on sponsor billing returns 401', async () => {
    const res = await request(app)
      .get('/api/v1/sponsor/billing');

    expect(res.status).toBe(401);
  });

  // D3B1-17: No mutating billing operations on sponsor routes
  it('D3B1-17: POST /sponsor/billing does not exist (405 or 404)', async () => {
    const res = await request(app)
      .post('/api/v1/sponsor/billing')
      .set('Authorization', `Bearer ${sponsorToken}`)
      .send({});

    // Should be 404 (no route) — POST to billing is not registered
    expect([404, 405]).toContain(res.status);
  });

  it('D3B1-17b: PUT /sponsor/billing does not exist', async () => {
    const res = await request(app)
      .put('/api/v1/sponsor/billing')
      .set('Authorization', `Bearer ${sponsorToken}`)
      .send({});

    expect([404, 405]).toContain(res.status);
  });

  it('D3B1-17c: DELETE /sponsor/billing does not exist', async () => {
    const res = await request(app)
      .delete('/api/v1/sponsor/billing')
      .set('Authorization', `Bearer ${sponsorToken}`);

    expect([404, 405]).toContain(res.status);
  });

  it('D3B1-17d: PATCH /sponsor/billing does not exist', async () => {
    const res = await request(app)
      .patch('/api/v1/sponsor/billing')
      .set('Authorization', `Bearer ${sponsorToken}`)
      .send({});

    expect([404, 405]).toContain(res.status);
  });
});
