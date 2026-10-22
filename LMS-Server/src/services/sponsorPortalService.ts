import { query, queryOne } from '../config/database.js';

// Ownership is always explicit, including when an administrator also holds sponsor roles.
const sponsoredMembers = `SELECT DISTINCT sc.course_id, cm.user_id FROM sponsor_cohorts sc
  JOIN cohort_members cm ON cm.cohort_id = sc.id WHERE sc.sponsor_user_id = ?`;

export function sponsorCourseOptions(userId: string) {
  return query<{ id: string; title: string; tiersEnabled: 'free_only' | 'paid_only' | 'both' }>(
    `
    SELECT c.id, c.title, COALESCE(cp.tiers_enabled, 'both') AS tiersEnabled FROM courses c
    LEFT JOIN course_pricing cp ON cp.course_id = c.id AND cp.is_active = 1
    WHERE (c.approval_status IN ('approved','published') AND (c.tenant_id IS NULL OR c.tenant_id IN
      (SELECT tenant_id FROM tenant_users WHERE user_id = ?)))
      OR EXISTS (SELECT 1 FROM sponsor_cohorts sc WHERE sc.course_id = c.id AND sc.sponsor_user_id = ?)
    ORDER BY c.title`,
    [userId, userId],
  );
}

export function sponsorCourses(userId: string) {
  return query(
    `WITH members AS (${sponsoredMembers})
    SELECT c.id AS courseId, c.title AS courseName, c.course_code AS courseCode, c.sponsor_label AS sponsorLabel,
      COUNT(DISTINCT m.user_id) AS enrollmentsCount,
      COUNT(DISTINCT CASE WHEN u.walletAddress IS NOT NULL THEN u.id END) AS walletsLinkedCount,
      COUNT(DISTINCT nc.id) AS nftsIssuedCount, COALESCE(cp.tiers_enabled,'both') AS tiersEnabled
    FROM courses c
    LEFT JOIN members m ON m.course_id = c.id LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN nft_credentials nc ON nc.course_id = c.id AND nc.user_id = m.user_id
      AND nc.mint_status = 'minted' AND nc.is_superseded = 0
    LEFT JOIN course_pricing cp ON cp.course_id = c.id AND cp.is_active = 1
    WHERE EXISTS (SELECT 1 FROM sponsor_cohorts sc WHERE sc.course_id = c.id AND sc.sponsor_user_id = ?)
    GROUP BY c.id ORDER BY c.title`,
    [userId, userId],
  );
}

export function ownsSponsorCourse(userId: string, courseId: string): boolean {
  return !!queryOne('SELECT id FROM sponsor_cohorts WHERE sponsor_user_id = ? AND course_id = ? LIMIT 1', [
    userId,
    courseId,
  ]);
}

export function sponsorStudents(userId: string, courseId?: string) {
  return query<{
    courseId: string;
    courseName: string;
    courseCode: string;
    sponsorLabel: string | null;
    userId: string;
    name: string;
    email: string;
    walletAddress: string | null;
    enrolledAt: string;
    nftStatus: 'minted' | 'none';
  }>(
    `
    SELECT c.id AS courseId, c.title AS courseName, c.course_code AS courseCode, c.sponsor_label AS sponsorLabel,
      u.id AS userId, u.name, u.email, u.walletAddress, MIN(cm.added_at) AS enrolledAt,
      CASE WHEN EXISTS (SELECT 1 FROM nft_credentials nc WHERE nc.user_id = u.id AND nc.course_id = c.id
        AND nc.mint_status = 'minted' AND nc.is_superseded = 0) THEN 'minted' ELSE 'none' END AS nftStatus
    FROM sponsor_cohorts sc JOIN courses c ON c.id = sc.course_id
    JOIN cohort_members cm ON cm.cohort_id = sc.id JOIN users u ON u.id = cm.user_id
    WHERE sc.sponsor_user_id = ? ${courseId ? 'AND c.id = ?' : ''}
    GROUP BY c.id, u.id ORDER BY c.title, u.name`,
    courseId ? [userId, courseId] : [userId],
  );
}

export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+@\-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
