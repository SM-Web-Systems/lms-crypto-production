/**
 * cohortService — Phase 11 C3: sponsor cohort CRUD + bulk operations.
 */

import { v4 as uuidv4 } from 'uuid';
import { db, query, queryOne, execute } from '../config/database.js';
import type {
  SponsorCohort,
  SponsorCohortSummary,
  CohortMemberDetail,
  BulkApplyResult,
  BulkPayResult,
  CertificateTier,
} from '../types/index.js';
import { getCoursePricing } from './paymentService.js';
import { getTiersEnabled } from './badgeService.js';

// ─── Cohort CRUD ────────────────────────────────────────────────────────────

export function createCohort(params: {
  name: string;
  sponsorUserId: string;
  courseId: string;
  selectedTier: CertificateTier;
  memberUserIds?: string[];
}): SponsorCohortSummary {
  const { name, sponsorUserId, courseId, selectedTier, memberUserIds } = params;

  // Validate course exists
  const course = queryOne<{ id: string; title: string }>(
    'SELECT id, title FROM courses WHERE id = ?',
    [courseId],
  );
  if (!course) throw Object.assign(new Error('Course not found'), { code: 'NOT_FOUND' });

  // Validate tier availability
  const tiersEnabled = getTiersEnabled(courseId);
  if (
    (selectedTier === 'free' && tiersEnabled === 'paid_only') ||
    (selectedTier === 'paid' && tiersEnabled === 'free_only')
  ) {
    throw Object.assign(new Error('This tier is not available for this course'), { code: 'TIER_NOT_AVAILABLE' });
  }

  const cohortId = uuidv4();
  execute(
    `INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'draft', datetime('now'))`,
    [cohortId, name, sponsorUserId, courseId, selectedTier],
  );

  // Add initial members if provided
  let memberCount = 0;
  if (memberUserIds && memberUserIds.length > 0) {
    const insertMember = db.prepare(
      `INSERT OR IGNORE INTO cohort_members (cohort_id, user_id, added_at) VALUES (?, ?, datetime('now'))`,
    );
    for (const uid of memberUserIds) {
      const userExists = queryOne<{ id: string }>('SELECT id FROM users WHERE id = ?', [uid]);
      if (userExists) {
        insertMember.run(cohortId, uid);
        memberCount++;
      }
    }
  }

  return {
    cohortId,
    name,
    courseId,
    courseName: course.title,
    selectedTier,
    status: 'draft',
    memberCount,
    appliedCount: 0,
    paymentStatus: null,
    createdAt: queryOne<{ created_at: string }>('SELECT created_at FROM sponsor_cohorts WHERE id = ?', [cohortId])!.created_at,
  };
}

export function listCohorts(filters?: { courseId?: string }): SponsorCohortSummary[] {
  let sql = `
    SELECT sc.id, sc.name, sc.course_id, c.title as course_name,
           sc.selected_tier, sc.status, sc.payment_id, sc.created_at,
           (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id) as member_count,
           (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id AND cm.application_id IS NOT NULL) as applied_count,
           p.status as payment_status
    FROM sponsor_cohorts sc
    JOIN courses c ON c.id = sc.course_id
    LEFT JOIN payments p ON p.id = sc.payment_id
  `;
  const params: string[] = [];
  if (filters?.courseId) {
    sql += ' WHERE sc.course_id = ?';
    params.push(filters.courseId);
  }
  sql += ' ORDER BY sc.created_at DESC';

  const rows = query<{
    id: string; name: string; course_id: string; course_name: string;
    selected_tier: CertificateTier; status: string; payment_id: string | null;
    created_at: string; member_count: number; applied_count: number;
    payment_status: string | null;
  }>(sql, params);

  return rows.map((r) => ({
    cohortId: r.id,
    name: r.name,
    courseId: r.course_id,
    courseName: r.course_name,
    selectedTier: r.selected_tier,
    status: r.status,
    memberCount: r.member_count,
    appliedCount: r.applied_count,
    paymentStatus: r.payment_status,
    createdAt: r.created_at,
  }));
}

