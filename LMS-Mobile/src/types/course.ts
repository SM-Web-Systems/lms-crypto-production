// The web content model is the authoring contract; keep native readers on that contract.
import type { Course as WebCourse, CourseItem as AuthoredItem, CourseItemBase, CourseSection as WebSection, CourseWeek as WebWeek } from '../../../LMS-Frontend/src/types/course';
export type { ContentItemType, CourseItemAssignment } from '../../../LMS-Frontend/src/types/course';

export interface UnsupportedCourseItem extends CourseItemBase {
  type: 'unsupported';
  originalType: string;
  description?: string;
}
export type CourseItem = AuthoredItem | UnsupportedCourseItem;
export interface CourseSection extends Omit<WebSection, 'items'> { items: CourseItem[] }
export interface CourseWeek extends Omit<WebWeek, 'sections'> { sections: CourseSection[] }
export interface Course extends Omit<WebCourse, 'weeks' | 'sections'> {
  weeks?: CourseWeek[];
  sections?: CourseSection[];
}

export function getCourseWeeks(course: Course): CourseWeek[] {
  if (course.weeks?.length) return [...course.weeks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return [{ id: 'week-1', title: 'Week 1', order: 1, sections: course.sections ?? [] }];
}
