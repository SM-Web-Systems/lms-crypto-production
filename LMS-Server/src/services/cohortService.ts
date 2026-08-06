/**
 * cohortService — Phase 11 C3: sponsor cohort CRUD + bulk operations.
 */

import { v4 as uuidv4 } from 'uuid';
import { db, query, queryOne, execute } from '../config/database.js';
import type {
  SponsorCohort,
  SponsorCohortSummary,
  CohortMemberDetail,
  CohortCompletionStats,
  BulkApplyResult,
  BulkPayResult,
  CertificateTier,
} from '../types/index.js';
import { getCoursePricing } from './paymentService.js';
import { getTiersEnabled } from './badgeService.js';
import { getCourseProgress } from './courseCompletionService.js';
import { sendEnrollmentEmail, sendCourseInviteEmail, sendPaymentReminderEmail } from './emailService.js';
import logger from '../utils/logger.js';

// ─── Status Transitions (Phase 22 C2) ───────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['active'],
  active: ['completed'],
  completed: [],
};

export function transitionCohortStatus(
  cohortId: string,
  toStatus: 'active' | 'completed',
  triggeredBy: string,
  reason?: string,
): boolean {
  const cohort = queryOne<{ status: string }>('SELECT status FROM sponsor_cohorts WHERE id = ?', [cohortId]);
  if (!cohort) return false;

  const fromStatus = cohort.status;
  if (fromStatus === toStatus) return false;
  if (!VALID_TRANSITIONS[fromStatus]?.includes(toStatus)) return false;

  execute("UPDATE sponsor_cohorts SET status = ? WHERE id = ?", [toStatus, cohortId]);
  execute(
    `INSERT INTO cohort_status_log (id, cohort_id, from_status, to_status, triggered_by, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [uuidv4(), cohortId, fromStatus, toStatus, triggeredBy, reason ?? null],
  );
  return true;
}

export function getStatusLog(cohortId: string): Array<{
  id: string; fromStatus: string; toStatus: string; triggeredBy: string; reason: string | null; createdAt: string;
}> {
  return query<{
    id: string; from_status: string; to_status: string; triggered_by: string; reason: string | null; created_at: string;
  }>('SELECT * FROM cohort_status_log WHERE cohort_id = ? ORDER BY created_at DESC', [cohortId]).map((r) => ({
    id: r.id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    triggeredBy: r.triggered_by,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

/** Lazy evaluation: check date-based transitions for a single cohort */
function lazyCheckStatus(cohortId: string, status: string, startDate: string | null, endDate: string | null): string {
  const now = new Date().toISOString();
  if (status === 'draft' && startDate && startDate <= now) {
    transitionCohortStatus(cohortId, 'active', 'system:lazy', 'Start date reached');
    return 'active';
  }
  if (status === 'active' && endDate && endDate <= now) {
    transitionCohortStatus(cohortId, 'completed', 'system:lazy', 'End date reached');
    return 'completed';
  }
  return status;
}

// ─── Cohort CRUD ────────────────────────────────────────────────────────────

export function createCohort(params: {
  name: string;
  sponsorUserId: string;
  courseId: string;
  selectedTier: CertificateTier;
  memberUserIds?: string[];
  startDate?: string;
  endDate?: string;
}): SponsorCohortSummary {
  const { name, sponsorUserId, courseId, selectedTier, memberUserIds, startDate, endDate } = params;

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
    `INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier, status, start_date, end_date, created_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, datetime('now'))`,
    [cohortId, name, sponsorUserId, courseId, selectedTier, startDate ?? null, endDate ?? null],
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
           sc.start_date, sc.end_date,
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
    created_at: string; start_date: string | null; end_date: string | null;
    member_count: number; applied_count: number;
    payment_status: string | null;
  }>(sql, params);

  return rows.map((r) => {
    const status = lazyCheckStatus(r.id, r.status, r.start_date, r.end_date);
    return {
      cohortId: r.id,
      name: r.name,
      courseId: r.course_id,
      courseName: r.course_name,
      selectedTier: r.selected_tier,
      status,
      memberCount: r.member_count,
      appliedCount: r.applied_count,
      paymentStatus: r.payment_status,
      createdAt: r.created_at,
    };
  });
}

export function getCohort(cohortId: string): { cohort: SponsorCohortSummary; members: CohortMemberDetail[]; completionStats: CohortCompletionStats } | null {
  const row = queryOne<{
    id: string; name: string; course_id: string; course_name: string;
    selected_tier: CertificateTier; status: string; payment_id: string | null;
    created_at: string; start_date: string | null; end_date: string | null;
    member_count: number; applied_count: number;
    payment_status: string | null;
  }>(`
    SELECT sc.id, sc.name, sc.course_id, c.title as course_name,
           sc.selected_tier, sc.status, sc.payment_id, sc.created_at,
           sc.start_date, sc.end_date,
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

  // Compute per-member completion data
  const enrichedMembers: CohortMemberDetail[] = members.map((m) => {
    const progress = getCourseProgress(m.user_id, row.course_id);

    // Certificate status: check for minted NFT first, then badge
    let certificateStatus: 'none' | 'badge' | 'nft' = 'none';
    const hasNft = queryOne<{ id: string }>(
      "SELECT id FROM nft_credentials WHERE user_id = ? AND course_id = ? AND mint_status = 'minted'",
      [m.user_id, row.course_id],
    );
    if (hasNft) {
      certificateStatus = 'nft';
    } else {
      const hasBadge = queryOne<{ id: string }>(
        'SELECT id FROM certificate_badges WHERE user_id = ? AND course_id = ?',
        [m.user_id, row.course_id],
      );
      if (hasBadge) certificateStatus = 'badge';
    }

    return {
      userId: m.user_id,
      userName: m.user_name,
      userEmail: m.user_email,
      applicationId: m.application_id,
      applicationStatus: m.application_status,
      isEnrolled: m.is_enrolled === 1,
      addedAt: m.added_at,
      lessonProgress: progress.lessonPercentage,
      meetsRequirements: progress.meetsAllRequirements,
      certificateStatus,
    };
  });

  // Aggregate stats
  const completionStats: CohortCompletionStats = {
    totalMembers: enrichedMembers.length,
    completedCount: enrichedMembers.filter((m) => m.meetsRequirements).length,
    certifiedCount: enrichedMembers.filter((m) => m.certificateStatus !== 'none').length,
    avgLessonProgress: enrichedMembers.length > 0
      ? Math.round(enrichedMembers.reduce((sum, m) => sum + m.lessonProgress, 0) / enrichedMembers.length)
      : 0,
  };

  // Lazy evaluation: date-based transitions
  let status = lazyCheckStatus(row.id, row.status, row.start_date, row.end_date);

  // Lazy evaluation: completion-based transition (active → completed when all members done)
  if (status === 'active' && enrichedMembers.length > 0 && completionStats.completedCount === enrichedMembers.length) {
    transitionCohortStatus(row.id, 'completed', 'system:lazy', 'All members completed');
    status = 'completed';
  }

  return {
    cohort: {
      cohortId: row.id,
      name: row.name,
      courseId: row.course_id,
      courseName: row.course_name,
      selectedTier: row.selected_tier,
      status,
      memberCount: row.member_count,
      appliedCount: row.applied_count,
      paymentStatus: row.payment_status,
      createdAt: row.created_at,
    },
    members: enrichedMembers,
    completionStats,
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
    transitionCohortStatus(cohortId, 'active', 'system:bulkApply', `${applied} applications created`);
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

// ─── Bulk Invite (Phase 22 C4) ──────────────────────────────────────────────

export function bulkInviteToCohort(
  cohortId: string,
  emails: string[],
): { added: number; invited: number; alreadyInCohort: number; errors: string[] } {
  const cohort = queryOne<{ id: string; course_id: string }>(
    'SELECT id, course_id FROM sponsor_cohorts WHERE id = ?',
    [cohortId],
  );
  if (!cohort) throw Object.assign(new Error('Cohort not found'), { code: 'COHORT_NOT_FOUND' });

  const course = queryOne<{ id: string; title: string; course_code: string | null }>(
    'SELECT id, title, course_code FROM courses WHERE id = ?',
    [cohort.course_id],
  );
  if (!course) throw Object.assign(new Error('Course not found'), { code: 'NOT_FOUND' });

  let added = 0;
  let invited = 0;
  let alreadyInCohort = 0;
  const errors: string[] = [];

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!emailRegex.test(email)) {
      errors.push(email);
      continue;
    }

    try {
      const user = queryOne<{ id: string; name: string; email: string }>(
        'SELECT id, name, email FROM users WHERE LOWER(email) = ?',
        [email],
      );

      if (user) {
        // Check if already in cohort
        const inCohort = queryOne<{ user_id: string }>(
          'SELECT user_id FROM cohort_members WHERE cohort_id = ? AND user_id = ?',
          [cohortId, user.id],
        );
        if (inCohort) {
          alreadyInCohort++;
          continue;
        }

        // Check if enrolled in course
        if (course.course_code) {
          const enrolled = queryOne<{ user_id: string }>(
            'SELECT user_id FROM user_course_codes WHERE user_id = ? AND course_code = ?',
            [user.id, course.course_code],
          );
          if (!enrolled) {
            // Enroll first
            execute(
              'INSERT OR IGNORE INTO user_course_codes (user_id, course_code) VALUES (?, ?)',
              [user.id, course.course_code],
            );
            sendEnrollmentEmail({ to: email, name: user.name, courseName: course.title }).catch(
              (err) => logger.error({ module: 'cohortService', err }, 'Enrollment email failed'),
            );
          }
        }

        // Add to cohort
        execute(
          "INSERT OR IGNORE INTO cohort_members (cohort_id, user_id, added_at) VALUES (?, ?, datetime('now'))",
          [cohortId, user.id],
        );
        added++;
      } else {
        // New user — create course invite
        const existing = queryOne<{ id: string }>(
          "SELECT id FROM course_invites WHERE course_id = ? AND LOWER(email) = ? AND status = 'pending'",
          [course.id, email],
        );
        if (!existing) {
          const token = uuidv4();
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          execute(
            'INSERT INTO course_invites (id, course_id, email, token, expires_at) VALUES (?, ?, ?, ?, ?)',
            [uuidv4(), course.id, email, token, expiresAt],
          );
          sendCourseInviteEmail({ to: email, courseName: course.title, inviteToken: token }).catch(
            (err) => logger.error({ module: 'cohortService', err }, 'Invite email failed'),
          );
        }
        invited++;
      }
    } catch (err) {
      errors.push(email);
      logger.error({ module: 'cohortService', email, err }, 'Error processing cohort invite');
    }
  }

  return { added, invited, alreadyInCohort, errors };
}

