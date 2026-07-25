/**
 * Regression tests — "Mint NFT for undefined?" bug (2026-07-20).
 *
 * Root cause: PATCH .../approve and PATCH .../reject return partial objects
 * (only applicationId + status). The frontend was replacing the full NftApplication
 * in React state with the partial response, destroying courseId/userName/userEmail.
 * Subsequent handleMint call used app.courseId === undefined → wrong URL →
 * backend 404 "Application not found".
 *
 * Fix: frontend now does { ...a, ...updated } to merge partial response into
 * existing full object.
 *
 * Backend regression tests verify:
 *  MB1 — GET /admin/certificates returns full shape (all fields needed by FE)
 *  MB2 — PATCH approve response shape is partial (only applicationId + status)
 *  MB3 — PATCH reject response shape is partial (only applicationId + status)
 *  MB4 — POST mint with wrong courseId ("undefined") returns 404 NOT_FOUND
 *  MB5 — POST mint with correct courseId succeeds after approve in same flow
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import * as mintModule from '../services/mintService.js';

const HASH = bcrypt.hashSync('password123', 4);
const WALLET = 'GBVRLTX5AKI6TS5TAENKN3CMRM2EWORUD6CKDVV4K5E54DGJD3W7LP4I';
const FAKE_TX = 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3';
const CONTRACT = 'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524';

function seedAll() {
  const adminId  = uuidv4();
  const studentId = uuidv4();
  const courseId  = uuidv4();
  const code = `MB-${uuidv4().slice(0, 8)}`;

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES
      ('${adminId}',   'MB Admin',   'mb-admin-${adminId}@test.com',   '${HASH}', 'admin',   NULL,       'none'),
      ('${studentId}', 'MB Student', 'mb-student-${studentId}@test.com', '${HASH}', 'student', '${WALLET}', 'linked');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'MB Course Title', 'desc', '${code}', '[]');

    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${studentId}', '${code}');
  `);

  return { adminId, studentId, courseId };
}

function seedPendingApp(studentId: string, courseId: string): string {
  const appId = uuidv4();
  db.exec(`
    INSERT INTO course_nft_applications
      (id, user_id, course_id, wallet_address, status, applied_at)
    VALUES ('${appId}', '${studentId}', '${courseId}', '${WALLET}', 'pending', datetime('now'))
  `);
  return appId;
}

function seedApprovedApp(studentId: string, courseId: string): string {
  const appId = uuidv4();
  db.exec(`
    INSERT INTO course_nft_applications
      (id, user_id, course_id, wallet_address, status, applied_at)
    VALUES ('${appId}', '${studentId}', '${courseId}', '${WALLET}', 'approved', datetime('now'))
  `);
  return appId;
}

beforeEach(() => { process.env.NFT_CONTRACT_ID = CONTRACT; });
afterEach(() => { delete process.env.NFT_CONTRACT_ID; vi.restoreAllMocks(); });

// ─── MB1: GET /admin/certificates returns full NftApplication shape ────────────

describe('MB1 — GET /admin/certificates returns full application shape', () => {
  it('includes userName, userEmail, courseId, courseName required by Mint NFT button', async () => {
    const { adminId, studentId, courseId } = seedAll();
    seedApprovedApp(studentId, courseId);

    const token = makeToken({ userId: adminId, email: `mb-admin-${adminId}@test.com`, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/admin/certificates?status=approved')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const apps: Record<string, unknown>[] = res.body.data.certificates;
    expect(apps.length).toBeGreaterThan(0);

    const a = apps.find((x) => x.courseId === courseId);
    expect(a).toBeDefined();
    // All fields the FE relies on for the Mint button dialog and API call:
    expect(typeof a!.applicationId).toBe('string');
    expect(typeof a!.courseId).toBe('string');
    expect(typeof a!.courseName).toBe('string');
    expect(typeof a!.userName).toBe('string');   // needed by confirm dialog
    expect(typeof a!.userEmail).toBe('string');  // fallback in confirm dialog
    expect(typeof a!.userId).toBe('string');
    expect(a!.status).toBe('approved');
  });
});

// ─── MB2: PATCH approve returns partial response ──────────────────────────────

describe('MB2 — PATCH approve returns partial response (FE must merge, not replace)', () => {
  it('response contains applicationId and status but NOT courseId or userName', async () => {
    const { adminId, studentId, courseId } = seedAll();
    const appId = seedPendingApp(studentId, courseId);

    const token = makeToken({ userId: adminId, email: `mb-admin-${adminId}@test.com`, role: 'admin' });
    const res = await request(app)
      .patch(`/api/v1/courses/${courseId}/completions/applications/${appId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.applicationId).toBe(appId);
    expect(res.body.data.status).toBe('approved');
    // Intentionally partial — FE must spread over existing full record:
    expect(res.body.data.courseId).toBeUndefined();
    expect(res.body.data.userName).toBeUndefined();
  });
});

// ─── MB3: PATCH reject returns partial response ───────────────────────────────

describe('MB3 — PATCH reject returns partial response (FE must merge, not replace)', () => {
  it('response contains applicationId and status but NOT courseId or userName', async () => {
    const { adminId, studentId, courseId } = seedAll();
    const appId = seedPendingApp(studentId, courseId);

    const token = makeToken({ userId: adminId, email: `mb-admin-${adminId}@test.com`, role: 'admin' });
    const res = await request(app)
      .patch(`/api/v1/courses/${courseId}/completions/applications/${appId}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'test rejection' });

    expect(res.status).toBe(200);
    expect(res.body.data.applicationId).toBe(appId);
    expect(res.body.data.status).toBe('rejected');
    // Intentionally partial — FE must spread over existing full record:
    expect(res.body.data.courseId).toBeUndefined();
    expect(res.body.data.userName).toBeUndefined();
  });
});

// ─── MB4: POST mint with wrong courseId returns 404 ──────────────────────────
// Reproduces the exact bug: FE sent /courses/undefined/completions/applications/:appId/mint

describe('MB4 — POST mint with wrong courseId returns 404 (reproduces the bug)', () => {
  it('returns 404 NOT_FOUND when courseId is "undefined" (string)', async () => {
    const { adminId, studentId, courseId } = seedAll();
    const appId = seedApprovedApp(studentId, courseId);
    const spy = vi.spyOn(mintModule, 'mintCredential');

    const token = makeToken({ userId: adminId, email: `mb-admin-${adminId}@test.com`, role: 'admin' });
    // Simulate the bug: FE uses app.courseId which became undefined after approve replaced state
    const res = await request(app)
      .post(`/api/v1/courses/undefined/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe('Application not found');
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── MB5: Approve → mint in sequence with preserved courseId succeeds ──────────
// Validates the correct flow: FE keeps courseId from original object

describe('MB5 — approve then mint with preserved courseId succeeds', () => {
  it('approve sets status=approved; subsequent mint with original courseId+appId succeeds', async () => {
    const { adminId, studentId, courseId } = seedAll();
    const appId = seedPendingApp(studentId, courseId);
    vi.spyOn(mintModule, 'mintCredential').mockResolvedValue({ txHash: FAKE_TX });

    const token = makeToken({ userId: adminId, email: `mb-admin-${adminId}@test.com`, role: 'admin' });

    // Step 1: approve (as FE would do)
    const approveRes = await request(app)
      .patch(`/api/v1/courses/${courseId}/completions/applications/${appId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('approved');

    // Step 2: FE merges partial response into original → courseId is preserved
    // Simulated here: use the original courseId (not approveRes.body.data.courseId)
    const mintRes = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);
    expect(mintRes.status).toBe(200);
    expect(mintRes.body.data.status).toBe('minted');
    expect(mintRes.body.data.txHash).toBe(FAKE_TX);
    expect(mintRes.body.data.applicationId).toBe(appId);
    expect(mintRes.body.data.courseId).toBe(courseId);
    expect(mintRes.body.data.courseName).toBe('MB Course Title');
  });
});
