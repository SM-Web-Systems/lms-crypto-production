/**
 * Phase F tests — admin-triggered course-level NFT mint workflow.
 *
 * Covers:
 *  F1 — happy-path: admin mints approved application → 200, DB recorded, app status = 'minted'
 *  F2 — already-minted idempotency guard → 409 ALREADY_MINTED
 *  F3 — wallet unlinked at mint time → 422 WALLET_NOT_LINKED
 *  F4 — wallet address null at mint time → 422 WALLET_NOT_LINKED
 *  F5 — mintCredential throws (Soroban failure) → 502 MINT_FAILED with applicationId
 *  F6 — lecturer role cannot trigger mint → 403
 *  F7 — application not found → 404
 *  F8 — unauthenticated request → 401
 *
 * mintCredential is spied on so no real Soroban RPC calls are made.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db, queryOne } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import * as mintModule from '../services/mintService.js';

const HASH = bcrypt.hashSync('password123', 4);
const FAKE_TX = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const CONTRACT_ID = 'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524';
const WALLET_ADDR = 'GBVRLTX5AKI6TS5TAENKN3CMRM2EWORUD6CKDVV4K5E54DGJD3W7LP4I';

// ─── Seed helpers ──────────────────────────────────────────────────────────────

function seedBase() {
  const adminId = uuidv4();
  const studentId = uuidv4();
  const lecturerId = uuidv4();
  const courseId = uuidv4();

  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES
      ('${adminId}',    'Admin',    'admin-f@test.com',    '${HASH}', 'admin',    NULL,             'none'),
      ('${studentId}',  'Student',  'student-f@test.com',  '${HASH}', 'student',  '${WALLET_ADDR}', 'linked'),
      ('${lecturerId}', 'Lecturer', 'lecturer-f@test.com', '${HASH}', 'lecturer', NULL,             'none');

    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'Phase F Course', 'Test', 'PF-001', '[]');

    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${studentId}', 'PF-001');
    INSERT INTO course_lecturers (course_id, user_id) VALUES ('${courseId}', '${lecturerId}');
  `);

  return { adminId, studentId, lecturerId, courseId };
}

/** Insert an approved application and return its ID. */
function seedApprovedApp(studentId: string, courseId: string): string {
  const appId = uuidv4();
  db.exec(`
    INSERT INTO course_nft_applications
      (id, user_id, course_id, wallet_address, status, applied_at)
    VALUES
      ('${appId}', '${studentId}', '${courseId}', '${WALLET_ADDR}', 'approved', datetime('now'))
  `);
  return appId;
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.NFT_CONTRACT_ID = CONTRACT_ID;
});