// ─── Spending Report (Phase 22 C4) ─────────────────────────────────────────

export function getSpendingReport(sponsorUserId?: string): {
  totalSpentCents: number;
  cohorts: Array<{
    cohortId: string;
    cohortName: string;
    courseName: string;
    memberCount: number;
    amountCents: number;
    paymentStatus: string | null;
    createdAt: string;
  }>;
} {
  let sql = `
    SELECT sc.id as cohort_id, sc.name as cohort_name, c.title as course_name,
           (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id) as member_count,
           COALESCE(p.amount_cents, 0) as amount_cents,
           p.status as payment_status,
           sc.created_at
    FROM sponsor_cohorts sc
    JOIN courses c ON c.id = sc.course_id
    LEFT JOIN payments p ON p.id = sc.payment_id
  `;
  const params: string[] = [];
  if (sponsorUserId) {
    sql += ' WHERE sc.sponsor_user_id = ?';
    params.push(sponsorUserId);
  }
  sql += ' ORDER BY sc.created_at DESC';

  const rows = query<{
    cohort_id: string; cohort_name: string; course_name: string;
    member_count: number; amount_cents: number;
    payment_status: string | null; created_at: string;
  }>(sql, params);

  const totalSpentCents = rows
    .filter((r) => r.payment_status === 'confirmed')
    .reduce((sum, r) => sum + r.amount_cents, 0);

  return {
    totalSpentCents,
    cohorts: rows.map((r) => ({
      cohortId: r.cohort_id,
      cohortName: r.cohort_name,
      courseName: r.course_name,
      memberCount: r.member_count,
      amountCents: r.amount_cents,
      paymentStatus: r.payment_status,
      createdAt: r.created_at,
    })),
  };
}

