// Course content layout: course → weeks → sections (with video, link, PDF, text items)

export type ContentItemType = 'video' | 'link' | 'pdf' | 'text' | 'audio' | 'quiz' | 'assignment' | 'download';

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
  /** Optional direct download URL (e.g. pinned GitHub MP4) shown as a clean download button. */
  downloadUrl?: string;
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

export interface CourseItemText extends CourseItemBase {
  type: 'text';
  /** URL to the text resource (e.g. a markdown file, article, or course notes page). */
  url: string;
  description?: string;
}

export interface CourseItemAudio extends CourseItemBase {
  type: 'audio';
  /** Legacy audio URL — retained for backward compatibility but not rendered as primary player. */
  url: string;
  description?: string;
  /** YouTube video ID for the primary listening experience (embedded player). */
  youtubeUrl?: string;
  /** Optional direct download URL (e.g. pinned GitHub MP3) shown as a clean download button. */
  downloadUrl?: string;
}

export interface CourseItemQuiz extends CourseItemBase {
  type: 'quiz';
  /** LMS quiz ID — links to quizzes table */
  quizId: string;
  description?: string;
}

export interface CourseItemAssignment extends CourseItemBase {
  type: 'assignment';
  description?: string;
  /** Max file size in bytes (optional; UI validation hint) */
  maxFileSize?: number;
  /** Allowed MIME types (optional; UI validation hint) */
  allowedMimeTypes?: string[];
}

export interface CourseItemDownload extends CourseItemBase {
  type: 'download';
  /** LMS document ID (optional — use documentsService.getDownloadUrl(id)) */
  documentId?: string;
  /** Direct file URL when not from LMS */
  fileUrl?: string;
  /** Display name for the downloadable file */
  fileName: string;
  description?: string;
}

export type CourseItem = CourseItemVideo | CourseItemLink | CourseItemPdf | CourseItemText | CourseItemAudio | CourseItemQuiz | CourseItemAssignment | CourseItemDownload;

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
  /** Optional sponsor or cohort label (e.g. "USAID Cohort 2026"). */
  sponsorLabel?: string;
}

/** Returns weeks for a course; normalizes legacy courses that only have sections into a single "Week 1". */
export function getCourseWeeks(course: Course): CourseWeek[] {
  if (course.weeks && course.weeks.length > 0) {
    return [...course.weeks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  return [{ id: 'week-1', title: 'Week 1', order: 1, sections: course.sections ?? [] }];
}
