/**
 * Regression: an application with a confirmed payment could not be minted once a later
 * duplicate payment for the same application was refunded (2026-11-16).
 *
 * The mint gate looked only at the newest payment record, so a refunded Paystack retry
 * created after the confirmed manual payment returned 402 "Certificate payment has not
 * been confirmed". The admin list joined every payment row, so the one application showed
 * up once per payment ("Paid", "refunded", "refunded").
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import * as mintModule from '../services/mintService.js';
import { getPaymentForApplication, isPaymentSatisfied } from '../services/paymentService.js';

const HASH = bcrypt.hashSync('password123', 4);
const WALLET = 'GBVRLTX5AKI6TS5TAENKN3CMRM2EWORUD6CKDVV4K5E54DGJD3W7LP4I';
const FAKE_TX = 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const CONTRACT = 'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524';

function seed(payments: { method: string; status: string; currency: string; createdAt: string }[]) {
  const adminId = uuidv4();
  const studentId = uuidv4();
  const courseId = uuidv4();
  const appId = uuidv4();
  const code = `RD-${uuidv4().slice(0, 8)}`;
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES
      ('${adminId}',   'RD Admin',   'rd-admin-${adminId}@test.com',     '${HASH}', 'admin',   NULL,       'none'),
      ('${studentId}', 'RD Student', 'rd-student-${studentId}@test.com', '${HASH}', 'student', '${WALLET}', 'linked');
    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'RD Course', 'desc', '${code}', '[]');
    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${studentId}', '${code}');
    INSERT INTO course_pricing (id, course_id, price_cents, currency, is_active, tiers_enabled)
    VALUES ('${uuidv4()}', '${courseId}', 1000, 'USD', 1, 'both');
    INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, applied_at, selected_tier)
    VALUES ('${appId}', '${studentId}', '${courseId}', '${WALLET}', 'approved', datetime('now'), 'paid');
  `);
  for (const p of payments) {
    db.prepare(
      `INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1000, ?, ?, ?, ?, ?)`,
    ).run(uuidv4(), studentId, courseId, appId, p.currency, p.method, p.status, p.createdAt, p.createdAt);
  }
  const token = makeToken({ userId: adminId, email: `rd-admin-${adminId}@test.com`, role: 'admin' });
  return { courseId, appId, token };
}

const CONFIRMED_THEN_REFUNDED = [
  { method: 'manual',   status: 'confirmed', currency: 'USD', createdAt: '2026-11-13 08:00:00' },
  { method: 'paystack', status: 'refunded',  currency: 'ZAR', createdAt: '2026-11-13 09:00:00' },
  { method: 'paystack', status: 'refunded',  currency: 'ZAR', createdAt: '2026-11-16 09:00:00' },
];

beforeEach(() => { process.env.NFT_CONTRACT_ID = CONTRACT; });
afterEach(() => { delete process.env.NFT_CONTRACT_ID; vi.restoreAllMocks(); });

describe('confirmed payment followed by refunded duplicates', () => {
  it('counts the application as paid', () => {
    const { appId } = seed(CONFIRMED_THEN_REFUNDED);
    expect(isPaymentSatisfied(appId)).toBe(true);
    expect(getPaymentForApplication(appId)?.status).toBe('confirmed');
  });

  it('lists the application once, as paid and on the paid tier', async () => {
    const { appId, token } = seed(CONFIRMED_THEN_REFUNDED);
    const res = await request(app).get('/api/v1/admin/certificates?status=approved').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const rows = (res.body.data.certificates as Record<string, unknown>[]).filter((c) => c.applicationId === appId);
    expect(rows).toHaveLength(1);
    expect(rows[0].paymentStatus).toBe('confirmed');
    expect(rows[0].selectedTier).toBe('paid');
  });

  it('mints instead of returning 402', async () => {
    const { courseId, appId, token } = seed(CONFIRMED_THEN_REFUNDED);
    vi.spyOn(mintModule, 'mintCredential').mockResolvedValue({ txHash: FAKE_TX });
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('minted');
  });

  it('still blocks minting when every payment was refunded', async () => {
    const { courseId, appId, token } = seed([
      { method: 'paystack', status: 'refunded', currency: 'ZAR', createdAt: '2026-11-13 09:00:00' },
      { method: 'manual',   status: 'pending',  currency: 'USD', createdAt: '2026-11-13 08:00:00' },
    ]);
    expect(isPaymentSatisfied(appId)).toBe(false);
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(402);
  });
});
