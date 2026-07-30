import { describe, it, expect } from 'vitest';
import app from '../app.js';
import request from 'supertest';

describe('LMS-J1-005: Registration name max length', () => {
  it('should reject registration with name > 200 chars', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'A'.repeat(201),
        email: 'longname@test.com',
        password: 'password123',
      });
    expect(res.status).toBe(400);
    expect(res.body.error?.message || res.body.message).toMatch(/200 characters/i);
  });

  it('should accept registration with name = 200 chars', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'B'.repeat(200),
        email: 'okname@test.com',
        password: 'password123',
      });
    // Should not be 400 for name length (may be 201/409/etc for other reasons)
    expect(res.status).not.toBe(400);
  });
});
