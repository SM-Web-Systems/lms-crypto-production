import { queryOne } from '../config/database.js';
import { getUserPermissions } from '../middleware/rbac.js';
import { courseAccessScope } from './courseAccessService.js';
import { searchDirectoryScope } from './searchScopeService.js';

export function studentRecordId(userId: string): string | undefined {
  return queryOne<{id: string}>('SELECT id FROM students WHERE user_id = ?', [userId])?.id;
}

/** Static s alias: used by both paginated lists and individual-resource checks. */
export function submissionStaffScope(userId: string) {
  const permissions = new Set(getUserPermissions(userId));
  const admin = permissions.has('course.delete');
  if (!admin && !permissions.has('course.grade') && !permissions.has('course.grade_pending')) return {sql:'0 = 1', params:[] as unknown[]};
  const scope = courseAccessScope(userId, permissions, 'staff');
  const params = [...scope.params];
  let sql = `s.course_id IN (SELECT c.id FROM courses c WHERE ${scope.sql})`;
  if (admin) {
    const directory = searchDirectoryScope(userId, permissions);
    sql = `(${sql} OR (s.course_id IS NULL AND EXISTS (SELECT 1 FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = s.student_id AND ${directory.sql})))`;
    params.push(...directory.params);
  } else {
    // Older submissions have no course_id; preserve access only through a
    // student's enrollment in a course currently assigned to this staff member.
    sql = `(${sql} OR (s.course_id IS NULL AND EXISTS (SELECT 1 FROM students st JOIN user_course_codes ucc ON ucc.user_id = st.user_id JOIN courses c ON c.course_code = ucc.course_code WHERE st.id = s.student_id AND ${scope.sql})))`;
    params.push(...scope.params);
  }
  return {sql,params};
}

export function canAccessSubmission(userId: string, id: string, staffOnly = false): boolean {
  const staff = submissionStaffScope(userId);
  return !!queryOne(`SELECT s.id FROM submissions s WHERE s.id = ? AND (${staff.sql}${staffOnly ? '' : ' OR s.student_id = ?'})`,
    [id,...staff.params,...(staffOnly ? [] : [studentRecordId(userId) ?? ''])]);
}