export function getCohort(cohortId: string): { cohort: SponsorCohortSummary; members: CohortMemberDetail[] } | null {
  const row = queryOne<{
    id: string; name: string; course_id: string; course_name: string;
    selected_tier: CertificateTier; status: string; payment_id: string | null;
    created_at: string; member_count: number; applied_count: number;
    payment_status: string | null;
  }>(`
    SELECT sc.id, sc.name, sc.course_id, c.title as course_name,
           sc.selected_tier, sc.status, sc.payment_id, sc.created_at,
           (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id) as member_count,
           (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id AND cm.application_id IS NOT NULL) as applied_count,
           p.status as payment_status
    FROM sponsor_cohorts sc
    JOIN courses c ON c.id = sc.course_id
    LEFT JOIN payments p ON p.id = sc.payment_id
    WHERE sc.id = ?
  `, [cohortId]);

  if (!row) return null;

  const members = query<{
    user_id: string; user_name: string; user_email: string;
    application_id: string | null; application_status: string | null;
    is_enrolled: number; added_at: string;
  }>(`
    SELECT cm.user_id, u.name as user_name, u.email as user_email,
           cm.application_id, app.status as application_status,
           CASE WHEN uc.user_id IS NOT NULL THEN 1 ELSE 0 END as is_enrolled,
           cm.added_at
    FROM cohort_members cm
    JOIN users u ON u.id = cm.user_id
    LEFT JOIN course_nft_applications app ON app.id = cm.application_id
    LEFT JOIN (
      SELECT ucc.user_id FROM user_course_codes ucc
      INNER JOIN courses c2 ON c2.course_code = ucc.course_code
      WHERE c2.id = ?
    ) uc ON uc.user_id = cm.user_id
    WHERE cm.cohort_id = ?
    ORDER BY cm.added_at
  `, [row.course_id, cohortId]);

  return {
    cohort: {
      cohortId: row.id,
      name: row.name,
      courseId: row.course_id,
      courseName: row.course_name,
      selectedTier: row.selected_tier,
      status: row.status,
      memberCount: row.member_count,
      appliedCount: row.applied_count,
      paymentStatus: row.payment_status,
      createdAt: row.created_at,
    },
    members: members.map((m) => ({
      userId: m.user_id,
      userName: m.user_name,
      userEmail: m.user_email,
      applicationId: m.application_id,
      applicationStatus: m.application_status,
      isEnrolled: m.is_enrolled === 1,
      addedAt: m.added_at,
    })),
  };
}

