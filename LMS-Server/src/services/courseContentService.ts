import { createHash } from 'node:crypto';
import { execute, query, queryOne } from '../config/database.js';
import { getUserPermissions } from '../middleware/rbac.js';
import { parseFlatSections } from '../utils/courseHelpers.js';
import { renderMarkdownToSafeHtml } from '../utils/markdownProcessor.js';
import logger from '../utils/logger.js';
import { canAccessCourse } from './courseAccessService.js';

/**
 * Course content resolved on the server, so web and mobile show the same lesson.
 *
 * GitHub markdown is only read from an approved source: the platform default (the BVC content repo at a
 * pinned commit, as the web viewer has always used) or a source an admin approved for that course. Org and
 * repo names compare case-insensitively, as GitHub does. Only raw.githubusercontent.com is ever fetched.
 */

export interface ContentSource { owner: string; repo: string; ref: string }

const RAW_HOST = 'raw.githubusercontent.com';
const MAX_MARKDOWN_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const BRANCH_CACHE_MS = 60 * 60 * 1000;
const COMMIT = /^[a-f0-9]{40}$/i;
const NAME = /^[a-z0-9._-]{1,100}$/;
const REF = /^[A-Za-z0-9._/-]{1,100}$/;

/** The platform default: the BVC content repo (and its old name) pinned to the reviewed commit. */
const DEFAULT_SOURCES: ContentSource[] = [
  { owner: 'sm-web-systems', repo: 'blockchain-foundations-for-vibe-coding', ref: 'b9fad25e1e0ad1d6bd2c428778decfc1cd6cc472' },
];
/** Old repo names that now resolve to another approved repo. */
const REPO_ALIASES: Record<string, string> = { 'sm-web-systems/vibe-coding-blockchain': 'blockchain-foundations-for-vibe-coding' };

export class CourseContentError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export function normalizeSource(input: unknown): ContentSource {
  const raw = (input ?? {}) as Partial<Record<keyof ContentSource, unknown>>;
  const owner = typeof raw.owner === 'string' ? raw.owner.trim().toLowerCase() : '';
  const repo = typeof raw.repo === 'string' ? raw.repo.trim().toLowerCase().replace(/\.git$/, '') : '';
  const ref = typeof raw.ref === 'string' ? raw.ref.trim() : '';
  if (!NAME.test(owner) || !NAME.test(repo) || !REF.test(ref) || ref.includes('..')) {
    throw new CourseContentError(400, 'VALIDATION_ERROR', 'Each source needs a GitHub owner, repository and branch or commit.');
  }
  return { owner, repo, ref: COMMIT.test(ref) ? ref.toLowerCase() : ref };
}

export function listCourseSources(courseId: string): ContentSource[] {
  return query<ContentSource>('SELECT owner, repo, ref FROM course_content_sources WHERE course_id = ? ORDER BY owner, repo', [courseId]);
}

export function replaceCourseSources(courseId: string, sources: unknown): ContentSource[] {
  if (!Array.isArray(sources) || sources.length > 20) {
    throw new CourseContentError(400, 'VALIDATION_ERROR', 'Send a list of up to 20 sources.');
  }
  const parsed = sources.map(normalizeSource);
  execute('DELETE FROM course_content_sources WHERE course_id = ?', [courseId]);
  for (const source of parsed) {
    execute('INSERT OR REPLACE INTO course_content_sources (course_id, owner, repo, ref) VALUES (?,?,?,?)',
      [courseId, source.owner, source.repo, source.ref]);
  }
  return listCourseSources(courseId);
}

/** Splits a github.com blob or raw.githubusercontent.com URL into owner, repo and file path. */
export function parseGitHubFileUrl(url: string): { owner: string; repo: string; path: string } | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  let owner: string | undefined, repo: string | undefined, rest: string[];
  if (u.hostname === RAW_HOST) [owner, repo, , ...rest] = parts;
  else if (u.hostname === 'github.com' || u.hostname === 'www.github.com') {
    if (parts[2] !== 'blob') return null;
    [owner, repo, , , ...rest] = parts;
  } else return null;
  if (!owner || !repo || !rest.length || rest.some(p => p === '..' || p === '.' || p.includes('\\'))) return null;
  return { owner: owner.toLowerCase(), repo: repo.toLowerCase(), path: rest.join('/') };
}

/** The pinned raw URL for an approved GitHub file, or null when the file is not from an approved source. */
export function resolveApprovedRawUrl(courseId: string, url: string): string | null {
  const file = parseGitHubFileUrl(url);
  if (!file) return null;
  const repo = REPO_ALIASES[`${file.owner}/${file.repo}`] ?? file.repo;
  const source = [...listCourseSources(courseId), ...DEFAULT_SOURCES].find(s => s.owner === file.owner && s.repo === repo);
  if (!source) return null;
  const path = file.path.split('/').map(encodeURIComponent).join('/');
  return `https://${RAW_HOST}/${source.owner}/${source.repo}/${source.ref.split('/').map(encodeURIComponent).join('/')}/${path}`;
}

type Fetcher = (url: string, init: { signal: AbortSignal; redirect: 'error' }) => Promise<Response>;
let fetcher: Fetcher = (url, init) => fetch(url, init);
/** Tests replace the network fetch. */
export function setContentFetcher(next: Fetcher | null) { fetcher = next ?? ((url, init) => fetch(url, init)); }

async function fetchMarkdown(rawUrl: string): Promise<string> {
  const response = await fetcher(rawUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' });
  if (!response.ok) throw new CourseContentError(502, 'CONTENT_UNAVAILABLE', `GitHub returned ${response.status} for this lesson.`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_MARKDOWN_BYTES) throw new CourseContentError(413, 'CONTENT_TOO_LARGE', 'This lesson file is too large.');
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_MARKDOWN_BYTES) throw new CourseContentError(413, 'CONTENT_TOO_LARGE', 'This lesson file is too large.');
  return text;
}