afterEach(() => {
  delete process.env.NFT_CONTRACT_ID;
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// F1 — Happy path
// ═══════════════════════════════════════════════════════════════════════════════

describe('F1 — POST .../mint happy path', () => {
  it('admin mints approved application → 200, nft_credentials row inserted, application minted', async () => {
    const { adminId, studentId, courseId } = seedBase();
    const appId = seedApprovedApp(studentId, courseId);

    vi.spyOn(mintModule, 'mintCredential').mockResolvedValue({ txHash: FAKE_TX });

    const token = makeToken({ userId: adminId, email: 'admin-f@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('minted');
    expect(res.body.data.txHash).toBe(FAKE_TX);
    expect(res.body.data.applicationId).toBe(appId);
    expect(res.body.data.walletAddress).toBe(WALLET_ADDR);
    expect(res.body.data.courseId).toBe(courseId);
    expect(res.body.data.courseName).toBe('Phase F Course');

    // Verify nft_credentials row inserted with correct fields
    const cred = queryOne<{
      user_id: string; course_id: string; application_id: string;
      quiz_id: string | null; mint_status: string; tx_hash: string; network: string;
    }>('SELECT * FROM nft_credentials WHERE user_id = ? AND course_id = ?', [studentId, courseId]);
    expect(cred).not.toBeNull();
    expect(cred!.mint_status).toBe('minted');
    expect(cred!.tx_hash).toBe(FAKE_TX);
    expect(cred!.quiz_id).toBeNull();
    expect(cred!.network).toBe('public');
    expect(cred!.application_id).toBe(appId);

    // Verify application updated to 'minted'
    const updatedApp = queryOne<{ status: string; tx_hash: string }>(
      'SELECT status, tx_hash FROM course_nft_applications WHERE id = ?',
      [appId]
    );
    expect(updatedApp!.status).toBe('minted');
    expect(updatedApp!.tx_hash).toBe(FAKE_TX);

    // Verify mintCredential called with correct params
    expect(mintModule.mintCredential).toHaveBeenCalledWith({
      userId: studentId,
      courseId,
      walletAddress: WALLET_ADDR,
      applicationId: appId,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F2 — Already-minted idempotency guard
// ═══════════════════════════════════════════════════════════════════════════════

describe('F2 — already-minted protection', () => {
  it('returns 409 ALREADY_MINTED when minted credential already exists for user+course', async () => {
    const { adminId, studentId, courseId } = seedBase();
    const appId = seedApprovedApp(studentId, courseId);
    const spy = vi.spyOn(mintModule, 'mintCredential');

    // Pre-seed a minted credential row
    db.exec(`
      INSERT INTO nft_credentials
        (id, user_id, quiz_id, course_id, wallet_address, mint_status, tx_hash, contract_id, network)
      VALUES
        ('${uuidv4()}', '${studentId}', NULL, '${courseId}',
         '${WALLET_ADDR}', 'minted', '${FAKE_TX}', '${CONTRACT_ID}', 'public')
    `);

    const token = makeToken({ userId: adminId, email: 'admin-f@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_MINTED');
    expect(spy).not.toHaveBeenCalled();
  });

  it('pending credential row does not block a new mint attempt', async () => {
    const { adminId, studentId, courseId } = seedBase();
    const appId = seedApprovedApp(studentId, courseId);

    // A stale pending row should NOT block the mint
    db.exec(`
      INSERT INTO nft_credentials
        (id, user_id, quiz_id, course_id, wallet_address, mint_status, contract_id, network)
      VALUES
        ('${uuidv4()}', '${studentId}', NULL, '${courseId}',
         '${WALLET_ADDR}', 'pending', '${CONTRACT_ID}', 'public')
    `);

    vi.spyOn(mintModule, 'mintCredential').mockResolvedValue({ txHash: FAKE_TX });

    const token = makeToken({ userId: adminId, email: 'admin-f@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('minted');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F3 / F4 — Wallet check at mint time
// ═══════════════════════════════════════════════════════════════════════════════

describe('F3/F4 — wallet re-verification at mint time', () => {
  it('returns 422 WALLET_NOT_LINKED when wallet_linking_status is not "linked"', async () => {
    const { adminId, studentId, courseId } = seedBase();
    const appId = seedApprovedApp(studentId, courseId);
    const spy = vi.spyOn(mintModule, 'mintCredential');

    // Unlink wallet after approval
    db.prepare("UPDATE users SET wallet_linking_status = 'none' WHERE id = ?").run(studentId);

    const token = makeToken({ userId: adminId, email: 'admin-f@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('WALLET_NOT_LINKED');
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns 422 WALLET_NOT_LINKED when walletAddress is null', async () => {
    const { adminId, studentId, courseId } = seedBase();
    const appId = seedApprovedApp(studentId, courseId);
    const spy = vi.spyOn(mintModule, 'mintCredential');

    // Remove wallet address
    db.prepare('UPDATE users SET walletAddress = NULL WHERE id = ?').run(studentId);

    const token = makeToken({ userId: adminId, email: 'admin-f@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('WALLET_NOT_LINKED');
    expect(spy).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F5 — Soroban mint failure
// ═══════════════════════════════════════════════════════════════════════════════

describe('F5 — mintCredential failure handling', () => {
  it('returns 502 MINT_FAILED with applicationId when mintCredential throws Error', async () => {
    const { adminId, studentId, courseId } = seedBase();
    const appId = seedApprovedApp(studentId, courseId);

    vi.spyOn(mintModule, 'mintCredential').mockRejectedValue(
      new Error('Simulation failed: contract call rejected')
    );

    const token = makeToken({ userId: adminId, email: 'admin-f@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('MINT_FAILED');
    expect(res.body.error.message).toContain('Simulation failed');
    expect(res.body.error.applicationId).toBe(appId);

    // Application status must NOT have changed
    const updatedApp = queryOne<{ status: string }>(
      'SELECT status FROM course_nft_applications WHERE id = ?',
      [appId]
    );
    expect(updatedApp!.status).toBe('approved');

    // A 'failed' nft_credentials row is inserted on failure (L-005: error tracking)
    const cred = queryOne<{ id: string; mint_status: string; error: string | null }>(
      'SELECT id, mint_status, error FROM nft_credentials WHERE user_id = ? AND course_id = ?',
      [studentId, courseId]
    );
    expect(cred).not.toBeNull();
    expect(cred!.mint_status).toBe('failed');
    expect(cred!.error).toContain('Simulation failed');
  });

  it('returns 502 MINT_FAILED when mintCredential throws a non-Error value', async () => {
    const { adminId, studentId, courseId } = seedBase();
    const appId = seedApprovedApp(studentId, courseId);

    vi.spyOn(mintModule, 'mintCredential').mockRejectedValue('network timeout');

    const token = makeToken({ userId: adminId, email: 'admin-f@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('MINT_FAILED');
    expect(res.body.error.message).toContain('network timeout');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F6 — Authorization guards
// ═══════════════════════════════════════════════════════════════════════════════

describe('F6 — authorization', () => {
  it('lecturer cannot trigger mint → 403', async () => {
    const { lecturerId, studentId, courseId } = seedBase();
    const appId = seedApprovedApp(studentId, courseId);
    const spy = vi.spyOn(mintModule, 'mintCredential');

    const token = makeToken({ userId: lecturerId, email: 'lecturer-f@test.com', role: 'lecturer' });
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F7 — Not found
// ═══════════════════════════════════════════════════════════════════════════════

describe('F7 — application not found', () => {
  it('returns 404 for non-existent application', async () => {
    const { adminId, courseId } = seedBase();
    const token = makeToken({ userId: adminId, email: 'admin-f@test.com', role: 'admin' });
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${uuidv4()}/mint`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F8 — Unauthenticated
// ═══════════════════════════════════════════════════════════════════════════════

describe('F8 — unauthenticated request', () => {
  it('returns 401 when no token provided', async () => {
    const { courseId } = seedBase();
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${uuidv4()}/mint`);
    expect(res.status).toBe(401);
  });
});