// ─── Payment Reminders (Phase 22 C4) ────────────────────────────────────────

export function sendPaymentReminders(cohortId: string): { sent: number; cohortId: string } {
  const cohort = queryOne<{ id: string; name: string; course_id: string; payment_id: string | null }>(
    'SELECT id, name, course_id, payment_id FROM sponsor_cohorts WHERE id = ?',
    [cohortId],
  );
  if (!cohort) throw Object.assign(new Error('Cohort not found'), { code: 'COHORT_NOT_FOUND' });

  // Only send reminders if cohort has a pending payment
  if (cohort.payment_id) {
    const payment = queryOne<{ status: string }>(
      'SELECT status FROM payments WHERE id = ?',
      [cohort.payment_id],
    );
    if (payment && payment.status !== 'pending') {
      return { sent: 0, cohortId };
    }
  }

  const course = queryOne<{ title: string }>(
    'SELECT title FROM courses WHERE id = ?',
    [cohort.course_id],
  );

  const members = query<{ user_id: string; user_name: string; user_email: string }>(
    `SELECT cm.user_id, u.name as user_name, u.email as user_email
     FROM cohort_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.cohort_id = ?`,
    [cohortId],
  );

  let sent = 0;
  for (const m of members) {
    sendPaymentReminderEmail({
      to: m.user_email,
      studentName: m.user_name,
      courseName: course?.title ?? 'Course',
      cohortName: cohort.name,
    }).catch(
      (err) => logger.error({ module: 'cohortService', err }, 'Payment reminder email failed'),
    );
    sent++;
  }

  return { sent, cohortId };
}
