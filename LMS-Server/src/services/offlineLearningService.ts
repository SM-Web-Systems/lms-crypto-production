import { createHash, randomUUID } from 'node:crypto';
import { db, execute, hashToken, query, queryOne } from '../config/database.js';
import { getUserPermissions } from '../middleware/rbac.js';
import type { JWTPayload } from '../types/index.js';
import { parseFlatSections } from '../utils/courseHelpers.js';
import { canAccessCourse } from './courseAccessService.js';

const maxLeaseSeconds = 86_400;
const maxPackageBytes = 512 * 1024;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export class OfflineLearningError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

interface CourseRow { id: string; course_code: string; title: string; sections: string }
interface LeaseRow {
  id: string;
  user_id: string;
  course_id: string;
  course_code: string;
  session_hash: string;
  content_version: string;
  issued_at: number;
  expires_at: number;
}
interface ProgressRow {
  itemId: string;
  completedAt: string | null;
  progressPct: number | null;
  lastPositionS: number | null;
}
type Mutation = { leaseId: string; contentVersion: string; idempotencyKey: string; itemId: string } & (
  {kind: 'complete'} | {kind: 'progress'; positionSeconds: number; progressPercent: number}
);

function policy(courseId: string) {
  const seconds = Number(process.env.OFFLINE_LEARNING_TTL_SECONDS);
  const courses = (process.env.OFFLINE_LEARNING_COURSE_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);
  if (process.env.OFFLINE_LEARNING_ENABLED !== 'true' || !Number.isSafeInteger(seconds)
    || seconds < 60 || seconds > maxLeaseSeconds || courses.length === 0) {
    throw new OfflineLearningError(503, 'OFFLINE_UNAVAILABLE', 'Offline learning is unavailable.');
  }
  if (!courses.includes(courseId)) {
    throw new OfflineLearningError(403, 'OFFLINE_NOT_APPROVED', 'This course is unavailable offline.');
  }
  return seconds * 1000;
}

function currentCourse(actor: JWTPayload, token: string, courseId: string, now: number) {
  const sessionHash = hashToken(token);
  const session = queryOne<{ expiresAt: number; authorizationVersion: number }>(
    `SELECT unixepoch(s.expires_at)*1000 AS expiresAt, u.authorization_version AS authorizationVersion
       FROM active_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.user_id = ? AND s.token_hash = ? AND s.revoked_at IS NULL
        AND COALESCE(u.deletion_status, '') NOT IN ('pending_deletion', 'finalized')
        AND (u.password_changed_at IS NULL OR unixepoch(u.password_changed_at) <= ?)`,
    [actor.userId, sessionHash, actor.iat ?? 0],
  );
  const authExpiresAt = Math.min((actor.exp ?? 0) * 1000, session?.expiresAt ?? 0);
  if (!session || session.authorizationVersion !== (actor.authorizationVersion ?? 0) || authExpiresAt <= now) {
    throw new OfflineLearningError(401, 'UNAUTHORIZED', 'Sign in again to use offline learning.');
  }

  const course = queryOne<CourseRow>(
    `SELECT c.id, c.course_code, c.title, c.sections FROM courses c
     JOIN user_course_codes e ON e.course_code = c.course_code
     WHERE c.id = ? AND e.user_id = ?`, [courseId, actor.userId],
  );
  const permissions = new Set(getUserPermissions(actor.userId));
  if (!course || !canAccessCourse(actor.userId, courseId, permissions, 'enrolled')) {
    throw new OfflineLearningError(403, 'OFFLINE_ACCESS_REVOKED', 'You do not have offline access to this course.');
  }
  const contentVersion = digest(JSON.stringify([course.id, course.course_code, course.title, course.sections]));
  return {course, sessionHash, authExpiresAt, contentVersion};
}

function offlineSections(course: CourseRow) {
  const sections = parseFlatSections(course.sections).filter(section => section && typeof section.id === 'string'
    && typeof section.title === 'string' && Array.isArray(section.items));
  const counts = new Map<string, number>();
  for (const section of sections) {
    for (const item of section.items) {
      if (item && typeof item.id === 'string') counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    }
  }
  return sections.map(section => ({
    id: section.id,
    title: section.title,
    items: section.items.filter(item => item?.type === 'text' && typeof item.id === 'string'
      && item.id.length > 0 && item.id.length <= 200 && typeof item.title === 'string'
      && typeof item.information === 'string' && item.information.trim().length > 0 && counts.get(item.id) === 1)
      .map(item => ({
        id: item.id,
        type: 'text' as const,
        title: item.title,
        description: typeof item.description === 'string' ? item.description : undefined,
        information: typeof item.information === 'string' ? item.information : undefined,
      })),
  })).filter(section => section.items.length > 0);
}

const progressFields = 'item_id AS itemId, completed_at AS completedAt, progress_pct AS progressPct, last_position_s AS lastPositionS';

