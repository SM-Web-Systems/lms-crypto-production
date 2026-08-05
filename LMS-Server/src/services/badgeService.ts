/**
 * badgeService — Phase 11 C2: SVG badge generation + CRUD for free-tier certificates.
 */

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute } from '../config/database.js';
import type { CertificateBadge, TiersEnabled } from '../types/index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── SVG Template ────────────────────────────────────────────────────────────

export function generateBadgeSvg(params: {
  badgeId: string;
  studentName: string;
  courseName: string;
  completionDate: string;
}): string {
  const name = escapeHtml(params.studentName);
  const course = escapeHtml(params.courseName);
  const date = escapeHtml(params.completionDate);
  const badgeId = escapeHtml(params.badgeId.slice(0, 8));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e3a5f"/>
      <stop offset="100%" style="stop-color:#2d5a8e"/>
    </linearGradient>
  </defs>
  <rect width="400" height="300" rx="16" fill="url(#bg)"/>
  <rect x="8" y="8" width="384" height="284" rx="12" fill="none" stroke="#c9a96e" stroke-width="2"/>
  <text x="200" y="50" text-anchor="middle" fill="#c9a96e" font-size="14" font-family="serif">CERTIFICATE OF COMPLETION</text>
  <text x="200" y="90" text-anchor="middle" fill="#ffffff" font-size="11" font-family="sans-serif">This certifies that</text>
  <text x="200" y="120" text-anchor="middle" fill="#c9a96e" font-size="20" font-weight="bold" font-family="serif">${name}</text>
  <text x="200" y="155" text-anchor="middle" fill="#ffffff" font-size="11" font-family="sans-serif">has successfully completed</text>
  <text x="200" y="185" text-anchor="middle" fill="#ffffff" font-size="16" font-weight="bold" font-family="sans-serif">${course}</text>
  <line x1="100" y1="210" x2="300" y2="210" stroke="#c9a96e" stroke-width="1"/>
  <text x="200" y="240" text-anchor="middle" fill="#a0b4cc" font-size="10" font-family="sans-serif">${date}</text>
  <text x="200" y="260" text-anchor="middle" fill="#a0b4cc" font-size="8" font-family="sans-serif">Badge ID: ${badgeId}</text>
  <text x="200" y="280" text-anchor="middle" fill="#5a7a9a" font-size="7" font-family="sans-serif">SM Web Systems Blockchain Academy</text>
</svg>`;
}

// ─── Badge CRUD ──────────────────────────────────────────────────────────────

export function createBadge(
  userId: string,
  courseId: string,
  applicationId: string,
): CertificateBadge {
  // Check for existing badge (idempotent)
  const existing = getBadgeForUser(userId, courseId);
  if (existing) return existing;

  const id = uuidv4();

  const user = queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [userId]);
  const course = queryOne<{ title: string }>('SELECT title FROM courses WHERE id = ?', [courseId]);

  const svg = generateBadgeSvg({
    badgeId: id,
    studentName: user?.name ?? 'Student',
    courseName: course?.title ?? 'Course',
    completionDate: formatDate(new Date().toISOString()),
  });

  const hash = createHash('sha256').update(svg).digest('hex');

  execute(
    `INSERT INTO certificate_badges (id, user_id, course_id, application_id, badge_svg, badge_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, courseId, applicationId, svg, hash],
  );

  return queryOne<CertificateBadge>('SELECT * FROM certificate_badges WHERE id = ?', [id])!;
}

export function getBadge(badgeId: string): CertificateBadge | null {
  return queryOne<CertificateBadge>('SELECT * FROM certificate_badges WHERE id = ?', [badgeId]);
}

export function getBadgeForApplication(applicationId: string): CertificateBadge | null {
  return queryOne<CertificateBadge>(
    'SELECT * FROM certificate_badges WHERE application_id = ?',
    [applicationId],
  );
}

export function getBadgeForUser(userId: string, courseId: string): CertificateBadge | null {
  return queryOne<CertificateBadge>(
    'SELECT * FROM certificate_badges WHERE user_id = ? AND course_id = ?',
    [userId, courseId],
  );
}

// ─── Tier Configuration ──────────────────────────────────────────────────────

export function getTiersEnabled(courseId: string): TiersEnabled {
  const pricing = queryOne<{ tiers_enabled: string }>(
    'SELECT tiers_enabled FROM course_pricing WHERE course_id = ? AND is_active = 1',
    [courseId],
  );
  if (!pricing) return 'both';
  const val = pricing.tiers_enabled;
  if (val === 'free_only' || val === 'paid_only' || val === 'both') return val;
  return 'both';
}
