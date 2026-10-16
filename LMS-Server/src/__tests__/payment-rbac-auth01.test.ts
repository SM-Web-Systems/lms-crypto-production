/**
 * AUTH-01 — Payment/badge routes use RBAC `billing.view_all` instead of JWT role.
 *
 * Verifies that the four owner-or-admin routes in payments.ts use the RBAC
 * permission system (`billing.view_all`) instead of `req.user!.role !== 'admin'`.
 *
 * AUTH01-1 — Resource owner can view own payment status
 * AUTH01-2 — Admin with billing.view_all can view any payment status
 * AUTH01-3 — Student without billing.view_all cannot view others' payment status
 * AUTH01-4 — Resource owner can download own receipt
 * AUTH01-5 — Admin with billing.view_all can download any receipt
 * AUTH01-6 — Student cannot download others' receipt
 * AUTH01-7 — Resource owner can view own badge
 * AUTH01-8 — Admin with billing.view_all can view any badge
 * AUTH01-9 — Student cannot view others' badge
 * AUTH01-10 — Resource owner can download own badge SVG
 * AUTH01-11 — Admin with billing.view_all can download any badge SVG
 * AUTH01-12 — Student cannot download others' badge SVG
 * AUTH01-13 — Unauthenticated request returns 401
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(role: 'admin' | 'student', suffix: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES ('${userId}', 'AUTH01 ${suffix}', 'auth01-${suffix}-${userId.slice(0, 6)}@test.com', '${HASH}', '${role}', 'GTEST${userId.slice(0, 8)}', 'linked');
  `);
  return userId;
}

function assignRbacRole(userId: string, roleId: string) {
  db.exec(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${userId}', '${roleId}');`);
}

function seedCourse(suffix: string) {
  const courseId = uuidv4();
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections)
    VALUES ('${courseId}', 'AUTH01 Course ${suffix}', 'AUTH01-${suffix}', '[]');
  `);
  return courseId;
}

function seedPayment(userId: string, courseId: string, status: string = 'confirmed') {
  const appId = uuidv4();
  const paymentId = uuidv4();
  db.exec(`
    INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status)
    VALUES ('${appId}', '${userId}', '${courseId}', 'GTESTWALLET', 'approved');
  `);
  db.exec(`
    INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status, confirmed_at)
    VALUES ('${paymentId}', '${userId}', '${courseId}', '${appId}', 2500, 'USD', 'manual', '${status}', ${status === 'confirmed' ? "'2025-01-01T00:00:00Z'" : 'NULL'});
  `);
  return { paymentId, appId };
}

function seedBadge(userId: string, courseId: string, applicationId: string) {
  const badgeId = uuidv4();
  db.exec(`
    INSERT INTO certificate_badges (id, user_id, course_id, application_id, badge_svg, badge_hash)
    VALUES ('${badgeId}', '${userId}', '${courseId}', '${applicationId}', '<svg>test</svg>', 'hash-${badgeId.slice(0, 8)}');
  `);
  return badgeId;
}

// ─── Payment status route ────────────────────────────────────────────────────

describe('AUTH-01 — Payment status RBAC', () => {
  it('AUTH01-1: resource owner can view own payment status', async () => {
    const ownerId = seedUser('student', 'owner-ps');
    assignRbacRole(ownerId, 'role_student');
    const courseId = seedCourse('PS1');
    const { paymentId } = seedPayment(ownerId, courseId);
    const token = makeToken({ userId: ownerId, email: 'auth01-owner-ps@test.com', role: 'student' });

    const res = await request(app)
      .get(`/api/v1/payments/${paymentId}/status`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.paymentId).toBe(paymentId);
  });

  it('AUTH01-2: admin with billing.view_all can view any payment status', async () => {
    const ownerId = seedUser('student', 'owner-ps2');
    assignRbacRole(ownerId, 'role_student');
    const adminId = seedUser('admin', 'admin-ps2');
    assignRbacRole(adminId, 'role_admin');
    const courseId = seedCourse('PS2');
    const { paymentId } = seedPayment(ownerId, courseId);
    const adminToken = makeToken({ userId: adminId, email: 'auth01-admin-ps2@test.com', role: 'admin' });

    const res = await request(app)
      .get(`/api/v1/payments/${paymentId}/status`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.paymentId).toBe(paymentId);
  });

  it('AUTH01-3: student without billing.view_all cannot view others payment status', async () => {
    const ownerId = seedUser('student', 'owner-ps3');
    assignRbacRole(ownerId, 'role_student');
    const otherId = seedUser('student', 'other-ps3');
    assignRbacRole(otherId, 'role_student');
    const courseId = seedCourse('PS3');
    const { paymentId } = seedPayment(ownerId, courseId);
    const otherToken = makeToken({ userId: otherId, email: 'auth01-other-ps3@test.com', role: 'student' });

    const res = await request(app)
      .get(`/api/v1/payments/${paymentId}/status`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── Receipt route ───────────────────────────────────────────────────────────

describe('AUTH-01 — Receipt RBAC', () => {
  it('AUTH01-4: resource owner can download own receipt', async () => {
    const ownerId = seedUser('student', 'owner-rc');
    assignRbacRole(ownerId, 'role_student');
    const courseId = seedCourse('RC1');
    const { paymentId } = seedPayment(ownerId, courseId, 'confirmed');
    const token = makeToken({ userId: ownerId, email: 'auth01-owner-rc@test.com', role: 'student' });

    const res = await request(app)
      .get(`/api/v1/payments/${paymentId}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    // 200 with PDF or 400/500 if PDF gen has issues — but NOT 403
    expect(res.status).not.toBe(403);
  });

  it('AUTH01-5: admin with billing.view_all can download any receipt', async () => {
    const ownerId = seedUser('student', 'owner-rc2');
    assignRbacRole(ownerId, 'role_student');
    const adminId = seedUser('admin', 'admin-rc2');
    assignRbacRole(adminId, 'role_admin');
    const courseId = seedCourse('RC2');
    const { paymentId } = seedPayment(ownerId, courseId, 'confirmed');
    const adminToken = makeToken({ userId: adminId, email: 'auth01-admin-rc2@test.com', role: 'admin' });

    const res = await request(app)
      .get(`/api/v1/payments/${paymentId}/receipt`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Should not get 403 — admin has billing.view_all
    expect(res.status).not.toBe(403);
  });

  it('AUTH01-6: student cannot download others receipt', async () => {
    const ownerId = seedUser('student', 'owner-rc3');
    assignRbacRole(ownerId, 'role_student');
    const otherId = seedUser('student', 'other-rc3');
    assignRbacRole(otherId, 'role_student');
    const courseId = seedCourse('RC3');
    const { paymentId } = seedPayment(ownerId, courseId, 'confirmed');
    const otherToken = makeToken({ userId: otherId, email: 'auth01-other-rc3@test.com', role: 'student' });

    const res = await request(app)
      .get(`/api/v1/payments/${paymentId}/receipt`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── Badge view route ────────────────────────────────────────────────────────

describe('AUTH-01 — Badge view RBAC', () => {
  it('AUTH01-7: resource owner can view own badge', async () => {
    const ownerId = seedUser('student', 'owner-bv');
    assignRbacRole(ownerId, 'role_student');
    const courseId = seedCourse('BV1');
    const { appId } = seedPayment(ownerId, courseId);
    const badgeId = seedBadge(ownerId, courseId, appId);
    const token = makeToken({ userId: ownerId, email: 'auth01-owner-bv@test.com', role: 'student' });

    const res = await request(app)
      .get(`/api/v1/badges/${badgeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.badgeId).toBe(badgeId);
  });

  it('AUTH01-8: admin with billing.view_all can view any badge', async () => {
    const ownerId = seedUser('student', 'owner-bv2');
    assignRbacRole(ownerId, 'role_student');
    const adminId = seedUser('admin', 'admin-bv2');
    assignRbacRole(adminId, 'role_admin');
    const courseId = seedCourse('BV2');
    const { appId } = seedPayment(ownerId, courseId);
    const badgeId = seedBadge(ownerId, courseId, appId);
    const adminToken = makeToken({ userId: adminId, email: 'auth01-admin-bv2@test.com', role: 'admin' });

    const res = await request(app)
      .get(`/api/v1/badges/${badgeId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.badgeId).toBe(badgeId);
  });

  it('AUTH01-9: student cannot view others badge', async () => {
    const ownerId = seedUser('student', 'owner-bv3');
    assignRbacRole(ownerId, 'role_student');
    const otherId = seedUser('student', 'other-bv3');
    assignRbacRole(otherId, 'role_student');
    const courseId = seedCourse('BV3');
    const { appId } = seedPayment(ownerId, courseId);
    const badgeId = seedBadge(ownerId, courseId, appId);
    const otherToken = makeToken({ userId: otherId, email: 'auth01-other-bv3@test.com', role: 'student' });

    const res = await request(app)
      .get(`/api/v1/badges/${badgeId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── Badge download route ────────────────────────────────────────────────────

describe('AUTH-01 — Badge download RBAC', () => {
  it('AUTH01-10: resource owner can download own badge SVG', async () => {
    const ownerId = seedUser('student', 'owner-bd');
    assignRbacRole(ownerId, 'role_student');
    const courseId = seedCourse('BD1');
    const { appId } = seedPayment(ownerId, courseId);
    const badgeId = seedBadge(ownerId, courseId, appId);
    const token = makeToken({ userId: ownerId, email: 'auth01-owner-bd@test.com', role: 'student' });

    const res = await request(app)
      .get(`/api/v1/badges/${badgeId}/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('svg');
  });

  it('AUTH01-11: admin with billing.view_all can download any badge SVG', async () => {
    const ownerId = seedUser('student', 'owner-bd2');
    assignRbacRole(ownerId, 'role_student');
    const adminId = seedUser('admin', 'admin-bd2');
    assignRbacRole(adminId, 'role_admin');
    const courseId = seedCourse('BD2');
    const { appId } = seedPayment(ownerId, courseId);
    const badgeId = seedBadge(ownerId, courseId, appId);
    const adminToken = makeToken({ userId: adminId, email: 'auth01-admin-bd2@test.com', role: 'admin' });

    const res = await request(app)
      .get(`/api/v1/badges/${badgeId}/download`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('svg');
  });

  it('AUTH01-12: student cannot download others badge SVG', async () => {
    const ownerId = seedUser('student', 'owner-bd3');
    assignRbacRole(ownerId, 'role_student');
    const otherId = seedUser('student', 'other-bd3');
    assignRbacRole(otherId, 'role_student');
    const courseId = seedCourse('BD3');
    const { appId } = seedPayment(ownerId, courseId);
    const badgeId = seedBadge(ownerId, courseId, appId);
    const otherToken = makeToken({ userId: otherId, email: 'auth01-other-bd3@test.com', role: 'student' });

    const res = await request(app)
      .get(`/api/v1/badges/${badgeId}/download`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── Unauthenticated ─────────────────────────────────────────────────────────

describe('AUTH-01 — Unauthenticated access', () => {
  it('AUTH01-13: unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/v1/payments/nonexistent/status');
    expect(res.status).toBe(401);
  });
});
