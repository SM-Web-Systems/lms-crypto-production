/**
 * UX-004: the LMS reset link carries the account email, so Login can fill it in after the reset.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';

vi.mock('../services/emailService.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/emailService.js')>()),
  sendPasswordResetEmail: vi.fn(async () => undefined),
}));

import app from '../app.js';
import { db } from '../config/database.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

function createUser(email: string, authProvider = 'local') {
  const id = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role, auth_provider) VALUES (?, 'Learner', ?, 'hash', 'student', ?)")
    .run(id, email, authProvider);
  return id;
}

describe('POST /api/v1/auth/forgot-password reset link', () => {
  beforeEach(() => {
    vi.mocked(sendPasswordResetEmail).mockClear();
    // The unit schema predates the SSO column; the startup migration adds it in production.
    db.exec("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'");
  });

  it('adds the encoded email to the reset link', async () => {
    const email = `learner+${uuidv4().slice(0, 8)}@test.invalid`;
    createUser(email);

    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: email.toUpperCase() });

    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledOnce();
    const { resetUrl } = vi.mocked(sendPasswordResetEmail).mock.calls[0][0];
    const url = new URL(resetUrl);
    expect(url.pathname).toBe('/reset-password');
    expect(url.searchParams.get('token')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('email')).toBe(email);
    expect(resetUrl).toContain(`email=${encodeURIComponent(email)}`);
  });

  it('gives the same answer and sends nothing for an unknown email or an AmmaWallet account', async () => {
    const sso = `sso-${uuidv4().slice(0, 8)}@test.invalid`;
    createUser(sso, 'ammawallet');

    const unknown = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@test.invalid' });
    const wallet = await request(app).post('/api/v1/auth/forgot-password').send({ email: sso });

    expect(unknown.body).toEqual(wallet.body);
    expect(unknown.body.success).toBe(true);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
