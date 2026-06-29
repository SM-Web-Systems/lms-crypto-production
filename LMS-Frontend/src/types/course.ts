// Course content layout: course → weeks → sections (with video, link, PDF items)

export type ContentItemType = 'video' | 'link' | 'pdf';

export interface CourseItemBase {
  id: string;
  title: string;
  order?: number;
  /** Shown above the embedded resource in the student viewer (pre-context from the instructor). */
  information?: string;
}

export interface CourseItemVideo extends CourseItemBase {
  type: 'video';
  /** YouTube (watch or embed) URL, or a direct file URL e.g. .mp4 / .webm for native playback */
  url: string;
  description?: string;
}

export interface CourseItemLink extends CourseItemBase {
  type: 'link';
  url: string;
  description?: string;
}

export interface CourseItemPdf extends CourseItemBase {
  type: 'pdf';
  /** LMS document ID (use documentsService.getDownloadUrl(id) for view) */
  documentId?: string;
  /** Direct PDF URL when not from LMS */
  fileUrl?: string;
  description?: string;
}

export type CourseItem = CourseItemVideo | CourseItemLink | CourseItemPdf;

export interface CourseSection {
  id: string;
  title: string;
  objective?: string;
  outcome?: string;
  items: CourseItem[];
}

/** A week within a course; contains sections (same content format as before). */
export interface CourseWeek {
  id: string;
  title: string; // e.g. "Week 1", "Week 2"
  order?: number;
  sections: CourseSection[];
}

export interface Course {
  id: string;
  title: string;
  description?: string;
  /** Unique code for access control; students with this code can see the course and its resources. Optional for migration; defaulted in courseService. */
  courseCode?: string;
  /** New structure: course → weeks → sections. Use getCourseWeeks(course) for backward compat. */
  weeks?: CourseWeek[];
  /** @deprecated Use weeks[].sections. Kept for migration from old data. */
  sections?: CourseSection[];
}

/** Returns weeks for a course; normalizes legacy courses that only have sections into a single "Week 1". */
export function getCourseWeeks(course: Course): CourseWeek[] {
  if (course.weeks && course.weeks.length > 0) {
    return [...course.weeks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  return [{ id: 'week-1', title: 'Week 1', order: 1, sections: course.sections ?? [] }];
}
