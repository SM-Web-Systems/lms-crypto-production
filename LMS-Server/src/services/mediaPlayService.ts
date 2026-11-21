import { randomUUID } from 'node:crypto';
import { execute, query, queryOne } from '../config/database.js';
import { CourseContentError, findItem, readableCourse } from './courseContentService.js';

/**
 * Lesson media play events for view analytics: which player a learner used (YouTube in the lesson, the
 * YouTube app, a direct file or a saved offline file), how far they got, and whether they finished.
 *
 * Clients send a few milestones per play (start, 25/50/75 percent, complete), not a stream. The same
 * milestone for the same lesson and source is recorded once per learner per 30 minutes, so retries and
 * reloads do not inflate the numbers.
 */

export const PLAY_SOURCES = ['youtube_embed', 'youtube_app', 'direct_file', 'offline_file'] as const;
export const PLAY_EVENTS = ['start', 'progress', 'complete', 'open_external'] as const;
const PLATFORMS = ['web', 'android', 'ios'] as const;
const MILESTONES = [25, 50, 75];
const DEDUPE_MS = 30 * 60 * 1000;
type Source = typeof PLAY_SOURCES[number];
type PlayEvent = typeof PLAY_EVENTS[number];

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : null;
}

export function recordPlayEvent(userId: string, courseId: string, itemId: string, body: unknown, now = Date.now()) {
  const input = (body ?? {}) as Record<string, unknown>;
  const source = oneOf<Source>(input.source, PLAY_SOURCES);
  const event = oneOf<PlayEvent>(input.event, PLAY_EVENTS);
  const platform = oneOf(input.platform, PLATFORMS);
  const rawPercent = input.percent;
  let percent: number | null = null;
  if (event === 'progress') {
    // Snap to the milestone the learner has passed, so clients cannot invent fine-grained values.
    if (typeof rawPercent !== 'number' || !Number.isFinite(rawPercent)) percent = -1;
    else percent = [...MILESTONES].reverse().find(m => rawPercent >= m) ?? -1;
  } else if (event === 'complete') percent = 100;
  else if (event === 'start') percent = 0;
  if (!source || !event || !platform || percent === -1 || (event === 'open_external' && source !== 'youtube_app')) {
    throw new CourseContentError(400, 'VALIDATION_ERROR', 'Invalid play event.');
  }
  const course = readableCourse(userId, courseId);
  const entry = findItem(course, itemId);
  if (!entry || (entry.item.type !== 'video' && entry.item.type !== 'audio')) {
    throw new CourseContentError(404, 'NOT_FOUND', 'Media lesson not found');
  }
  const recent = queryOne(
    `SELECT 1 FROM media_play_events WHERE user_id = ? AND course_id = ? AND item_id = ? AND source = ? AND event = ?
       AND percent IS ? AND created_at > ? LIMIT 1`,
    [userId, courseId, itemId, source, event, percent, now - DEDUPE_MS],
  );
  if (recent) return { recorded: false };
  execute(
    `INSERT INTO media_play_events (id, user_id, course_id, item_id, source, event, percent, platform, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [randomUUID(), userId, courseId, itemId, source, event, percent, platform, now],
  );
  return { recorded: true };
}

export interface MediaLessonStats {
  courseId: string; courseTitle: string; itemId: string; itemTitle: string; itemType: string;
  plays: number; learners: number; completions: number; averagePercentWatched: number;
  youtubeEmbedPlays: number; youtubeAppOpens: number; directFilePlays: number; offlineFilePlays: number;
}

/** Per-lesson totals for media lessons, optionally for one course and a date range (ms since epoch). */
export function mediaStats(filter: { courseId?: string; from?: number; to?: number }): MediaLessonStats[] {
  const where = ['e.created_at >= ?', 'e.created_at <= ?'];
  const params: unknown[] = [filter.from ?? 0, filter.to ?? Number.MAX_SAFE_INTEGER];
  if (filter.courseId) { where.push('e.course_id = ?'); params.push(filter.courseId); }
  const rows = query<Omit<MediaLessonStats, 'itemTitle' | 'itemType' | 'averagePercentWatched'> & { sumMax: number | null; sections: string }>(
    `WITH per_learner AS (
       SELECT course_id, item_id, user_id, MAX(percent) AS max_percent FROM media_play_events e
        WHERE ${where.join(' AND ')} AND event IN ('start','progress','complete') GROUP BY course_id, item_id, user_id
     )
     SELECT e.course_id AS courseId, c.title AS courseTitle, c.sections AS sections, e.item_id AS itemId,
       SUM(e.event = 'start') AS plays,
       COUNT(DISTINCT CASE WHEN e.event IN ('start','progress','complete') THEN e.user_id END) AS learners,
       COUNT(DISTINCT CASE WHEN e.event = 'complete' THEN e.user_id END) AS completions,
       (SELECT SUM(p.max_percent) FROM per_learner p WHERE p.course_id = e.course_id AND p.item_id = e.item_id) AS sumMax,
       SUM(e.event = 'start' AND e.source = 'youtube_embed') AS youtubeEmbedPlays,
       SUM(e.event = 'open_external' AND e.source = 'youtube_app') AS youtubeAppOpens,
       SUM(e.event = 'start' AND e.source = 'direct_file') AS directFilePlays,
       SUM(e.event = 'start' AND e.source = 'offline_file') AS offlineFilePlays
     FROM media_play_events e JOIN courses c ON c.id = e.course_id
     WHERE ${where.join(' AND ')}
     GROUP BY e.course_id, e.item_id ORDER BY plays DESC, e.course_id, e.item_id`,
    [...params, ...params],
  );
  const titles = new Map<string, { title: string; type: string }>();
  const parsedCourses = new Set<string>();
  return rows.map(({ sumMax, sections, ...row }) => {
    if (!parsedCourses.has(row.courseId)) {
      parsedCourses.add(row.courseId);
      try {
        const parsed = JSON.parse(sections || '[]');
        const list = Array.isArray(parsed) && parsed[0]?.sections ? parsed.flatMap((w: { sections?: unknown[] }) => w.sections ?? []) : parsed;
        for (const s of list as { items?: { id?: string; title?: string; type?: string }[] }[]) {
          for (const i of s.items ?? []) if (i.id) titles.set(`${row.courseId}:${i.id}`, { title: i.title ?? i.id, type: i.type ?? '' });
        }
      } catch { /* titles fall back to ids */ }
    }
    const meta = titles.get(`${row.courseId}:${row.itemId}`);
    return {
      ...row,
      itemTitle: meta?.title ?? row.itemId,
      itemType: meta?.type ?? '',
      averagePercentWatched: row.learners ? Math.round((sumMax ?? 0) / row.learners) : 0,
    };
  });
}

const csvCell = (value: string | number) => {
  const text = String(value);
  // Neutralise spreadsheet formulas in titles, then quote.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function mediaStatsCsv(rows: MediaLessonStats[]): string {
  const header = ['Course', 'Lesson', 'Type', 'Plays', 'Learners', 'Completions', 'Average % watched',
    'YouTube in lesson', 'Opened in YouTube app', 'Direct file', 'Offline file'];
  const lines = rows.map(r => [r.courseTitle, r.itemTitle, r.itemType, r.plays, r.learners, r.completions, r.averagePercentWatched,
    r.youtubeEmbedPlays, r.youtubeAppOpens, r.directFilePlays, r.offlineFilePlays].map(csvCell).join(','));
  return [header.map(csvCell).join(','), ...lines].join('\n') + '\n';
}
