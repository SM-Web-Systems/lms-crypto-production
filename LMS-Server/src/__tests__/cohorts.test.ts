/**
 * Tests for Phase 11 C3 — Sponsor Cohorts.
 *
 * COH-B1  — createCohort stores cohort and returns it with member count
 * COH-B2  — createCohort validates tier against course tiers_enabled
 * COH-B3  — listCohorts returns summaries with applied count
 * COH-B4  — getCohort returns members with enrollment and application status
 * COH-B5  — addMembers inserts new members and skips duplicates
 * COH-B6  — removeMember deletes member row, leaves application intact
 * COH-B7  — bulkApply creates applications for enrolled members
 * COH-B8  — bulkApply skips unenrolled members with reason
 * COH-B9  — bulkApply skips members with existing non-rejected applications
 * COH-B10 — bulkPay creates single payment with correct total
 * COH-B11 — bulkPay rejects free-tier cohorts with 400
 * COH-B12 — bulkApply for free-tier cohort creates applications with free tier
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

// ─── Seed Helpers ───────────────────────────────────────────────────────────

function seedUser(role: 'admin' | 'student', suffix: string, wallet = false) {
  const userId = uuidv4();
  const walletAddr = wallet ? `GTEST${suffix.toUpperCase()}WALLET` : null;
  const walletStatus = wallet ? 'linked' : 'none';
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES ('${userId}', 'User ${suffix}', '${suffix}@test.com', '${HASH}', '${role}',
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
  db.exec(`INSERT INTO user_course_codes (user_id, course_code) VALUES ('${userId}', '${courseCode}');`);
}

function seedPricing(courseId: string, priceCents: number, tiersEnabled = 'both') {
  const pricingId = uuidv4();
  db.exec(`
    INSERT INTO course_pricing (id, course_id, price_cents, currency, is_active, tiers_enabled)
    VALUES ('${pricingId}', '${courseId}', ${priceCents}, 'USD', 1, '${tiersEnabled}');
  `);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Sponsor Cohorts (C3)', () => {
  let adminId: string;
  let adminToken: string;
  let studentId1: string;
  let studentId2: string;
  let studentId3: string;
  let courseId: string;
  const courseCode = 'COH-TEST-101';

  beforeEach(() => {
    adminId = seedUser('admin', 'coh-admin');
    adminToken = makeToken({ userId: adminId, email: 'coh-admin@test.com', role: 'admin' });
    studentId1 = seedUser('student', 'coh-s1');
    studentId2 = seedUser('student', 'coh-s2');
    studentId3 = seedUser('student', 'coh-s3');
    courseId = seedCourse('Cohort Test Course', courseCode);
    seedPricing(courseId, 2500, 'both');
  });

  // COH-B1: createCohort stores and returns with member count
  it('COH-B1 — creates cohort with initial members', async () => {
    const res = await request(app)
      .post('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Cohort', courseId, selectedTier: 'free', memberUserIds: [studentId1, studentId2] });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Test Cohort');
    expect(res.body.data.selectedTier).toBe('free');
    expect(res.body.data.memberCount).toBe(2);
    expect(res.body.data.status).toBe('draft');
  });

  // COH-B2: createCohort validates tier
  it('COH-B2 — rejects tier mismatch (paid on free_only course)', async () => {
    db.exec(`UPDATE course_pricing SET tiers_enabled = 'free_only' WHERE course_id = '${courseId}'`);

    const res = await request(app)
      .post('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad Cohort', courseId, selectedTier: 'paid' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TIER_NOT_AVAILABLE');
  });

  // COH-B3: listCohorts returns summaries
  it('COH-B3 — lists cohorts with member and applied counts', async () => {
    await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cohort A', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cohort B', courseId, selectedTier: 'free' });

    const res = await request(app)
      .get('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cohorts.length).toBe(2);
    const cohortA = res.body.data.cohorts.find((c: any) => c.name === 'Cohort A');
    expect(cohortA.memberCount).toBe(1);
    expect(cohortA.appliedCount).toBe(0);
  });

  // COH-B4: getCohort returns members with enrollment status
  it('COH-B4 — getCohort returns members with enrollment and application status', async () => {
    seedEnrollment(studentId1, courseCode);
    // studentId2 NOT enrolled

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Detail Cohort', courseId, selectedTier: 'free', memberUserIds: [studentId1, studentId2] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .get(`/api/v1/admin/cohorts/${cohortId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.members.length).toBe(2);
    const enrolled = res.body.data.members.find((m: any) => m.userId === studentId1);
    const notEnrolled = res.body.data.members.find((m: any) => m.userId === studentId2);
    expect(enrolled.isEnrolled).toBe(true);
    expect(notEnrolled.isEnrolled).toBe(false);
  });

  // COH-B5: addMembers skips duplicates
  it('COH-B5 — adds new members, skips duplicates', async () => {
    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Add Test', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userIds: [studentId1, studentId2] });

    expect(res.status).toBe(200);
    expect(res.body.data.added).toBe(1);
    expect(res.body.data.skipped).toBe(1);
  });

  // COH-B6: removeMember deletes row, application persists
  it('COH-B6 — removes member but application persists', async () => {
    seedEnrollment(studentId1, courseCode);
    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Remove Test', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    const cohortId = createRes.body.data.cohortId;

    // Bulk-apply first
    await request(app).post(`/api/v1/admin/cohorts/${cohortId}/apply`).set('Authorization', `Bearer ${adminToken}`);

    // Remove member
    const res = await request(app)
      .delete(`/api/v1/admin/cohorts/${cohortId}/members/${studentId1}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // Application still exists
    const appRow = db.prepare(
      "SELECT id FROM course_nft_applications WHERE user_id = ? AND course_id = ?",
    ).get(studentId1, courseId);
    expect(appRow).toBeTruthy();
  });

  // COH-B7: bulkApply creates applications for enrolled members
  it('COH-B7 — bulk-apply creates applications for enrolled members', async () => {
    seedEnrollment(studentId1, courseCode);
    seedEnrollment(studentId2, courseCode);

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Apply Test', courseId, selectedTier: 'free', memberUserIds: [studentId1, studentId2] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/apply`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(2);
    expect(res.body.data.skipped).toEqual([]);
  });

  // COH-B8: bulkApply skips unenrolled
  it('COH-B8 — bulk-apply skips unenrolled members', async () => {
    seedEnrollment(studentId1, courseCode);
    // studentId2 NOT enrolled

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Skip Test', courseId, selectedTier: 'free', memberUserIds: [studentId1, studentId2] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/apply`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(1);
    expect(res.body.data.skipped).toEqual([{ userId: studentId2, reason: 'not_enrolled' }]);
  });

  // COH-B9: bulkApply skips members with existing applications
  it('COH-B9 — bulk-apply skips members with existing applications', async () => {
    seedEnrollment(studentId1, courseCode);

    const existingAppId = uuidv4();
    db.exec(`
      INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, selected_tier, applied_at)
      VALUES ('${existingAppId}', '${studentId1}', '${courseId}', '', 'pending', 'free', datetime('now'));
    `);

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Existing App Test', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/apply`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(0);
    expect(res.body.data.skipped[0].reason).toBe('application_exists');
  });

  // COH-B10: bulkPay creates single payment with correct total
  it('COH-B10 — bulk-pay creates single payment for paid cohort', async () => {
    seedEnrollment(studentId1, courseCode);
    seedEnrollment(studentId2, courseCode);

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Pay Test', courseId, selectedTier: 'paid', memberUserIds: [studentId1, studentId2] });
    const cohortId = createRes.body.data.cohortId;

    // Bulk-apply first
    await request(app).post(`/api/v1/admin/cohorts/${cohortId}/apply`).set('Authorization', `Bearer ${adminToken}`);

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/pay`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.amountCents).toBe(5000); // 2500 * 2
    expect(res.body.data.memberCount).toBe(2);
    expect(res.body.data.status).toBe('pending');
  });

  // COH-B11: bulkPay rejects free-tier cohorts
  it('COH-B11 — bulk-pay rejects free-tier cohort', async () => {
    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Free Pay Test', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/pay`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // COH-B12: bulkApply for free-tier creates applications with free tier
  it('COH-B12 — free-tier bulk-apply creates applications with selected_tier=free', async () => {
    seedEnrollment(studentId1, courseCode);

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Free Tier Test', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    const cohortId = createRes.body.data.cohortId;

    await request(app).post(`/api/v1/admin/cohorts/${cohortId}/apply`).set('Authorization', `Bearer ${adminToken}`);

    const appRow = db.prepare(
      "SELECT selected_tier FROM course_nft_applications WHERE user_id = ? AND course_id = ?",
    ).get(studentId1, courseId) as { selected_tier: string };
    expect(appRow.selected_tier).toBe('free');
  });

  // ─── Phase 14 C1: Cohort Completion Tracking ─────────────────────────────

  // COH-T1: getCohort returns completionStats
  it('COH-T1 — getCohort returns completionStats for cohort with members', async () => {
    seedEnrollment(studentId1, courseCode);
    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Stats Cohort', courseId, selectedTier: 'free', memberUserIds: [studentId1, studentId2] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .get(`/api/v1/admin/cohorts/${cohortId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.completionStats).toBeDefined();
    expect(res.body.data.completionStats.totalMembers).toBe(2);
    expect(typeof res.body.data.completionStats.completedCount).toBe('number');
    expect(typeof res.body.data.completionStats.certifiedCount).toBe('number');
    expect(typeof res.body.data.completionStats.avgLessonProgress).toBe('number');
  });

  // COH-T2: member with no completions on a course with items shows 0% progress
  it('COH-T2 — member with no completions shows 0% progress', async () => {
    // Give the course items so progress isn't defaulting to 100%
    const sId = uuidv4();
    const iId = uuidv4();
    db.exec(`UPDATE courses SET sections = '${JSON.stringify([{
      id: sId, title: 'S1', items: [{ id: iId, type: 'video', title: 'V1', url: 'http://x' }],
    }])}' WHERE id = '${courseId}'`);

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Zero Cohort', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .get(`/api/v1/admin/cohorts/${cohortId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const member = res.body.data.members.find((m: any) => m.userId === studentId1);
    expect(member.lessonProgress).toBe(0);
    expect(member.certificateStatus).toBe('none');
  });

  // COH-T3: member with completed lessons shows correct progress
  it('COH-T3 — member with completed lessons shows progress', async () => {
    // Give the course some sections with items
    const sectionId = uuidv4();
    const item1Id = uuidv4();
    const item2Id = uuidv4();
    db.exec(`UPDATE courses SET sections = '${JSON.stringify([{
      id: sectionId, title: 'S1', items: [
        { id: item1Id, type: 'video', title: 'V1', url: 'http://x' },
        { id: item2Id, type: 'video', title: 'V2', url: 'http://y' },
      ],
    }])}' WHERE id = '${courseId}'`);

    // Complete 1 of 2 items
    const lcId = uuidv4();
    db.exec(`INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, completed_at)
      VALUES ('${lcId}', '${studentId1}', '${courseId}', '${item1Id}', '${sectionId}', datetime('now'))`);

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Progress Cohort', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .get(`/api/v1/admin/cohorts/${cohortId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const member = res.body.data.members.find((m: any) => m.userId === studentId1);
    expect(member.lessonProgress).toBe(50);
  });

  // COH-T4: member with minted NFT shows certificateStatus='nft'
  it('COH-T4 — member with minted NFT shows certificateStatus=nft', async () => {
    const credId = uuidv4();
    const appId = uuidv4();
    db.exec(`INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, selected_tier, applied_at)
      VALUES ('${appId}', '${studentId1}', '${courseId}', 'GWALLET1', 'minted', 'paid', datetime('now'))`);
    db.exec(`INSERT INTO nft_credentials (id, user_id, course_id, application_id, wallet_address, contract_id, network, mint_status, created_at, updated_at)
      VALUES ('${credId}', '${studentId1}', '${courseId}', '${appId}', 'GWALLET1', 'CTEST', 'testnet', 'minted', datetime('now'), datetime('now'))`);

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'NFT Cohort', courseId, selectedTier: 'paid', memberUserIds: [studentId1] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .get(`/api/v1/admin/cohorts/${cohortId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const member = res.body.data.members.find((m: any) => m.userId === studentId1);
    expect(member.certificateStatus).toBe('nft');
  });

  // COH-T5: completedCount reflects members meeting all requirements
  it('COH-T5 — completedCount counts members meeting requirements', async () => {
    // Course has no items → getCourseProgress returns 0% with meetsAllRequirements=false by default
    // But with no completion requirements set, it defaults to meetsAllRequirements based on lesson threshold
    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Completion Cohort', courseId, selectedTier: 'free', memberUserIds: [studentId1, studentId2] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .get(`/api/v1/admin/cohorts/${cohortId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.data.completionStats.completedCount).toBeDefined();
    // Exact count depends on course requirements; verify it's consistent with members
    const membersWhoMeet = res.body.data.members.filter((m: any) => m.meetsRequirements).length;
    expect(res.body.data.completionStats.completedCount).toBe(membersWhoMeet);
  });
});