export function addMembers(cohortId: string, userIds: string[]): { added: number; skipped: number } {
  const cohort = queryOne<{ id: string }>('SELECT id FROM sponsor_cohorts WHERE id = ?', [cohortId]);
  if (!cohort) throw Object.assign(new Error('Cohort not found'), { code: 'COHORT_NOT_FOUND' });

  let added = 0;
  let skipped = 0;
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO cohort_members (cohort_id, user_id, added_at) VALUES (?, ?, datetime(\'now\'))',
  );
  for (const uid of userIds) {
    const userExists = queryOne<{ id: string }>('SELECT id FROM users WHERE id = ?', [uid]);
    if (!userExists) { skipped++; continue; }
    const result = stmt.run(cohortId, uid);
    if (result.changes > 0) added++;
    else skipped++;
  }
  return { added, skipped };
}

export function removeMember(cohortId: string, userId: string): boolean {
  const changes = execute(
    'DELETE FROM cohort_members WHERE cohort_id = ? AND user_id = ?',
    [cohortId, userId],
  );
  return changes > 0;
}

// ─── Bulk Operations ────────────────────────────────────────────────────────

export function bulkApply(cohortId: string, adminUserId: string): BulkApplyResult {
  const cohort = queryOne<SponsorCohort>('SELECT * FROM sponsor_cohorts WHERE id = ?', [cohortId]);
  if (!cohort) throw Object.assign(new Error('Cohort not found'), { code: 'COHORT_NOT_FOUND' });

  const members = query<{ user_id: string }>(
    'SELECT user_id FROM cohort_members WHERE cohort_id = ?',
    [cohortId],
  );
  if (members.length === 0) throw Object.assign(new Error('Cohort has no members'), { code: 'COHORT_EMPTY' });

  const course = queryOne<{ id: string; title: string; course_code: string }>(
    'SELECT id, title, course_code FROM courses WHERE id = ?',
    [cohort.course_id],
  );

  let applied = 0;
  const skipped: { userId: string; reason: string }[] = [];

  for (const member of members) {
    // Check enrollment
    const enrolled = queryOne<{ user_id: string }>(
      'SELECT user_id FROM user_course_codes WHERE user_id = ? AND course_code = ?',
      [member.user_id, course!.course_code],
    );
    if (!enrolled) {
      skipped.push({ userId: member.user_id, reason: 'not_enrolled' });
      continue;
    }

    // Check existing non-rejected application
    const existingApp = queryOne<{ id: string }>(
      "SELECT id FROM course_nft_applications WHERE user_id = ? AND course_id = ? AND status NOT IN ('rejected')",
      [member.user_id, cohort.course_id],
    );
    if (existingApp) {
      skipped.push({ userId: member.user_id, reason: 'application_exists' });
      continue;
    }

    // Create application
    const walletAddress = cohort.selected_tier === 'paid'
      ? (queryOne<{ walletAddress: string }>('SELECT walletAddress FROM users WHERE id = ?', [member.user_id])?.walletAddress ?? '')
      : '';
    const appId = uuidv4();
    execute(
      `INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, selected_tier, applied_at)
       VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'))`,
      [appId, member.user_id, cohort.course_id, walletAddress, cohort.selected_tier],
    );

    // Update cohort_members with application_id
    execute(
      'UPDATE cohort_members SET application_id = ? WHERE cohort_id = ? AND user_id = ?',
      [appId, cohortId, member.user_id],
    );

    applied++;
  }

  // Update cohort status to 'active' if any applications created
  if (applied > 0) {
    execute("UPDATE sponsor_cohorts SET status = 'active' WHERE id = ?", [cohortId]);
  }

  return { cohortId, applied, skipped };
}

export function bulkPay(cohortId: string, adminUserId: string): BulkPayResult {
  const cohort = queryOne<SponsorCohort>('SELECT * FROM sponsor_cohorts WHERE id = ?', [cohortId]);
  if (!cohort) throw Object.assign(new Error('Cohort not found'), { code: 'COHORT_NOT_FOUND' });

  if (cohort.selected_tier === 'free') {
    throw Object.assign(new Error('Free-tier cohorts do not require payment'), { code: 'VALIDATION_ERROR' });
  }

  if (cohort.payment_id) {
    throw Object.assign(new Error('Cohort already has a payment'), { code: 'COHORT_ALREADY_PAID' });
  }

  // Count applied members
  const appliedCount = queryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM cohort_members WHERE cohort_id = ? AND application_id IS NOT NULL',
    [cohortId],
  )!.cnt;

  if (appliedCount === 0) {
    throw Object.assign(new Error('No applied members to pay for'), { code: 'COHORT_EMPTY' });
  }

  const pricing = getCoursePricing(cohort.course_id);
  const priceCents = pricing?.price_cents ?? 0;
  const totalCents = priceCents * appliedCount;

  // Create single bulk payment (application_id = NULL for bulk)
  const paymentId = uuidv4();
  execute(
    `INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, 'USD', 'manual', 'pending', datetime('now'), datetime('now'))`,
    [paymentId, cohort.sponsor_user_id, cohort.course_id, totalCents],
  );

  // Link payment to cohort
  execute('UPDATE sponsor_cohorts SET payment_id = ? WHERE id = ?', [paymentId, cohortId]);

  return {
    paymentId,
    amountCents: totalCents,
    currency: 'USD',
    memberCount: appliedCount,
    status: 'pending',
  };
}
