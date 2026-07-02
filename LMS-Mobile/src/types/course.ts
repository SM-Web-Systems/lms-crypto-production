export type ContentItemType = 'video' | 'link' | 'pdf';

export interface CourseItemBase {
  id: string;
  title: string;
  order?: number;
  information?: string;
}

export interface CourseItemVideo extends CourseItemBase {
  type: 'video';
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
  documentId?: string;
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

export interface CourseWeek {
  id: string;
  title: string;
  order?: number;
  sections: CourseSection[];
}

export interface Course {
  id: string;
  title: string;
  description?: string;
  courseCode?: string;
  weeks?: CourseWeek[];
  sections?: CourseSection[];
}

export function getCourseWeeks(course: Course): CourseWeek[] {
  if (course.weeks && course.weeks.length > 0) {
    return [...course.weeks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  return [{ id: 'week-1', title: 'Week 1', order: 1, sections: course.sections ?? [] }];
}
