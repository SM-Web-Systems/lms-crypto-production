import { queryOne } from '../config/database.js';
import { searchCourseScope } from './searchScopeService.js';

export type CourseAccess = 'read' | 'members' | 'staff' | 'manage' | 'enrolled';

/** Same boundary for list, detail, rosters, management, and search. */
export function courseAccessScope(userId: string, permissions: Set<string>, access: CourseAccess = 'read') {
  if (['read', 'members', 'enrolled'].includes(access) && !permissions.has('course.view')) return {sql:'0 = 1', params:[] as unknown[]};
  const scopedPermissions = new Set(permissions);
  if (access === 'enrolled') {
    for (const capability of ['course.delete','course.manage','course.grade_pending','cohort.view_own']) scopedPermissions.delete(capability);
  }
  if (access === 'members') scopedPermissions.delete('cohort.view_own');
  if (access === 'manage') scopedPermissions.delete('course.grade_pending');
  return searchCourseScope(userId, scopedPermissions, access === 'staff' || access === 'manage');
}

export function canAccessCourse(userId: string, courseId: string, permissions: Set<string>, access: CourseAccess = 'read'): boolean {
  const scope = courseAccessScope(userId, permissions, access);
  return !!queryOne('SELECT c.id FROM courses c WHERE c.id = ? AND ' + scope.sql, [courseId, ...scope.params]);
}
