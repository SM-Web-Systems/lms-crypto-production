import type { CourseDocument } from '../types/api';

/** Course IDs restricting a document; empty/undefined = visible to all enrolled students (server-enforced). */
export function getCourseIdsFromDocument(doc: CourseDocument): string[] {
  const ids = doc.courseIds;
  return ids && ids.length > 0 ? [...ids] : [];
}

export function documentAccessLabel(
  doc: CourseDocument,
  courses: { id: string; title?: string }[],
): string {
  const ids = getCourseIdsFromDocument(doc);
  if (ids.length === 0) return 'Open to all';
  const names = ids
    .map((id) => courses.find((c) => c.id === id)?.title)
    .filter(Boolean) as string[];
  return names.length ? names.join(', ') : 'Restricted';
}
