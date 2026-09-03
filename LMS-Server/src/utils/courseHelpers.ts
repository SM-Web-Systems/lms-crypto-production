import type { CourseSection } from '../types/index.js';

/**
 * Parse the raw `sections` column JSON into a flat CourseSection[].
 * Handles both legacy format (CourseSection[]) and weeks format (CourseWeek[]).
 * In weeks format, each element has a `sections` sub-array; this flattens them.
 */
export function parseFlatSections(sectionsJson: string): CourseSection[] {
  try {
    const parsed = JSON.parse(sectionsJson || '[]');
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    // Detect weeks format: first element has a `sections` property that is an array
    if (parsed[0] && Array.isArray(parsed[0].sections)) {
      return parsed.flatMap((w: { sections?: CourseSection[] }) => w.sections ?? []);
    }
    return parsed as CourseSection[];
  } catch {
    return [];
  }
}

/** Find the section that contains itemId. Returns sectionId or null if not found. */
export function findSectionForItem(sectionsJson: string, itemId: string): string | null {
  try {
    const sections = parseFlatSections(sectionsJson);
    for (const section of sections) {
      if (section.items.some((item) => item.id === itemId)) {
        return section.id;
      }
    }
  } catch {
    /* invalid JSON — treat as no items */
  }
  return null;
}

/** Find item by quizId in course sections. Returns { itemId, sectionId } or null. */
export function findQuizItemInCourse(
  sectionsJson: string,
  quizId: string
): { itemId: string; sectionId: string } | null {
  try {
    const sections = parseFlatSections(sectionsJson);
    for (const section of sections) {
      const quizItem = section.items.find(
        (it) => it.type === 'quiz' && (it as { quizId?: string }).quizId === quizId
      );
      if (quizItem) return { itemId: quizItem.id, sectionId: section.id };
    }
  } catch {
    /* invalid JSON */
  }
  return null;
}