export function issueOfflineLease(actor: JWTPayload, token: string, courseId: string) {
  return db.transaction(() => {
    const now = Date.now();
    const ttl = policy(courseId);
    const {course, sessionHash, authExpiresAt, contentVersion} = currentCourse(actor, token, courseId, now);
    const sections = offlineSections(course);
    if (sections.length === 0) {
      throw new OfflineLearningError(409, 'OFFLINE_NO_CONTENT', 'This course has no offline text lessons with inline reading content.');
    }
    const items = new Set(sections.flatMap(section => section.items.map(item => item.id)));
    const progress = query<ProgressRow>(
      `SELECT ${progressFields} FROM lesson_completions WHERE user_id = ? AND course_id = ?`, [actor.userId, courseId],
    ).filter(row => items.has(row.itemId));
    execute('DELETE FROM offline_learning_leases WHERE expires_at <= ?', [now]);
    execute('DELETE FROM offline_progress_receipts WHERE retain_until <= ?', [now]);
    let lease = queryOne<LeaseRow>(
      `SELECT * FROM offline_learning_leases
       WHERE user_id = ? AND course_id = ? AND session_hash = ? AND content_version = ?`,
      [actor.userId, courseId, sessionHash, contentVersion],
    );
    if (lease && lease.issued_at + ttl <= now) {
      execute('DELETE FROM offline_learning_leases WHERE id = ?', [lease.id]);
      lease = null;
    }
    if (!lease) {
      lease = {
        id: randomUUID(), user_id: actor.userId, course_id: course.id, course_code: course.course_code,
        session_hash: sessionHash, content_version: contentVersion, issued_at: now, expires_at: Math.min(now + ttl, authExpiresAt),
      };
      execute(`INSERT INTO offline_learning_leases
        (id,user_id,course_id,course_code,session_hash,content_version,issued_at,expires_at) VALUES (?,?,?,?,?,?,?,?)`,
      [lease.id, lease.user_id, lease.course_id, lease.course_code, lease.session_hash, lease.content_version, lease.issued_at, lease.expires_at]);
    }
    const result = {
      leaseId: lease.id,
      contentVersion,
      issuedAt: lease.issued_at,
      serverTime: now,
      expiresAt: Math.min(lease.expires_at, lease.issued_at + ttl, authExpiresAt),
      course: {id: course.id, title: course.title, sections},
      progress,
    };
    if (Buffer.byteLength(JSON.stringify(result)) > maxPackageBytes) {
      throw new OfflineLearningError(413, 'OFFLINE_PACKAGE_TOO_LARGE', 'This course exceeds the offline storage limit.');
    }
    return result;
  }).immediate();
}

function parseMutation(value: unknown): Mutation {
  const input = value as Partial<Mutation> | null;
  if (!input || typeof input.leaseId !== 'string' || !uuid.test(input.leaseId)
    || typeof input.contentVersion !== 'string' || !/^[a-f0-9]{64}$/.test(input.contentVersion)
    || typeof input.idempotencyKey !== 'string' || !uuid.test(input.idempotencyKey)
    || typeof input.itemId !== 'string' || input.itemId.length < 1 || input.itemId.length > 200
    || (input.kind !== 'complete' && input.kind !== 'progress')
    || (input.kind === 'progress' && (
      typeof input.positionSeconds !== 'number' || !Number.isSafeInteger(input.positionSeconds) || input.positionSeconds < 0
      || typeof input.progressPercent !== 'number' || !Number.isInteger(input.progressPercent) || input.progressPercent < 0 || input.progressPercent > 100))) {
    throw new OfflineLearningError(400, 'VALIDATION_ERROR', 'Invalid offline progress operation.');
  }
  return {...input, idempotencyKey: input.idempotencyKey.toLowerCase()} as Mutation;
}

export function syncOfflineProgress(
  actor: JWTPayload, token: string, courseId: string, raw: unknown,
  apply: (sectionId: string, operation: Mutation) => boolean,
) {
  const operation = parseMutation(raw);
  return db.transaction(() => {
    const now = Date.now();
    const ttl = policy(courseId);
    const {course, sessionHash, contentVersion} = currentCourse(actor, token, courseId, now);
    const lease = queryOne<LeaseRow>(
      'SELECT * FROM offline_learning_leases WHERE id = ? AND user_id = ? AND course_id = ? AND session_hash = ?',
      [operation.leaseId, actor.userId, courseId, sessionHash],
    );
    if (!lease) {
      throw new OfflineLearningError(403, 'OFFLINE_LEASE_INVALID', 'This offline lease is unavailable.');
    }
    if (Math.min(lease.expires_at, lease.issued_at + ttl) <= now) {
      throw new OfflineLearningError(409, 'OFFLINE_LEASE_EXPIRED', 'This offline lease expired.');
    }
    if (lease.content_version !== contentVersion || operation.contentVersion !== lease.content_version) {
      throw new OfflineLearningError(409, 'OFFLINE_CONTENT_CHANGED', 'The course changed. Refresh its offline content.');
    }
    const section = offlineSections(course).find(section => section.items.some(item => item.id === operation.itemId));
    if (!section) {
      throw new OfflineLearningError(403, 'OFFLINE_ITEM_NOT_APPROVED', 'This lesson is unavailable offline.');
    }
    const requestHash = digest(JSON.stringify([lease.id, courseId, operation.itemId, operation.kind,
      operation.kind === 'progress' ? [operation.positionSeconds, operation.progressPercent] : null]));
    const receipt = queryOne<{ request_hash: string }>(
      'SELECT request_hash FROM offline_progress_receipts WHERE user_id = ? AND idempotency_key = ?',
      [actor.userId, operation.idempotencyKey],
    );
    if (receipt && receipt.request_hash !== requestHash) {
      throw new OfflineLearningError(409, 'OFFLINE_OPERATION_CONFLICT', 'This operation ID already belongs to another update.');
    }
    let completed = false;
    if (!receipt) {
      completed = apply(section.id, operation);
      execute('INSERT INTO offline_progress_receipts (user_id,idempotency_key,request_hash,retain_until) VALUES (?,?,?,?)',
        [actor.userId, operation.idempotencyKey, requestHash, lease.expires_at]);
    }
    const progress = queryOne<ProgressRow>(
      `SELECT ${progressFields} FROM lesson_completions WHERE user_id = ? AND course_id = ? AND item_id = ?`,
      [actor.userId, courseId, operation.itemId],
    ) ?? {itemId: operation.itemId, completedAt: null, progressPct: null, lastPositionS: null};
    return {progress, completed, sections: course.sections};
  }).immediate();
}
