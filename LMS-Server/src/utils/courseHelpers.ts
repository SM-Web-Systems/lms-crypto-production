import type { CourseSection } from '../types/index.js';

/** Find the section that contains itemId. Returns sectionId or null if not found. */
export function findSectionForItem(sectionsJson: string, itemId: string): string | null {
  try {
    const sections: CourseSection[] = JSON.parse(sectionsJson || '[]');
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
    const sections: CourseSection[] = JSON.parse(sectionsJson || '[]');
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
