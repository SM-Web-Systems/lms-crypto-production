import { getCurrentAdminTier } from './administratorPolicy.js';
import { query, queryOne } from '../config/database.js';
import { getUserPermissions, getUserRoles } from '../middleware/rbac.js';
import { roleSummariesForUser } from './roleSummaryService.js';

export type Workspace = 'admin' | 'lecturer' | 'teaching-assistant' | 'sponsor' | 'employer' | 'parent' | 'teacher' | 'student';

/** Authoritative UI context. Names never imply privileges; all capabilities come from RBAC. */
export function getAuthorizationContext(userId: string) {
  const rbacRoles = getUserRoles(userId);
  const permissions = getUserPermissions(userId).sort();
  const can = (permission: string) => permissions.includes(permission);
  const assignedCourses = {
    instructor: query<{course_id: string}>('SELECT course_id FROM course_lecturers WHERE user_id = ? ORDER BY course_id', [userId]).map(r => r.course_id),
    teachingAssistant: query<{course_id: string}>('SELECT course_id FROM course_tas WHERE user_id = ? ORDER BY course_id', [userId]).map(r => r.course_id),
  };
  const workspaces: Workspace[] = [];
  const admin = ['course.delete', 'system.manage_roles', 'user.assign_role', 'system.view_audit_log', 'tenant.manage'].some(can);
  if (admin) workspaces.push('admin');
  if (can('course.manage') && (rbacRoles.includes('instructor') || assignedCourses.instructor.length > 0)) workspaces.push('lecturer');
  if (can('course.grade_pending') && (rbacRoles.includes('teaching-assistant') || assignedCourses.teachingAssistant.length > 0)) workspaces.push('teaching-assistant');
  if (can('cohort.view_own') && (rbacRoles.includes('sponsor') || (!admin && can('impact_report.read')))) workspaces.push('sponsor');
  for (const role of ['employer', 'parent', 'teacher'] as const) {
    if (rbacRoles.includes(role) && can('student.view_assigned')) workspaces.push(role);
  }
  // Custom content managers can use the course editor without a name heuristic.
  if (!admin && can('course.manage') && !workspaces.length) workspaces.push('lecturer');
  if (can('course.submit')) workspaces.push('student');
  if (!workspaces.length && can('course.view')) workspaces.push('student');
  const adminTier = getCurrentAdminTier(userId);
  const deletionStatus = queryOne<{deletion_status:string|null}>('SELECT deletion_status FROM users WHERE id = ?', [userId])?.deletion_status ?? null;
  return { rbacRoles, roleSummaries: roleSummariesForUser(userId), permissions, workspaces, defaultWorkspace: workspaces[0] ?? null, adminTier, assignedCourses, deletionStatus };
}
