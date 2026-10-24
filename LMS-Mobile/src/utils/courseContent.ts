import type { Course, CourseItem, CourseSection, CourseWeek } from '../types/course';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === 'string' ? value : undefined;
const order = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function itemFromApi(value: unknown, index: number, sectionId: string): CourseItem {
  const raw = object(value);
  const base = { id: string(raw.id) || `${sectionId}-invalid-${index}`, title: string(raw.title) || 'Unavailable lesson', order: order(raw.order), information: string(raw.information), description: string(raw.description) };
  const url = string(raw.url) || '';
  // Preserve unknown or malformed lessons as visible fallbacks instead of silently losing them.
  if (!string(raw.id)) return { ...base, type: 'unsupported', originalType: string(raw.type) || 'unknown' };
  switch (raw.type) {
    case 'video': return { ...base, type: 'video', url, downloadUrl: string(raw.downloadUrl) };
    case 'link': return { ...base, type: 'link', url };
    case 'text': return { ...base, type: 'text', url };
    case 'audio': return { ...base, type: 'audio', url, youtubeUrl: string(raw.youtubeUrl), downloadUrl: string(raw.downloadUrl) };
    case 'pdf': return { ...base, type: 'pdf', documentId: string(raw.documentId), fileUrl: string(raw.fileUrl) };
    case 'download': return { ...base, type: 'download', documentId: string(raw.documentId), fileUrl: string(raw.fileUrl), fileName: string(raw.fileName) || base.title };
    case 'quiz': return { ...base, type: 'quiz', quizId: string(raw.quizId) || '' };
    case 'assignment': return { ...base, type: 'assignment', maxFileSize: order(raw.maxFileSize), allowedMimeTypes: Array.isArray(raw.allowedMimeTypes) ? raw.allowedMimeTypes.filter((v): v is string => typeof v === 'string') : undefined };
    default: return { ...base, type: 'unsupported', originalType: string(raw.type) || 'unknown' };
  }
}

function sectionsFromApi(value: unknown): CourseSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((value) => {
    const raw = object(value);
    const id = string(raw.id);
    if (!id) return [];
    return [{ id, title: string(raw.title) || 'Section', objective: string(raw.objective), outcome: string(raw.outcome), items: Array.isArray(raw.items) ? raw.items.map((item, index) => itemFromApi(item, index, id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [] }];
  });
}

export function courseFromApi(value: unknown): Course {
  const raw = object(value);
  if (!string(raw.id) || !string(raw.title)) throw new Error('The server returned an invalid course.');
  const weeks: CourseWeek[] = Array.isArray(raw.weeks) ? raw.weeks.flatMap((value) => {
    const week = object(value);
    const id = string(week.id);
    return id ? [{ id, title: string(week.title) || 'Week', order: order(week.order), sections: sectionsFromApi(week.sections) }] : [];
  }).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
  return { id: raw.id as string, title: raw.title as string, description: string(raw.description), courseCode: string(raw.courseCode), sponsorLabel: string(raw.sponsorLabel), weeks, sections: sectionsFromApi(raw.sections) };
}

export function isWebResource(url: string | undefined): url is string {
  if (!url?.trim()) return false;
  try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; }
}
