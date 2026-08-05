/**
 * Tests for Phase 11 C2 — Freemium Certificate Tiers.
 *
 * TIER-B1  — GET /courses/:courseId/tiers returns default 'both'
 * TIER-B2  — PUT pricing with tiersEnabled updates tier config
 * TIER-B3  — Apply with selectedTier='free' succeeds without wallet
 * TIER-B4  — Apply with selectedTier='paid' requires wallet
 * TIER-B5  — Apply rejects unavailable tier (free on paid_only course)
 * TIER-B6  — Approve free-tier application auto-generates badge
 * TIER-B7  — GET /badges/:badgeId returns badge for owner
 * TIER-B8  — GET /badges/:badgeId returns 403 for non-owner
 * TIER-B9  — GET /badges/:badgeId/download returns SVG
 * TIER-B10 — Mint endpoint rejects free-tier application
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(role: 'admin' | 'student', suffix: string, wallet = true) {
  const userId = uuidv4();
  const walletAddr = wallet ? `GTEST${suffix.toUpperCase()}` : null;
  const walletStatus = wallet ? 'linked' : 'none';
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES ('${userId}', 'Tier User ${suffix}', 'tier-${suffix}@test.com', '${HASH}', '${role}',
            ${walletAddr ? `'${walletAddr}'` : 'NULL'}, '${walletStatus}');
  `);
  return userId;
}

function seedCourse(title: string, code: string) {
  const courseId = uuidv4();
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections)
    VALUES ('${courseId}', '${title}', '${code}', '[]');
  `);
  return courseId;
}

function seedEnrollment(userId: string, courseCode: string) {
  db.exec(`
    INSERT INTO user_course_codes (user_id, course_code)
    VALUES ('${userId}', '${courseCode}');
  `);
}

function seedPricing(courseId: string, priceCents: number, tiersEnabled = 'both') {
  const pricingId = uuidv4();
  db.exec(`
    INSERT INTO course_pricing (id, course_id, price_cents, currency, is_active, tiers_enabled)
    VALUES ('${pricingId}', '${courseId}', ${priceCents}, 'USD', 1, '${tiersEnabled}');
  `);
  return pricingId;
}

function seedApplication(userId: string, courseId: string, status: string, tier: string) {
  const appId = uuidv4();
  db.exec(`
    INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, selected_tier)
    VALUES ('${appId}', '${userId}', '${courseId}', 'GTESTWALLET', '${status}', '${tier}');
  `);
  return appId;
}

function seedBadge(userId: string, courseId: string, appId: string) {
  const badgeId = uuidv4();
  db.exec(`
    INSERT INTO certificate_badges (id, user_id, course_id, application_id, badge_svg, badge_hash)
    VALUES ('${badgeId}', '${userId}', '${courseId}', '${appId}', '<svg>test</svg>', 'abc123hash');
  `);
  return badgeId;
}

describe('Phase 11 C2 — Freemium Certificate Tiers', () => {
  // TIER-B1: GET /courses/:courseId/tiers returns default 'both'
  it('TIER-B1 — GET tiers returns default both', async () => {
    const adminId = seedUser('admin', 'b1-admin');
    const courseId = seedCourse('Tier Course B1', 'TIER-B1');
    const token = makeToken({ userId: adminId, email: 'tier-b1-admin@test.com', role: 'admin' });

    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/tiers`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tiersEnabled).toBe('both');
    expect(res.body.data.priceCents).toBe(0);
    expect(res.body.data.isFree).toBe(true);
  });

  // TIER-B2: PUT pricing with tiersEnabled updates tier config
  it('TIER-B2 — PUT pricing sets tiersEnabled', async () => {
    const adminId = seedUser('admin', 'b2-admin');
    const courseId = seedCourse('Tier Course B2', 'TIER-B2');
    const token = makeToken({ userId: adminId, email: 'tier-b2-admin@test.com', role: 'admin' });

    const res = await request(app)
      .put(`/api/v1/admin/courses/${courseId}/pricing`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priceCents: 5000, tiersEnabled: 'paid_only' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.priceCents).toBe(5000);
    expect(res.body.data.tiersEnabled).toBe('paid_only');
  });

  // TIER-B3: Apply with selectedTier='free' succeeds without wallet
  it('TIER-B3 — apply free tier without wallet succeeds', async () => {
    const studentId = seedUser('student', 'b3-student', false); // no wallet
    const courseId = seedCourse('Tier Course B3', 'TIER-B3');
    seedEnrollment(studentId, 'TIER-B3');
    const token = makeToken({ userId: studentId, email: 'tier-b3-student@test.com', role: 'student' });

    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/apply`)
      .set('Authorization', `Bearer ${token}`)
      .send({ selectedTier: 'free' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.selectedTier).toBe('free');
    expect(res.body.data.walletAddress).toBeNull();
  });

  // TIER-B4: Apply with selectedTier='paid' requires wallet
  it('TIER-B4 — apply paid tier without wallet returns 422', async () => {
    const studentId = seedUser('student', 'b4-student', false); // no wallet
    const courseId = seedCourse('Tier Course B4', 'TIER-B4');
    seedEnrollment(studentId, 'TIER-B4');
    const token = makeToken({ userId: studentId, email: 'tier-b4-student@test.com', role: 'student' });

    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/apply`)
      .set('Authorization', `Bearer ${token}`)
      .send({ selectedTier: 'paid' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('WALLET_NOT_LINKED');
  });

  // TIER-B5: Apply rejects unavailable tier
  it('TIER-B5 — apply free on paid_only course returns 400', async () => {
    const studentId = seedUser('student', 'b5-student');
    const courseId = seedCourse('Tier Course B5', 'TIER-B5');
    seedEnrollment(studentId, 'TIER-B5');
    seedPricing(courseId, 5000, 'paid_only');
    const token = makeToken({ userId: studentId, email: 'tier-b5-student@test.com', role: 'student' });

    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/apply`)
      .set('Authorization', `Bearer ${token}`)
      .send({ selectedTier: 'free' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TIER_NOT_AVAILABLE');
  });

  // TIER-B6: Approve free-tier application auto-generates badge
  it('TIER-B6 — approve free-tier app creates badge', async () => {
    const adminId = seedUser('admin', 'b6-admin');
    const studentId = seedUser('student', 'b6-student');
    const courseId = seedCourse('Tier Course B6', 'TIER-B6');
    seedEnrollment(studentId, 'TIER-B6');
    const appId = seedApplication(studentId, courseId, 'pending', 'free');
    const token = makeToken({ userId: adminId, email: 'tier-b6-admin@test.com', role: 'admin' });

    const res = await request(app)
      .patch(`/api/v1/courses/${courseId}/completions/applications/${appId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Approved for free badge' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify badge was created
    const badge = db.prepare(
      'SELECT * FROM certificate_badges WHERE user_id = ? AND course_id = ?'
    ).get(studentId, courseId) as { id: string; badge_svg: string } | undefined;

    expect(badge).toBeTruthy();
    expect(badge!.badge_svg).toContain('<svg');
    expect(badge!.badge_svg).toContain('CERTIFICATE OF COMPLETION');
  });

  // TIER-B7: GET /badges/:badgeId returns badge for owner
  it('TIER-B7 — GET badge returns data for owner', async () => {
    const studentId = seedUser('student', 'b7-student');
    const courseId = seedCourse('Tier Course B7', 'TIER-B7');
    const appId = seedApplication(studentId, courseId, 'approved', 'free');
    const badgeId = seedBadge(studentId, courseId, appId);
    const token = makeToken({ userId: studentId, email: 'tier-b7-student@test.com', role: 'student' });

    const res = await request(app)
      .get(`/api/v1/badges/${badgeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.badgeId).toBe(badgeId);
    expect(res.body.data.badgeSvg).toBe('<svg>test</svg>');
  });

  // TIER-B8: GET /badges/:badgeId returns 403 for non-owner
  it('TIER-B8 — GET badge returns 403 for non-owner', async () => {
    const studentId = seedUser('student', 'b8-student');
    const otherId = seedUser('student', 'b8-other');
    const courseId = seedCourse('Tier Course B8', 'TIER-B8');
    const appId = seedApplication(studentId, courseId, 'approved', 'free');
    const badgeId = seedBadge(studentId, courseId, appId);
    const token = makeToken({ userId: otherId, email: 'tier-b8-other@test.com', role: 'student' });

    const res = await request(app)
      .get(`/api/v1/badges/${badgeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // TIER-B9: GET /badges/:badgeId/download returns SVG
  it('TIER-B9 — badge download returns SVG content-type', async () => {
    const studentId = seedUser('student', 'b9-student');
    const courseId = seedCourse('Tier Course B9', 'TIER-B9');
    const appId = seedApplication(studentId, courseId, 'approved', 'free');
    const badgeId = seedBadge(studentId, courseId, appId);
    const token = makeToken({ userId: studentId, email: 'tier-b9-student@test.com', role: 'student' });

    const res = await request(app)
      .get(`/api/v1/badges/${badgeId}/download`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body.toString()).toBe('<svg>test</svg>');
  });

  // TIER-B10: Mint endpoint rejects free-tier application
  it('TIER-B10 — mint rejects free-tier application', async () => {
    const adminId = seedUser('admin', 'b10-admin');
    const studentId = seedUser('student', 'b10-student');
    const courseId = seedCourse('Tier Course B10', 'TIER-B10');
    seedEnrollment(studentId, 'TIER-B10');
    const appId = seedApplication(studentId, courseId, 'approved', 'free');
    const token = makeToken({ userId: adminId, email: 'tier-b10-admin@test.com', role: 'admin' });

    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('Free-tier');
  });
});