/** Rendered, sanitized HTML for an approved GitHub markdown file. Pinned commits are cached for good. */
export async function renderApprovedMarkdown(rawUrl: string, now = Date.now()): Promise<string> {
  const pinned = COMMIT.test(rawUrl.split('/')[5] ?? '');
  const cached = queryOne<{ html: string; fetched_at: number }>('SELECT html, fetched_at FROM course_content_cache WHERE source_url = ?', [rawUrl]);
  if (cached && (pinned || now - cached.fetched_at < BRANCH_CACHE_MS)) return cached.html;
  try {
    const html = renderMarkdownToSafeHtml(await fetchMarkdown(rawUrl));
    execute('INSERT INTO course_content_cache (source_url, html, fetched_at) VALUES (?,?,?) ON CONFLICT(source_url) DO UPDATE SET html=excluded.html, fetched_at=excluded.fetched_at',
      [rawUrl, html, now]);
    return html;
  } catch (error) {
    // A stale copy beats a blank lesson when GitHub is slow or down.
    if (cached) return cached.html;
    logger.warn({ rawUrl, err: error instanceof Error ? error.message : String(error) }, 'Could not load GitHub lesson content');
    if (error instanceof CourseContentError) throw error;
    throw new CourseContentError(502, 'CONTENT_UNAVAILABLE', 'The lesson content could not be loaded from GitHub. Try again shortly.');
  }
}

interface RawItem { id?: unknown; type?: unknown; title?: unknown; url?: unknown; youtubeUrl?: unknown; downloadUrl?: unknown; fileUrl?: unknown; documentId?: unknown; information?: unknown }
interface CourseRow { id: string; sections: string }

/** The course, if this user may read it (enrolled, or staff with access). */
export function readableCourse(userId: string, courseId: string): CourseRow {
  const course = queryOne<CourseRow>('SELECT id, sections FROM courses WHERE id = ?', [courseId]);
  if (!course) throw new CourseContentError(404, 'NOT_FOUND', 'Course not found');
  const permissions = new Set(getUserPermissions(userId));
  if (!permissions.has('course.view') || !canAccessCourse(userId, courseId, permissions, 'read')) {
    throw new CourseContentError(403, 'FORBIDDEN', 'You do not have access to this course.');
  }
  return course;
}

function items(course: CourseRow) {
  return parseFlatSections(course.sections || '[]').flatMap(section => (Array.isArray(section?.items) ? section.items : [])
    .map(item => ({ sectionId: String(section.id), item: item as RawItem })));
}

export function findItem(course: CourseRow, itemId: string) {
  return items(course).find(entry => entry.item.id === itemId) ?? null;
}

const str = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
export function youtubeId(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const bare = url.trim();
  // Some courses store a bare video ID in youtubeUrl rather than a full link.
  if (/^[A-Za-z0-9_-]{11}$/.test(bare)) return bare;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|watch\?(?:.*&)?v=))([A-Za-z0-9_-]{6,20})/);
  return match?.[1];
}

/** One lesson's reading, as sanitized HTML: inline imported content first, else an approved GitHub file. */
export async function lessonReading(userId: string, courseId: string, itemId: string) {
  const course = readableCourse(userId, courseId);
  const entry = findItem(course, itemId);
  if (!entry || (entry.item.type !== 'text' && entry.item.type !== 'link')) throw new CourseContentError(404, 'NOT_FOUND', 'Lesson not found');
  const url = str(entry.item.url);
  const rawUrl = url ? resolveApprovedRawUrl(courseId, url) : null;
  if (rawUrl && /\.(md|markdown)$/i.test(new URL(rawUrl).pathname)) {
    return { itemId, source: 'github' as const, sourceUrl: rawUrl, html: await renderApprovedMarkdown(rawUrl) };
  }
  const information = str(entry.item.information);
  if (entry.item.type === 'text' && information && !url) {
    return { itemId, source: 'inline' as const, sourceUrl: null, html: /<[a-z][\s\S]*>/i.test(information) ? information : renderMarkdownToSafeHtml(information) };
  }
  throw new CourseContentError(404, 'NO_READING', 'This lesson has no reading the app can show. Open it from its link.');
}

/** Every lesson with the fields a client needs to show or download it, and a version that changes with the course. */
export function contentManifest(userId: string, courseId: string) {
  const course = readableCourse(userId, courseId);
  const contentVersion = createHash('sha256').update(course.sections || '').digest('hex');
  const lessons = items(course).filter(({ item }) => typeof item.id === 'string').map(({ sectionId, item }) => {
    const url = str(item.url);
    const type = typeof item.type === 'string' ? item.type : 'unknown';
    const yt = youtubeId(str(item.youtubeUrl)) ?? youtubeId(url);
    const rawUrl = url ? resolveApprovedRawUrl(courseId, url) : null;
    const hasReading = (type === 'text' || type === 'link') && (!!(rawUrl && /\.(md|markdown)$/i.test(rawUrl)) || (type === 'text' && !url && !!str(item.information)));
    return {
      id: item.id as string, sectionId, type, title: str(item.title) ?? 'Lesson',
      youtubeId: yt ?? null,
      youtubeWatchUrl: yt ? `https://www.youtube.com/watch?v=${yt}` : null,
      downloadUrl: str(item.downloadUrl) ?? str(item.fileUrl) ?? null,
      readingPath: hasReading ? `/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(item.id as string)}/reading` : null,
    };
  });
  return { courseId, contentVersion, lessons };
}
